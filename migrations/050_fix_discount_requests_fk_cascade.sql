-- Migration 050: Fix Discount Requests Foreign Key Cascade
-- Ensures discount_requests foreign key fk_dr_discount cascades on delete
-- so deleting an unused discount does not trigger an unhandled foreign key constraint error.

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'discount_requests'
    AND CONSTRAINT_NAME = 'fk_dr_discount'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @drop_fk_sql = IF(
  @fk_exists > 0,
  'ALTER TABLE discount_requests DROP FOREIGN KEY fk_dr_discount',
  'SELECT 1'
);
PREPARE _s1 FROM @drop_fk_sql; EXECUTE _s1; DEALLOCATE PREPARE _s1;

ALTER TABLE discount_requests 
ADD CONSTRAINT fk_dr_discount 
FOREIGN KEY (discount_id) REFERENCES discounts(id) 
ON DELETE CASCADE;
