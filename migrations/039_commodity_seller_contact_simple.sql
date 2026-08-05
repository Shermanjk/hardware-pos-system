-- Migration 039: Add seller address and contact number to commodity_purchases
-- Allows the clerk to record seller contact details for auditing purposes.

USE hardware_pos;

-- Add seller_address column if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'commodity_purchases';
SET @columnname = 'seller_address';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `seller_address` VARCHAR(500) NULL COMMENT "Seller physical address for audit" AFTER seller_name')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add seller_contact column if it doesn't exist
SET @columnname = 'seller_contact';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `seller_contact` VARCHAR(100) NULL COMMENT "Seller contact number for audit" AFTER seller_address')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
