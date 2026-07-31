-- Migration 031: System Update Management System
-- Creates tables for version tracking, backup metadata, migration history, and backup settings

-- Create system_version table
CREATE TABLE IF NOT EXISTS system_version (
  id INT PRIMARY KEY DEFAULT 1,
  application_version VARCHAR(20) NOT NULL,
  database_version VARCHAR(10) NOT NULL,
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_system_version_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert initial version record
INSERT INTO system_version (id, application_version, database_version)
VALUES (1, '1.0.0', '030')
ON DUPLICATE KEY UPDATE 
  application_version = '1.0.0',
  database_version = '030';

-- Create backup_metadata table
CREATE TABLE IF NOT EXISTS backup_metadata (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  application_version VARCHAR(20),
  database_version VARCHAR(10),
  backup_type ENUM('manual','pre_update','daily') DEFAULT 'manual',
  local_status ENUM('success','failed') DEFAULT 'success',
  google_drive_status ENUM('pending','success','failed') DEFAULT 'pending',
  google_drive_file_id VARCHAR(255),
  created_by INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_backup_created_at (created_at),
  INDEX idx_backup_google_drive_status (google_drive_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Metadata for database backups including Google Drive upload status';

-- Create migration_history table
CREATE TABLE IF NOT EXISTS migration_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  migration_number VARCHAR(10) NOT NULL,
  description VARCHAR(255),
  execution_time DATETIME NOT NULL,
  applied_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status ENUM('success','failed') NOT NULL,
  executed_by INT NOT NULL,
  backup_id INT,
  FOREIGN KEY (executed_by) REFERENCES users(id),
  FOREIGN KEY (backup_id) REFERENCES backup_metadata(id),
  INDEX idx_migration_number (migration_number),
  INDEX idx_migration_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='History of database migrations executed';

-- Create backup_settings table
CREATE TABLE IF NOT EXISTS backup_settings (
  id INT PRIMARY KEY DEFAULT 1,
  backup_reminder_time TIME DEFAULT '18:00:00',
  backup_reminder_enabled BOOLEAN DEFAULT TRUE,
  local_backup_directory VARCHAR(500) DEFAULT 'E:\\Database Backup',
  google_drive_folder_url VARCHAR(500),
  google_drive_folder_id VARCHAR(255),
  max_local_backups INT DEFAULT 30,
  automatic_cleanup_enabled BOOLEAN DEFAULT TRUE,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_backup_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Configurable backup settings including reminder and Google Drive';

-- Insert default backup settings
INSERT INTO backup_settings (id, backup_reminder_time, backup_reminder_enabled, local_backup_directory, max_local_backups, automatic_cleanup_enabled)
VALUES (1, '18:00:00', TRUE, 'E:\\Database Backup', 30, TRUE)
ON DUPLICATE KEY UPDATE 
  backup_reminder_time = '18:00:00',
  backup_reminder_enabled = TRUE,
  local_backup_directory = 'E:\\Database Backup',
  max_local_backups = 30,
  automatic_cleanup_enabled = TRUE;
