-- Migration 029: Fix quantity_type for weighted products
-- Update products that are incorrectly set to WHOLE_UNIT but should be WEIGHTED
-- based on their unit names (kg, kilogram, kilo, gram, g, lbs, pound)

UPDATE products p
JOIN units u ON p.unit_id = u.id
SET p.quantity_type = 'WEIGHTED' 
WHERE p.quantity_type = 'WHOLE_UNIT' 
  AND (u.unit_name LIKE '%kg%' OR u.unit_name LIKE '%kilogram%' OR u.unit_name LIKE '%kilo%' 
       OR u.unit_name LIKE '%gram%' OR u.unit_name LIKE '% g' OR u.unit_name LIKE '%lbs%' 
       OR u.unit_name LIKE '%pound%' OR u.unit_name LIKE '%lb%');
