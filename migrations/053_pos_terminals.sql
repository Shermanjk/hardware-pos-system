-- Migration 053: Create POS Terminals table for multi-counter workstation configuration
-- Allows binding each physical cashier PC to a unique Terminal Code, S/N, and BIR MIN.

CREATE TABLE IF NOT EXISTS pos_terminals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  terminal_code VARCHAR(20) NOT NULL UNIQUE,
  terminal_name VARCHAR(100) NOT NULL,
  pos_serial VARCHAR(50) NOT NULL DEFAULT '',
  pos_min VARCHAR(50) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed initial 2 terminals for standard 2-counter checkout setup
INSERT INTO pos_terminals (terminal_code, terminal_name, pos_serial, pos_min, is_active)
VALUES 
  ('TERM-01', 'Counter 1 (Front Desk)', 'PF3QX4HD', '0000-932749901', TRUE),
  ('TERM-02', 'Counter 2 (Side Desk)', '0000000', '0000-932749902', TRUE)
ON DUPLICATE KEY UPDATE terminal_name = VALUES(terminal_name);
