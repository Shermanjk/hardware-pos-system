-- Migration: 007_pos_bir_fields.sql
-- Adds BIR POS machine registration fields to store_settings.

USE hardware_pos;

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS pos_min    VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pos_serial VARCHAR(30) NOT NULL DEFAULT '';
