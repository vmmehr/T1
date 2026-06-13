import bcrypt from 'bcryptjs';
import express from 'express';

import { authRequired } from '../auth.js';
import { logAudit } from '../audit.js';
import { pool } from '../db.js';
import {
  asyncHandler,
  isSupervisor,
  isUuid,
  publicUser,
} from '../utils.js';

const router = express.Router();

router.post('/users', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { username, password, fullName, role } = req.body;
  const allowedRoles = new Set(['client', 'consultant', 'psychologist', 'supervisor']);

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: 'username, password, fullName, and role are required' });
  }
  if (!allowedRoles.has(role)) {
    return res.status(400).json({ error: 'Invalid role value' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `insert into profiles (username, password_hash, full_name, role)
       values ($1, $2, $3, $4)
       returning id, username, full_name, role, consultant_id, psychologist_id`,
      [username, hashedPassword, fullName, role],
    );
    const created = rows[0];
    await logAudit({
      actorId: req.user.id,
      action: 'user_created',
      targetType: 'profile',
      targetId: created.id,
      details: { username: created.username, role: created.role },
    });
    return res.status(201).json(publicUser(created));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    throw error;
  }
}));

router.delete('/users/:userId', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { userId } = req.params;
  if (!isUuid(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (String(req.user.id) === String(userId)) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const { rows: targetUserRows } = await pool.query(
    `select id, role
     from profiles
     where id = $1`,
    [userId],
  );

  if (targetUserRows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (targetUserRows[0].role === 'supervisor') {
    const { rows: supervisorRows } = await pool.query(
      `select count(*)::int as total
       from profiles
       where role = 'supervisor'`,
    );

    if (Number(supervisorRows[0]?.total || 0) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last supervisor account' });
    }
  }

  const { rows: deletedRows } = await pool.query(
    `with clear_consultant_assignments as (
       update profiles
       set consultant_id = null
       where consultant_id = $1
     ),
     clear_psychologist_assignments as (
       update profiles
       set psychologist_id = null
       where psychologist_id = $1
     )
     delete from profiles
     where id = $1
     returning id, username, full_name, role`,
    [userId],
  );

  if (deletedRows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  await logAudit({
    actorId: req.user.id,
    action: 'user_deleted',
    targetType: 'profile',
    targetId: deletedRows[0].id,
    details: { username: deletedRows[0].username, role: deletedRows[0].role },
  });

  return res.json({ deletedUser: deletedRows[0] });
}));

router.patch('/clients/:clientId/assignments', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { clientId } = req.params;
  const hasConsultant = Object.prototype.hasOwnProperty.call(req.body, 'consultantId');
  const hasPsychologist = Object.prototype.hasOwnProperty.call(req.body, 'psychologistId');
  const { consultantId, psychologistId } = req.body;

  if (!hasConsultant && !hasPsychologist) {
    return res.status(400).json({ error: 'At least one assignment field is required' });
  }

  const { rows: clientRows } = await pool.query(
    `select id
     from profiles
     where id = $1 and role = 'client'`,
    [clientId],
  );
  if (clientRows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  if (hasConsultant && consultantId !== null) {
    const { rows } = await pool.query(
      `select id
       from profiles
       where id = $1 and role = 'consultant'`,
      [consultantId],
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid consultantId' });
    }
  }

  if (hasPsychologist && psychologistId !== null) {
    const { rows } = await pool.query(
      `select id
       from profiles
       where id = $1 and role = 'psychologist'`,
      [psychologistId],
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid psychologistId' });
    }
  }

  const fields = [];
  const params = [];
  if (hasConsultant) {
    params.push(consultantId ?? null);
    fields.push(`consultant_id = $${params.length}`);
  }
  if (hasPsychologist) {
    params.push(psychologistId ?? null);
    fields.push(`psychologist_id = $${params.length}`);
  }
  params.push(clientId);

  const { rows } = await pool.query(
    `update profiles
     set ${fields.join(', ')}
     where id = $${params.length} and role = 'client'
     returning id, username, full_name, role, consultant_id, psychologist_id`,
    params,
  );

  await logAudit({
    actorId: req.user.id,
    action: 'assignments_updated',
    targetType: 'profile',
    targetId: clientId,
    details: {
      ...(hasConsultant ? { consultant_id: consultantId ?? null } : {}),
      ...(hasPsychologist ? { psychologist_id: psychologistId ?? null } : {}),
    },
  });

  return res.json(rows[0]);
}));

export default router;
