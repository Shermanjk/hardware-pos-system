-- Migration 039: Add seller address and contact number to commodity_purchases
-- Allows the clerk to record seller contact details for auditing purposes.

USE hardware_pos;

DROP PROCEDURE IF EXISTS _add_col39;
DELIMITER //
CREATE PROCEDURE _add_col39(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
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

CALL _add_col39(
  'commodity_purchases',
  'seller_address',
  'VARCHAR(500) NULL COMMENT "Seller physical address for audit" AFTER seller_name'
);

CALL _add_col39(
  'commodity_purchases',
  'seller_contact',
  'VARCHAR(100) NULL COMMENT "Seller contact number for audit" AFTER seller_address'
);

DROP PROCEDURE IF EXISTS _add_col39;
