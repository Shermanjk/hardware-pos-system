-- Migration 028: Fix quantity_type for whole unit products
-- Update products that are incorrectly set to WEIGHTED but should be WHOLE_UNIT
-- based on their unit names (pcs, piece, each)

UPDATE products p
JOIN units u ON p.unit_id = u.id
SET p.quantity_type = 'WHOLE_UNIT' 
WHERE p.quantity_type = 'WEIGHTED' 
  AND (u.unit_name LIKE '%pcs%' OR u.unit_name LIKE '%piece%' OR u.unit_name LIKE '%each%');
