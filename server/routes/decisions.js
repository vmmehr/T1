import express from 'express';

import { authRequired } from '../auth.js';
import {
  canAccessDecision,
  canAccessTargetUserScope,
  canManageDecision,
  getDecisionMeta,
  getReadableCommentVisibilities,
  getReadableCommentVisibilitiesForRole,
  isFinalDecisionStatus,
  resolveCommentStepScope,
  updateDecisionWithOutcomeEvent,
} from '../access.js';
import {
  COMMENT_STEP_SCOPES,
  VALID_DECISION_STATUS,
} from '../config.js';
import { pool } from '../db.js';
import {
  asyncHandler,
  calculateWilsonInterval,
  getWindowStartDate,
  parseIsoDate,
  parsePositiveId,
  parsePositiveInt,
} from '../utils.js';

const router = express.Router();

router.get('/', authRequired, asyncHandler(async (req, res) => {
  const targetUserId = req.query.userId || req.user.id;

  const canAccessTarget = await canAccessTargetUserScope(req.user, targetUserId);
  if (!canAccessTarget) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const readableVisibilities = String(targetUserId) === String(req.user.id)
    ? ['public']
    : getReadableCommentVisibilitiesForRole(req.user.role);
  const { rows } = await pool.query(
    `select
       d.*,
       coalesce(unread.unread_comments_count, 0)::int as unread_comments_count
     from decisions d
     left join lateral (
       select count(*)::int as unread_comments_count
       from comments c
       left join task_comment_reads tcr
         on c.task_id is not null
        and tcr.user_id = $2
        and tcr.task_id = c.task_id
       left join decision_step_comment_reads dsr
         on c.task_id is null
        and c.section <> 'outcome_reflection'
        and dsr.user_id = $2
        and dsr.decision_id = d.id
        and dsr.step_scope = case
          when c.target_item_id is not null then 'analysis'
          when c.section = 'strategy' then 'strategy'
          else 'definition'
        end
       where c.decision_id = d.id
         and c.user_id <> $2
         and (case when c.visibility = 'internal' then 'staff_private' else c.visibility end) = any($3::text[])
         and c.section <> 'outcome_reflection'
         and c.created_at > coalesce(tcr.last_read_at, dsr.last_read_at, 'epoch'::timestamptz)
     ) unread on true
     where d.user_id = $1
     order by d.created_at desc`,
    [targetUserId, req.user.id, readableVisibilities],
  );
  return res.json(rows);
}));

router.get('/archive', authRequired, asyncHandler(async (req, res) => {
  const targetUserId = req.query.userId || req.user.id;
  const canAccessTarget = await canAccessTargetUserScope(req.user, targetUserId);
  if (!canAccessTarget) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const statusFilter = req.query.status;
  if (statusFilter && !['success', 'fail'].includes(statusFilter)) {
    return res.status(400).json({ error: 'Invalid status filter' });
  }

  const fromDate = parseIsoDate(req.query.from);
  const toDate = parseIsoDate(req.query.to);
  if (req.query.from && !fromDate) {
    return res.status(400).json({ error: 'Invalid from date' });
  }
  if (req.query.to && !toDate) {
    return res.status(400).json({ error: 'Invalid to date' });
  }

  const limit = parsePositiveInt(req.query.limit, 20, { min: 1, max: 100 });
  const offset = parsePositiveInt(req.query.offset, 0, { min: 0, max: 10000 });

  const filterParams = [targetUserId, statusFilter || null, fromDate, toDate];
  const filterSql = `
    d.user_id = $1
    and d.status in ('success', 'fail')
    and ($2::text is null or d.status = $2)
    and ($3::timestamptz is null or d.finalized_at >= $3)
    and ($4::timestamptz is null or d.finalized_at <= $4)
  `;

  const dataParams = [...filterParams, limit, offset];
  const { rows } = await pool.query(
    `select
       d.id,
       d.title,
       d.description,
       d.created_at,
       d.finalized_at,
       d.status as latest_status,
       d.outcome_reason as latest_outcome_reason,
       d.latest_outcome_event_id,
       coalesce(rev.revision_count, 0)::int as revision_count,
       round(greatest(extract(epoch from (d.finalized_at - d.created_at)) / 86400.0, 0), 2) as time_to_outcome_days
     from decisions d
     left join lateral (
       select count(*)::int as revision_count
       from decision_outcome_events e
       where e.decision_id = d.id
         and e.event_type = 'revised'
     ) rev on true
     where ${filterSql}
     order by d.finalized_at desc nulls last, d.created_at desc
     limit $5
     offset $6`,
    dataParams,
  );

  const totalResult = await pool.query(
    `select count(*)::int as total
     from decisions d
     where ${filterSql}`,
    filterParams,
  );

  return res.json({
    items: rows,
    total: totalResult.rows[0]?.total || 0,
    limit,
    offset,
  });
}));

router.get('/stats', authRequired, asyncHandler(async (req, res) => {
  const targetUserId = req.query.userId || req.user.id;
  const canAccessTarget = await canAccessTargetUserScope(req.user, targetUserId);
  if (!canAccessTarget) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const requestedWindow = req.query.window || 'all';
  if (!['all', '30d', '90d'].includes(requestedWindow)) {
    return res.status(400).json({ error: 'Invalid window value' });
  }

  const startDate = getWindowStartDate(requestedWindow);
  const { rows } = await pool.query(
    `select
       count(*)::int as total_count,
       count(*) filter (where status = 'success')::int as success_count,
       count(*) filter (where status = 'fail')::int as fail_count,
       count(*) filter (where status = 'pending')::int as pending_count,
       count(*) filter (where status in ('success', 'fail'))::int as finalized_count,
       percentile_cont(0.5) within group (
         order by greatest(extract(epoch from (finalized_at - created_at)) / 86400.0, 0)
       ) filter (where status in ('success', 'fail') and finalized_at is not null) as median_time_to_outcome_days
     from decisions
     where user_id = $1
       and ($2::timestamptz is null or created_at >= $2)`,
    [targetUserId, startDate],
  );

  const stats = rows[0] || {};
  const totalCount = Number(stats.total_count || 0);
  const successCount = Number(stats.success_count || 0);
  const failCount = Number(stats.fail_count || 0);
  const pendingCount = Number(stats.pending_count || 0);
  const finalizedCount = Number(stats.finalized_count || 0);

  const successRate = finalizedCount > 0 ? successCount / finalizedCount : null;
  const completionRate = totalCount > 0 ? finalizedCount / totalCount : null;
  const wilsonInterval = calculateWilsonInterval(successCount, finalizedCount);

  return res.json({
    window: requestedWindow,
    total_count: totalCount,
    finalized_count: finalizedCount,
    success_count: successCount,
    fail_count: failCount,
    pending_count: pendingCount,
    success_rate: successRate,
    completion_rate: completionRate,
    median_time_to_outcome_days: stats.median_time_to_outcome_days === null
      ? null
      : Number(stats.median_time_to_outcome_days),
    success_rate_ci_95: wilsonInterval,
    low_sample_size: finalizedCount < 20,
  });
}));

router.post('/', authRequired, asyncHandler(async (req, res) => {
  const { title, description, step = 1, status = 'pending', outcome_reason = '' } = req.body;
  if (!VALID_DECISION_STATUS.has(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows } = await client.query(
      `insert into decisions (user_id, title, description, step, status, outcome_reason, finalized_at)
       values ($1, $2, $3, $4, $5, $6, case when $5 in ('success', 'fail') then now() else null end)
       returning *`,
      [req.user.id, title || '', description || '', step, status, outcome_reason || ''],
    );

    let createdDecision = rows[0];
    if (isFinalDecisionStatus(status)) {
      const eventResult = await client.query(
        `insert into decision_outcome_events (
          decision_id,
          actor_user_id,
          event_type,
          from_status,
          to_status,
          outcome_reason
        )
        values ($1, $2, 'finalized', 'pending', $3, $4)
        returning id`,
        [createdDecision.id, req.user.id, status, outcome_reason || ''],
      );

      const latestEventId = eventResult.rows[0].id;
      const updated = await client.query(
        `update decisions
         set latest_outcome_event_id = $1
         where id = $2
         returning *`,
        [latestEventId, createdDecision.id],
      );
      createdDecision = updated.rows[0];
    }

    await client.query('commit');
    return res.status(201).json(createdDecision);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/:id', authRequired, asyncHandler(async (req, res) => {
  const decisionId = parsePositiveId(req.params.id);
  if (!decisionId) {
    return res.status(400).json({ error: 'Invalid decision id' });
  }
  const decisionMeta = await getDecisionMeta(decisionId);

  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }

  if (!canManageDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const requestedUpdates = {
    title: req.body.title,
    description: req.body.description,
    step: req.body.step,
    status: req.body.status,
    outcome_reason: req.body.outcome_reason,
  };

  if (requestedUpdates.status !== undefined && !VALID_DECISION_STATUS.has(requestedUpdates.status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    const result = await updateDecisionWithOutcomeEvent({
      decisionId,
      actorUserId: req.user.id,
      updates: requestedUpdates,
      reflectionPayload: req.body.reflection_payload,
    });

    return res.json({
      ...result.decision,
      _outcome_event: result.outcomeEvent
        ? {
          id: result.outcomeEvent.id,
          event_type: result.outcomeEvent.event_type,
          created_at: result.outcomeEvent.created_at,
        }
        : null,
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    throw error;
  }
}));

router.delete('/:id', authRequired, asyncHandler(async (req, res) => {
  const decisionId = parsePositiveId(req.params.id);
  if (!decisionId) {
    return res.status(400).json({ error: 'Invalid decision id' });
  }
  const decisionMeta = await getDecisionMeta(decisionId);

  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }

  if (!canManageDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query(`delete from decisions where id = $1`, [decisionId]);
  return res.status(204).send();
}));

router.get('/:id/details', authRequired, asyncHandler(async (req, res) => {
  const decisionId = parsePositiveId(req.params.id);
  if (!decisionId) {
    return res.status(400).json({ error: 'Invalid decision id' });
  }
  const decisionMeta = await getDecisionMeta(decisionId);

  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }

  if (!canAccessDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows: items } = await pool.query(
    `select *
     from decision_items
     where decision_id = $1
     order by created_at asc`,
    [decisionId],
  );

  const itemIds = items.map((item) => item.id);
  let tasks = [];
  if (itemIds.length > 0) {
    const taskResult = await pool.query(
      `select *
       from tasks
       where decision_item_id = any($1::bigint[])
       order by created_at asc`,
      [itemIds],
    );
    tasks = taskResult.rows;
  }

  const readableVisibilities = getReadableCommentVisibilities(req.user, decisionMeta);
  const { rows: comments } = await pool.query(
    `select
       c.id,
       c.decision_id,
       c.user_id,
       c.content,
       c.target_item_id,
       c.task_id,
       c.section,
       case when c.visibility = 'internal' then 'staff_private' else c.visibility end as visibility,
       c.created_at,
       json_build_object(
         'id', p.id,
         'username', p.username,
         'full_name', p.full_name,
         'role', p.role
       ) as profiles
     from comments c
     join profiles p on p.id = c.user_id
     where c.decision_id = $1
       and (case when c.visibility = 'internal' then 'staff_private' else c.visibility end) = any($2::text[])
     order by c.created_at asc`,
    [decisionId, readableVisibilities],
  );

  const taskIds = tasks.map((task) => task.id);
  const taskUnreadCounts = {};
  if (taskIds.length > 0) {
    const { rows: unreadRows } = await pool.query(
      `select
         c.task_id,
         count(*)::int as unread_count
       from comments c
       left join task_comment_reads tcr
         on tcr.user_id = $2
        and tcr.task_id = c.task_id
       where c.decision_id = $1
         and c.task_id = any($3::bigint[])
         and c.user_id <> $2
         and (case when c.visibility = 'internal' then 'staff_private' else c.visibility end) = any($4::text[])
         and c.created_at > coalesce(tcr.last_read_at, 'epoch'::timestamptz)
       group by c.task_id`,
      [decisionId, req.user.id, taskIds, readableVisibilities],
    );

    unreadRows.forEach((row) => {
      taskUnreadCounts[row.task_id] = Number(row.unread_count) || 0;
    });
  }

  const itemUnreadCounts = {};
  if (itemIds.length > 0) {
    const { rows: unreadItemRows } = await pool.query(
      `select
         c.target_item_id as item_id,
         count(*)::int as unread_count
       from comments c
       left join decision_item_comment_reads dicr
         on dicr.user_id = $2
        and dicr.decision_item_id = c.target_item_id
       where c.decision_id = $1
         and c.target_item_id = any($3::bigint[])
         and (c.task_id is null)
         and c.user_id <> $2
         and (case when c.visibility = 'internal' then 'staff_private' else c.visibility end) = any($4::text[])
         and c.created_at > coalesce(dicr.last_read_at, 'epoch'::timestamptz)
       group by c.target_item_id`,
      [decisionId, req.user.id, itemIds, readableVisibilities],
    );

    unreadItemRows.forEach((row) => {
      itemUnreadCounts[row.item_id] = Number(row.unread_count) || 0;
    });
  }

  const { rows: stepReadRows } = await pool.query(
    `select step_scope, last_read_at
     from decision_step_comment_reads
     where user_id = $1 and decision_id = $2`,
    [req.user.id, decisionId],
  );
  const stepReadAt = { definition: 0, analysis: 0, strategy: 0 };
  stepReadRows.forEach((row) => {
    const scope = row.step_scope;
    if (!COMMENT_STEP_SCOPES.has(scope)) return;
    stepReadAt[scope] = Date.parse(row.last_read_at) || 0;
  });

  const stepUnreadCounts = { definition: 0, analysis: 0, strategy: 0, action_plan: 0 };
  comments.forEach((comment) => {
    if (String(comment.user_id) === String(req.user.id)) return;
    if (comment.task_id !== null && comment.task_id !== undefined) return;

    const scope = resolveCommentStepScope(comment);
    if (!scope || !COMMENT_STEP_SCOPES.has(scope)) return;

    const createdAt = Date.parse(comment.created_at) || 0;
    if (createdAt > (stepReadAt[scope] || 0)) {
      stepUnreadCounts[scope] += 1;
    }
  });

  return res.json({
    items,
    tasks,
    comments,
    task_unread_counts: taskUnreadCounts,
    item_unread_counts: itemUnreadCounts,
    step_unread_counts: stepUnreadCounts,
  });
}));

router.post('/:id/steps/:stepScope/read', authRequired, asyncHandler(async (req, res) => {
  const decisionId = parsePositiveId(req.params.id);
  if (!decisionId) {
    return res.status(400).json({ error: 'Invalid decision id' });
  }

  const stepScope = String(req.params.stepScope || '').trim();
  if (!COMMENT_STEP_SCOPES.has(stepScope)) {
    return res.status(400).json({ error: 'Invalid step scope' });
  }

  const decisionMeta = await getDecisionMeta(decisionId);
  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }
  if (!canAccessDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query(
    `insert into decision_step_comment_reads (user_id, decision_id, step_scope, last_read_at)
     values ($1, $2, $3, now())
     on conflict (user_id, decision_id, step_scope)
     do update set last_read_at = excluded.last_read_at`,
    [req.user.id, decisionId, stepScope],
  );

  return res.json({ ok: true, decision_id: decisionId, step_scope: stepScope });
}));

export default router;
