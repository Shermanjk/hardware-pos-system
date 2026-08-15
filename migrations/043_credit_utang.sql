-- ============================================================================
-- Migration 043: Credit / Utang (Accounts Receivable) Feature
-- ============================================================================
-- Creates: customers, credit_ledger, credit_allocations, credit_limit_overrides
-- Alters:  sales (add customer_id, payment_type, credit_balance, amount_paid_at_sale)
-- Inserts: new payment_methods row, new invoice_sequences row
-- Compatible with MySQL 5.7+ and MySQL 8.x
-- ============================================================================

-- ── 1. customers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `customers` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `customer_code`    VARCHAR(30)  NOT NULL UNIQUE COMMENT 'Auto-generated: CUST-0001',
  `full_name`        VARCHAR(150) NOT NULL,
  `address`          TEXT,
  `contact_number`   VARCHAR(30)  DEFAULT NULL,
  `tin`              VARCHAR(30)  DEFAULT NULL,
  `business_style`   VARCHAR(100) DEFAULT NULL,
  `credit_limit`     DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'Admin-set maximum outstanding balance. 0 = credit not yet configured.',
  `current_balance`  DECIMAL(12,2) NOT NULL DEFAULT 0.00
    COMMENT 'Denormalized outstanding balance. Source of truth is credit_ledger.',
  `is_credit_enabled` TINYINT(1)  NOT NULL DEFAULT 0
    COMMENT '1 = Admin has explicitly enabled credit for this customer.',
  `status`           ENUM('Active','Inactive') DEFAULT 'Active',
  `created_by`       INT          NOT NULL COMMENT 'FK → users.id',
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_cust_created_by` (`created_by`),
  CONSTRAINT `fk_cust_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Registered customers eligible for credit/utang transactions.';

-- ── 2. credit_ledger ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `credit_ledger` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `customer_id`   INT          NOT NULL,
  `sale_id`       INT          DEFAULT NULL
    COMMENT 'FK to sales.id — populated for CREDIT_SALE entries',
  `entry_type`    ENUM('CREDIT_SALE','PAYMENT','VOID_REVERSAL','ADJUSTMENT')
                  NOT NULL,
  `amount`        DECIMAL(12,2) NOT NULL
    COMMENT 'Positive = new debt (CREDIT_SALE). Negative = debt reduced (PAYMENT/VOID_REVERSAL).',
  `reference`     VARCHAR(100)  DEFAULT NULL
    COMMENT 'Invoice number, OR/CRR number, or adjustment reference',
  `notes`         VARCHAR(500)  DEFAULT NULL,
  `recorded_by`   INT           NOT NULL COMMENT 'FK → users.id',
  `authorized_by` INT           DEFAULT NULL
    COMMENT 'FK → users.id — admin who approved limit override or adjustment',
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cl_customer`    (`customer_id`),
  KEY `idx_cl_sale`        (`sale_id`),
  KEY `idx_cl_type_date`   (`customer_id`,`entry_type`,`created_at`),
  KEY `fk_cl_recorded_by`  (`recorded_by`),
  KEY `fk_cl_authorized_by` (`authorized_by`),
  CONSTRAINT `fk_cl_customer`      FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_cl_sale`          FOREIGN KEY (`sale_id`)     REFERENCES `sales` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cl_recorded_by`   FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cl_authorized_by` FOREIGN KEY (`authorized_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Append-only credit/utang ledger. Source of truth for all balances.';

-- ── 3. credit_allocations ─────────────────────────────────────────────────────
-- FIFO allocation: maps each payment ledger entry to the sale entries it settles.
CREATE TABLE IF NOT EXISTS `credit_allocations` (
  `id`                INT          NOT NULL AUTO_INCREMENT,
  `payment_ledger_id` INT          NOT NULL
    COMMENT 'FK to credit_ledger.id WHERE entry_type IN (PAYMENT, VOID_REVERSAL)',
  `sale_ledger_id`    INT          NOT NULL
    COMMENT 'FK to credit_ledger.id WHERE entry_type = CREDIT_SALE',
  `amount_applied`    DECIMAL(12,2) NOT NULL
    COMMENT 'Amount of the payment credited to this specific sale entry',
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ca_payment` (`payment_ledger_id`),
  KEY `fk_ca_sale`    (`sale_ledger_id`),
  CONSTRAINT `fk_ca_payment` FOREIGN KEY (`payment_ledger_id`) REFERENCES `credit_ledger` (`id`),
  CONSTRAINT `fk_ca_sale`    FOREIGN KEY (`sale_ledger_id`)    REFERENCES `credit_ledger` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='FIFO allocation: links payment entries to the sale entries they settle.';

-- ── 4. credit_limit_overrides ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `credit_limit_overrides` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `customer_id`      INT          NOT NULL,
  `sale_id`          INT          DEFAULT NULL
    COMMENT 'FK to sales.id — set after the override-authorized sale is completed',
  `requested_by`     INT          NOT NULL COMMENT 'FK → users.id (Cashier)',
  `authorized_by`    INT          DEFAULT NULL COMMENT 'FK → users.id (Admin)',
  `status`           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `requested_amount` DECIMAL(12,2) NOT NULL
    COMMENT 'Sale total that triggered the override request',
  `current_limit`    DECIMAL(12,2) NOT NULL,
  `current_balance`  DECIMAL(12,2) NOT NULL,
  `reason`           VARCHAR(500)  DEFAULT NULL,
  `rejection_reason` VARCHAR(500)  DEFAULT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at`      DATETIME      DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_clo_customer`     (`customer_id`),
  KEY `fk_clo_sale`         (`sale_id`),
  KEY `fk_clo_requested_by` (`requested_by`),
  KEY `fk_clo_authorized_by` (`authorized_by`),
  KEY `idx_clo_status`      (`status`,`created_at`),
  CONSTRAINT `fk_clo_customer`      FOREIGN KEY (`customer_id`)   REFERENCES `customers` (`id`),
  CONSTRAINT `fk_clo_sale`          FOREIGN KEY (`sale_id`)       REFERENCES `sales` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_clo_requested_by`  FOREIGN KEY (`requested_by`)  REFERENCES `users` (`id`),
  CONSTRAINT `fk_clo_authorized_by` FOREIGN KEY (`authorized_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Admin override requests when a credit sale would exceed the customer credit limit.';

-- ── 5. Alter sales table with conditional dynamic SQL ──────────────────────────

-- Add customer_id
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND COLUMN_NAME  = 'customer_id'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `sales` ADD COLUMN `customer_id` INT DEFAULT NULL COMMENT \'FK to customers.id\'',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add payment_type
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND COLUMN_NAME  = 'payment_type'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `sales` ADD COLUMN `payment_type` ENUM(\'CASH\',\'CREDIT\') NOT NULL DEFAULT \'CASH\'',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add credit_balance
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND COLUMN_NAME  = 'credit_balance'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `sales` ADD COLUMN `credit_balance` DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add amount_paid_at_sale
SET @col = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND COLUMN_NAME  = 'amount_paid_at_sale'
);
SET @sql = IF(
  @col = 0,
  'ALTER TABLE `sales` ADD COLUMN `amount_paid_at_sale` DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add Foreign Key fk_sales_customer
SET @fk = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND CONSTRAINT_NAME = 'fk_sales_customer'
);
SET @sql = IF(
  @fk = 0,
  'ALTER TABLE `sales` ADD CONSTRAINT `fk_sales_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add Index idx_sales_payment_type
SET @idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND INDEX_NAME   = 'idx_sales_payment_type'
);
SET @sql = IF(
  @idx = 0,
  'ALTER TABLE `sales` ADD INDEX `idx_sales_payment_type` (`payment_type`)',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add Index idx_sales_customer
SET @idx = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'sales'
    AND INDEX_NAME   = 'idx_sales_customer'
);
SET @sql = IF(
  @idx = 0,
  'ALTER TABLE `sales` ADD INDEX `idx_sales_customer` (`customer_id`)',
  'SELECT 1'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ── 6. Register "Credit / Utang" payment method ───────────────────────────────
INSERT IGNORE INTO `payment_methods` (`method_name`, `is_active`, `requires_reference`)
VALUES ('Credit / Utang', 1, 0);

-- ── 7. Credit Receipt Reference (CRR) sequence ───────────────────────────────
INSERT IGNORE INTO `invoice_sequences` (`document_type`, `prefix`, `current_number`)
VALUES ('CREDIT RECEIPT', 'CRR', 0);
