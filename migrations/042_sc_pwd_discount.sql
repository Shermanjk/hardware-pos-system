-- Migration 042: Add SC/PWD discount fields to sales table
-- Adds fields to track Senior Citizen / PWD discount type, ID, and VAT-exempt amount.
-- Compatible with MySQL 5.7+ and MySQL 8.x (no ADD COLUMN IF NOT EXISTS).

-- ── sc_pwd_type ───────────────────────────────────────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND COLUMN_NAME  = 'sc_pwd_type'
);
SET @sql = IF(
  @col = 0,
  "ALTER TABLE sales ADD COLUMN sc_pwd_type ENUM('NONE','SENIOR_CITIZEN','PWD') NOT NULL DEFAULT 'NONE' AFTER discount_id",
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── sc_pwd_id ─────────────────────────────────────────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND COLUMN_NAME  = 'sc_pwd_id'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE sales ADD COLUMN sc_pwd_id VARCHAR(50) NULL AFTER sc_pwd_type',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── vat_exempt_amount ─────────────────────────────────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND COLUMN_NAME  = 'vat_exempt_amount'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE sales ADD COLUMN vat_exempt_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER vat_amount',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;