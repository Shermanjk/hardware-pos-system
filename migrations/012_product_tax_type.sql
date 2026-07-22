-- Migration: 012_product_tax_type.sql
-- Adds configurable tax classification to the products table.
-- Supported values: VATABLE, VAT_EXEMPT, ZERO_RATED, NON_TAXABLE
-- Default is VATABLE — must be confirmed per product by accountant before changing.
-- Safe to re-run: uses IF NOT EXISTS guard via helper procedure.

USE hardware_pos;

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

CALL _add_col(
  'products',
  'tax_type',
  "ENUM('VATABLE','VAT_EXEMPT','ZERO_RATED','NON_TAXABLE') NOT NULL DEFAULT 'VATABLE'"
);

DROP PROCEDURE IF EXISTS _add_col;
