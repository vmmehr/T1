import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (['local-dev-secret', 'change-this-local-secret'].includes(jwtSecret)) {
  throw new Error('JWT_SECRET must be a strong non-default value');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const isSupervisor = (role) => role === 'supervisor';
const isConsultant = (role) => role === 'consultant';
const isPsychologist = (role) => role === 'psychologist';
const isStaff = (role) => isConsultant(role) || isPsychologist(role) || isSupervisor(role);
const VALID_DECISION_STATUS = new Set(['pending', 'success', 'fail']);
const FINAL_DECISION_STATUSES = new Set(['success', 'fail']);
const COMMENT_VISIBILITY_VALUES = new Set(['public', 'staff_private', 'psychologist_private']);
const COMMENT_STEP_SCOPES = new Set(['definition', 'analysis', 'strategy']);

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  full_name: user.full_name,
  role: user.role,
  consultant_id: user.consultant_id,
  psychologist_id: user.psychologist_id,
});

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });

const isFinalDecisionStatus = (status) => FINAL_DECISION_STATUSES.has(status);

const parsePositiveInt = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
};

const parsePositiveId = (value) => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
};

const parseIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const getWindowStartDate = (windowValue) => {
  if (!windowValue || windowValue === 'all') return null;
  if (windowValue === '30d' || windowValue === '90d') {
    const days = windowValue === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return startDate.toISOString();
  }
  return null;
};

const calculateWilsonInterval = (successCount, totalCount, z = 1.96) => {
  if (totalCount <= 0) return null;
  const p = successCount / totalCount;
  const z2 = z * z;
  const denominator = 1 + z2 / totalCount;
  const center = (p + z2 / (2 * totalCount)) / denominator;
  const margin = (z / denominator)
    * Math.sqrt((p * (1 - p) + z2 / (4 * totalCount)) / totalCount);
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
};

const getUserById = async (userId) => {
  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     where id = $1`,
    [userId],
  );
  return rows[0] || null;
};

const authRequired = asyncHandler(async (req, res, next) => {
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

const getDecisionMeta = async (decisionId) => {
  const { rows } = await pool.query(
    `select d.id, d.user_id, owner.consultant_id, owner.psychologist_id
     from decisions d
     join profiles owner on owner.id = d.user_id
     where d.id = $1`,
    [decisionId],
  );
  return rows[0] || null;
};

const canAccessDecision = (actor, decisionMeta) => {
  if (!decisionMeta) return false;
  if (actor.id === decisionMeta.user_id) return true;
  if (isSupervisor(actor.role)) return true;
  if (isConsultant(actor.role)) return decisionMeta.consultant_id === actor.id;
  if (isPsychologist(actor.role)) return decisionMeta.psychologist_id === actor.id;
  return false;
};

const canManageDecision = (actor, decisionMeta) => actor.id === decisionMeta?.user_id;

const consultantOwnsClient = async (consultantId, clientId) => {
  const { rows } = await pool.query(
    `select 1
     from profiles
     where id = $1 and role = 'client' and consultant_id = $2`,
    [clientId, consultantId],
  );
  return rows.length > 0;
};

const psychologistOwnsClient = async (psychologistId, clientId) => {
  const { rows } = await pool.query(
    `select 1
     from profiles
     where id = $1 and role = 'client' and psychologist_id = $2`,
    [clientId, psychologistId],
  );
  return rows.length > 0;
};

const canAccessTargetUserScope = async (actor, targetUserId) => {
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

const normalizeVisibilityInput = (value) => (value === 'internal' ? 'staff_private' : value);
const getReadableCommentVisibilitiesForRole = (role) => {
  if (isSupervisor(role) || isPsychologist(role)) {
    return ['public', 'staff_private', 'psychologist_private'];
  }
  if (isConsultant(role)) {
    return ['public', 'staff_private'];
  }
  return ['public'];
};
const isCommentVisibilityConstraintError = (error) => {
  if (!error || error.code !== '23514') return false;
  const details = `${error.constraint || ''} ${error.message || ''}`.toLowerCase();
  return details.includes('visibility');
};

const getReadableCommentVisibilities = (actor, decisionMeta) => {
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

const resolveCommentStepScope = (comment) => {
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

const updateDecisionWithOutcomeEvent = async ({
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

const getDecisionItemMeta = async (itemId) => {
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

const getTaskMeta = async (taskId) => {
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

const applyUpdate = async (table, id, updates, allowedColumns) => {
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/signup', asyncHandler(async (req, res) => {
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

app.post('/api/auth/login', asyncHandler(async (req, res) => {
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

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/profiles/consultants', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     where role = 'consultant'
     order by full_name asc nulls last, username asc`,
  );
  res.json(rows);
}));

app.get('/api/profiles/me/clients', authRequired, asyncHandler(async (req, res) => {
  if (!isConsultant(req.user.role) && !isPsychologist(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const assignmentColumn = isConsultant(req.user.role) ? 'consultant_id' : 'psychologist_id';
  const readableVisibilities = getReadableCommentVisibilitiesForRole(req.user.role);
  const { rows } = await pool.query(
    `select
       p.id,
       p.username,
       p.full_name,
       p.role,
       p.consultant_id,
       p.psychologist_id,
       coalesce(unread.unread_comments_count, 0)::int as unread_comments_count
     from profiles p
     left join lateral (
       select count(*)::int as unread_comments_count
       from decisions d
       join comments c on c.decision_id = d.id
       left join client_comment_reads ccr
         on ccr.staff_user_id = $1
        and ccr.client_user_id = p.id
       where d.user_id = p.id
         and c.user_id <> $1
         and (case when c.visibility = 'internal' then 'staff_private' else c.visibility end) = any($2::text[])
         and c.created_at > coalesce(ccr.last_read_at, 'epoch'::timestamptz)
     ) unread on true
     where p.role = 'client'
       and p.${assignmentColumn} = $1
     order by p.full_name asc nulls last, p.username asc`,
    [req.user.id, readableVisibilities],
  );
  return res.json(rows);
}));

app.post('/api/profiles/me/clients/:clientId/comments/read', authRequired, asyncHandler(async (req, res) => {
  if (!isConsultant(req.user.role) && !isPsychologist(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const clientId = req.params.clientId;
  const assignmentColumn = isConsultant(req.user.role) ? 'consultant_id' : 'psychologist_id';
  const { rows: clientRows } = await pool.query(
    `select id
     from profiles
     where id = $1
       and role = 'client'
       and ${assignmentColumn} = $2`,
    [clientId, req.user.id],
  );

  if (clientRows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  await pool.query(
    `insert into client_comment_reads (staff_user_id, client_user_id, last_read_at)
     values ($1, $2, now())
     on conflict (staff_user_id, client_user_id)
     do update set last_read_at = excluded.last_read_at`,
    [req.user.id, clientId],
  );

  return res.json({ ok: true, client_id: clientId });
}));

app.get('/api/profiles/:consultantId/clients', authRequired, asyncHandler(async (req, res) => {
  const { consultantId } = req.params;

  if (!isSupervisor(req.user.role) && !(isConsultant(req.user.role) && req.user.id === consultantId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     where role = 'client' and consultant_id = $1
     order by full_name asc nulls last, username asc`,
    [consultantId],
  );
  return res.json(rows);
}));

app.get('/api/profiles/me/assignments', authRequired, asyncHandler(async (req, res) => {
  if (req.user.role !== 'client') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select
       client.id,
       client.consultant_id,
       client.psychologist_id,
       cons.id as consultant_profile_id,
       cons.username as consultant_username,
       cons.full_name as consultant_full_name,
       psych.id as psychologist_profile_id,
       psych.username as psychologist_username,
       psych.full_name as psychologist_full_name
     from profiles client
     left join profiles cons on cons.id = client.consultant_id
     left join profiles psych on psych.id = client.psychologist_id
     where client.id = $1 and client.role = 'client'`,
    [req.user.id],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const row = rows[0];
  return res.json({
    consultant: row.consultant_profile_id
      ? {
        id: row.consultant_profile_id,
        username: row.consultant_username,
        full_name: row.consultant_full_name,
      }
      : null,
    psychologist: row.psychologist_profile_id
      ? {
        id: row.psychologist_profile_id,
        username: row.psychologist_username,
        full_name: row.psychologist_full_name,
      }
      : null,
  });
}));

app.patch('/api/profiles/:clientId/consultant', authRequired, asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const { consultantId } = req.body;

  if (!consultantId) {
    return res.status(400).json({ error: 'consultantId is required' });
  }

  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows: consultantRows } = await pool.query(
    `select id from profiles where id = $1 and role = 'consultant'`,
    [consultantId],
  );
  if (consultantRows.length === 0) {
    return res.status(400).json({ error: 'Invalid consultantId' });
  }

  const { rows } = await pool.query(
    `update profiles
     set consultant_id = $1
     where id = $2 and role = 'client'
     returning id, username, full_name, role, consultant_id, psychologist_id`,
    [consultantId, clientId],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  return res.json(rows[0]);
}));

app.get('/api/profiles/users', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id, psychologist_id
     from profiles
     order by created_at desc`,
  );
  return res.json(rows);
}));

app.post('/api/admin/users', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { username, password, fullName, role } = req.body;
  const allowedRoles = new Set(['client', 'consultant', 'psychologist']);

  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: 'username, password, fullName, and role are required' });
  }
  if (!allowedRoles.has(role)) {
    return res.status(400).json({ error: 'Invalid role value' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `insert into profiles (username, password_hash, full_name, role)
       values ($1, $2, $3, $4)
       returning id, username, full_name, role, consultant_id, psychologist_id`,
      [username, hashedPassword, fullName, role],
    );
    return res.status(201).json(publicUser(rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    throw error;
  }
}));

app.patch('/api/admin/clients/:clientId/assignments', authRequired, asyncHandler(async (req, res) => {
  if (!isSupervisor(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { clientId } = req.params;
  const hasConsultant = Object.prototype.hasOwnProperty.call(req.body, 'consultantId');
  const hasPsychologist = Object.prototype.hasOwnProperty.call(req.body, 'psychologistId');
  const { consultantId, psychologistId } = req.body;

  if (!hasConsultant && !hasPsychologist) {
    return res.status(400).json({ error: 'At least one assignment field is required' });
  }

  const { rows: clientRows } = await pool.query(
    `select id
     from profiles
     where id = $1 and role = 'client'`,
    [clientId],
  );
  if (clientRows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  if (hasConsultant && consultantId !== null) {
    const { rows } = await pool.query(
      `select id
       from profiles
       where id = $1 and role = 'consultant'`,
      [consultantId],
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid consultantId' });
    }
  }

  if (hasPsychologist && psychologistId !== null) {
    const { rows } = await pool.query(
      `select id
       from profiles
       where id = $1 and role = 'psychologist'`,
      [psychologistId],
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid psychologistId' });
    }
  }

  const fields = [];
  const params = [];
  if (hasConsultant) {
    params.push(consultantId ?? null);
    fields.push(`consultant_id = $${params.length}`);
  }
  if (hasPsychologist) {
    params.push(psychologistId ?? null);
    fields.push(`psychologist_id = $${params.length}`);
  }
  params.push(clientId);

  const { rows } = await pool.query(
    `update profiles
     set ${fields.join(', ')}
     where id = $${params.length} and role = 'client'
     returning id, username, full_name, role, consultant_id, psychologist_id`,
    params,
  );

  return res.json(rows[0]);
}));

app.get('/api/decisions', authRequired, asyncHandler(async (req, res) => {
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

app.get('/api/decisions/archive', authRequired, asyncHandler(async (req, res) => {
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

app.get('/api/decisions/stats', authRequired, asyncHandler(async (req, res) => {
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

app.post('/api/decisions', authRequired, asyncHandler(async (req, res) => {
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

app.patch('/api/decisions/:id', authRequired, asyncHandler(async (req, res) => {
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

app.delete('/api/decisions/:id', authRequired, asyncHandler(async (req, res) => {
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

app.get('/api/decisions/:id/details', authRequired, asyncHandler(async (req, res) => {
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

app.post('/api/decisions/:id/steps/:stepScope/read', authRequired, asyncHandler(async (req, res) => {
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

app.post('/api/decision-items', authRequired, asyncHandler(async (req, res) => {
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

app.patch('/api/decision-items/:id', authRequired, asyncHandler(async (req, res) => {
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

app.delete('/api/decision-items/:id', authRequired, asyncHandler(async (req, res) => {
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

app.post('/api/tasks', authRequired, asyncHandler(async (req, res) => {
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

app.patch('/api/tasks/:id', authRequired, asyncHandler(async (req, res) => {
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

app.delete('/api/tasks/:id', authRequired, asyncHandler(async (req, res) => {
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

app.post('/api/tasks/:id/comments/read', authRequired, asyncHandler(async (req, res) => {
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

app.post('/api/decision-items/:id/comments/read', authRequired, asyncHandler(async (req, res) => {
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

app.post('/api/comments', authRequired, asyncHandler(async (req, res) => {
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

app.use((error, _req, res, next) => {
  void next;
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
