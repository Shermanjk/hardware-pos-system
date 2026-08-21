-- ============================================================================
-- Migration 045: BIR Z-Reading, Reset Counter, and Tax Compliance
-- ============================================================================
-- 1. Creates the immutable `z_readings` audit table with 4-digit z_counter_no,
--    reset_counter_no, non-resettable grand totals, tax breakdown, and cutoffs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `z_readings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `z_counter_no` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '4-digit sequence 1 to 9999',
  `reset_counter_no` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Increments when z_counter loops back from 9999 to 1',
  `reading_date` DATE NOT NULL COMMENT 'Date of the reading',
  `opened_at` DATETIME NOT NULL COMMENT 'Start cutoff timestamp (previous Z-reading closed_at or beginning of time)',
  `closed_at` DATETIME NOT NULL COMMENT 'End cutoff timestamp when Z-reading was executed',
  `generated_by` INT NOT NULL COMMENT 'FK to users.id (admin or authorized user who generated reading)',
  
  -- Audit sequences
  `beg_invoice_no` VARCHAR(50) DEFAULT NULL COMMENT 'First invoice number in reading window',
  `end_invoice_no` VARCHAR(50) DEFAULT NULL COMMENT 'Last invoice number in reading window',
  `beg_void_no` VARCHAR(50) DEFAULT NULL COMMENT 'First void transaction ID/number in reading window',
  `end_void_no` VARCHAR(50) DEFAULT NULL COMMENT 'Last void transaction ID/number in reading window',
  `beg_return_no` VARCHAR(50) DEFAULT NULL COMMENT 'First return number in reading window',
  `end_return_no` VARCHAR(50) DEFAULT NULL COMMENT 'Last return number in reading window',
  
  -- Non-resettable accumulator grand totals
  `old_grand_total` DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Previous cumulative grand total',
  `daily_gross_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Gross sales during this reading window',
  `new_grand_total` DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Strictly old_grand_total + daily_gross_sales',
  
  -- BIR Tax Breakdown
  `vatable_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Net of VAT (taxable base)',
  `vat_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '12% output VAT',
  `vat_exempt_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'VAT-exempt sales including SC/PWD',
  `zero_rated_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '0% VAT sales',
  `non_vat_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Non-VAT registered sales if applicable',
  
  -- Deductions
  `sc_discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Senior Citizen 20% discount total',
  `pwd_discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'PWD 20% discount total',
  `regular_discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Promotional / other discounts',
  `total_discounts` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Total of all discounts',
  `total_returns` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Total refunded returns',
  `total_voids` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Total voided sales',
  `net_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Net sales for the reading period',
  
  -- Payment summaries
  `cash_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cash collected from sales & down payments',
  `credit_sales` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Sales charged to credit accounts',
  
  -- Transaction counters
  `transaction_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total successful invoices in period',
  `void_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total voided transactions in period',
  `return_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total return transactions in period',
  
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX `idx_zr_reading_date` (`reading_date`),
  INDEX `idx_zr_closed_at` (`closed_at`),
  INDEX `idx_zr_z_counter` (`z_counter_no`),
  
  CONSTRAINT `fk_zr_user` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
