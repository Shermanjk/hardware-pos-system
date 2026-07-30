-- Migration 025: Market-Based Adjustment Requests Table
-- This table stores stock count adjustment requests for Market-Based products
-- that require admin approval before inventory updates can occur.

DROP TABLE IF EXISTS `market_based_adjustment_requests`;

CREATE TABLE `market_based_adjustment_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `system_quantity` decimal(12,3) NOT NULL COMMENT 'System quantity before adjustment',
  `physical_quantity` decimal(12,3) NOT NULL COMMENT 'Physical count entered by clerk',
  `difference` decimal(12,3) GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED COMMENT 'Calculated difference',
  `reason` enum('Drying/Moisture Loss','Spillage','Theft','Processing Loss','Handling Loss','Warehouse Damage','Inventory Miscount','Other') NOT NULL,
  `remarks` varchar(500) DEFAULT NULL COMMENT 'Required when reason is Other',
  `prepared_by` int NOT NULL COMMENT 'FK to users.id - clerk who submitted request',
  `prepared_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('PENDING_APPROVAL','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  `approved_by` int DEFAULT NULL COMMENT 'FK to users.id - admin who approved',
  `approved_at` datetime DEFAULT NULL,
  `rejection_reason` varchar(500) DEFAULT NULL COMMENT 'Required when rejecting',
  `reference` varchar(50) DEFAULT NULL COMMENT 'Auto-generated: MBAR-YYYYMMDD-NNNNNN',
  PRIMARY KEY (`id`),
  KEY `fk_mbar_product` (`product_id`),
  KEY `fk_mbar_prepared` (`prepared_by`),
  KEY `fk_mbar_approved` (`approved_by`),
  KEY `idx_mbar_status` (`status`),
  KEY `idx_mbar_product_date` (`product_id`, `prepared_at`),
  KEY `idx_mbar_reference` (`reference`),
  CONSTRAINT `fk_mbar_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_mbar_prepared` FOREIGN KEY (`prepared_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_mbar_approved` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Market-Based stock count adjustment requests requiring admin approval';

-- Add invoice sequence for MBAR prefix
INSERT INTO `invoice_sequences` (`document_type`, `prefix`, `current_number`, `created_at`)
VALUES ('MARKET-BASED ADJUSTMENT REQUEST', 'MBAR', 0, NOW())
ON DUPLICATE KEY UPDATE `document_type` = 'MARKET-BASED ADJUSTMENT REQUEST';
