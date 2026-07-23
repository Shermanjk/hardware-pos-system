-- Migration: 013_commodity_pricing.sql
-- Adds market-based / commodity pricing support.
-- Safe to re-run: all DDL uses IF NOT EXISTS or helper procedures.

USE hardware_pos;

-- ── Helper ────────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col13;
DELIMITER //
CREATE PROCEDURE _add_col13(IN t VARCHAR(64), IN c VARCHAR(64), IN def TEXT)
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

-- ── 1. products — add pricing_type column ────────────────────────────────────
-- FIXED_PRICE  : normal product with a stable cost/selling price (default)
-- MARKET_BASED : commodity whose buying price fluctuates (copra, charcoal, etc.)
CALL _add_col13(
  'products',
  'pricing_type',
  "ENUM('FIXED_PRICE','MARKET_BASED') NOT NULL DEFAULT 'FIXED_PRICE'"
);

-- ── 2. commodity_prices — current reference buying price per product ──────────
-- One active row per product at any time.
-- Changing the price inserts a new row; old rows are kept for history.
CREATE TABLE IF NOT EXISTS commodity_prices (
  id            INT            NOT NULL AUTO_INCREMENT,
  product_id    INT            NOT NULL,
  price_per_unit DECIMAL(10,4) NOT NULL,          -- reference buying price
  effective_from DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by    INT            NOT NULL,           -- FK → users.id
  reason        VARCHAR(500)   NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_cp_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_cp_user    FOREIGN KEY (changed_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for fast "latest price for product" lookup
DROP PROCEDURE IF EXISTS _add_idx13;
DELIMITER //
CREATE PROCEDURE _add_idx13()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'commodity_prices'
      AND INDEX_NAME = 'idx_cp_product_time'
  ) THEN
    ALTER TABLE commodity_prices ADD INDEX idx_cp_product_time (product_id, effective_from);
  END IF;
END //
DELIMITER ;
CALL _add_idx13();
DROP PROCEDURE IF EXISTS _add_idx13;

-- ── 3. commodity_purchases — individual buy transactions ─────────────────────
-- Each row is one purchase of a commodity from a supplier/seller.
-- All monetary values are calculated by the backend; frontend totals are ignored.
CREATE TABLE IF NOT EXISTS commodity_purchases (
  id                  INT            NOT NULL AUTO_INCREMENT,
  product_id          INT            NOT NULL,
  supplier_id         INT            NULL,         -- optional seller/supplier
  seller_name         VARCHAR(150)   NULL,         -- free-text seller name
  quantity            DECIMAL(10,4)  NOT NULL,     -- quantity received
  unit_id             INT            NOT NULL,     -- FK → units.id (snapshot)
  unit_name           VARCHAR(50)    NOT NULL,     -- snapshot of unit name
  reference_price     DECIMAL(10,4)  NOT NULL,     -- price from commodity_prices at transaction time
  deduction_per_unit  DECIMAL(10,4)  NOT NULL DEFAULT 0.0000,
  final_unit_price    DECIMAL(10,4)  NOT NULL,     -- reference_price - deduction_per_unit (backend-calculated)
  gross_amount        DECIMAL(12,4)  NOT NULL,     -- quantity × reference_price (backend-calculated)
  total_deduction     DECIMAL(12,4)  NOT NULL,     -- quantity × deduction_per_unit (backend-calculated)
  final_amount        DECIMAL(12,4)  NOT NULL,     -- quantity × final_unit_price (backend-calculated)
  remarks             VARCHAR(500)   NULL,
  recorded_by         INT            NOT NULL,     -- FK → users.id
  transaction_date    DATE           NOT NULL,
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cpurch_product  FOREIGN KEY (product_id)  REFERENCES products(id),
  CONSTRAINT fk_cpurch_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_cpurch_unit     FOREIGN KEY (unit_id)     REFERENCES units(id),
  CONSTRAINT fk_cpurch_user     FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Cleanup ───────────────────────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS _add_col13;
