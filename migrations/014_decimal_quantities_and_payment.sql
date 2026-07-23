-- Migration: 014_decimal_quantities_and_payment.sql
-- Hardens the commodity purchasing system for real-world store operations.
--
-- Changes:
--   1. products.quantity          INT → DECIMAL(12,3)
--   2. products.damaged_stock     INT → DECIMAL(12,3)
--   3. inventory_logs.quantity_change  INT → DECIMAL(12,3)
--   4. inventory_logs.quantity         INT → DECIMAL(12,3)  (if column exists)
--   5. inventory_logs.remaining_stock  INT → DECIMAL(12,3)  (if column exists)
--   6. commodity_purchases: add payment columns
--   7. commodity_purchases: add commodity_purchase_id reference to inventory_logs
--
-- Safe to re-run: uses helper procedures with IF NOT EXISTS guards.
-- sale_items.quantity and return_items.quantity_returned remain INT
-- because sales and returns are always whole-unit transactions.

USE hardware_pos;

-- ── Helper: modify column type (always runs — idempotent for DECIMAL) ─────────
DROP PROCEDURE IF EXISTS _alter_col14;
DELIMITER //
CREATE PROCEDURE _alter_col14(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` MODIFY COLUMN `', c, '` ', def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

-- ── Helper: add column only if missing ───────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col14;
DELIMITER //
CREATE PROCEDURE _add_col14(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

-- ── 1. products.quantity — support decimal commodity quantities ───────────────
-- Existing integer values are preserved exactly (100 → 100.000).
CALL _alter_col14('products', 'quantity',       'DECIMAL(12,3) NOT NULL DEFAULT 0.000');
CALL _alter_col14('products', 'damaged_stock',  'DECIMAL(12,3) NOT NULL DEFAULT 0.000');

-- ── 2. inventory_logs — support decimal quantity columns ─────────────────────
CALL _alter_col14('inventory_logs', 'quantity_change',  'DECIMAL(12,3) NULL');
CALL _alter_col14('inventory_logs', 'quantity',         'DECIMAL(12,3) NULL');
CALL _alter_col14('inventory_logs', 'remaining_stock',  'DECIMAL(12,3) NULL');

-- ── 3. inventory_logs — add commodity_purchase_id for traceability ────────────
CALL _add_col14(
  'inventory_logs',
  'commodity_purchase_id',
  'INT NULL COMMENT "FK to commodity_purchases.id — set when action = Commodity Purchase"'
);

-- ── 4. commodity_purchases — add payment tracking columns ────────────────────
-- payment_status: UNPAID (default), PARTIALLY_PAID, PAID
CALL _add_col14(
  'commodity_purchases',
  'payment_status',
  "ENUM('UNPAID','PARTIALLY_PAID','PAID') NOT NULL DEFAULT 'UNPAID'"
);
CALL _add_col14(
  'commodity_purchases',
  'amount_paid',
  'DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT "Total amount actually paid to seller"'
);
CALL _add_col14(
  'commodity_purchases',
  'payment_method',
  "VARCHAR(50) NULL COMMENT 'Cash, Bank Transfer, GCash, etc.'"
);
CALL _add_col14(
  'commodity_purchases',
  'paid_at',
  'DATETIME NULL COMMENT "Timestamp of most recent payment"'
);
CALL _add_col14(
  'commodity_purchases',
  'paid_by',
  'INT NULL COMMENT "FK → users.id — user who recorded the payment"'
);
CALL _add_col14(
  'commodity_purchases',
  'payment_reference',
  'VARCHAR(100) NULL COMMENT "Receipt number, GCash ref, etc."'
);

-- ── 5. commodity_purchase_payments — append-only payment event log ────────────
-- Each row is one payment event against a commodity purchase.
-- Supports partial payments and multiple payment events per purchase.
CREATE TABLE IF NOT EXISTS commodity_purchase_payments (
  id                  INT            NOT NULL AUTO_INCREMENT,
  commodity_purchase_id INT          NOT NULL,
  amount              DECIMAL(12,4)  NOT NULL,
  payment_method      VARCHAR(50)    NULL,
  payment_reference   VARCHAR(100)   NULL,
  notes               VARCHAR(500)   NULL,
  recorded_by         INT            NOT NULL,
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cpp_purchase FOREIGN KEY (commodity_purchase_id)
    REFERENCES commodity_purchases(id),
  CONSTRAINT fk_cpp_user FOREIGN KEY (recorded_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Append-only log of payment events for commodity purchases';

-- ── Cleanup ───────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _alter_col14;
DROP PROCEDURE IF EXISTS _add_col14;
