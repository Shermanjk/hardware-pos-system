-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: hardware_pos
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `module` varchar(100) DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `reference_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `reference` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `activity_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action` varchar(64) NOT NULL,
  `performed_by_id` int NOT NULL,
  `performed_by_username` varchar(255) NOT NULL,
  `target_user_id` int DEFAULT NULL,
  `target_username` varchar(255) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `entity_type` varchar(64) DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `previous_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_audit_performed_by` (`performed_by_id`),
  KEY `fk_audit_target` (`target_user_id`),
  CONSTRAINT `fk_audit_performed_by` FOREIGN KEY (`performed_by_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_audit_target` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) NOT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `commodity_prices`
--

DROP TABLE IF EXISTS `commodity_prices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commodity_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `price_per_unit` decimal(10,4) NOT NULL,
  `effective_from` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `changed_by` int NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_cp_user` (`changed_by`),
  KEY `idx_cp_product_time` (`product_id`,`effective_from`),
  CONSTRAINT `fk_cp_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_cp_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `commodity_purchase_payments`
--

DROP TABLE IF EXISTS `commodity_purchase_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commodity_purchase_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `commodity_purchase_id` int NOT NULL,
  `amount` decimal(12,4) NOT NULL,
  `payment_method` varchar(50) DEFAULT NULL,
  `payment_reference` varchar(100) DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `recorded_by` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_cpp_purchase` (`commodity_purchase_id`),
  KEY `fk_cpp_user` (`recorded_by`),
  CONSTRAINT `fk_cpp_purchase` FOREIGN KEY (`commodity_purchase_id`) REFERENCES `commodity_purchases` (`id`),
  CONSTRAINT `fk_cpp_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Append-only log of payment events for commodity purchases';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `commodity_purchases`
--

DROP TABLE IF EXISTS `commodity_purchases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commodity_purchases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` enum('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING_APPROVAL' COMMENT 'Approval workflow status',
  `prepared_by` int DEFAULT NULL COMMENT 'FK ÔåÆ users.id ÔÇö clerk who submitted',
  `product_id` int NOT NULL,
  `supplier_id` int DEFAULT NULL,
  `seller_name` varchar(150) DEFAULT NULL,
  `quantity` decimal(10,4) NOT NULL,
  `deducted_quantity` decimal(10,4) NOT NULL DEFAULT '0.0000' COMMENT 'Physical quantity deducted (e.g., 3 kg). Used for new transactions.',
  `payable_quantity` decimal(10,4) NOT NULL DEFAULT '0.0000' COMMENT 'Quantity to pay for: quantity - deducted_quantity. Computed by backend.',
  `deduction_amount` decimal(12,4) NOT NULL DEFAULT '0.0000' COMMENT 'Monetary value of deduction: deducted_quantity * reference_price',
  `unit_id` int NOT NULL,
  `unit_name` varchar(50) NOT NULL,
  `reference_price` decimal(10,4) NOT NULL,
  `deduction_per_unit` decimal(10,4) NOT NULL DEFAULT '0.0000',
  `final_unit_price` decimal(10,4) NOT NULL,
  `gross_amount` decimal(12,4) NOT NULL,
  `total_deduction` decimal(12,4) NOT NULL,
  `final_amount` decimal(12,4) NOT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `recorded_by` int NOT NULL,
  `transaction_date` date NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payment_status` enum('UNPAID','PARTIALLY_PAID','PAID') NOT NULL DEFAULT 'UNPAID',
  `amount_paid` decimal(12,4) NOT NULL DEFAULT '0.0000' COMMENT 'Total amount actually paid to seller',
  `payment_method` varchar(50) DEFAULT NULL COMMENT 'Cash, Bank Transfer, GCash, etc.',
  `paid_at` datetime DEFAULT NULL COMMENT 'Timestamp of most recent payment',
  `paid_by` int DEFAULT NULL COMMENT 'FK ÔåÆ users.id ÔÇö user who recorded the payment',
  `payment_reference` varchar(100) DEFAULT NULL COMMENT 'Receipt number, GCash ref, etc.',
  `approved_by` int DEFAULT NULL COMMENT 'FK ÔåÆ users.id ÔÇö admin who approved',
  `approved_at` datetime DEFAULT NULL,
  `rejected_by` int DEFAULT NULL COMMENT 'FK ÔåÆ users.id ÔÇö admin who rejected',
  `rejected_at` datetime DEFAULT NULL,
  `rejection_reason` varchar(500) DEFAULT NULL,
  `receipt_printed` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = payment receipt was printed',
  PRIMARY KEY (`id`),
  KEY `fk_cpurch_product` (`product_id`),
  KEY `fk_cpurch_supplier` (`supplier_id`),
  KEY `fk_cpurch_unit` (`unit_id`),
  KEY `fk_cpurch_user` (`recorded_by`),
  KEY `idx_cp_status_pending` (`status`,`created_at`),
  CONSTRAINT `fk_cpurch_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_cpurch_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `fk_cpurch_unit` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`),
  CONSTRAINT `fk_cpurch_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `discounts`
--

DROP TABLE IF EXISTS `discounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `discounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `discount_name` varchar(100) DEFAULT NULL,
  `discount_type` enum('Percentage','Fixed') DEFAULT NULL,
  `value` decimal(10,2) DEFAULT NULL,
  `status` enum('Active','Inactive') DEFAULT 'Active',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `external_processing_companies`
--

DROP TABLE IF EXISTS `external_processing_companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `external_processing_companies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `address` varchar(500) DEFAULT NULL,
  `contact` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_epc_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='External processing companies/facilities for commodity delivery';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `external_processing_deliveries`
--

DROP TABLE IF EXISTS `external_processing_deliveries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `external_processing_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `delivery_reference` varchar(50) NOT NULL COMMENT 'Auto-generated: EPD-YYYY-NNNNNN',
  `product_id` int NOT NULL,
  `quantity` decimal(12,3) NOT NULL COMMENT 'Quantity delivered (supports decimals)',
  `company_id` int NOT NULL,
  `delivery_date` date NOT NULL,
  `delivered_by` varchar(200) DEFAULT NULL COMMENT 'Person who delivered',
  `remarks` varchar(500) DEFAULT NULL,
  `recorded_by` int NOT NULL COMMENT 'FK → users.id — Admin who recorded',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_epd_user` (`recorded_by`),
  KEY `idx_epd_reference` (`delivery_reference`),
  KEY `idx_epd_product_date` (`product_id`,`delivery_date`),
  KEY `idx_epd_company` (`company_id`),
  CONSTRAINT `fk_epd_company` FOREIGN KEY (`company_id`) REFERENCES `external_processing_companies` (`id`),
  CONSTRAINT `fk_epd_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_epd_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='External processing delivery records for commodity auditing';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_logs`
--

DROP TABLE IF EXISTS `inventory_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inventory_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int DEFAULT NULL,
  `transaction_type` enum('Stock In','Sale','Return','Adjustment') DEFAULT NULL,
  `reference_id` int DEFAULT NULL,
  `quantity` decimal(12,3) DEFAULT NULL,
  `remaining_stock` decimal(12,3) DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `action` varchar(50) DEFAULT NULL,
  `quantity_change` decimal(12,3) DEFAULT NULL,
  `reference` varchar(50) DEFAULT NULL,
  `commodity_purchase_id` int DEFAULT NULL COMMENT 'FK to commodity_purchases.id ÔÇö set when action = Commodity Purchase',
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `inventory_logs_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `inventory_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoice_sequences`
--

DROP TABLE IF EXISTS `invoice_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_sequences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `document_type` varchar(60) NOT NULL DEFAULT 'SALES INVOICE',
  `prefix` varchar(10) NOT NULL DEFAULT 'INV',
  `current_number` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_seq_prefix` (`prefix`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payment_methods`
--

DROP TABLE IF EXISTS `payment_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_methods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `method_name` varchar(50) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `requires_reference` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `barcode` varchar(50) DEFAULT NULL,
  `barcode_source` enum('manufacturer','store') NOT NULL DEFAULT 'manufacturer',
  `supplier_barcode` varchar(50) DEFAULT NULL,
  `product_name` varchar(150) NOT NULL,
  `description` text,
  `category_id` int DEFAULT NULL,
  `supplier_id` int DEFAULT NULL,
  `unit_id` int DEFAULT NULL,
  `cost_price` decimal(10,2) DEFAULT '0.00',
  `selling_price` decimal(10,2) DEFAULT '0.00',
  `quantity` decimal(12,3) NOT NULL DEFAULT '0.000',
  `reorder_level` int DEFAULT '0',
  `image` varchar(255) DEFAULT NULL,
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_returnable` tinyint(1) NOT NULL DEFAULT '1',
  `damaged_stock` decimal(12,3) NOT NULL DEFAULT '0.000',
  `tax_type` enum('VATABLE','VAT_EXEMPT','ZERO_RATED','NON_TAXABLE') NOT NULL DEFAULT 'VATABLE',
  `pricing_type` enum('FIXED_PRICE','MARKET_BASED') NOT NULL DEFAULT 'FIXED_PRICE',
  `product_usage` enum('RETAIL_PRODUCT','RAW_MATERIAL_COMMODITY','BOTH') NOT NULL DEFAULT 'RETAIL_PRODUCT' COMMENT 'Determines how the product is used in business workflows',
  `quantity_type` enum('WHOLE_UNIT','WEIGHTED') NOT NULL DEFAULT 'WHOLE_UNIT' COMMENT 'WHOLE_UNIT for integer quantities, WEIGHTED for decimal quantities',
  PRIMARY KEY (`id`),
  UNIQUE KEY `barcode` (`barcode`),
  KEY `category_id` (`category_id`),
  KEY `supplier_id` (`supplier_id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  CONSTRAINT `products_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `products_ibfk_3` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_id` int DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `quantity_ordered` int DEFAULT '0',
  `quantity_received` int DEFAULT '0',
  `cost_price` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `po_id` (`po_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `purchase_order_items_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `purchase_order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_number` varchar(50) NOT NULL,
  `supplier_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `status` enum('Pending','In Transit','Received','Cancelled') DEFAULT 'Pending',
  `expected_date` date DEFAULT NULL,
  `remarks` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `po_number` (`po_number`),
  KEY `supplier_id` (`supplier_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `purchase_orders_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `purchase_orders_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `receipt_reprint_log`
--

DROP TABLE IF EXISTS `receipt_reprint_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `receipt_reprint_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_id` int DEFAULT NULL COMMENT 'NULL if not a sale reprint',
  `return_id` int DEFAULT NULL COMMENT 'NULL if not a return reprint',
  `purchase_id` int DEFAULT NULL COMMENT 'NULL if not a commodity purchase reprint',
  `reprinted_by` int NOT NULL,
  `reason` varchar(200) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_rrl_sale` (`sale_id`),
  KEY `fk_rrl_return` (`return_id`),
  KEY `fk_rrl_user` (`reprinted_by`),
  CONSTRAINT `fk_rrl_return` FOREIGN KEY (`return_id`) REFERENCES `returns` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rrl_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rrl_user` FOREIGN KEY (`reprinted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `return_items`
--

DROP TABLE IF EXISTS `return_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `return_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `return_id` int NOT NULL,
  `sale_item_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity_returned` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_return_items_return` (`return_id`),
  KEY `fk_return_items_sale_item` (`sale_item_id`),
  KEY `fk_return_items_product` (`product_id`),
  CONSTRAINT `fk_return_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_return_items_return` FOREIGN KEY (`return_id`) REFERENCES `returns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_return_items_sale_item` FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `returns`
--

DROP TABLE IF EXISTS `returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `returns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `return_number` varchar(20) NOT NULL,
  `sale_id` int NOT NULL,
  `processed_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `resolution` enum('refund','replacement') DEFAULT NULL,
  `item_condition` enum('good','damaged') DEFAULT NULL,
  `return_reason` varchar(500) NOT NULL,
  `refund_amount` decimal(10,2) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  `receipt_printed` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = return receipt was printed',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_return_number` (`return_number`),
  KEY `fk_returns_sale` (`sale_id`),
  KEY `fk_returns_processed_by` (`processed_by`),
  KEY `fk_returns_approved_by` (`approved_by`),
  CONSTRAINT `fk_returns_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_returns_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_returns_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sale_items`
--

DROP TABLE IF EXISTS `sale_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_id` int DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `selling_price` decimal(10,2) DEFAULT NULL,
  `total` decimal(10,2) DEFAULT NULL,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `subtotal` decimal(10,2) DEFAULT NULL,
  `tax_type` enum('VATABLE','VAT_EXEMPT','ZERO_RATED','NON_TAXABLE') NOT NULL DEFAULT 'VATABLE',
  `tax_rate` decimal(5,2) NOT NULL DEFAULT '12.00',
  `vat_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `taxable_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `sale_id` (`sale_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `sale_items_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`),
  CONSTRAINT `sale_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sale_voids`
--

DROP TABLE IF EXISTS `sale_voids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sale_voids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_id` int NOT NULL,
  `requested_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reason` varchar(500) NOT NULL,
  `rejection_reason` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_sv_sale` (`sale_id`),
  KEY `fk_sv_requested_by` (`requested_by`),
  KEY `fk_sv_approved_by` (`approved_by`),
  CONSTRAINT `fk_sv_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_sv_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_sv_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales`
--

DROP TABLE IF EXISTS `sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(30) DEFAULT NULL,
  `cashier_id` int DEFAULT NULL,
  `customer_name` varchar(150) DEFAULT NULL,
  `customer_address` text,
  `customer_tin` varchar(30) DEFAULT NULL,
  `business_style` varchar(100) DEFAULT NULL,
  `subtotal` decimal(10,2) DEFAULT NULL,
  `discount` decimal(10,2) DEFAULT NULL,
  `discount_id` int DEFAULT NULL,
  `vat_sales` decimal(10,2) DEFAULT NULL,
  `vat_amount` decimal(10,2) DEFAULT NULL,
  `total_amount` decimal(10,2) DEFAULT NULL,
  `amount_received` decimal(10,2) DEFAULT NULL,
  `change_amount` decimal(10,2) DEFAULT NULL,
  `payment_method_id` int DEFAULT NULL,
  `transaction_status` enum('Completed','Voided','Cancelled') DEFAULT 'Completed',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cash_tendered` decimal(10,2) DEFAULT NULL,
  `void_status` enum('active','void_requested','voided') NOT NULL DEFAULT 'active',
  `receipt_printed` tinyint(1) NOT NULL DEFAULT '0',
  `client_transaction_id` varchar(100) DEFAULT NULL,
  `payment_status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending' COMMENT 'Tracks payment lifecycle for crash recovery',
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  UNIQUE KEY `uq_sales_invoice_number` (`invoice_number`),
  KEY `cashier_id` (`cashier_id`),
  KEY `payment_method_id` (`payment_method_id`),
  KEY `discount_id` (`discount_id`),
  KEY `idx_sales_client_txn_id` (`client_transaction_id`),
  CONSTRAINT `sales_ibfk_1` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`id`),
  CONSTRAINT `sales_ibfk_2` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`),
  CONSTRAINT `sales_ibfk_3` FOREIGN KEY (`discount_id`) REFERENCES `discounts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stock_adjustments`
--

DROP TABLE IF EXISTS `stock_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_adjustments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int DEFAULT NULL,
  `adjusted_by` int DEFAULT NULL,
  `adjustment_type` enum('Damaged','Lost','Correction','Expired') DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `reason` text,
  `adjustment_date` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  KEY `adjusted_by` (`adjusted_by`),
  CONSTRAINT `stock_adjustments_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `stock_adjustments_ibfk_2` FOREIGN KEY (`adjusted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stock_count_items`
--

DROP TABLE IF EXISTS `stock_count_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_count_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_count_id` int DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `system_quantity` int DEFAULT '0',
  `physical_count` int DEFAULT '0',
  `difference` int GENERATED ALWAYS AS ((`physical_count` - `system_quantity`)) STORED,
  `remarks` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `stock_count_id` (`stock_count_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `stock_count_items_ibfk_1` FOREIGN KEY (`stock_count_id`) REFERENCES `stock_counts` (`id`),
  CONSTRAINT `stock_count_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stock_counts`
--

DROP TABLE IF EXISTS `stock_counts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_counts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `counted_by` int DEFAULT NULL,
  `status` enum('In Progress','Completed','Cancelled') DEFAULT 'In Progress',
  `count_date` date DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `counted_by` (`counted_by`),
  CONSTRAINT `stock_counts_ibfk_1` FOREIGN KEY (`counted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stock_in`
--

DROP TABLE IF EXISTS `stock_in`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_in` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_id` int DEFAULT NULL,
  `invoice_number` varchar(50) DEFAULT NULL,
  `received_by` int DEFAULT NULL,
  `received_date` date DEFAULT NULL,
  `remarks` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `supplier_id` (`supplier_id`),
  KEY `received_by` (`received_by`),
  CONSTRAINT `stock_in_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`),
  CONSTRAINT `stock_in_ibfk_2` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stock_in_items`
--

DROP TABLE IF EXISTS `stock_in_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_in_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stock_in_id` int DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `cost_price` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `stock_in_id` (`stock_in_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `stock_in_items_ibfk_1` FOREIGN KEY (`stock_in_id`) REFERENCES `stock_in` (`id`),
  CONSTRAINT `stock_in_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `store_settings`
--

DROP TABLE IF EXISTS `store_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `store_settings` (
  `id` int NOT NULL DEFAULT '1',
  `store_name` varchar(150) NOT NULL DEFAULT '',
  `store_fb` varchar(150) NOT NULL DEFAULT '',
  `store_phone` varchar(50) NOT NULL DEFAULT '',
  `store_address` varchar(255) NOT NULL DEFAULT '',
  `currency` varchar(10) NOT NULL DEFAULT 'PHP',
  `tax_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `business_license` varchar(100) NOT NULL DEFAULT '',
  `updated_at` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `pos_min` varchar(30) NOT NULL DEFAULT '',
  `pos_serial` varchar(30) NOT NULL DEFAULT '',
  `vat_registered` tinyint(1) NOT NULL DEFAULT '0',
  `registered_taxpayer_name` varchar(200) NOT NULL DEFAULT '',
  `tin` varchar(30) NOT NULL DEFAULT '',
  `document_type` varchar(60) NOT NULL DEFAULT 'SALES INVOICE',
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_singleton` CHECK ((`id` = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(150) NOT NULL,
  `contact_person` varchar(150) DEFAULT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` text,
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `suspended_sales`
--

DROP TABLE IF EXISTS `suspended_sales`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suspended_sales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `suspended_order_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cashier_id` int NOT NULL,
  `customer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `customer_address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_tin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cart_data` json NOT NULL,
  `status` enum('SUSPENDED','COMPLETED','CANCELLED') COLLATE utf8mb4_unicode_ci DEFAULT 'SUSPENDED',
  `label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `suspended_order_id` (`suspended_order_id`),
  KEY `idx_cashier_status` (`cashier_id`,`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `store_name` varchar(150) DEFAULT NULL,
  `proprietor` varchar(150) DEFAULT NULL,
  `tin` varchar(30) DEFAULT NULL,
  `address` text,
  `contact_number` varchar(20) DEFAULT NULL,
  `facebook` varchar(100) DEFAULT NULL,
  `vat_enabled` tinyint(1) DEFAULT '1',
  `vat_rate` decimal(5,2) DEFAULT NULL,
  `pricing_type` enum('VAT Inclusive','VAT Exclusive') DEFAULT NULL,
  `receipt_footer` text,
  `printer_name` varchar(150) DEFAULT NULL,
  `cash_drawer_enabled` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `units`
--

DROP TABLE IF EXISTS `units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `units` (
  `id` int NOT NULL AUTO_INCREMENT,
  `unit_name` varchar(50) NOT NULL,
  `abbreviation` varchar(30) NOT NULL,
  `description` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(20) DEFAULT NULL,
  `full_name` varchar(150) NOT NULL,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('Admin','Inventory Clerk','Cashier') NOT NULL,
  `contact_number` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  `password_changed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `employee_id` (`employee_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-29 14:49:55
