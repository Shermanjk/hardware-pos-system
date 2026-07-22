-- Migration: 010_bir_improvements.sql
-- Implements: registered taxpayer info, document type, safe invoice sequences,
--             tax classification on sale_items, extended audit_logs,
--             void/cancellation workflow, and database integrity improvements.
-- Safe to re-run: uses helper procedures and IF NOT EXISTS guards.

USE hardware_pos;

-- ══════════════════════════════════════════════════════════════════════════════
-- Helper: add column only if it does not already exist
-- ══════════════════════════════════════════════════════════════════════════════
DROP PROCEDURE IF EXISTS _add_col;
DELIMITER //
CREATE PROCEDURE _add_col(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
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
-- IMPLEMENTATION 1 — REGISTERED TAXPAYER INFORMATION
-- business_license is currently used as TIN display in receipts.
-- We add a proper `tin` column and keep business_license for backward compat.
-- ══════════════════════════════════════════════════════════════════════════════
CALL _add_col('store_settings', 'registered_taxpayer_name', "VARCHAR(200) NOT NULL DEFAULT ''");
CALL _add_col('store_settings', 'tin',                      "VARCHAR(30)  NOT NULL DEFAULT ''");

-- Migrate existing business_license value into tin if tin is still empty
UPDATE store_settings
SET tin = business_license
WHERE id = 1 AND tin = '' AND business_license != '';

-- ══════════════════════════════════════════════════════════════════════════════
-- IMPLEMENTATION 2 — CONFIGURABLE DOCUMENT TYPE
-- ══════════════════════════════════════════════════════════════════════════════
CALL _add_col('store_settings', 'document_type', "VARCHAR(60) NOT NULL DEFAULT 'SALES INVOICE'");

-- ══════════════════════════════════════════════════════════════════════════════
-- IMPLEMENTATION 3 — SAFE INVOICE NUMBERING (invoice_sequences table)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_sequences (
  id             INT          NOT NULL AUTO_INCREMENT,
  document_type  VARCHAR(60)  NOT NULL DEFAULT 'SALES INVOICE',
  prefix         VARCHAR(10)  NOT NULL DEFAULT 'INV',
  current_number INT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seq_prefix (prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default sequence row (idempotent)
INSERT IGNORE INTO invoice_sequences (document_type, prefix, current_number)
VALUES ('SALES INVOICE', 'INV', 0);

-- Seed return sequence row
INSERT IGNORE INTO invoice_sequences (document_type, prefix, current_number)
VALUES ('RETURN', 'RTN', 0);

-- ══════════════════════════════════════════════════════════════════════════════
-- IMPLEMENTATION 4 — TAX CLASSIFICATION on sale_items
-- Preserve tax values at time of sale so historical records are immutable.
-- All four columns added in one ALTER TABLE to avoid metadata cache issues.
-- ══════════════════════════════════════════════════════════════════════════════
DROP PROCEDURE IF EXISTS _add_sale_item_tax_cols;
DELIMITER //
CREATE PROCEDURE _add_sale_item_tax_cols()
BEGIN
  -- Add all missing columns in a single ALTER TABLE
  SET @cols = '';

  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items' AND COLUMN_NAME = 'tax_type') THEN
    SET @cols = CONCAT(@cols, ", ADD COLUMN `tax_type` ENUM('VATABLE','VAT_EXEMPT','ZERO_RATED','NON_TAXABLE') NOT NULL DEFAULT 'VATABLE'");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items' AND COLUMN_NAME = 'tax_rate') THEN
    SET @cols = CONCAT(@cols, ', ADD COLUMN `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 12.00');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items' AND COLUMN_NAME = 'taxable_amount') THEN
    SET @cols = CONCAT(@cols, ', ADD COLUMN `taxable_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items' AND COLUMN_NAME = 'vat_amount') THEN
    SET @cols = CONCAT(@cols, ', ADD COLUMN `vat_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00');
  END IF;

  IF @cols != '' THEN
    -- Strip leading ", "
    SET @cols = SUBSTRING(@cols, 3);
    SET @s = CONCAT('ALTER TABLE `sale_items` ', @cols);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

CALL _add_sale_item_tax_cols();
DROP PROCEDURE IF EXISTS _add_sale_item_tax_cols;

-- Backfill existing sale_items (run after ALTER TABLE is fully committed)
SET SQL_SAFE_UPDATES = 0;
UPDATE sale_items
SET
  tax_type       = 'VATABLE',
  tax_rate       = 12.00,
  taxable_amount = ROUND(subtotal / 1.12, 2),
  vat_amount     = ROUND(subtotal - (subtotal / 1.12), 2)
WHERE subtotal IS NOT NULL;
SET SQL_SAFE_UPDATES = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- IMPLEMENTATION 6 — EXTENDED AUDIT LOGS
-- Add entity_type, entity_id, previous_values, new_values, reason columns.
-- ══════════════════════════════════════════════════════════════════════════════
CALL _add_col('audit_logs', 'entity_type',     "VARCHAR(64)  NULL");
CALL _add_col('audit_logs', 'entity_id',       "INT          NULL");
CALL _add_col('audit_logs', 'previous_values', "JSON         NULL");
CALL _add_col('audit_logs', 'new_values',      "JSON         NULL");
CALL _add_col('audit_logs', 'reason',          "VARCHAR(500) NULL");

-- ══════════════════════════════════════════════════════════════════════════════
-- IMPLEMENTATION 7 — VOID / CANCELLATION WORKFLOW
-- Original sale is NEVER deleted. A separate sale_voids record is created.
-- ══════════════════════════════════════════════════════════════════════════════
CALL _add_col('sales', 'void_status', "ENUM('active','void_requested','voided') NOT NULL DEFAULT 'active'");

CREATE TABLE IF NOT EXISTS sale_voids (
  id               INT          NOT NULL AUTO_INCREMENT,
  sale_id          INT          NOT NULL,
  requested_by     INT          NOT NULL,
  approved_by      INT          NULL,
  status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reason           VARCHAR(500) NOT NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at      DATETIME     NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_sv_sale         FOREIGN KEY (sale_id)      REFERENCES sales(id),
  CONSTRAINT fk_sv_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_sv_approved_by  FOREIGN KEY (approved_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ══════════════════════════════════════════════════════════════════════════════
-- IMPLEMENTATION 10 — DATABASE INTEGRITY
-- Add unique constraint on invoice_number if not already present.
-- ══════════════════════════════════════════════════════════════════════════════
DROP PROCEDURE IF EXISTS _add_unique;
DELIMITER //
CREATE PROCEDURE _add_unique(IN t VARCHAR(64), IN idx VARCHAR(64), IN col VARCHAR(64))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND INDEX_NAME = idx
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` ADD UNIQUE KEY `', idx, '` (`', col, '`)');
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

CALL _add_unique('sales', 'uq_sales_invoice_number', 'invoice_number');

-- ── Cleanup helpers ───────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col;
DROP PROCEDURE IF EXISTS _add_unique;
