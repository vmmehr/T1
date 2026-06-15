import crypto from 'node:crypto';
import express from 'express';

import { authRequired } from '../auth.js';
import { logAudit } from '../audit.js';
import { pool } from '../db.js';
import { asyncHandler, isSupervisor } from '../utils.js';

const router = express.Router();

const resetStatus = (row) => {
  if (row.used_at) return 'used';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
};

// Supervisor issues a password-reset link for a user.
router.post('/', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const { rows: userRows } = await pool.query(
    `select id, username, full_name from profiles where id = $1`,
    [userId],
  );
  const targetUser = userRows[0];
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const expiresInDays = Math.max(1, Math.min(Number(req.body.expiresInDays) || 3, 14));
  const token = crypto.randomBytes(24).toString('hex');
  const { rows } = await pool.query(
    `insert into password_resets (user_id, token, created_by, expires_at)
     values ($1, $2, $3, now() + ($4 || ' days')::interval)
     returning *`,
    [targetUser.id, token, req.user.id, String(expiresInDays)],
  );

  const reset = rows[0];
  await logAudit({
    actorId: req.user.id,
    action: 'password_reset_created',
    targetType: 'profile',
    targetId: targetUser.id,
    details: { username: targetUser.username },
  });

  return res.status(201).json({
    ...reset,
    status: resetStatus(reset),
    user: { id: targetUser.id, username: targetUser.username, full_name: targetUser.full_name },
  });
}));

// Public: validate a reset token so the reset page can show the user's name.
router.get('/:token', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `select pr.used_at, pr.expires_at, p.full_name
     from password_resets pr
     join profiles p on p.id = pr.user_id
     where pr.token = $1`,
    [req.params.token],
  );
  const reset = rows[0];
  if (!reset) {
    return res.status(404).json({ valid: false, reason: 'not_found' });
  }
  const status = resetStatus(reset);
  return res.json({ valid: status === 'pending', status, full_name: reset.full_name });
}));

export default router;
