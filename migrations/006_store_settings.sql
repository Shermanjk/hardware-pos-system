-- Migration: 006_store_settings.sql
-- Creates a single-row store_settings table for General and Business settings.

USE hardware_pos;

CREATE TABLE IF NOT EXISTS store_settings (
  id               INT           NOT NULL DEFAULT 1,
  store_name       VARCHAR(150)  NOT NULL DEFAULT '',
  store_fb         VARCHAR(150)  NOT NULL DEFAULT '',
  store_phone      VARCHAR(50)   NOT NULL DEFAULT '',
  store_address    VARCHAR(255)  NOT NULL DEFAULT '',
  currency         VARCHAR(10)   NOT NULL DEFAULT 'PHP',
  tax_rate         DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  business_license VARCHAR(100)  NOT NULL DEFAULT '',
  updated_at       DATETIME      NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the single row if it doesn't exist
INSERT IGNORE INTO store_settings (id) VALUES (1);
