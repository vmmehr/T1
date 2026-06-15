import express from 'express';

import { authRequired } from '../auth.js';
import {
  applyUpdate,
  canAccessDecision,
  canManageDecision,
  getDecisionItemMeta,
  getTaskMeta,
} from '../access.js';
import { pool } from '../db.js';
import { asyncHandler, parsePositiveId } from '../utils.js';

const router = express.Router();

router.post('/', authRequired, asyncHandler(async (req, res) => {
  const { decision_item_id, content, is_completed = false } = req.body;
  const decisionItemId = parsePositiveId(decision_item_id);
  if (!decisionItemId) {
    return res.status(400).json({ error: 'Invalid decision_item_id' });
  }

  const itemMeta = await getDecisionItemMeta(decisionItemId);

  if (!itemMeta) {
    return res.status(404).json({ error: 'Decision item not found' });
  }
  if (!canManageDecision(req.user, itemMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `insert into tasks (decision_item_id, content, is_completed)
     values ($1, $2, $3)
     returning *`,
    [decisionItemId, content, is_completed],
  );
  return res.status(201).json(rows[0]);
}));

router.patch('/:id', authRequired, asyncHandler(async (req, res) => {
  const taskId = parsePositiveId(req.params.id);
  if (!taskId) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  const taskMeta = await getTaskMeta(taskId);

  if (!taskMeta) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (!canManageDecision(req.user, taskMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updatedTask = await applyUpdate('tasks', taskId, req.body, ['content', 'is_completed']);
  return res.json(updatedTask);
}));

router.delete('/:id', authRequired, asyncHandler(async (req, res) => {
  const taskId = parsePositiveId(req.params.id);
  if (!taskId) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  const taskMeta = await getTaskMeta(taskId);

  if (!taskMeta) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (!canManageDecision(req.user, taskMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query(`delete from tasks where id = $1`, [taskId]);
  return res.status(204).send();
}));

router.post('/:id/comments/read', authRequired, asyncHandler(async (req, res) => {
  const taskId = parsePositiveId(req.params.id);
  if (!taskId) {
    return res.status(400).json({ error: 'Invalid task id' });
  }

  const taskMeta = await getTaskMeta(taskId);
  if (!taskMeta) {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (!canAccessDecision(req.user, taskMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query(
    `insert into task_comment_reads (user_id, task_id, last_read_at)
     values ($1, $2, now())
     on conflict (user_id, task_id)
     do update set last_read_at = excluded.last_read_at`,
    [req.user.id, taskId],
  );

  return res.json({ ok: true, task_id: taskId });
}));

export default router;
