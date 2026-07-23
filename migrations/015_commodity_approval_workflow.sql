-- Migration: 015_commodity_approval_workflow.sql
-- Adds approval workflow to commodity_purchases.
-- Safe to re-run: all changes use IF NOT EXISTS guards.

USE hardware_pos;

DROP PROCEDURE IF EXISTS _add_col15;
DELIMITER //
CREATE PROCEDURE _add_col15(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

-- Approval status (separate from payment_status)
CALL _add_col15(
  'commodity_purchases', 'status',
  "ENUM('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING_APPROVAL' COMMENT 'Approval workflow status' AFTER id"
);

-- Who prepared/submitted the purchase (for self-approval prevention)
CALL _add_col15(
  'commodity_purchases', 'prepared_by',
  'INT NULL COMMENT "FK → users.id — clerk who submitted" AFTER status'
);

-- Approval fields
CALL _add_col15(
  'commodity_purchases', 'approved_by',
  'INT NULL COMMENT "FK → users.id — admin who approved"'
);
CALL _add_col15(
  'commodity_purchases', 'approved_at',
  'DATETIME NULL'
);

-- Rejection fields
CALL _add_col15(
  'commodity_purchases', 'rejected_by',
  'INT NULL COMMENT "FK → users.id — admin who rejected"'
);
CALL _add_col15(
  'commodity_purchases', 'rejected_at',
  'DATETIME NULL'
);
CALL _add_col15(
  'commodity_purchases', 'rejection_reason',
  'VARCHAR(500) NULL'
);

-- Back-fill existing rows: treat them as already approved so they remain valid
-- (they were recorded under the old direct-record workflow)
UPDATE commodity_purchases
SET status      = 'APPROVED',
    prepared_by = recorded_by,
    approved_by = recorded_by,
    approved_at = created_at
WHERE status = 'PENDING_APPROVAL';

DROP PROCEDURE IF EXISTS _add_col15;
