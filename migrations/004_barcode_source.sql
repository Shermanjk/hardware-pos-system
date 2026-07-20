-- Migration: 004_barcode_source.sql
USE hardware_pos;

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

CALL add_column_if_not_exists(
  'products',
  'barcode_source',
  "ENUM('manufacturer','store') NOT NULL DEFAULT 'manufacturer'"
);

DROP PROCEDURE IF EXISTS add_column_if_not_exists;
