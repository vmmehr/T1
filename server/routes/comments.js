import express from 'express';

import { authRequired } from '../auth.js';
import {
  canAccessDecision,
  getCommentMeta,
  getDecisionMeta,
  isCommentVisibilityConstraintError,
  normalizeVisibilityInput,
} from '../access.js';
import { COMMENT_VISIBILITY_VALUES } from '../config.js';
import { pool } from '../db.js';
import {
  asyncHandler,
  isStaff,
  parsePositiveId,
} from '../utils.js';

const router = express.Router();

router.post('/', authRequired, asyncHandler(async (req, res) => {
  const {
    decision_id,
    content,
    target_item_id = null,
    task_id = null,
    visibility = 'public',
    section: rawSection = 'general',
  } = req.body;

  const decisionId = parsePositiveId(decision_id);
  if (!decisionId) {
    return res.status(400).json({ error: 'Invalid decision_id' });
  }

  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  const normalizedTargetItemId = target_item_id === null ? null : parsePositiveId(target_item_id);
  if (target_item_id !== null && !normalizedTargetItemId) {
    return res.status(400).json({ error: 'Invalid target_item_id' });
  }

  const normalizedTaskId = task_id === null ? null : parsePositiveId(task_id);
  if (task_id !== null && !normalizedTaskId) {
    return res.status(400).json({ error: 'Invalid task_id' });
  }

  const decisionMeta = await getDecisionMeta(decisionId);
  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }
  if (!canAccessDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (normalizedTargetItemId !== null) {
    const { rows: itemRows } = await pool.query(
      `select id, decision_id
       from decision_items
       where id = $1`,
      [normalizedTargetItemId],
    );
    const item = itemRows[0];
    if (!item || String(item.decision_id) !== String(decisionId)) {
      return res.status(400).json({ error: 'target_item_id must belong to the same decision' });
    }
  }

  if (normalizedTaskId !== null) {
    const { rows: taskRows } = await pool.query(
      `select t.id, t.decision_item_id, di.decision_id
       from tasks t
       join decision_items di on di.id = t.decision_item_id
       where t.id = $1`,
      [normalizedTaskId],
    );
    const task = taskRows[0];
    if (!task || String(task.decision_id) !== String(decisionId)) {
      return res.status(400).json({ error: 'task_id must belong to the same decision' });
    }
    if (normalizedTargetItemId !== null && String(task.decision_item_id) !== String(normalizedTargetItemId)) {
      return res.status(400).json({ error: 'task_id does not match target_item_id' });
    }
  }

  const requestedVisibility = normalizeVisibilityInput(visibility);
  let finalVisibility = requestedVisibility;
  if (req.user.id === decisionMeta.user_id) {
    finalVisibility = 'public';
  }
  if (!COMMENT_VISIBILITY_VALUES.has(finalVisibility)) {
    return res.status(400).json({ error: 'Invalid visibility value' });
  }
  if (!isStaff(req.user.role) && finalVisibility !== 'public') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const normalizedSection = typeof rawSection === 'string' && rawSection.trim()
    ? rawSection
    : 'general';

  const insertComment = async (visibilityValue) => {
    const { rows } = await pool.query(
      `insert into comments (decision_id, user_id, content, target_item_id, task_id, visibility, section)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        decisionId,
        req.user.id,
        content.trim(),
        normalizedTargetItemId,
        normalizedTaskId,
        visibilityValue,
        normalizedSection,
      ],
    );
    return rows[0];
  };

  let insertedComment;
  try {
    insertedComment = await insertComment(finalVisibility);
  } catch (error) {
    if (!isCommentVisibilityConstraintError(error) || finalVisibility === 'public') {
      throw error;
    }

    // Compatibility fallback for databases that still only accept legacy 'internal' visibility.
    insertedComment = await insertComment('internal');
  }

  const commentWithProfile = {
    ...insertedComment,
    visibility: normalizeVisibilityInput(insertedComment.visibility),
    profiles: {
      id: req.user.id,
      username: req.user.username,
      full_name: req.user.full_name,
      role: req.user.role,
    },
  };

  return res.status(201).json(commentWithProfile);
}));

router.delete('/:id', authRequired, asyncHandler(async (req, res) => {
  const commentId = parsePositiveId(req.params.id);
  if (!commentId) {
    return res.status(400).json({ error: 'Invalid comment id' });
  }

  const commentMeta = await getCommentMeta(commentId);
  if (!commentMeta) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  if (!canAccessDecision(req.user, {
    user_id: commentMeta.decision_user_id,
    consultant_id: commentMeta.consultant_id,
    psychologist_id: commentMeta.psychologist_id,
  })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (String(commentMeta.comment_user_id) !== String(req.user.id)) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }

  await pool.query(
    `delete from comments
     where id = $1 and user_id = $2`,
    [commentId, req.user.id],
  );

  return res.status(204).send();
}));

export default router;
