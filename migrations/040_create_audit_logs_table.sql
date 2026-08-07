-- Migration: Create audit_logs table
-- Description: Tracks system events and user actions for security and compliance
-- Note: This table already exists in the database. This migration is for reference only.

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action VARCHAR(64) NOT NULL,
  performed_by_id INT NOT NULL,
  performed_by_username VARCHAR(255) NOT NULL,
  target_user_id INT,
  target_username VARCHAR(255),
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entity_type VARCHAR(64),
  entity_id INT,
  previous_values JSON,
  new_values JSON,
  reason VARCHAR(500),
  INDEX idx_performed_by_id (performed_by_id),
  INDEX idx_target_user_id (target_user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  INDEX idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
