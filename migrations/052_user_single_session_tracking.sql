-- Migration 052: User Single Active Session Tracking
-- Enforces single active session per user account across all roles (Admin, Cashier, Inventory Clerk)
-- Prevents duplicate concurrent logins on different PCs.

-- 1. is_logged_in
SET @col_is_logged_in = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'is_logged_in'
);
SET @sql_is_logged_in = IF(
  @col_is_logged_in = 0,
  "ALTER TABLE users ADD COLUMN is_logged_in TINYINT(1) NOT NULL DEFAULT 0 AFTER must_change_password",
  'SELECT 1'
);
PREPARE _s1 FROM @sql_is_logged_in; EXECUTE _s1; DEALLOCATE PREPARE _s1;

-- 2. current_session_id
SET @col_current_session_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'current_session_id'
);
SET @sql_current_session_id = IF(
  @col_current_session_id = 0,
  "ALTER TABLE users ADD COLUMN current_session_id VARCHAR(64) NULL DEFAULT NULL AFTER is_logged_in",
  'SELECT 1'
);
PREPARE _s2 FROM @sql_current_session_id; EXECUTE _s2; DEALLOCATE PREPARE _s2;

-- 3. last_login_at
SET @col_last_login_at = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'last_login_at'
);
SET @sql_last_login_at = IF(
  @col_last_login_at = 0,
  "ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL DEFAULT NULL AFTER current_session_id",
  'SELECT 1'
);
PREPARE _s3 FROM @sql_last_login_at; EXECUTE _s3; DEALLOCATE PREPARE _s3;

-- 4. last_activity_at
SET @col_last_activity_at = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'last_activity_at'
);
SET @sql_last_activity_at = IF(
  @col_last_activity_at = 0,
  "ALTER TABLE users ADD COLUMN last_activity_at DATETIME NULL DEFAULT NULL AFTER last_login_at",
  'SELECT 1'
);
PREPARE _s4 FROM @sql_last_activity_at; EXECUTE _s4; DEALLOCATE PREPARE _s4;

-- 5. logged_in_ip
SET @col_logged_in_ip = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'logged_in_ip'
);
SET @sql_logged_in_ip = IF(
  @col_logged_in_ip = 0,
  "ALTER TABLE users ADD COLUMN logged_in_ip VARCHAR(45) NULL DEFAULT NULL AFTER last_activity_at",
  'SELECT 1'
);
PREPARE _s5 FROM @sql_logged_in_ip; EXECUTE _s5; DEALLOCATE PREPARE _s5;

-- 6. logged_in_device
SET @col_logged_in_device = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND COLUMN_NAME  = 'logged_in_device'
);
SET @sql_logged_in_device = IF(
  @col_logged_in_device = 0,
  "ALTER TABLE users ADD COLUMN logged_in_device VARCHAR(255) NULL DEFAULT NULL AFTER logged_in_ip",
  'SELECT 1'
);
PREPARE _s6 FROM @sql_logged_in_device; EXECUTE _s6; DEALLOCATE PREPARE _s6;

-- 7. Index idx_users_session_status
SET @idx_count = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND INDEX_NAME   = 'idx_users_session_status'
);
SET @sql_idx = IF(
  @idx_count = 0,
  "CREATE INDEX idx_users_session_status ON users(id, is_logged_in, last_activity_at)",
  'SELECT 1'
);
PREPARE _s7 FROM @sql_idx; EXECUTE _s7; DEALLOCATE PREPARE _s7;
