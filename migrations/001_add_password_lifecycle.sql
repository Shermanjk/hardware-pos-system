-- Migration: 001_add_password_lifecycle.sql
-- MySQL 8.0+ compatible
-- Run once against the hardware_pos database.

USE hardware_pos;

-- ── 1. Add password lifecycle columns to users ────────────────────────────────
-- must_change_password defaults FALSE so existing accounts are unaffected.
-- Only new accounts created via POST /api/users get must_change_password = TRUE
-- (set explicitly in the application layer, not by this default).

ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN password_changed_at  DATETIME NULL;
ALTER TABLE users ADD COLUMN updated_at           DATETIME NULL;

-- ── 2. Create audit_logs table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id                     INT          NOT NULL AUTO_INCREMENT,
  action                 VARCHAR(64)  NOT NULL,
  performed_by_id        INT          NOT NULL,
  performed_by_username  VARCHAR(255) NOT NULL,
  target_user_id         INT          NULL,
  target_username        VARCHAR(255) NULL,
  metadata               JSON         NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_audit_performed_by FOREIGN KEY (performed_by_id) REFERENCES users(id),
  CONSTRAINT fk_audit_target       FOREIGN KEY (target_user_id)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
