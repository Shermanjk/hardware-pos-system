-- Migration 027: Fix Standard Stock Count Adjustment Requests Reason Enum
-- Update the reason column to use Standard product reasons instead of Market-Based reasons

ALTER TABLE `stock_count_adjustment_requests` 
MODIFY COLUMN `reason` enum('Inventory Miscount','Damaged Items','Lost Items','Newly Found Stock','Encoding Error','Other') NOT NULL;

-- Also update system_quantity and physical_quantity to decimal to support weighted products
ALTER TABLE `stock_count_adjustment_requests` 
MODIFY COLUMN `system_quantity` decimal(12,3) NOT NULL COMMENT 'System quantity before adjustment',
MODIFY COLUMN `physical_quantity` decimal(12,3) NOT NULL COMMENT 'Physical count entered by clerk';

-- Update the difference column calculation
ALTER TABLE `stock_count_adjustment_requests` 
DROP COLUMN `difference`,
ADD COLUMN `difference` decimal(12,3) GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED COMMENT 'Calculated difference';
