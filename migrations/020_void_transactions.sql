-- Migration: 020_void_transactions.sql
-- Adds void transaction support to the sales workflow.
-- Safe to re-run: all changes use IF NOT EXISTS / IF EXISTS guards.

USE hardware_pos;

-- ── Helper: add column only if missing ───────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col20;
DELIMITER //
CREATE PROCEDURE _add_col20(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
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

-- ── 1. sales.void_status ──────────────────────────────────────────────────────
-- Tracks the void lifecycle of each sale.
-- 'active'         = normal completed sale
-- 'void_requested' = cashier has submitted a pending void request
-- 'voided'         = admin approved the void; sale is excluded from reports
CALL _add_col20(
  'sales', 'void_status',
  "ENUM('active','void_requested','voided') NOT NULL DEFAULT 'active' COMMENT 'Void workflow status'"
);

-- ── 2. sale_voids — one row per void request ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_voids (
  id               INT           NOT NULL AUTO_INCREMENT,
  sale_id          INT           NOT NULL,
  requested_by     INT           NOT NULL  COMMENT 'FK → users.id — cashier who requested',
  reason           VARCHAR(500)  NOT NULL,
  status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by      INT           NULL      COMMENT 'FK → users.id — admin who resolved',
  rejection_reason VARCHAR(500)  NULL,
  resolved_at      DATETIME      NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_sv_sale         FOREIGN KEY (sale_id)      REFERENCES sales(id),
  CONSTRAINT fk_sv_requested_by FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_sv_approved_by  FOREIGN KEY (approved_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Void request workflow — one row per void request against a completed sale';

-- ── Cleanup ───────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col20;
