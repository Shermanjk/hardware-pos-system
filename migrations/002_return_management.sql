-- Migration: 002_return_management.sql
-- MySQL 8.0 compatible
-- Re-runnable: uses stored procedures to guard each ALTER with IF NOT EXISTS checks,
-- and CREATE TABLE IF NOT EXISTS for new tables.
-- Run against the hardware_pos database.

USE hardware_pos;

-- ══════════════════════════════════════════════════════════════════════════════
-- Helper procedure: adds a column only if it does not already exist
-- ══════════════════════════════════════════════════════════════════════════════
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DELIMITER //
CREATE PROCEDURE add_column_if_not_exists(
  IN p_table   VARCHAR(64),
  IN p_column  VARCHAR(64),
  IN p_def     TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_def);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

-- ── 1. products — add is_returnable and damaged_stock ─────────────────────────
CALL add_column_if_not_exists('products', 'is_returnable', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_column_if_not_exists('products', 'damaged_stock',  'INT NOT NULL DEFAULT 0');

-- ── 2. sales — add cash_tendered ─────────────────────────────────────────────
CALL add_column_if_not_exists('sales', 'cash_tendered', 'DECIMAL(10,2) NULL');

-- ── 3. sale_items — add unit_price and subtotal ───────────────────────────────
CALL add_column_if_not_exists('sale_items', 'unit_price', 'DECIMAL(10,2) NULL');
CALL add_column_if_not_exists('sale_items', 'subtotal',   'DECIMAL(10,2) NULL');

-- ── 4. returns — drop old schema and recreate with spec schema ────────────────
-- The existing returns table has a completely different schema.
-- It is currently empty (no return-management production data yet).
-- Drop + recreate is the cleanest approach.
DROP TABLE IF EXISTS returns;

CREATE TABLE IF NOT EXISTS returns (
  id             INT            NOT NULL AUTO_INCREMENT,
  return_number  VARCHAR(20)    NOT NULL,
  sale_id        INT            NOT NULL,
  processed_by   INT            NOT NULL,
  approved_by    INT            NULL,
  status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  resolution     ENUM('refund','replacement')          NULL,
  item_condition ENUM('good','damaged')                NULL,
  return_reason  VARCHAR(500)   NOT NULL,
  refund_amount  DECIMAL(10,2)  NULL,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at    DATETIME       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_number (return_number),
  CONSTRAINT fk_returns_sale         FOREIGN KEY (sale_id)      REFERENCES sales(id),
  CONSTRAINT fk_returns_processed_by FOREIGN KEY (processed_by) REFERENCES users(id),
  CONSTRAINT fk_returns_approved_by  FOREIGN KEY (approved_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. return_items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS return_items (
  id                INT            NOT NULL AUTO_INCREMENT,
  return_id         INT            NOT NULL,
  sale_item_id      INT            NOT NULL,
  product_id        INT            NOT NULL,
  quantity_returned INT            NOT NULL,
  unit_price        DECIMAL(10,2)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_return_items_return    FOREIGN KEY (return_id)    REFERENCES returns(id)    ON DELETE CASCADE,
  CONSTRAINT fk_return_items_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  CONSTRAINT fk_return_items_product   FOREIGN KEY (product_id)   REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. inventory_logs — add action, quantity_change, reference ────────────────
CALL add_column_if_not_exists('inventory_logs', 'action',          'VARCHAR(50) NULL');
CALL add_column_if_not_exists('inventory_logs', 'quantity_change', 'INT NULL');
CALL add_column_if_not_exists('inventory_logs', 'reference',       'VARCHAR(50) NULL');

-- ── 7. activity_logs — add reference ─────────────────────────────────────────
CALL add_column_if_not_exists('activity_logs', 'reference', 'VARCHAR(50) NULL');

-- ── Cleanup helper procedure ──────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
