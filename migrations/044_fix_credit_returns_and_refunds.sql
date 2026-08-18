-- ============================================================================
-- Migration 044: Fix Credit Returns, Effective Refund Pricing, and Void Defense
-- ============================================================================
-- 1. Updates credit_ledger.entry_type enum to include 'RETURN_CREDIT'
-- 2. Adds resolved_by, credit_refund_amount, and cash_refund_amount to returns
-- 3. Adds effective_unit_price to return_items
-- ============================================================================

-- ── 1. Modify credit_ledger.entry_type ENUM ─────────────────────────────────
ALTER TABLE `credit_ledger`
  MODIFY COLUMN `entry_type` ENUM('CREDIT_SALE','PAYMENT','VOID_REVERSAL','ADJUSTMENT','RETURN_CREDIT')
  NOT NULL COMMENT 'Append-only entry types';

-- ── 2. Add resolved_by, credit_refund_amount, cash_refund_amount to returns ──
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'returns'
    AND COLUMN_NAME  = 'resolved_by'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `returns` ADD COLUMN `resolved_by` INT DEFAULT NULL COMMENT \'FK to users.id (cashier who resolved)\'',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'returns'
    AND COLUMN_NAME  = 'credit_refund_amount'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `returns` ADD COLUMN `credit_refund_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT \'Amount reversed from customer credit balance\'',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'returns'
    AND COLUMN_NAME  = 'cash_refund_amount'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `returns` ADD COLUMN `cash_refund_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT \'Physical cash amount refunded from drawer\'',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── 3. Add effective_unit_price to return_items ──────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'return_items'
    AND COLUMN_NAME  = 'effective_unit_price'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `return_items` ADD COLUMN `effective_unit_price` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT \'Net unit price actually paid after discounts\'',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;
