import { pool } from "../db.js";

export type AuditAction =
  // ── User / account ──────────────────────────────────────────────────────────
  | "account_created"
  | "password_reset"
  | "password_changed"
  | "account_deactivated"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_ROLE_CHANGED"
  // ── Sales ───────────────────────────────────────────────────────────────────
  | "SALE_CREATED"
  | "SALE_COMPLETED"
  // ── Void / cancellation ─────────────────────────────────────────────────────
  | "SALE_VOID_REQUESTED"
  | "SALE_VOIDED"
  | "SALE_CANCELLATION_REJECTED"
  // ── Returns ─────────────────────────────────────────────────────────────────
  | "RETURN_REQUESTED"
  | "RETURN_APPROVED"
  | "RETURN_REJECTED"
  | "REFUND_PROCESSED"
  | "EXCHANGE_COMPLETED"
  // ── Inventory ───────────────────────────────────────────────────────────────
  | "STOCK_RECEIVED"
  | "STOCK_ADJUSTED"
  | "DAMAGED_ITEM_RECORDED"
  | "PRODUCT_CREATED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_PRICE_CHANGED"
  // ── Commodity pricing ────────────────────────────────────────────────────────
  | "COMMODITY_PRICE_CHANGED"
  | "COMMODITY_PURCHASE_SUBMITTED"
  | "COMMODITY_PURCHASE_RECORDED"
  | "COMMODITY_PURCHASE_APPROVED"
  | "COMMODITY_PURCHASE_REJECTED"
  | "COMMODITY_PURCHASE_CANCELLED"
  | "PAYMENT_RECORDED"
  | "PAYMENT_UPDATED"
  | "PAYMENT_STATUS_CHANGED"
  // ── System / settings ───────────────────────────────────────────────────────
  | "SYSTEM_SETTINGS_UPDATED"
  | "TAX_CONFIGURATION_UPDATED"
  | "BUSINESS_INFORMATION_UPDATED";

export interface AuditEventParams {
  action: AuditAction;
  performedById: number;
  performedByUsername: string;
  targetUserId?: number;
  targetUsername?: string;
  entityType?: string;
  entityId?: number;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
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
    entityType = null,
    entityId = null,
    previousValues = null,
    newValues = null,
    reason = null,
    metadata = null,
  } = params;

  try {
    await pool.execute(
      `INSERT INTO audit_logs
         (action, performed_by_id, performed_by_username,
          target_user_id, target_username,
          entity_type, entity_id,
          previous_values, new_values, reason, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        action,
        performedById,
        performedByUsername,
        targetUserId,
        targetUsername,
        entityType,
        entityId,
        previousValues !== null ? JSON.stringify(previousValues) : null,
        newValues !== null ? JSON.stringify(newValues) : null,
        reason,
        metadata !== null ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // Never propagate — audit failures are non-fatal
    console.error("[auditLogger] Failed to write audit log:", err);
  }
}
