-- Delete market-based pricing type products
-- Run this script to remove products with pricing_type = 'MARKET_BASED'

-- First, see what will be deleted (optional preview)
-- SELECT id, barcode, product_name, pricing_type FROM products WHERE pricing_type = 'MARKET_BASED';

-- Delete the market-based products
DELETE FROM products WHERE pricing_type = 'MARKET_BASED';

-- Show count of deleted rows
-- SELECT ROW_COUNT() AS deleted_count;