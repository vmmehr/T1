import crypto from 'node:crypto';
import express from 'express';

import { authRequired } from '../auth.js';
import { logAudit } from '../audit.js';
import { pool } from '../db.js';
import {
  asyncHandler,
  isConsultant,
  isPsychologist,
  isStaff,
  isSupervisor,
} from '../utils.js';

const router = express.Router();

const invitationStatus = (row) => {
  if (row.used_at) return 'used';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
};

// Create a one-time client invitation link. Staff only.
router.post('/', authRequired, asyncHandler(async (req, res) => {
  if (!isStaff(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { fullName = '', consultantId = null, psychologistId = null } = req.body;
  const expiresInDays = Math.max(1, Math.min(Number(req.body.expiresInDays) || 7, 30));

  // Determine assignment based on the creator's role.
  let assignConsultant = null;
  let assignPsychologist = null;
  if (isSupervisor(req.user.role)) {
    assignConsultant = consultantId || null;
    assignPsychologist = psychologistId || null;
    if (assignConsultant) {
      const { rows } = await pool.query(
        `select id from profiles where id = $1 and role = 'consultant'`,
        [assignConsultant],
      );
      if (rows.length === 0) return res.status(400).json({ error: 'Invalid consultantId' });
    }
    if (assignPsychologist) {
      const { rows } = await pool.query(
        `select id from profiles where id = $1 and role = 'psychologist'`,
        [assignPsychologist],
      );
      if (rows.length === 0) return res.status(400).json({ error: 'Invalid psychologistId' });
    }
  } else if (isConsultant(req.user.role)) {
    assignConsultant = req.user.id;
  } else if (isPsychologist(req.user.role)) {
    assignPsychologist = req.user.id;
  }

  const token = crypto.randomBytes(24).toString('hex');
  const { rows } = await pool.query(
    `insert into invitations (token, full_name, consultant_id, psychologist_id, created_by, expires_at)
     values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)
     returning *`,
    [token, String(fullName || '').trim(), assignConsultant, assignPsychologist, req.user.id, String(expiresInDays)],
  );

  const invitation = rows[0];
  await logAudit({
    actorId: req.user.id,
    action: 'invitation_created',
    targetType: 'invitation',
    targetId: invitation.id,
    details: { full_name: invitation.full_name, consultant_id: assignConsultant, psychologist_id: assignPsychologist },
  });

  return res.status(201).json({ ...invitation, status: invitationStatus(invitation) });
}));

// List invitations visible to the current staff member.
router.get('/', authRequired, asyncHandler(async (req, res) => {
  if (!isStaff(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let whereSql = 'true';
  const params = [];
  if (!isSupervisor(req.user.role)) {
    const column = isConsultant(req.user.role) ? 'consultant_id' : 'psychologist_id';
    params.push(req.user.id);
    whereSql = `(i.created_by = $1 or i.${column} = $1)`;
  }

  const { rows } = await pool.query(
    `select
       i.*,
       creator.full_name as created_by_name,
       cons.full_name as consultant_name,
       psych.full_name as psychologist_name
     from invitations i
     left join profiles creator on creator.id = i.created_by
     left join profiles cons on cons.id = i.consultant_id
     left join profiles psych on psych.id = i.psychologist_id
     where ${whereSql}
     order by i.created_at desc
     limit 100`,
    params,
  );

  return res.json(rows.map((row) => ({ ...row, status: invitationStatus(row) })));
}));

// Public: validate a token so the signup page can show invite details.
router.get('/:token', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `select full_name, role, used_at, expires_at from invitations where token = $1`,
    [req.params.token],
  );
  const invitation = rows[0];
  if (!invitation) {
    return res.status(404).json({ valid: false, reason: 'not_found' });
  }
  const status = invitationStatus(invitation);
  return res.json({
    valid: status === 'pending',
    status,
    full_name: invitation.full_name,
    role: invitation.role,
  });
}));

// Revoke an invitation (creator or supervisor).
router.delete('/:id', authRequired, asyncHandler(async (req, res) => {
  if (!isStaff(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(`select * from invitations where id = $1`, [req.params.id]);
  const invitation = rows[0];
  if (!invitation) {
    return res.status(404).json({ error: 'Invitation not found' });
  }
  if (!isSupervisor(req.user.role) && String(invitation.created_by) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query(`delete from invitations where id = $1`, [req.params.id]);
  await logAudit({
    actorId: req.user.id,
    action: 'invitation_revoked',
    targetType: 'invitation',
    targetId: invitation.id,
  });

  return res.status(204).send();
}));

export default router;
