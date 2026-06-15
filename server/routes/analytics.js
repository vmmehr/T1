import express from 'express';

import { authRequired } from '../auth.js';
import { pool } from '../db.js';
import {
  asyncHandler,
  calculateWilsonInterval,
  isConsultant,
  isPsychologist,
  isSupervisor,
} from '../utils.js';

const router = express.Router();

const withSuccessRate = (row) => {
  const total = Number(row.total_decisions || 0);
  const finalized = Number(row.finalized_count || 0);
  const success = Number(row.success_count || 0);
  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    clients_count: row.clients_count !== undefined ? Number(row.clients_count) : undefined,
    total_decisions: total,
    finalized_count: finalized,
    success_count: success,
    success_rate: finalized > 0 ? success / finalized : null,
  };
};

// Role-scoped aggregate analytics:
// - supervisor: org-wide totals + per-consultant breakdown
// - consultant/psychologist: totals across their assigned clients + per-client breakdown
router.get('/overview', authRequired, asyncHandler(async (req, res) => {
  const { role, id: actorId } = req.user;

  let scope;
  let clientFilterSql;
  let filterParams;
  if (isSupervisor(role)) {
    scope = 'org';
    clientFilterSql = `role = 'client'`;
    filterParams = [];
  } else if (isConsultant(role)) {
    scope = 'consultant';
    clientFilterSql = `role = 'client' and consultant_id = $1`;
    filterParams = [actorId];
  } else if (isPsychologist(role)) {
    scope = 'psychologist';
    clientFilterSql = `role = 'client' and psychologist_id = $1`;
    filterParams = [actorId];
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const totalsResult = await pool.query(
    `with scoped_clients as (
       select id from profiles where ${clientFilterSql}
     ),
     client_decisions as (
       select d.*
       from decisions d
       join scoped_clients sc on sc.id = d.user_id
     )
     select
       (select count(*) from scoped_clients)::int as total_clients,
       count(distinct cd.user_id)::int as active_clients,
       count(cd.id)::int as total_decisions,
       count(*) filter (where cd.status = 'pending')::int as pending_count,
       count(*) filter (where cd.status = 'success')::int as success_count,
       count(*) filter (where cd.status = 'fail')::int as fail_count,
       count(*) filter (where cd.status in ('success', 'fail'))::int as finalized_count,
       percentile_cont(0.5) within group (
         order by greatest(extract(epoch from (cd.finalized_at - cd.created_at)) / 86400.0, 0)
       ) filter (where cd.status in ('success', 'fail') and cd.finalized_at is not null) as median_time_to_outcome_days
     from client_decisions cd`,
    filterParams,
  );

  const t = totalsResult.rows[0] || {};
  const finalizedCount = Number(t.finalized_count || 0);
  const successCount = Number(t.success_count || 0);
  const totalDecisions = Number(t.total_decisions || 0);

  const totals = {
    total_clients: Number(t.total_clients || 0),
    active_clients: Number(t.active_clients || 0),
    total_decisions: totalDecisions,
    pending_count: Number(t.pending_count || 0),
    success_count: successCount,
    fail_count: Number(t.fail_count || 0),
    finalized_count: finalizedCount,
    success_rate: finalizedCount > 0 ? successCount / finalizedCount : null,
    success_rate_ci_95: calculateWilsonInterval(successCount, finalizedCount),
    completion_rate: totalDecisions > 0 ? finalizedCount / totalDecisions : null,
    median_time_to_outcome_days: t.median_time_to_outcome_days === null
      || t.median_time_to_outcome_days === undefined
      ? null
      : Number(t.median_time_to_outcome_days),
    low_sample_size: finalizedCount < 20,
  };

  let breakdown;
  let breakdownBy;
  if (isSupervisor(role)) {
    breakdownBy = 'consultant';
    const { rows } = await pool.query(
      `select
         c.id,
         c.full_name,
         c.username,
         count(distinct cl.id)::int as clients_count,
         count(d.id)::int as total_decisions,
         count(d.id) filter (where d.status in ('success', 'fail'))::int as finalized_count,
         count(d.id) filter (where d.status = 'success')::int as success_count
       from profiles c
       left join profiles cl on cl.role = 'client' and cl.consultant_id = c.id
       left join decisions d on d.user_id = cl.id
       where c.role = 'consultant'
       group by c.id, c.full_name, c.username
       order by c.full_name asc nulls last, c.username asc`,
    );
    breakdown = rows.map(withSuccessRate);
  } else {
    breakdownBy = 'client';
    const assignmentColumn = isConsultant(role) ? 'consultant_id' : 'psychologist_id';
    const { rows } = await pool.query(
      `select
         cl.id,
         cl.full_name,
         cl.username,
         count(d.id)::int as total_decisions,
         count(d.id) filter (where d.status in ('success', 'fail'))::int as finalized_count,
         count(d.id) filter (where d.status = 'success')::int as success_count
       from profiles cl
       left join decisions d on d.user_id = cl.id
       where cl.role = 'client' and cl.${assignmentColumn} = $1
       group by cl.id, cl.full_name, cl.username
       order by cl.full_name asc nulls last, cl.username asc`,
      [actorId],
    );
    breakdown = rows.map(withSuccessRate);
  }

  return res.json({ scope, totals, breakdown_by: breakdownBy, breakdown });
}));

export default router;
