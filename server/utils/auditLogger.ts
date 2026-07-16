import { pool } from "../db.js";

export type AuditAction =
  | "account_created"
  | "password_reset"
  | "password_changed"
  | "account_deactivated";

export interface AuditEventParams {
  action: AuditAction;
  performedById: number;
  performedByUsername: string;
  targetUserId?: number;
  targetUsername?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Inserts one row into the audit_logs table.
 *
 * Errors are swallowed — an audit log failure must never roll back
 * or prevent the primary operation from completing.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  const {
    action,
    performedById,
    performedByUsername,
    targetUserId = null,
    targetUsername = null,
    metadata = null,
  } = params;

  try {
    await pool.execute(
      `INSERT INTO audit_logs
         (action, performed_by_id, performed_by_username,
          target_user_id, target_username, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        action,
        performedById,
        performedByUsername,
        targetUserId,
        targetUsername,
        metadata !== null ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // Never propagate — audit failures are non-fatal
    console.error("[auditLogger] Failed to write audit log:", err);
  }
}
