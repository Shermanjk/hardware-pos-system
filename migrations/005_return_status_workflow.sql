-- Migration: 005_return_status_workflow.sql
-- MySQL 8.0 compatible
-- Purpose: Add WAITING_FOR_CASHIER and COMPLETED statuses to returns table
-- to implement the proper return workflow where approved returns remain
-- visible to cashier until completion.

USE hardware_pos;

-- ── 1. Update returns.status enum to include WAITING_FOR_CASHIER and COMPLETED ─────────────────────────────────────
-- Current values: 'pending','approved','rejected'
-- New values: 'pending','approved','rejected','waiting_for_cashier','completed'
ALTER TABLE returns MODIFY COLUMN status ENUM('pending','approved','rejected','waiting_for_cashier','completed') NOT NULL DEFAULT 'pending';

-- ── 2. Update existing approved returns to waiting_for_cashier if they haven't been resolved ─────────────────────────────────────
-- This ensures any returns that were approved but not yet resolved are properly tracked
UPDATE returns 
SET status = 'waiting_for_cashier' 
WHERE status = 'approved' AND resolution IS NULL;

-- ── 3. Update existing resolved returns to completed ─────────────────────────────────────
UPDATE returns 
SET status = 'completed' 
WHERE status = 'approved' AND resolution IS NOT NULL;
