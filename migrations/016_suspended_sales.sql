-- Migration: 016_suspended_sales.sql
-- Persistent suspended sales for restart-safe transactions

CREATE TABLE IF NOT EXISTS suspended_sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    suspended_order_id VARCHAR(50) NOT NULL UNIQUE,
    cashier_id INT NOT NULL,
    customer_name VARCHAR(255) DEFAULT '',
    customer_address VARCHAR(500) DEFAULT NULL,
    customer_tin VARCHAR(50) DEFAULT NULL,
    cart_data JSON NOT NULL,
    status ENUM('SUSPENDED', 'COMPLETED', 'CANCELLED') DEFAULT 'SUSPENDED',
    label VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cashier_status (cashier_id, status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;