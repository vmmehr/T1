import bcrypt from 'bcryptjs';
import express from 'express';

import { authRequired, signToken } from '../auth.js';
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
