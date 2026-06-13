import express from 'express';

import { authRequired } from '../auth.js';
import { getReadableCommentVisibilitiesForRole } from '../access.js';
import { pool } from '../db.js';
import {
  asyncHandler,
  isConsultant,
  isPsychologist,
  isSupervisor,
} from '../utils.js';

const router = express.Router();

router.get('/consultants', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     where role = 'consultant'
     order by full_name asc nulls last, username asc`,
  );
  res.json(rows);
}));

router.get('/me/clients', authRequired, asyncHandler(async (req, res) => {
  if (!isConsultant(req.user.role) && !isPsychologist(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const assignmentColumn = isConsultant(req.user.role) ? 'consultant_id' : 'psychologist_id';
  const readableVisibilities = getReadableCommentVisibilitiesForRole(req.user.role);
  const { rows } = await pool.query(
    `select
       p.id,
       p.username,
       p.full_name,
       p.role,
       p.consultant_id,
       p.psychologist_id,
       coalesce(unread.unread_comments_count, 0)::int as unread_comments_count
     from profiles p
     left join lateral (
       select count(*)::int as unread_comments_count
       from decisions d
       join comments c on c.decision_id = d.id
       left join client_comment_reads ccr
         on ccr.staff_user_id = $1
        and ccr.client_user_id = p.id
       where d.user_id = p.id
         and c.user_id <> $1
         and (case when c.visibility = 'internal' then 'staff_private' else c.visibility end) = any($2::text[])
         and c.created_at > coalesce(ccr.last_read_at, 'epoch'::timestamptz)
     ) unread on true
     where p.role = 'client'
       and p.${assignmentColumn} = $1
     order by p.full_name asc nulls last, p.username asc`,
    [req.user.id, readableVisibilities],
  );
  return res.json(rows);
}));

router.post('/me/clients/:clientId/comments/read', authRequired, asyncHandler(async (req, res) => {
  if (!isConsultant(req.user.role) && !isPsychologist(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const clientId = req.params.clientId;
  const assignmentColumn = isConsultant(req.user.role) ? 'consultant_id' : 'psychologist_id';
  const { rows: clientRows } = await pool.query(
    `select id
     from profiles
     where id = $1
       and role = 'client'
       and ${assignmentColumn} = $2`,
    [clientId, req.user.id],
  );

  if (clientRows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  await pool.query(
    `insert into client_comment_reads (staff_user_id, client_user_id, last_read_at)
     values ($1, $2, now())
     on conflict (staff_user_id, client_user_id)
     do update set last_read_at = excluded.last_read_at`,
    [req.user.id, clientId],
  );

  return res.json({ ok: true, client_id: clientId });
}));

router.get('/:consultantId/clients', authRequired, asyncHandler(async (req, res) => {
  const { consultantId } = req.params;

  if (!isSupervisor(req.user.role) && !(isConsultant(req.user.role) && req.user.id === consultantId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     where role = 'client' and consultant_id = $1
     order by full_name asc nulls last, username asc`,
    [consultantId],
  );
  return res.json(rows);
}));

router.get('/me/assignments', authRequired, asyncHandler(async (req, res) => {
  if (req.user.role !== 'client') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select
       client.id,
       client.consultant_id,
       client.psychologist_id,
       cons.id as consultant_profile_id,
       cons.username as consultant_username,
       cons.full_name as consultant_full_name,
       psych.id as psychologist_profile_id,
       psych.username as psychologist_username,
       psych.full_name as psychologist_full_name
     from profiles client
     left join profiles cons on cons.id = client.consultant_id
     left join profiles psych on psych.id = client.psychologist_id
     where client.id = $1 and client.role = 'client'`,
    [req.user.id],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const row = rows[0];
  return res.json({
    consultant: row.consultant_profile_id
      ? {
        id: row.consultant_profile_id,
        username: row.consultant_username,
        full_name: row.consultant_full_name,
      }
      : null,
    psychologist: row.psychologist_profile_id
      ? {
        id: row.psychologist_profile_id,
        username: row.psychologist_username,
        full_name: row.psychologist_full_name,
      }
      : null,
  });
}));

router.patch('/:clientId/consultant', authRequired, asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const { consultantId } = req.body;

  if (!consultantId) {
    return res.status(400).json({ error: 'consultantId is required' });
  }

  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows: consultantRows } = await pool.query(
    `select id from profiles where id = $1 and role = 'consultant'`,
    [consultantId],
  );
  if (consultantRows.length === 0) {
    return res.status(400).json({ error: 'Invalid consultantId' });
  }

  const { rows } = await pool.query(
    `update profiles
     set consultant_id = $1
     where id = $2 and role = 'client'
     returning id, username, full_name, role, consultant_id, psychologist_id`,
    [consultantId, clientId],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  return res.json(rows[0]);
}));

router.get('/users', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     order by created_at desc`,
  );
  return res.json(rows);
}));

export default router;
