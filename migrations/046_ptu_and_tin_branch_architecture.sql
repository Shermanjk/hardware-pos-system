-- Migration 046: BIR Compliance Enhancements
-- 1. Add ptu_or_accn_no (Permit to Use / Acknowledgment Certificate No.)
-- 2. Split TIN and Branch Code architecture (tin: 9 digits, branch_code: 3-5 digits, default '00000')

-- Step 1: Add ptu_or_accn_no if it does not exist
SET @col_ptu = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'system_settings'
    AND COLUMN_NAME  = 'ptu_or_accn_no'
);
SET @sql_ptu = IF(
  @col_ptu = 0,
  "ALTER TABLE system_settings ADD COLUMN ptu_or_accn_no VARCHAR(100) DEFAULT NULL COMMENT 'BIR Permit to Use (PTU) or Acknowledgment Certificate No.' AFTER pos_serial",
  'SELECT 1'
);
PREPARE _s1 FROM @sql_ptu; EXECUTE _s1; DEALLOCATE PREPARE _s1;

-- Step 2: Add branch_code if it does not exist
SET @col_branch = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'system_settings'
    AND COLUMN_NAME  = 'branch_code'
);
SET @sql_branch = IF(
  @col_branch = 0,
  "ALTER TABLE system_settings ADD COLUMN branch_code VARCHAR(10) NOT NULL DEFAULT '00000' COMMENT '3 to 5-digit BIR Branch Code' AFTER tin",
  'SELECT 1'
);
PREPARE _s2 FROM @sql_branch; EXECUTE _s2; DEALLOCATE PREPARE _s2;

-- Step 3: Migrate existing TIN values to split clean 9-digit TIN and branch_code
SET @raw_tin = (SELECT IFNULL(tin, '') FROM system_settings WHERE id = 1);
SET @clean_digits = (SELECT REGEXP_REPLACE(@raw_tin, '[^0-9]', ''));

UPDATE system_settings
SET
  tin = IF(LENGTH(@clean_digits) >= 9, SUBSTRING(@clean_digits, 1, 9), IF(LENGTH(@clean_digits) > 0, LPAD(@clean_digits, 9, '0'), '000000000')),
  branch_code = IF(LENGTH(@clean_digits) > 9, SUBSTRING(@clean_digits, 10, 5), IF(branch_code IS NULL OR branch_code = '', '00000', branch_code))
WHERE id = 1;
