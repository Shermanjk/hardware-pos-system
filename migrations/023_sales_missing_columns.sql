-- Add missing columns to sales table for proper transaction management
-- These columns were referenced in the code but missing from the schema

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS payment_status ENUM('pending', 'paid', 'refunded', 'cancelled') DEFAULT 'paid' AFTER total_amount,
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash' AFTER payment_status,
ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100) AFTER payment_method;

-- Add index for payment_status for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
