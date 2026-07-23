-- Migration: 017_commodity_deducted_quantity.sql
-- Changes the commodity purchase deduction model from "price per unit" to "physical quantity".
-- 
-- OLD (incorrect): Deduction stored as ₱/kg (deduction_per_unit)
-- NEW (correct): Deduction stored as kg (deducted_quantity)
--
-- CRITICAL: Preserve historical data! The old deduction_per_unit values are valid
-- for historical transactions and must NOT be deleted or reinterpreted.
--
-- New transactions will use deducted_quantity instead of deduction_per_unit.
-- Both fields can coexist in the same table for backwards compatibility.

USE hardware_pos;

-- Helper procedure to add column if not exists
DROP PROCEDURE IF EXISTS _add_col17;
DELIMITER //
CREATE PROCEDURE _add_col17(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
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

-- Add new column for physical deducted quantity
-- This stores the physical weight deducted (e.g., 3 kg), not a price deduction
CALL _add_col17(
  'commodity_purchases',
  'deducted_quantity',
  'DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT "Physical quantity deducted (e.g., 3 kg). Used for new transactions." AFTER quantity'
);

-- Add computed payable_quantity column for easier querying
-- This is the actual quantity that will be paid for: quantity - deducted_quantity
CALL _add_col17(
  'commodity_purchases',
  'payable_quantity',
  'DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT "Quantity to pay for: quantity - deducted_quantity. Computed by backend." AFTER deducted_quantity'
);

-- Add deduction_amount column to store the monetary value of the deduction
-- This is: deducted_quantity * reference_price (computed by backend)
CALL _add_col17(
  'commodity_purchases',
  'deduction_amount',
  'DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT "Monetary value of deduction: deducted_quantity * reference_price" AFTER payable_quantity'
);

-- Back-fill new columns from existing deduction_per_unit for historical records
-- For old records: 
--   - deducted_quantity = 0 (assume no physical deduction was recorded)
--   - payable_quantity = quantity
--   - deduction_amount = quantity * deduction_per_unit (the old monetary deduction)
--
-- This preserves the old calculation while new transactions use the new model.
UPDATE commodity_purchases 
SET 
  deducted_quantity = 0,
  payable_quantity = quantity,
  deduction_amount = COALESCE(total_deduction, 0)
WHERE deducted_quantity = 0;

-- Add index for faster lookup of pending purchases
DROP PROCEDURE IF EXISTS _add_idx17;
DELIMITER //
CREATE PROCEDURE _add_idx17()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'commodity_purchases'
      AND INDEX_NAME = 'idx_cp_status_pending'
  ) THEN
    ALTER TABLE commodity_purchases ADD INDEX idx_cp_status_pending (status, created_at);
  END IF;
END //
DELIMITER ;
CALL _add_idx17();
DROP PROCEDURE IF EXISTS _add_idx17;

DROP PROCEDURE IF EXISTS _add_col17;

-- Verify the changes
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  COLUMN_COMMENT,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'commodity_purchases'
  AND COLUMN_NAME IN ('quantity', 'deducted_quantity', 'payable_quantity', 'deduction_amount', 'deduction_per_unit', 'gross_amount', 'total_deduction', 'final_amount')
ORDER BY ORDINAL_POSITION;