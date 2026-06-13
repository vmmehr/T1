import bcrypt from 'bcryptjs';
import express from 'express';

import { authRequired, signToken } from '../auth.js';
import { logAudit } from '../audit.js';
import { allowPublicSignup } from '../config.js';
import { pool } from '../db.js';
import { asyncHandler, publicUser } from '../utils.js';

const router = express.Router();

router.post('/signup', asyncHandler(async (req, res) => {
  if (!allowPublicSignup) {
    return res.status(403).json({ error: 'Public signup is disabled. Please contact a supervisor.' });
  }

  const { username, password, fullName } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'username, password, and fullName are required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      `insert into profiles (username, password_hash, full_name, role)
       values ($1, $2, $3, 'client')
       returning id, username, full_name, role, consultant_id, psychologist_id`,
      [username, hashedPassword, fullName],
    );

    const user = rows[0];
    const token = signToken(user);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    throw error;
  }
}));

// Accept a one-time invitation: creates a client pre-assigned to the inviting
// staff and auto-logs them in. Authorized by the invite token (independent of
// the public-signup toggle).
router.post('/accept-invite', asyncHandler(async (req, res) => {
  const { token, username, password, fullName } = req.body;

  if (!token || !username || !password) {
    return res.status(400).json({ error: 'token, username, and password are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: inviteRows } = await client.query(
      `select * from invitations where token = $1 for update`,
      [token],
    );
    const invitation = inviteRows[0];
    if (!invitation) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Invitation not found' });
    }
    if (invitation.used_at) {
      await client.query('rollback');
      return res.status(409).json({ error: 'This invitation has already been used' });
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      await client.query('rollback');
      return res.status(410).json({ error: 'This invitation has expired' });
    }

    const resolvedFullName = String(fullName || invitation.full_name || '').trim();
    if (!resolvedFullName) {
      await client.query('rollback');
      return res.status(400).json({ error: 'fullName is required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let user;
    try {
      const { rows } = await client.query(
        `insert into profiles (username, password_hash, full_name, role, consultant_id, psychologist_id)
         values ($1, $2, $3, 'client', $4, $5)
         returning id, username, full_name, role, consultant_id, psychologist_id`,
        [username, hashedPassword, resolvedFullName, invitation.consultant_id, invitation.psychologist_id],
      );
      user = rows[0];
    } catch (error) {
      await client.query('rollback');
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      throw error;
    }

    await client.query(
      `update invitations set used_at = now(), used_by = $1 where id = $2`,
      [user.id, invitation.id],
    );

    await client.query('commit');

    await logAudit({
      actorId: invitation.created_by,
      action: 'invitation_accepted',
      targetType: 'profile',
      targetId: user.id,
      details: { invitation_id: invitation.id, username: user.username },
    });

    const authToken = signToken(user);
    return res.status(201).json({ token: authToken, user: publicUser(user) });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id, password_hash
     from profiles
     where username = $1`,
    [username],
  );

  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user);
  return res.json({ token, user: publicUser(user) });
}));

router.get('/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
