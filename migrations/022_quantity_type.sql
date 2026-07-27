-- Add quantity_type column to products table
-- This allows distinguishing between whole-unit items (counted in pieces) 
-- and weighted items (counted in kg/lb with decimals)

ALTER TABLE products 
ADD COLUMN quantity_type ENUM('WHOLE_UNIT', 'WEIGHTED') DEFAULT 'WHOLE_UNIT' AFTER unit;

-- Update existing products to have appropriate quantity_type
-- Products with unit abbreviation containing kg, g, lb, oz should be WEIGHTED
UPDATE products 
SET quantity_type = 'WEIGHTED' 
WHERE unit_abbreviation IN ('kg', 'g', 'lb', 'oz', 'l', 'ml');

-- Add index for better query performance
CREATE INDEX idx_products_quantity_type ON products(quantity_type);
