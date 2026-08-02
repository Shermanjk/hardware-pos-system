-- Migration: 035_fix_resolution_enum.sql
-- MySQL 8.0 compatible
-- Purpose: Fix resolution column ENUM to include all required values
-- This migration ensures the resolution column has all required enum values

USE hardware_pos;

-- Check current ENUM values and update if needed
-- The resolution column should have: 'refund', 'exchange', 'store_credit', 'rejected'
-- We need to modify the column to ensure it has all these values

-- First, let's see what the current ENUM values are
-- This will help us understand what needs to be changed

-- Modify the resolution column to ensure it has all required values
-- We use MODIFY COLUMN to update the ENUM definition
ALTER TABLE returns 
MODIFY COLUMN resolution ENUM('refund', 'exchange', 'store_credit', 'rejected') NULL 
COMMENT 'Resolution type selected by admin';

-- Note: If there are existing values that are not in the new ENUM, 
-- they will be set to NULL. This is acceptable as the system should
-- only use the approved resolution types.
