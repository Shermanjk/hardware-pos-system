-- Migration: 005_deduplicate_units.sql
USE hardware_pos;

-- Remove singular duplicates (keep plural: Pieces, Boxes, Kilograms, Liters)
DELETE FROM units WHERE id IN (1, 2, 3, 4);

-- Standardize abbreviations to lowercase for consistency
UPDATE units SET abbreviation = 'pcs'  WHERE id = 6;
UPDATE units SET abbreviation = 'box'  WHERE id = 7;
UPDATE units SET abbreviation = 'kg'   WHERE id = 11;
UPDATE units SET abbreviation = 'L'    WHERE id = 12;
