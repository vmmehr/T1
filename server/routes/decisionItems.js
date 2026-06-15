import express from 'express';

import { authRequired } from '../auth.js';
import {
  applyUpdate,
  canAccessDecision,
  canManageDecision,
  getDecisionItemMeta,
  getDecisionMeta,
} from '../access.js';
import { pool } from '../db.js';
import { asyncHandler, parsePositiveId } from '../utils.js';

const router = express.Router();

router.post('/', authRequired, asyncHandler(async (req, res) => {
  const { decision_id, type, text, weight = 0, strategy = '' } = req.body;
  const decisionId = parsePositiveId(decision_id);
  if (!decisionId) {
    return res.status(400).json({ error: 'Invalid decision_id' });
  }

  const decisionMeta = await getDecisionMeta(decisionId);

  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }
  if (!canManageDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `insert into decision_items (decision_id, type, text, weight, strategy)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [decisionId, type, text, weight, strategy || ''],
  );
  return res.status(201).json(rows[0]);
}));

router.patch('/:id', authRequired, asyncHandler(async (req, res) => {
  const itemId = parsePositiveId(req.params.id);
  if (!itemId) {
    return res.status(400).json({ error: 'Invalid decision item id' });
  }
  const itemMeta = await getDecisionItemMeta(itemId);

  if (!itemMeta) {
    return res.status(404).json({ error: 'Decision item not found' });
  }
  if (!canManageDecision(req.user, itemMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updatedItem = await applyUpdate('decision_items', itemId, req.body, ['text', 'weight', 'strategy']);
  return res.json(updatedItem);
}));

router.delete('/:id', authRequired, asyncHandler(async (req, res) => {
  const itemId = parsePositiveId(req.params.id);
  if (!itemId) {
    return res.status(400).json({ error: 'Invalid decision item id' });
  }
  const itemMeta = await getDecisionItemMeta(itemId);

  if (!itemMeta) {
    return res.status(404).json({ error: 'Decision item not found' });
  }
  if (!canManageDecision(req.user, itemMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query(`delete from decision_items where id = $1`, [itemId]);
  return res.status(204).send();
}));

router.post('/:id/comments/read', authRequired, asyncHandler(async (req, res) => {
  const itemId = parsePositiveId(req.params.id);
  if (!itemId) {
    return res.status(400).json({ error: 'Invalid decision item id' });
  }

  const decisionItemMeta = await getDecisionItemMeta(itemId);
  if (!decisionItemMeta) {
    return res.status(404).json({ error: 'Decision item not found' });
  }
  if (!canAccessDecision(req.user, decisionItemMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query(
    `insert into decision_item_comment_reads (user_id, decision_item_id, last_read_at)
     values ($1, $2, now())
     on conflict (user_id, decision_item_id)
     do update set last_read_at = excluded.last_read_at`,
    [req.user.id, itemId],
  );

  return res.json({ ok: true, decision_item_id: itemId });
}));

export default router;
