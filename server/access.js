import {
  FINAL_DECISION_STATUSES,
  VALID_DECISION_STATUS,
} from './config.js';
import { pool } from './db.js';
import {
  isConsultant,
  isPsychologist,
  isSupervisor,
} from './utils.js';

export const isFinalDecisionStatus = (status) => FINAL_DECISION_STATUSES.has(status);

export const getDecisionMeta = async (decisionId) => {
  const { rows } = await pool.query(
    `select d.id, d.user_id, owner.consultant_id, owner.psychologist_id
     from decisions d
     join profiles owner on owner.id = d.user_id
     where d.id = $1`,
    [decisionId],
  );
  return rows[0] || null;
};

export const canAccessDecision = (actor, decisionMeta) => {
  if (!decisionMeta) return false;
  if (actor.id === decisionMeta.user_id) return true;
  if (isSupervisor(actor.role)) return true;
  if (isConsultant(actor.role)) return decisionMeta.consultant_id === actor.id;
  if (isPsychologist(actor.role)) return decisionMeta.psychologist_id === actor.id;
  return false;
};

export const canManageDecision = (actor, decisionMeta) => actor.id === decisionMeta?.user_id;

export const consultantOwnsClient = async (consultantId, clientId) => {
  const { rows } = await pool.query(
    `select 1
     from profiles
     where id = $1 and role = 'client' and consultant_id = $2`,
    [clientId, consultantId],
  );
  return rows.length > 0;
};

export const psychologistOwnsClient = async (psychologistId, clientId) => {
  const { rows } = await pool.query(
    `select 1
     from profiles
     where id = $1 and role = 'client' and psychologist_id = $2`,
    [clientId, psychologistId],
  );
  return rows.length > 0;
};

export const canAccessTargetUserScope = async (actor, targetUserId) => {
  if (targetUserId === actor.id) return true;
  if (isSupervisor(actor.role)) return true;
  if (isConsultant(actor.role)) {
    return consultantOwnsClient(actor.id, targetUserId);
  }
  if (isPsychologist(actor.role)) {
    return psychologistOwnsClient(actor.id, targetUserId);
  }
  return false;
};

export const normalizeVisibilityInput = (value) => (value === 'internal' ? 'staff_private' : value);

export const getReadableCommentVisibilitiesForRole = (role) => {
  if (isSupervisor(role) || isPsychologist(role)) {
    return ['public', 'staff_private', 'psychologist_private'];
  }
  if (isConsultant(role)) {
    return ['public', 'staff_private'];
  }
  return ['public'];
};

export const isCommentVisibilityConstraintError = (error) => {
  if (!error || error.code !== '23514') return false;
  const details = `${error.constraint || ''} ${error.message || ''}`.toLowerCase();
  return details.includes('visibility');
};

export const getReadableCommentVisibilities = (actor, decisionMeta) => {
  if (actor.id === decisionMeta.user_id) return ['public'];
  if (isSupervisor(actor.role)) return getReadableCommentVisibilitiesForRole(actor.role);
  if (isPsychologist(actor.role) && actor.id === decisionMeta.psychologist_id) {
    return getReadableCommentVisibilitiesForRole(actor.role);
  }
  if (isConsultant(actor.role) && actor.id === decisionMeta.consultant_id) {
    return getReadableCommentVisibilitiesForRole(actor.role);
  }
  return ['public'];
};

export const resolveCommentStepScope = (comment) => {
  if (comment.task_id !== null && comment.task_id !== undefined) {
    return 'strategy';
  }
  if (comment.target_item_id !== null && comment.target_item_id !== undefined) {
    return 'analysis';
  }
  if (comment.section === 'strategy') {
    return 'strategy';
  }
  if (comment.section === 'outcome_reflection') {
    return null;
  }
  return 'definition';
};

const getDecisionByIdForUpdate = async (client, decisionId) => {
  const { rows } = await client.query(
    `select *
     from decisions
     where id = $1
     for update`,
    [decisionId],
  );
  return rows[0] || null;
};

export const updateDecisionWithOutcomeEvent = async ({
  decisionId,
  actorUserId,
  updates,
  reflectionPayload = null,
}) => {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const existingDecision = await getDecisionByIdForUpdate(client, decisionId);
    if (!existingDecision) {
      const notFoundError = new Error('Decision not found');
      notFoundError.status = 404;
      throw notFoundError;
    }

    const nextStatus = updates.status !== undefined ? updates.status : existingDecision.status;
    if (!VALID_DECISION_STATUS.has(nextStatus)) {
      const invalidStatusError = new Error('Invalid status value');
      invalidStatusError.status = 400;
      throw invalidStatusError;
    }

    const currentIsFinal = isFinalDecisionStatus(existingDecision.status);
    const nextIsFinal = isFinalDecisionStatus(nextStatus);
    const reasonChangedForFinalized = (
      currentIsFinal
      && updates.outcome_reason !== undefined
      && updates.outcome_reason !== existingDecision.outcome_reason
    );

    let eventType = null;
    if (!currentIsFinal && nextIsFinal) {
      eventType = 'finalized';
    } else if (currentIsFinal && !nextIsFinal) {
      eventType = 'reopened';
    } else if (currentIsFinal && nextIsFinal && (
      existingDecision.status !== nextStatus || reasonChangedForFinalized
    )) {
      eventType = 'revised';
    }

    const entries = Object.entries(updates).filter(([
      key,
      value,
    ]) => ['title', 'description', 'step', 'status', 'outcome_reason'].includes(key) && value !== undefined);

    if (eventType === 'reopened') {
      entries.push(['finalized_at', null]);
    } else if (eventType && nextIsFinal) {
      entries.push(['finalized_at', new Date().toISOString()]);
    }

    let updatedDecision = existingDecision;
    if (entries.length > 0) {
      const setClause = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
      const values = entries.map(([, value]) => value);
      values.push(decisionId);

      const { rows } = await client.query(
        `update decisions
         set ${setClause}
         where id = $${values.length}
         returning *`,
        values,
      );
      updatedDecision = rows[0];
    }

    let outcomeEvent = null;
    if (eventType) {
      const revisionOfEventId = eventType === 'revised' ? existingDecision.latest_outcome_event_id : null;
      const normalizedPayload = reflectionPayload && typeof reflectionPayload === 'object'
        ? reflectionPayload
        : null;
      const eventReason = updates.outcome_reason !== undefined
        ? updates.outcome_reason
        : updatedDecision.outcome_reason;

      const { rows } = await client.query(
        `insert into decision_outcome_events (
          decision_id,
          actor_user_id,
          event_type,
          from_status,
          to_status,
          outcome_reason,
          reflection_payload,
          revision_of_event_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning *`,
        [
          decisionId,
          actorUserId,
          eventType,
          existingDecision.status,
          nextStatus,
          eventReason || '',
          normalizedPayload ? JSON.stringify(normalizedPayload) : null,
          revisionOfEventId,
        ],
      );
      outcomeEvent = rows[0];

      const latestUpdate = await client.query(
        `update decisions
         set latest_outcome_event_id = $1
         where id = $2
         returning *`,
        [outcomeEvent.id, decisionId],
      );
      updatedDecision = latestUpdate.rows[0];
    }

    await client.query('commit');
    return { decision: updatedDecision, outcomeEvent };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const getDecisionItemMeta = async (itemId) => {
  const { rows } = await pool.query(
    `select di.id, di.decision_id, d.user_id, owner.consultant_id, owner.psychologist_id
     from decision_items di
     join decisions d on d.id = di.decision_id
     join profiles owner on owner.id = d.user_id
     where di.id = $1`,
    [itemId],
  );
  return rows[0] || null;
};

export const getTaskMeta = async (taskId) => {
  const { rows } = await pool.query(
    `select t.id, di.decision_id, d.user_id, owner.consultant_id, owner.psychologist_id
     from tasks t
     join decision_items di on di.id = t.decision_item_id
     join decisions d on d.id = di.decision_id
     join profiles owner on owner.id = d.user_id
     where t.id = $1`,
    [taskId],
  );
  return rows[0] || null;
};

export const getCommentMeta = async (commentId) => {
  const { rows } = await pool.query(
    `select
       c.id,
       c.decision_id,
       c.user_id as comment_user_id,
       d.user_id as decision_user_id,
       owner.consultant_id,
       owner.psychologist_id
     from comments c
     join decisions d on d.id = c.decision_id
     join profiles owner on owner.id = d.user_id
     where c.id = $1`,
    [commentId],
  );
  return rows[0] || null;
};

export const applyUpdate = async (table, id, updates, allowedColumns) => {
  const entries = Object.entries(updates).filter(([key, value]) => allowedColumns.includes(key) && value !== undefined);
  if (entries.length === 0) {
    const { rows } = await pool.query(`select * from ${table} where id = $1`, [id]);
    return rows[0] || null;
  }

  const setClause = entries.map(([key], index) => `${key} = $${index + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(id);

  const { rows } = await pool.query(
    `update ${table}
     set ${setClause}
     where id = $${values.length}
     returning *`,
    values,
  );

  return rows[0] || null;
};
