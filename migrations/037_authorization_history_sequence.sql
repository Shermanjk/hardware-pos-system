-- Migration 037: Authorization History — sequence for AUTH reference numbers
-- This migration adds a sequence entry so authorization history records can be
-- assigned a unified AUTH-YYYYMMDD-NNNNNN reference when needed.
-- The module itself is a VIEW/UNION over existing approval tables — no new data
-- tables are required; all authorization data already lives in the source tables.

USE hardware_pos;

-- Add AUTH sequence (used if we ever need to generate unified auth references)
INSERT INTO `invoice_sequences` (`document_type`, `prefix`, `current_number`, `created_at`)
VALUES ('AUTHORIZATION HISTORY', 'AUTH', 0, NOW())
ON DUPLICATE KEY UPDATE `document_type` = 'AUTHORIZATION HISTORY';
