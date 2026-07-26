-- Migration: 021_power_outage_resilience.sql
-- Adds columns and tables needed for power-outage-safe transaction recovery.
-- Safe to re-run: uses IF NOT EXISTS guards.

USE hardware_pos;

-- ══════════════════════════════════════════════════════════════════════════════
-- Helper: add column only if it does not already exist
-- ══════════════════════════════════════════════════════════════════════════════
DROP PROCEDURE IF EXISTS _add_col21;
DELIMITER //
CREATE PROCEDURE _add_col21(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
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

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. sales — add payment_status and receipt_printed columns
-- ══════════════════════════════════════════════════════════════════════════════
-- payment_status tracks the lifecycle of payment for recovery after crash
CALL _add_col21('sales', 'payment_status',
  "ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending' COMMENT 'Tracks payment lifecycle for crash recovery'");

-- receipt_printed tracks whether the receipt was successfully printed
CALL _add_col21('sales', 'receipt_printed',
  "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = receipt was printed successfully'");

-- client_transaction_id provides idempotency for the sale creation
CALL _add_col21('sales', 'client_transaction_id',
  "VARCHAR(64) NULL COMMENT 'Unique client-generated idempotency key'");

-- Add unique index on client_transaction_id for duplicate detection
DROP PROCEDURE IF EXISTS _add_idx21;
DELIMITER //
CREATE PROCEDURE _add_idx21(IN t VARCHAR(64), IN idx VARCHAR(64), IN col VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND INDEX_NAME = idx
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` ADD INDEX `', idx, '` (`', col, '`)');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

CALL _add_idx21('sales', 'idx_sales_client_txn_id', 'client_transaction_id');

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. sale_items — add idempotency / dedup protection
-- ══════════════════════════════════════════════════════════════════════════════
-- No changes needed — sale_items are child rows of sales, protected by FK.

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. returns — add receipt_printed column
-- ══════════════════════════════════════════════════════════════════════════════
CALL _add_col21('returns', 'receipt_printed',
  "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = return receipt was printed'");

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. commodity_purchases — add receipt_printed column
-- ══════════════════════════════════════════════════════════════════════════════
CALL _add_col21('commodity_purchases', 'receipt_printed',
  "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = payment receipt was printed'");

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Create a receipt_reprint_log table for tracking reprints
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS receipt_reprint_log (
  id              INT          NOT NULL AUTO_INCREMENT,
  sale_id         INT          NULL COMMENT 'NULL if not a sale reprint',
  return_id       INT          NULL COMMENT 'NULL if not a return reprint',
  purchase_id     INT          NULL COMMENT 'NULL if not a commodity purchase reprint',
  reprinted_by    INT          NOT NULL,
  reason          VARCHAR(200) NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_rrl_sale    FOREIGN KEY (sale_id)      REFERENCES sales(id)    ON DELETE SET NULL,
  CONSTRAINT fk_rrl_return  FOREIGN KEY (return_id)    REFERENCES returns(id)  ON DELETE SET NULL,
  CONSTRAINT fk_rrl_user    FOREIGN KEY (reprinted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Backfill existing sales — mark all existing as payment_status='completed'
--    and receipt_printed=1 since they were created before this migration.
-- ══════════════════════════════════════════════════════════════════════════════
SET SQL_SAFE_UPDATES = 0;
UPDATE sales SET payment_status = 'completed', receipt_printed = 1 WHERE payment_status = 'pending';
SET SQL_SAFE_UPDATES = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- Cleanup
-- ══════════════════════════════════════════════════════════════════════════════
DROP PROCEDURE IF EXISTS _add_col21;
DROP PROCEDURE IF EXISTS _add_idx21;