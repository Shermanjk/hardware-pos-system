-- Migration: 036_percentage_discount_approval.sql
-- Adds percentage discount approval workflow to the existing discounts table
-- and creates a new discount_requests table for tracking approval requests.
-- Compatible with MySQL 5.7+ and MySQL 8.x (no ADD COLUMN IF NOT EXISTS).
-- Requires multipleStatements connection (handled by migrationService).

-- ── requires_admin_approval ──────────────────────────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'discounts'
    AND COLUMN_NAME  = 'requires_admin_approval'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE discounts ADD COLUMN requires_admin_approval TINYINT(1) NOT NULL DEFAULT 0 AFTER status',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── created_by ───────────────────────────────────────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'discounts'
    AND COLUMN_NAME  = 'created_by'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE discounts ADD COLUMN created_by INT NULL AFTER requires_admin_approval',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── created_at ───────────────────────────────────────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'discounts'
    AND COLUMN_NAME  = 'created_at'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE discounts ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── updated_at ───────────────────────────────────────────────────────────────
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'discounts'
    AND COLUMN_NAME  = 'updated_at'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE discounts ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── fk_discounts_created_by ──────────────────────────────────────────────────
SET @fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME         = 'discounts'
    AND CONSTRAINT_NAME    = 'fk_discounts_created_by'
    AND CONSTRAINT_TYPE    = 'FOREIGN KEY'
);
SET @sql = IF(
  @fk = 0,
  'ALTER TABLE discounts ADD CONSTRAINT fk_discounts_created_by FOREIGN KEY (created_by) REFERENCES users(id)',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── discount_requests table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_requests (
  id                   INT           NOT NULL AUTO_INCREMENT,
  sale_id              INT           DEFAULT NULL,
  discount_id          INT           NOT NULL,
  cashier_id           INT           NOT NULL,
  requested_percentage DECIMAL(5,2)  NOT NULL,
  discount_amount      DECIMAL(10,2) NOT NULL,
  reason               VARCHAR(500)  NOT NULL,
  status               ENUM('pending','approved','rejected','cancelled')
                                     NOT NULL DEFAULT 'pending',
  approved_by          INT           DEFAULT NULL,
  approved_at          DATETIME      DEFAULT NULL,
  rejection_reason     VARCHAR(500)  DEFAULT NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_dr_sale        (sale_id),
  KEY fk_dr_discount    (discount_id),
  KEY fk_dr_cashier     (cashier_id),
  KEY fk_dr_approved_by (approved_by),
  KEY idx_dr_status_pending (status, created_at),
  CONSTRAINT fk_dr_sale        FOREIGN KEY (sale_id)      REFERENCES sales    (id) ON DELETE SET NULL,
  CONSTRAINT fk_dr_discount    FOREIGN KEY (discount_id)  REFERENCES discounts(id),
  CONSTRAINT fk_dr_cashier     FOREIGN KEY (cashier_id)   REFERENCES users    (id),
  CONSTRAINT fk_dr_approved_by FOREIGN KEY (approved_by)  REFERENCES users    (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
