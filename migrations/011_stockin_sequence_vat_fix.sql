-- Migration: 011_stockin_sequence_vat_fix.sql
-- 1. Add a concurrency-safe stock-in sequence to invoice_sequences.
-- 2. Correct vat_registered to TRUE per confirmed BIR Certificate of Registration.
-- Safe to re-run: uses INSERT IGNORE and conditional UPDATE.

USE hardware_pos;

-- ── 1. Stock-in sequence ──────────────────────────────────────────────────────
-- Reuse the existing invoice_sequences table (already created in migration 010).
-- The SI prefix will generate IDs like SI-000001, SI-000002, etc.
-- The date-based portion is still prepended in application code for readability.
INSERT IGNORE INTO invoice_sequences (document_type, prefix, current_number)
VALUES ('STOCK IN', 'SI', 0);

-- ── 2. VAT registration correction ───────────────────────────────────────────
-- Per confirmed BIR Certificate of Registration (Form 2303) listing VALUE ADDED TAX
-- with quarterly filing under BIR Form 2550Q, vat_registered must be TRUE.
-- Only updates if currently set to FALSE to avoid overwriting an intentional change.
UPDATE store_settings
SET vat_registered = 1
WHERE id = 1 AND vat_registered = 0;
