-- Migration: 019_external_processing_delivery.sql
-- Adds product_usage field and External Processing Delivery tables.
-- Safe to re-run: all DDL uses IF NOT EXISTS or helper procedures.

USE hardware_pos;

-- ── Helper ────────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col19;
DELIMITER //
CREATE PROCEDURE _add_col19(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c
  ) THEN
    SET @s = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', def);
    PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END //
DELIMITER ;

-- ── 1. products — add product_usage column ───────────────────────────────────
-- RETAIL_PRODUCT        : standard retail item (default)
-- RAW_MATERIAL_COMMODITY: raw material / commodity (copra, charcoal, etc.)
-- BOTH                  : used for both retail and raw material
CALL _add_col19(
  'products',
  'product_usage',
  "ENUM('RETAIL_PRODUCT','RAW_MATERIAL_COMMODITY','BOTH') NOT NULL DEFAULT 'RETAIL_PRODUCT' COMMENT 'Determines how the product is used in business workflows'"
);

-- ── 2. external_processing_companies — list of processing facilities ─────────
CREATE TABLE IF NOT EXISTS external_processing_companies (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(200) NOT NULL,
  address    VARCHAR(500) NULL,
  contact    VARCHAR(100) NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_epc_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='External processing companies/facilities for commodity delivery';

-- ── 3. external_processing_deliveries — record of deliveries ────────────────
CREATE TABLE IF NOT EXISTS external_processing_deliveries (
  id               INT            NOT NULL AUTO_INCREMENT,
  delivery_reference VARCHAR(50)  NOT NULL COMMENT 'Auto-generated: EPD-YYYY-NNNNNN',
  product_id       INT            NOT NULL,
  quantity         DECIMAL(12,3)  NOT NULL COMMENT 'Quantity delivered (supports decimals)',
  company_id       INT            NOT NULL,
  delivery_date    DATE           NOT NULL,
  delivered_by     VARCHAR(200)   NULL     COMMENT 'Person who delivered',
  remarks          VARCHAR(500)   NULL,
  recorded_by      INT            NOT NULL COMMENT 'FK → users.id — Admin who recorded',
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_epd_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_epd_company FOREIGN KEY (company_id) REFERENCES external_processing_companies(id),
  CONSTRAINT fk_epd_user    FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='External processing delivery records for commodity auditing';

-- Indexes for searchability
DROP PROCEDURE IF EXISTS _add_idx19;
DELIMITER //
CREATE PROCEDURE _add_idx19()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'external_processing_deliveries'
      AND INDEX_NAME = 'idx_epd_reference'
  ) THEN
    ALTER TABLE external_processing_deliveries ADD INDEX idx_epd_reference (delivery_reference);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'external_processing_deliveries'
      AND INDEX_NAME = 'idx_epd_product_date'
  ) THEN
    ALTER TABLE external_processing_deliveries ADD INDEX idx_epd_product_date (product_id, delivery_date);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'external_processing_deliveries'
      AND INDEX_NAME = 'idx_epd_company'
  ) THEN
    ALTER TABLE external_processing_deliveries ADD INDEX idx_epd_company (company_id);
  END IF;
END //
DELIMITER ;
CALL _add_idx19();
DROP PROCEDURE IF EXISTS _add_idx19;

-- ── Seed default processing companies ─────────────────────────────────────────
INSERT IGNORE INTO external_processing_companies (name, address, contact) VALUES
  ('ABC Processing Company', '123 Industrial Zone, Manila', '09171234567'),
  ('XYZ Commodity Processor', '456 Manufacturing Road, Batangas', '09189876543'),
  ('CopraCo Processing Plant', '789 Coconut Avenue, Quezon', '09201234567');

-- ── Cleanup ───────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col19;

-- Verify the changes
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  COLUMN_TYPE,
  IS_NULLABLE
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'products'
  AND COLUMN_NAME = 'product_usage';

SELECT CONCAT('Migration 019 complete: external_processing_deliveries table created') AS status;