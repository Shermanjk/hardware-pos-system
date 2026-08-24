-- Migration 051: Seed Standard Hardware Store Discounts
-- Populates and standardizes retail, contractor, and statutory BIR discounts.

-- 1. Standardize existing entries
UPDATE discounts 
SET discount_name = 'Senior Citizen Discount',
    value = 20.00,
    requires_admin_approval = 0,
    is_sc_pwd = 1,
    status = 'Active'
WHERE id = 1;

UPDATE discounts 
SET discount_name = 'VIP Account Discount',
    value = 10.00,
    requires_admin_approval = 1,
    is_sc_pwd = 0,
    status = 'Active'
WHERE id = 2;

UPDATE discounts 
SET discount_name = 'Contractor Trade Discount',
    value = 5.00,
    requires_admin_approval = 0,
    is_sc_pwd = 0,
    status = 'Active'
WHERE id = 3;

UPDATE discounts 
SET discount_name = 'Cash Payment Discount',
    value = 3.00,
    requires_admin_approval = 0,
    is_sc_pwd = 0,
    status = 'Active'
WHERE id = 4;

-- 2. Insert PWD Discount (RA 10754)
INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, is_sc_pwd, status)
SELECT 'PWD Discount', 'Percentage', 20.00, 0, 1, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM discounts WHERE LOWER(discount_name) = 'pwd discount');

-- 3. Insert Bulk Order / Wholesale Discount
INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, is_sc_pwd, status)
SELECT 'Bulk Order / Wholesale', 'Percentage', 8.00, 1, 0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM discounts WHERE LOWER(discount_name) = 'bulk order / wholesale');

-- 4. Insert Clearance / Old Stock Discount
INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, is_sc_pwd, status)
SELECT 'Clearance / Old Stock', 'Percentage', 15.00, 1, 0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM discounts WHERE LOWER(discount_name) = 'clearance / old stock');

-- 5. Insert Manager Discretionary Discount
INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, is_sc_pwd, status)
SELECT 'Manager Discretionary', 'Percentage', 5.00, 1, 0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM discounts WHERE LOWER(discount_name) = 'manager discretionary');

-- 6. Insert Minor Flaw / Scratch & Dent Discount
INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, is_sc_pwd, status)
SELECT 'Minor Flaw / Scratch & Dent', 'Percentage', 10.00, 1, 0, 'Active'
WHERE NOT EXISTS (SELECT 1 FROM discounts WHERE LOWER(discount_name) = 'minor flaw / scratch & dent');
