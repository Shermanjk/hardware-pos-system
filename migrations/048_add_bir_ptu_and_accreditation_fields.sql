-- Migration 048: BIR Compliance Enhancements
-- 1. Add ptu_date_issued (Date when BIR PTU / ACCN was issued)
-- 2. Add accreditation_no (Software Accreditation Number)
-- 3. Add accreditation_date_issued (Date when Software Accreditation was issued)

-- Step 1: Add ptu_date_issued if it does not exist
SET @col_ptu_date = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'system_settings'
    AND COLUMN_NAME  = 'ptu_date_issued'
);
SET @sql_ptu_date = IF(
  @col_ptu_date = 0,
  "ALTER TABLE system_settings ADD COLUMN ptu_date_issued DATE NULL COMMENT 'Date when BIR PTU/ACCN was issued' AFTER ptu_or_accn_no",
  'SELECT 1'
);
PREPARE _s1 FROM @sql_ptu_date; EXECUTE _s1; DEALLOCATE PREPARE _s1;

-- Step 2: Add accreditation_no if it does not exist
SET @col_acc_no = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'system_settings'
    AND COLUMN_NAME  = 'accreditation_no'
);
SET @sql_acc_no = IF(
  @col_acc_no = 0,
  "ALTER TABLE system_settings ADD COLUMN accreditation_no VARCHAR(100) NOT NULL DEFAULT '000-000000000-000000' COMMENT 'BIR Software Accreditation No.' AFTER ptu_date_issued",
  'SELECT 1'
);
PREPARE _s2 FROM @sql_acc_no; EXECUTE _s2; DEALLOCATE PREPARE _s2;

-- Step 3: Add accreditation_date_issued if it does not exist
SET @col_acc_date = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'system_settings'
    AND COLUMN_NAME  = 'accreditation_date_issued'
);
SET @sql_acc_date = IF(
  @col_acc_date = 0,
  "ALTER TABLE system_settings ADD COLUMN accreditation_date_issued DATE NULL COMMENT 'Date when Software Accreditation was issued' AFTER accreditation_no",
  'SELECT 1'
);
PREPARE _s3 FROM @sql_acc_date; EXECUTE _s3; DEALLOCATE PREPARE _s3;
