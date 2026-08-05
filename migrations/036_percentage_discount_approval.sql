-- Migration: 036_percentage_discount_approval.sql
-- Adds percentage discount approval workflow to the existing discounts table
-- and creates a new discount_requests table for tracking approval requests.
-- Safe to re-run: all ADD COLUMN / ADD CONSTRAINT use IF NOT EXISTS guards.

-- Extend discounts table with approval workflow columns
ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS requires_admin_approval TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Whether this discount requires admin approval' AFTER status,
  ADD COLUMN IF NOT EXISTS created_by INT NULL
    COMMENT 'FK → users.id — who created the discount' AFTER requires_admin_approval,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    AFTER created_by,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Add foreign key constraint for created_by (only if it doesn't exist yet)
ALTER TABLE discounts
  ADD CONSTRAINT IF NOT EXISTS fk_discounts_created_by
    FOREIGN KEY (created_by) REFERENCES users(id);

-- Create discount_requests table
CREATE TABLE IF NOT EXISTS discount_requests (
  id int NOT NULL AUTO_INCREMENT,
  sale_id int DEFAULT NULL,
  discount_id int NOT NULL,
  cashier_id int NOT NULL,
  requested_percentage decimal(5,2) NOT NULL,
  discount_amount decimal(10,2) NOT NULL,
  reason varchar(500) NOT NULL,
  status enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  approved_by int DEFAULT NULL,
  approved_at datetime DEFAULT NULL,
  rejection_reason varchar(500) DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_dr_sale (sale_id),
  KEY fk_dr_discount (discount_id),
  KEY fk_dr_cashier (cashier_id),
  KEY fk_dr_approved_by (approved_by),
  KEY idx_dr_status_pending (status, created_at),
  CONSTRAINT fk_dr_sale FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE SET NULL,
  CONSTRAINT fk_dr_discount FOREIGN KEY (discount_id) REFERENCES discounts (id),
  CONSTRAINT fk_dr_cashier FOREIGN KEY (cashier_id) REFERENCES users (id),
  CONSTRAINT fk_dr_approved_by FOREIGN KEY (approved_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
