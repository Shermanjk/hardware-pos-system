-- Migration 041: Add is_sc_pwd flag to discounts table
-- SC/PWD discounts follow RA 9994 / RA 9442:
--   discount = (vat_inclusive_total / (1 + vat_rate)) * percentage
-- Regular discounts remain: discount = total * percentage

ALTER TABLE discounts
  ADD COLUMN is_sc_pwd TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = Senior Citizen / PWD discount (VAT-exclusive base per RA 9994/9442)'
  AFTER requires_admin_approval;
