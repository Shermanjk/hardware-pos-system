-- Migration 030: Add business rules to Units table
-- This migration transforms units from simple labels to database-driven business rules
-- with unit_type, allow_decimal, and status fields

USE hardware_pos;

-- Add new columns to units table
ALTER TABLE units
ADD COLUMN unit_type ENUM('Count', 'Weight', 'Volume', 'Length', 'Area', 'Packaging', 'Other') NOT NULL DEFAULT 'Other' AFTER abbreviation,
ADD COLUMN allow_decimal TINYINT(1) NOT NULL DEFAULT 0 AFTER unit_type,
ADD COLUMN status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active' AFTER allow_decimal;

-- Add unique constraints for unit_name and abbreviation (case-insensitive)
-- Using a generated column for case-insensitive uniqueness
ALTER TABLE units
ADD COLUMN unit_name_lower VARCHAR(50) GENERATED ALWAYS AS (LOWER(unit_name)) STORED,
ADD COLUMN abbreviation_lower VARCHAR(30) GENERATED ALWAYS AS (LOWER(abbreviation)) STORED,
ADD UNIQUE INDEX uq_unit_name (unit_name_lower),
ADD UNIQUE INDEX uq_abbreviation (abbreviation_lower);

-- Migrate existing units with sensible defaults based on their names/abbreviations

-- Weight units (allow decimals)
UPDATE units 
SET unit_type = 'Weight', allow_decimal = 1
WHERE LOWER(unit_name) LIKE '%kilogram%' OR LOWER(unit_name) LIKE '%kg%' 
   OR LOWER(unit_name) LIKE '%gram%' OR LOWER(unit_name) LIKE '%g%'
   OR LOWER(unit_name) LIKE '%pound%' OR LOWER(unit_name) LIKE '%lb%'
   OR LOWER(unit_name) LIKE '%ounce%' OR LOWER(unit_name) LIKE '%oz%';

-- Volume units (allow decimals)
UPDATE units 
SET unit_type = 'Volume', allow_decimal = 1
WHERE LOWER(unit_name) LIKE '%liter%' OR LOWER(unit_name) LIKE '%litre%' OR LOWER(unit_name) LIKE '%l%'
   OR LOWER(unit_name) LIKE '%milliliter%' OR LOWER(unit_name) LIKE '%ml%'
   OR LOWER(unit_name) LIKE '%gallon%' OR LOWER(unit_name) LIKE '%quart%';

-- Length units (allow decimals)
UPDATE units 
SET unit_type = 'Length', allow_decimal = 1
WHERE LOWER(unit_name) LIKE '%meter%' OR LOWER(unit_name) LIKE '%m%'
   OR LOWER(unit_name) LIKE '%centimeter%' OR LOWER(unit_name) LIKE '%cm%'
   OR LOWER(unit_name) LIKE '%millimeter%' OR LOWER(unit_name) LIKE '%mm%'
   OR LOWER(unit_name) LIKE '%inch%' OR LOWER(unit_name) LIKE '%in%'
   OR LOWER(unit_name) LIKE '%foot%' OR LOWER(unit_name) LIKE '%ft%'
   OR LOWER(unit_name) LIKE '%yard%' OR LOWER(unit_name) LIKE '%yd%';

-- Area units (allow decimals)
UPDATE units 
SET unit_type = 'Area', allow_decimal = 1
WHERE LOWER(unit_name) LIKE '%square%' OR LOWER(unit_name) LIKE '%sq%'
   OR LOWER(unit_name) LIKE '%hectare%' OR LOWER(unit_name) LIKE '%acre%';

-- Packaging units (typically whole units)
UPDATE units 
SET unit_type = 'Packaging', allow_decimal = 0
WHERE LOWER(unit_name) LIKE '%box%' OR LOWER(unit_name) LIKE '%carton%'
   OR LOWER(unit_name) LIKE '%case%' OR LOWER(unit_name) LIKE '%pack%'
   OR LOWER(unit_name) LIKE '%bundle%' OR LOWER(unit_name) LIKE '%set%';

-- Count units (whole units by default)
UPDATE units 
SET unit_type = 'Count', allow_decimal = 0
WHERE LOWER(unit_name) LIKE '%piece%' OR LOWER(unit_name) LIKE '%pcs%'
   OR LOWER(unit_name) LIKE '%each%' OR LOWER(unit_name) LIKE '%ea%'
   OR LOWER(unit_name) LIKE '%item%' OR LOWER(unit_name) LIKE '%unit%';

-- Set all remaining units to 'Other' with allow_decimal = 0 (safe default)
UPDATE units 
SET unit_type = 'Other', allow_decimal = 0
WHERE unit_type = 'Other';

-- Ensure all units are Active by default
UPDATE units SET status = 'Active' WHERE status IS NULL;
