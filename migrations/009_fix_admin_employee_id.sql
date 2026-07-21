-- Migration: 009_fix_admin_employee_id.sql
-- Cleans up employee_id = '0' which was stored as a default for the admin account.

USE hardware_pos;

UPDATE users SET employee_id = NULL WHERE employee_id = '0';
