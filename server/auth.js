import jwt from 'jsonwebtoken';

import { jwtSecret } from './config.js';
import { pool } from './db.js';
import { asyncHandler } from './utils.js';

export const getUserById = async (userId) => {
  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     where id = $1`,
    [userId],
  );
  return rows[0] || null;
};

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });

export const authRequired = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});
