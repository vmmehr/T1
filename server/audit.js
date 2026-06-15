import { pool } from './db.js';

// Record an administrative action. Best-effort: auditing must never break the
// main operation, so failures are logged and swallowed.
export const logAudit = async ({
  actorId = null,
  action,
  targetType = null,
  targetId = null,
  details = null,
}) => {
  try {
    await pool.query(
      `insert into audit_log (actor_id, action, target_type, target_id, details)
       values ($1, $2, $3, $4, $5)`,
      [
        actorId,
        action,
        targetType,
        targetId === null || targetId === undefined ? null : String(targetId),
        details ? JSON.stringify(details) : null,
      ],
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};
