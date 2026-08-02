-- Migration 032: Consolidate settings tables to system_settings only
-- This migration recreates system_settings with the proper structure

USE hardware_pos;

-- Step 1: Drop system_settings and recreate it with proper structure
DROP TABLE IF EXISTS system_settings;

-- Step 2: Create system_settings with all required columns
CREATE TABLE system_settings (
  id INT NOT NULL DEFAULT 1,
  store_name VARCHAR(150) DEFAULT NULL,
  proprietor VARCHAR(150) DEFAULT NULL,
  tin VARCHAR(30) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  contact_number VARCHAR(20) DEFAULT NULL,
  facebook VARCHAR(100) DEFAULT NULL,
  store_phone VARCHAR(50) DEFAULT NULL,
  store_address TEXT DEFAULT NULL,
  currency VARCHAR(10) DEFAULT 'PHP',
  vat_enabled TINYINT(1) DEFAULT 0,
  vat_rate DECIMAL(5,2) DEFAULT 0.00,
  pricing_type ENUM('VAT Inclusive','VAT Exclusive') DEFAULT NULL,
  receipt_footer TEXT DEFAULT NULL,
  printer_name VARCHAR(150) DEFAULT NULL,
  cash_drawer_enabled TINYINT(1) DEFAULT 0,
  business_license VARCHAR(100) DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  pos_min VARCHAR(30) DEFAULT NULL,
  pos_serial VARCHAR(30) DEFAULT NULL,
  registered_taxpayer_name VARCHAR(200) DEFAULT NULL,
  document_type VARCHAR(60) DEFAULT 'SALES INVOICE',
  PRIMARY KEY (id),
  CONSTRAINT chk_system_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Step 3: Insert default row with VAT rate set to 12%
INSERT INTO system_settings (id, vat_rate, vat_enabled) VALUES (1, 12.00, 1)
ON DUPLICATE KEY UPDATE vat_rate = 12.00, vat_enabled = 1;

-- Step 4: Drop the old store_settings table if it exists
DROP TABLE IF EXISTS store_settings;
