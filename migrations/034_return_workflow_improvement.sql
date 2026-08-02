-- Migration: 034_return_workflow_improvement.sql
-- MySQL 8.0 compatible
-- Purpose: Implement controlled return approval workflow with Store Credit support
-- - Add item_condition to returns (determined by cashier during initial verification)
-- - Expand resolution enum to include exchange, store_credit, rejected
-- - Add exchange tracking fields
-- - Create customer_store_credit table for store credit management
-- Safe to re-run: uses IF NOT EXISTS and conditional ALTER TABLE

USE hardware_pos;

-- ── 1. Add resolution field to returns table if it doesn't exist ─────────────
-- This field may have been added in migration 002, but we ensure it exists
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'returns' AND COLUMN_NAME = 'resolution');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE returns ADD COLUMN resolution ENUM(''refund'',''replacement'',''exchange'',''store_credit'',''rejected'') NULL COMMENT ''Resolution type selected by admin''', 'SELECT ''Column already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Add item_condition field for cashier's initial assessment ───────────────
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'returns' AND COLUMN_NAME = 'item_condition');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE returns ADD COLUMN item_condition ENUM(''good'',''damaged'',''defective'') NULL COMMENT ''Item condition determined by cashier during verification''', 'SELECT ''Column already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. Add exchange tracking fields ─────────────────────────────────────────────
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'returns' AND COLUMN_NAME = 'exchange_product_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE returns ADD COLUMN exchange_product_id INT NULL COMMENT ''Product ID for exchange replacement''', 'SELECT ''Column already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'returns' AND COLUMN_NAME = 'exchange_quantity');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE returns ADD COLUMN exchange_quantity INT NULL COMMENT ''Quantity for exchange replacement''', 'SELECT ''Column already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'returns' AND COLUMN_NAME = 'additional_payment');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE returns ADD COLUMN additional_payment DECIMAL(10,2) NULL COMMENT ''Additional payment required for exchange''', 'SELECT ''Column already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'returns' AND COLUMN_NAME = 'refund_difference');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE returns ADD COLUMN refund_difference DECIMAL(10,2) NULL COMMENT ''Refund amount for price difference in exchange''', 'SELECT ''Column already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4. Update existing returns: set default item_condition ─────────────────────
UPDATE returns SET item_condition = 'good' WHERE item_condition IS NULL;

-- ── 5. Convert 'replacement' to 'exchange' in resolution field ─────────────────
UPDATE returns SET resolution = 'exchange' WHERE resolution = 'replacement';

-- ── 6. Create customer_store_credit table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_store_credit (
  id                  INT            NOT NULL AUTO_INCREMENT,
  customer_id         INT            NULL,
  customer_name       VARCHAR(255)   NOT NULL,
  credit_amount       DECIMAL(10,2)  NOT NULL,
  remaining_balance   DECIMAL(10,2)  NOT NULL,
  issued_date         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiration_date     DATETIME       NULL,
  status              ENUM('active','expired','fully_used') NOT NULL DEFAULT 'active',
  return_id           INT            NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status),
  INDEX idx_return_id (return_id),
  CONSTRAINT fk_csc_return FOREIGN KEY (return_id) REFERENCES returns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Customer store credit balances from returns';
