-- Migration: 008_vat_registered.sql
-- Adds VAT-registered flag to store_settings.

USE hardware_pos;

ALTER TABLE store_settings
  ADD COLUMN vat_registered TINYINT(1) NOT NULL DEFAULT 0;
