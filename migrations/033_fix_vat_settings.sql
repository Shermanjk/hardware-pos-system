-- Migration 033: Fix VAT settings in system_settings
-- This migration ensures VAT rate and VAT enabled are properly set

USE hardware_pos;

-- Update the system_settings row to set proper VAT values
UPDATE system_settings 
SET vat_rate = 12.00, 
    vat_enabled = 1 
WHERE id = 1;
