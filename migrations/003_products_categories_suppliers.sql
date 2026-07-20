-- Migration: 003_products_categories_suppliers.sql
-- MySQL 8.0+ compatible
-- Run once against the hardware_pos database.
-- Safe to re-run: uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS patterns.

USE hardware_pos;

-- ── Helper: add column only if it does not already exist ─────────────────────
DROP PROCEDURE IF EXISTS add_column_if_not_exists;

DELIMITER $$
CREATE PROCEDURE add_column_if_not_exists(
  IN p_table  VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_def    VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND COLUMN_NAME  = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$
DELIMITER ;

-- ── 1. categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. suppliers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(150) NOT NULL,
  contact    VARCHAR(100) NULL,
  address    VARCHAR(255) NULL,
  email      VARCHAR(150) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. products — ensure all required columns exist ───────────────────────────
-- Core columns that may be missing from the original schema
CALL add_column_if_not_exists('products', 'barcode',       'VARCHAR(100) NULL');
CALL add_column_if_not_exists('products', 'category_id',   'INT NULL');
CALL add_column_if_not_exists('products', 'supplier_id',   'INT NULL');
CALL add_column_if_not_exists('products', 'unit',          'VARCHAR(50) NULL');
CALL add_column_if_not_exists('products', 'cost_price',    'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL add_column_if_not_exists('products', 'selling_price', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL add_column_if_not_exists('products', 'reorder_level', 'INT NOT NULL DEFAULT 0');
CALL add_column_if_not_exists('products', 'description',   'TEXT NULL');
CALL add_column_if_not_exists('products', 'is_active',     'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_column_if_not_exists('products', 'created_at',    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL add_column_if_not_exists('products', 'updated_at',    'DATETIME NULL ON UPDATE CURRENT_TIMESTAMP');

-- Unique index on barcode (skip if already exists)
DROP PROCEDURE IF EXISTS add_unique_if_not_exists;

DELIMITER $$
CREATE PROCEDURE add_unique_if_not_exists(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_col   VARCHAR(64)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = p_table
      AND INDEX_NAME   = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD UNIQUE KEY `', p_index, '` (`', p_col, '`)');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$
DELIMITER ;

CALL add_unique_if_not_exists('products', 'uq_product_barcode', 'barcode');

-- Foreign keys (add only if not already present)
DROP PROCEDURE IF EXISTS add_fk_if_not_exists;

DELIMITER $$
CREATE PROCEDURE add_fk_if_not_exists(
  IN p_table      VARCHAR(64),
  IN p_constraint VARCHAR(64),
  IN p_col        VARCHAR(64),
  IN p_ref_table  VARCHAR(64),
  IN p_ref_col    VARCHAR(64)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA     = DATABASE()
      AND TABLE_NAME       = p_table
      AND CONSTRAINT_NAME  = p_constraint
      AND CONSTRAINT_TYPE  = 'FOREIGN KEY'
  ) THEN
    SET @sql = CONCAT(
      'ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_constraint,
      '` FOREIGN KEY (`', p_col, '`) REFERENCES `', p_ref_table, '` (`', p_ref_col, '`)'
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$
DELIMITER ;

CALL add_fk_if_not_exists('products', 'fk_products_category', 'category_id', 'categories', 'id');
CALL add_fk_if_not_exists('products', 'fk_products_supplier', 'supplier_id', 'suppliers',  'id');

-- ── 4. Seed default categories (idempotent) ───────────────────────────────────
INSERT IGNORE INTO categories (name) VALUES
  ('Hand Tools'),
  ('Power Tool Acc'),
  ('Fasteners'),
  ('Adhesives'),
  ('Plumbing'),
  ('Electrical'),
  ('Abrasives'),
  ('Painting'),
  ('Construction'),
  ('Safety');

-- ── Cleanup helper procedures ─────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DROP PROCEDURE IF EXISTS add_unique_if_not_exists;
DROP PROCEDURE IF EXISTS add_fk_if_not_exists;
