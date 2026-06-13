import express from 'express';

import { authRequired } from '../auth.js';
import { pool } from '../db.js';
import { asyncHandler, isSupervisor, parsePositiveInt } from '../utils.js';

const router = express.Router();

// Recent administrative actions. Supervisor only.
router.get('/', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const limit = parsePositiveInt(req.query.limit, 50, { min: 1, max: 200 });
  const { rows } = await pool.query(
    `select
       a.id,
       a.action,
       a.target_type,
       a.target_id,
       a.details,
       a.created_at,
       actor.full_name as actor_name,
       actor.username as actor_username
     from audit_log a
     left join profiles actor on actor.id = a.actor_id
     order by a.created_at desc
     limit $1`,
    [limit],
  );

  return res.json(rows);
}));

export default router;
