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
const jwtSecret = process.env.JWT_SECRET || 'local-dev-secret';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const isPrivileged = (role) => role === 'psychologist' || role === 'supervisor';
const isStaff = (role) => role === 'consultant' || isPrivileged(role);

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  full_name: user.full_name,
  role: user.role,
  consultant_id: user.consultant_id,
});

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });

const getUserById = async (userId) => {
  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id
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
    `select d.id, d.user_id, owner.consultant_id
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
  if (isPrivileged(actor.role)) return true;
  return actor.role === 'consultant' && decisionMeta.consultant_id === actor.id;
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

const getDecisionItemMeta = async (itemId) => {
  const { rows } = await pool.query(
    `select di.id, di.decision_id, d.user_id, owner.consultant_id
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
    `select t.id, di.decision_id, d.user_id, owner.consultant_id
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
  const { username, password, fullName, consultantId } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'username, password, and fullName are required' });
  }

  if (consultantId) {
    const { rows: consultantRows } = await pool.query(
      `select id from profiles where id = $1 and role = 'consultant'`,
      [consultantId],
    );
    if (consultantRows.length === 0) {
      return res.status(400).json({ error: 'Invalid consultantId' });
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      `insert into profiles (username, password_hash, full_name, role, consultant_id)
       values ($1, $2, $3, 'client', $4)
       returning id, username, full_name, role, consultant_id`,
      [username, hashedPassword, fullName, consultantId || null],
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
    `select id, username, full_name, role, consultant_id, password_hash
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
    `select id, username, full_name, role, consultant_id
     from profiles
     where role = 'consultant'
     order by full_name asc nulls last, username asc`,
  );
  res.json(rows);
}));

app.get('/api/profiles/:consultantId/clients', authRequired, asyncHandler(async (req, res) => {
  const { consultantId } = req.params;

  if (!isPrivileged(req.user.role) && !(req.user.role === 'consultant' && req.user.id === consultantId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id
     from profiles
     where role = 'client' and consultant_id = $1
     order by full_name asc nulls last, username asc`,
    [consultantId],
  );
  return res.json(rows);
}));

app.patch('/api/profiles/:clientId/consultant', authRequired, asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const { consultantId } = req.body;

  if (!consultantId) {
    return res.status(400).json({ error: 'consultantId is required' });
  }

  const isSelfClientUpdate = req.user.role === 'client' && req.user.id === clientId;
  if (!isSelfClientUpdate && !isPrivileged(req.user.role)) {
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
     returning id, username, full_name, role, consultant_id`,
    [consultantId, clientId],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Client not found' });
  }

  return res.json(rows[0]);
}));

app.get('/api/profiles/users', authRequired, asyncHandler(async (req, res) => {
  if (!isPrivileged(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `select id, username, full_name, role, consultant_id
     from profiles
     order by created_at desc`,
  );
  return res.json(rows);
}));

app.get('/api/decisions', authRequired, asyncHandler(async (req, res) => {
  const targetUserId = req.query.userId || req.user.id;

  if (targetUserId !== req.user.id) {
    if (isPrivileged(req.user.role)) {
      // allowed
    } else if (req.user.role === 'consultant') {
      const allowed = await consultantOwnsClient(req.user.id, targetUserId);
      if (!allowed) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const { rows } = await pool.query(
    `select *
     from decisions
     where user_id = $1
     order by created_at desc`,
    [targetUserId],
  );
  return res.json(rows);
}));

app.post('/api/decisions', authRequired, asyncHandler(async (req, res) => {
  const { title, description, step = 1, status = 'pending', outcome_reason = '' } = req.body;

  const { rows } = await pool.query(
    `insert into decisions (user_id, title, description, step, status, outcome_reason)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [req.user.id, title || '', description || '', step, status, outcome_reason || ''],
  );

  return res.status(201).json(rows[0]);
}));

app.patch('/api/decisions/:id', authRequired, asyncHandler(async (req, res) => {
  const decisionId = Number(req.params.id);
  const decisionMeta = await getDecisionMeta(decisionId);

  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }

  if (!canManageDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updatedDecision = await applyUpdate('decisions', decisionId, req.body, [
    'title',
    'description',
    'step',
    'status',
    'outcome_reason',
  ]);

  return res.json(updatedDecision);
}));

app.delete('/api/decisions/:id', authRequired, asyncHandler(async (req, res) => {
  const decisionId = Number(req.params.id);
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
  const decisionId = Number(req.params.id);
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

  const commentParams = [decisionId];
  let visibilityClause = '';
  if (req.user.id === decisionMeta.user_id) {
    visibilityClause = `and c.visibility = 'public'`;
  }

  const { rows: comments } = await pool.query(
    `select
       c.*,
       json_build_object(
         'id', p.id,
         'username', p.username,
         'full_name', p.full_name,
         'role', p.role
       ) as profiles
     from comments c
     join profiles p on p.id = c.user_id
     where c.decision_id = $1
     ${visibilityClause}
     order by c.created_at asc`,
    commentParams,
  );

  return res.json({ items, tasks, comments });
}));

app.post('/api/decision-items', authRequired, asyncHandler(async (req, res) => {
  const { decision_id, type, text, weight = 0, strategy = '' } = req.body;
  const decisionMeta = await getDecisionMeta(decision_id);

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
    [decision_id, type, text, weight, strategy || ''],
  );
  return res.status(201).json(rows[0]);
}));

app.patch('/api/decision-items/:id', authRequired, asyncHandler(async (req, res) => {
  const itemId = Number(req.params.id);
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
  const itemId = Number(req.params.id);
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
  const itemMeta = await getDecisionItemMeta(decision_item_id);

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
    [decision_item_id, content, is_completed],
  );
  return res.status(201).json(rows[0]);
}));

app.patch('/api/tasks/:id', authRequired, asyncHandler(async (req, res) => {
  const taskId = Number(req.params.id);
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
  const taskId = Number(req.params.id);
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

app.post('/api/comments', authRequired, asyncHandler(async (req, res) => {
  const {
    decision_id,
    content,
    target_item_id = null,
    task_id = null,
    visibility = 'public',
    section = 'general',
  } = req.body;

  const decisionMeta = await getDecisionMeta(decision_id);
  if (!decisionMeta) {
    return res.status(404).json({ error: 'Decision not found' });
  }
  if (!canAccessDecision(req.user, decisionMeta)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let finalVisibility = visibility;
  if (req.user.id === decisionMeta.user_id) {
    finalVisibility = 'public';
  }
  if (!['public', 'internal'].includes(finalVisibility)) {
    return res.status(400).json({ error: 'Invalid visibility value' });
  }
  if (!isStaff(req.user.role) && finalVisibility !== 'public') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `insert into comments (decision_id, user_id, content, target_item_id, task_id, visibility, section)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      decision_id,
      req.user.id,
      content,
      target_item_id,
      task_id,
      finalVisibility,
      section,
    ],
  );

  const insertedComment = rows[0];
  const commentWithProfile = {
    ...insertedComment,
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
