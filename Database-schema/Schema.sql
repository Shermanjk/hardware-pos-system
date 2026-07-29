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
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES (1,1,NULL,'return_refund',NULL,'2026-07-21 07:36:16','RTN-20260721-0001'),(2,1,NULL,'return_refund',NULL,'2026-07-21 07:48:50','RTN-20260721-0002'),(3,1,NULL,'return_refund',NULL,'2026-07-21 09:56:29','RTN-20260721-0004'),(4,3,NULL,'return_refund',NULL,'2026-07-28 11:23:39','RTN-000001'),(5,3,NULL,'return_refund',NULL,'2026-07-28 11:42:34','RTN-000002'),(6,3,NULL,'return_refund',NULL,'2026-07-28 11:51:14','RTN-000003');
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,'account_created',1,'admin',3,'Cashier1',NULL,'2026-07-17 02:31:25',NULL,NULL,NULL,NULL,NULL),(2,'password_changed',3,'Cashier1',3,'Cashier1',NULL,'2026-07-17 02:33:46',NULL,NULL,NULL,NULL,NULL),(3,'account_created',1,'admin',4,'Clerk1',NULL,'2026-07-17 02:54:49',NULL,NULL,NULL,NULL,NULL),(4,'password_reset',1,'admin',4,'Clerk1',NULL,'2026-07-17 02:59:23',NULL,NULL,NULL,NULL,NULL),(5,'password_changed',4,'Clerk1',4,'Clerk1',NULL,'2026-07-17 02:59:54',NULL,NULL,NULL,NULL,NULL),(6,'password_changed',1,'admin',1,'admin',NULL,'2026-07-21 01:51:18',NULL,NULL,NULL,NULL,NULL),(7,'BUSINESS_INFORMATION_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-23 01:28:20','store_settings',1,'{\"registered_taxpayer_name\": \"\"}','{\"registered_taxpayer_name\": \"SALUDO, IRIES SUMAYLO\"}',NULL),(8,'BUSINESS_INFORMATION_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-23 01:30:10','store_settings',1,'{\"store_address\": \"Purok Lapu-Lapu, Tikwas 7015 Dumalinao, Zamboanga del Sur\"}','{\"store_address\": \"Prk Lapu-Lapu, Tikwas 7015 Dumalinao, Zamboanga del Sur\"}',NULL),(9,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-23 01:30:59','sales',13,NULL,'{\"total_amount\": 50, \"customer_name\": \"Nel\", \"invoice_number\": \"INV-000001\"}',NULL),(10,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-23 03:18:04','sales',14,NULL,'{\"total_amount\": 475, \"customer_name\": \"Lipay\", \"invoice_number\": \"INV-000012\"}',NULL),(11,'SYSTEM_SETTINGS_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-23 03:24:29','store_settings',1,'{\"store_name\": \"Isra Hardware\"}','{\"store_name\": \"Isra Hardware Trading\"}',NULL),(12,'BUSINESS_INFORMATION_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-23 03:25:48','store_settings',1,'{\"registered_taxpayer_name\": \"SALUDO, IRIES SUMAYLO\"}','{\"registered_taxpayer_name\": \"PROPRIETOR: IRIES S. SALUDO\"}',NULL),(13,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-23 03:27:22','sales',15,NULL,'{\"total_amount\": 75, \"customer_name\": \"Gerald\", \"invoice_number\": \"INV-000013\"}',NULL),(14,'PRODUCT_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-23 18:10:07','products',7,NULL,'{\"barcode\": \"0005\", \"cost_price\": 40, \"product_name\": \"Copra\", \"selling_price\": 50}',NULL),(15,'COMMODITY_PRICE_CHANGED',1,'admin',NULL,NULL,NULL,'2026-07-23 18:11:00','commodity_prices',1,NULL,'{\"product_id\": 7, \"product_name\": \"Copra\", \"price_per_unit\": 45}','Increase of price'),(16,'COMMODITY_PURCHASE_RECORDED',1,'admin',NULL,NULL,NULL,'2026-07-23 18:11:52','commodity_purchases',1,NULL,'{\"unit\": \"Kilograms\", \"quantity\": 100, \"product_id\": 7, \"amount_paid\": 0, \"final_amount\": 4100, \"product_name\": \"Copra\", \"payment_status\": \"UNPAID\", \"reference_price\": 45, \"final_unit_price\": 41, \"deduction_per_unit\": 4}',NULL),(17,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-23 19:17:04','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260723-000001\", \"item_count\": 1, \"stock_in_id\": \"SI-20260723-000001\"}',NULL),(18,'PRODUCT_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-23 21:28:05','products',8,NULL,'{\"barcode\": \"0006\", \"cost_price\": 30, \"product_name\": \"Charcoal\", \"selling_price\": 34.94}',NULL),(19,'COMMODITY_PRICE_CHANGED',1,'admin',NULL,NULL,NULL,'2026-07-23 21:29:18','commodity_prices',2,NULL,'{\"product_id\": 8, \"product_name\": \"Charcoal\", \"price_per_unit\": 35}',NULL),(20,'COMMODITY_PURCHASE_RECORDED',1,'admin',NULL,NULL,NULL,'2026-07-23 21:31:31','commodity_purchases',2,NULL,'{\"unit\": \"Kilograms\", \"quantity\": 50, \"product_id\": 8, \"amount_paid\": 0, \"final_amount\": 1750, \"product_name\": \"Charcoal\", \"payment_status\": \"UNPAID\", \"reference_price\": 35, \"final_unit_price\": 35, \"deduction_per_unit\": 0}',NULL),(21,'PRODUCT_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-24 17:12:37','products',9,NULL,'{\"barcode\": \"0005\", \"cost_price\": 0, \"product_name\": \"Copra\", \"selling_price\": 0}',NULL),(22,'COMMODITY_PRICE_CHANGED',1,'admin',NULL,NULL,NULL,'2026-07-24 17:26:44','commodity_prices',3,NULL,'{\"product_id\": 9, \"product_name\": \"Copra\", \"price_per_unit\": 40}',NULL),(23,'COMMODITY_PURCHASE_SUBMITTED',4,'Clerk1',NULL,NULL,NULL,'2026-07-24 17:27:29','commodity_purchases',3,NULL,'{\"unit\": \"Kilograms\", \"status\": \"PENDING_APPROVAL\", \"quantity\": 100, \"product_id\": 9, \"final_amount\": 3800, \"product_name\": \"Copra\", \"reference_price\": 40, \"deduction_amount\": 200, \"final_unit_price\": 40, \"payable_quantity\": 95, \"deducted_quantity\": 5, \"deduction_per_unit\": 0}',NULL),(24,'COMMODITY_PURCHASE_APPROVED',1,'admin',NULL,NULL,NULL,'2026-07-24 17:28:17','commodity_purchases',3,NULL,'{\"product_id\": 9, \"product_name\": \"Copra\", \"quantity_added\": 100, \"new_stock_quantity\": 100}',NULL),(25,'EP_COMPANY_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-24 17:59:19','external_processing_companies',4,NULL,'{\"name\": \"Tagum Processing plant\", \"address\": \"Tagum\", \"contact\": \"n/a\"}',NULL),(26,'EP_COMPANY_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-24 20:10:07','external_processing_companies',5,NULL,'{\"name\": \"Cagayan Plant\", \"address\": \"Cagayan\", \"contact\": \"n/a\"}',NULL),(27,'EP_COMPANY_DELETED',1,'admin',NULL,NULL,NULL,'2026-07-24 20:19:46','external_processing_companies',1,NULL,'{\"deleted\": true}',NULL),(28,'EP_COMPANY_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-24 20:19:52','external_processing_companies',5,NULL,'{\"name\": \"Cagayan Planta\", \"address\": \"Cagayan\", \"contact\": \"n/a\"}',NULL),(29,'EP_COMPANY_DELETED',1,'admin',NULL,NULL,NULL,'2026-07-24 20:19:56','external_processing_companies',2,NULL,'{\"deleted\": true}',NULL),(30,'EP_COMPANY_DELETED',1,'admin',NULL,NULL,NULL,'2026-07-24 20:19:59','external_processing_companies',3,NULL,'{\"deleted\": true}',NULL),(31,'EP_DELIVERY_RECORDED',1,'admin',NULL,NULL,NULL,'2026-07-24 20:20:28','external_processing_deliveries',1,NULL,'{\"company\": \"Tagum Processing plant\", \"quantity\": 50, \"new_stock\": 50, \"product_id\": 9, \"product_name\": \"Copra\", \"delivery_date\": \"2026-07-24\", \"previous_stock\": 100, \"delivery_reference\": \"EPD-2026-000001\"}',NULL),(32,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-24 21:38:13','sales',16,NULL,'{\"total_amount\": 75, \"customer_name\": \"lipay\", \"invoice_number\": \"INV-000014\"}',NULL),(33,'SALE_VOID_REQUESTED',1,'admin',NULL,NULL,NULL,'2026-07-24 21:40:06','sales',16,NULL,'{\"invoice_number\": \"INV-000014\", \"void_request_id\": 1}','Multiple product'),(34,'SALE_VOIDED',1,'admin',NULL,NULL,NULL,'2026-07-24 21:40:24','sales',16,NULL,'{\"invoice_number\": \"INV-000014\", \"void_request_id\": 1}',NULL),(35,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-24 22:25:11','sales',17,NULL,'{\"total_amount\": 425, \"customer_name\": \"mahusay\", \"invoice_number\": \"INV-000015\"}',NULL),(36,'SALE_VOID_REQUESTED',3,'Cashier1',NULL,NULL,NULL,'2026-07-24 22:25:51','sales',17,NULL,'{\"invoice_number\": \"INV-000015\", \"void_request_id\": 2}','Wrong item'),(37,'PRODUCT_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-25 22:37:40','products',10,NULL,'{\"barcode\": \"0006\", \"cost_price\": 50, \"product_name\": \"E2E Product\", \"selling_price\": 100}',NULL),(38,'account_created',1,'admin',5,'e2ecash3',NULL,'2026-07-25 22:37:41',NULL,NULL,NULL,NULL,NULL),(39,'password_changed',5,'e2ecash3',5,'e2ecash3',NULL,'2026-07-25 22:37:41',NULL,NULL,NULL,NULL,NULL),(40,'TAX_CONFIGURATION_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-25 22:37:41','store_settings',1,'{\"tax_rate\": \"12.00\"}','{\"tax_rate\": 15}',NULL),(41,'TAX_CONFIGURATION_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-25 22:37:42','store_settings',1,'{\"tax_rate\": \"15.00\"}','{\"tax_rate\": 12}',NULL),(42,'account_created',1,'admin',6,'e2edeact3',NULL,'2026-07-25 22:37:42',NULL,NULL,NULL,NULL,NULL),(43,'account_deactivated',1,'admin',6,'e2edeact3',NULL,'2026-07-25 22:37:42',NULL,NULL,NULL,NULL,NULL),(44,'SALE_CANCELLATION_REJECTED',1,'admin',NULL,NULL,NULL,'2026-07-26 12:09:57','sales',17,NULL,'{\"invoice_number\": \"INV-000015\", \"void_request_id\": 2}','not valid'),(45,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-26 12:42:10','sales',18,NULL,'{\"total_amount\": 50, \"customer_name\": \"Lads\", \"invoice_number\": \"INV-000016\"}',NULL),(46,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-26 12:45:05','sales',19,NULL,'{\"total_amount\": 225, \"customer_name\": \"LEBRON\", \"invoice_number\": \"INV-000017\"}',NULL),(47,'USER_ROLE_CHANGED',1,'admin',6,'e2edeact3',NULL,'2026-07-26 12:47:01',NULL,NULL,NULL,'{\"role\": \"Cashier\", \"status\": \"Active\", \"full_name\": \"Deact\"}',NULL),(48,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-26 12:53:06','sales',20,NULL,'{\"total_amount\": 150, \"customer_name\": \"BRAD\", \"invoice_number\": \"INV-000018\"}',NULL),(49,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-26 12:59:59','sales',21,NULL,'{\"total_amount\": 400, \"customer_name\": \"LAS\", \"invoice_number\": \"INV-000019\"}',NULL),(50,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-26 13:02:05','sales',22,NULL,'{\"total_amount\": 50, \"customer_name\": \"FRAD\", \"invoice_number\": \"INV-000020\"}',NULL),(51,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-26 13:05:24','sales',23,NULL,'{\"total_amount\": 80, \"customer_name\": \"DALES\", \"invoice_number\": \"INV-000021\"}',NULL),(52,'PRODUCT_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-27 15:00:30','products',11,NULL,'{\"barcode\": \"0007\", \"cost_price\": 40, \"product_name\": \"Small Brush\", \"selling_price\": 47}',NULL),(53,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 15:01:39','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260727-000002\", \"item_count\": 1, \"stock_in_id\": \"SI-20260727-000002\"}',NULL),(54,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 16:32:57','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260727-000003\", \"item_count\": 1, \"stock_in_id\": \"SI-20260727-000003\"}',NULL),(55,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 17:10:50','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260727-000004\", \"item_count\": 1, \"stock_in_id\": \"SI-20260727-000004\"}',NULL),(56,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 17:11:33','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260727-000005\", \"item_count\": 1, \"stock_in_id\": \"SI-20260727-000005\"}',NULL),(57,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 17:19:37','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260727-000006\", \"item_count\": 1, \"stock_in_id\": \"SI-20260727-000006\"}',NULL),(58,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 17:22:48','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260727-000007\", \"item_count\": 1, \"stock_in_id\": \"SI-20260727-000007\"}',NULL),(59,'STOCK_RECEIVED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 17:49:04','inventory',NULL,NULL,'{\"source\": \"Direct Purchase\", \"reference\": \"SI-20260727-000008\", \"item_count\": 1, \"stock_in_id\": \"SI-20260727-000008\"}',NULL),(60,'PRODUCT_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-27 17:50:31','products',12,NULL,'{\"barcode\": \"0008\", \"cost_price\": 0, \"product_name\": \"Charcoal\", \"selling_price\": 0}',NULL),(61,'COMMODITY_PRICE_CHANGED',1,'admin',NULL,NULL,NULL,'2026-07-27 17:52:18','commodity_prices',4,NULL,'{\"product_id\": 12, \"product_name\": \"Charcoal\", \"price_per_unit\": 43}',NULL),(62,'COMMODITY_PURCHASE_SUBMITTED',4,'Clerk1',NULL,NULL,NULL,'2026-07-27 18:00:56','commodity_purchases',4,NULL,'{\"unit\": \"Kilograms\", \"status\": \"PENDING_APPROVAL\", \"quantity\": 150, \"product_id\": 12, \"final_amount\": 6278, \"product_name\": \"Charcoal\", \"reference_price\": 43, \"deduction_amount\": 172, \"final_unit_price\": 43, \"payable_quantity\": 146, \"deducted_quantity\": 4, \"deduction_per_unit\": 0}',NULL),(63,'COMMODITY_PURCHASE_APPROVED',1,'admin',NULL,NULL,NULL,'2026-07-27 18:01:24','commodity_purchases',4,NULL,'{\"product_id\": 12, \"product_name\": \"Charcoal\", \"quantity_added\": 146, \"deducted_quantity\": 4, \"new_stock_quantity\": 146, \"quantity_received_gross\": 150}',NULL),(64,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-27 18:22:42','sales',24,NULL,'{\"total_amount\": 50, \"customer_name\": \"LIS\", \"invoice_number\": \"INV-000022\"}',NULL),(65,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-27 18:23:53','sales',25,NULL,'{\"total_amount\": 225, \"customer_name\": \"KOL\", \"invoice_number\": \"INV-000023\"}',NULL),(66,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 10:44:45','sales',26,NULL,'{\"total_amount\": 25, \"customer_name\": \"HIO\", \"invoice_number\": \"INV-000024\"}',NULL),(67,'PRODUCT_CREATED',1,'admin',NULL,NULL,NULL,'2026-07-28 11:19:41','products',13,NULL,'{\"barcode\": \"0009\", \"cost_price\": 0, \"product_name\": \"Coconut Raw\", \"selling_price\": 0}',NULL),(68,'PRODUCT_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-28 11:20:00','products',13,'{}','{\"status\": \"Inactive\", \"barcode\": \"0009\", \"unit_id\": 6, \"tax_type\": \"NON_TAXABLE\", \"cost_price\": 0, \"category_id\": 12, \"description\": null, \"supplier_id\": null, \"pricing_type\": \"MARKET_BASED\", \"product_name\": \"Coconut Raw\", \"is_returnable\": false, \"product_usage\": \"RAW_MATERIAL_COMMODITY\", \"reorder_level\": 0, \"selling_price\": 0, \"barcode_source\": \"store\", \"supplier_barcode\": null}',NULL),(69,'PRODUCT_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-28 11:20:05','products',13,'{}','{\"status\": \"Active\", \"barcode\": \"0009\", \"unit_id\": 6, \"tax_type\": \"NON_TAXABLE\", \"cost_price\": 0, \"category_id\": 12, \"description\": null, \"supplier_id\": null, \"pricing_type\": \"MARKET_BASED\", \"product_name\": \"Coconut Raw\", \"is_returnable\": false, \"product_usage\": \"RAW_MATERIAL_COMMODITY\", \"reorder_level\": 0, \"selling_price\": 0, \"barcode_source\": \"store\", \"supplier_barcode\": null}',NULL),(70,'PRODUCT_UPDATED',1,'admin',NULL,NULL,NULL,'2026-07-28 11:20:17','products',13,'{}','{\"status\": \"Active\", \"barcode\": \"0009\", \"unit_id\": 6, \"tax_type\": \"NON_TAXABLE\", \"cost_price\": 0, \"category_id\": 12, \"description\": null, \"supplier_id\": null, \"pricing_type\": \"MARKET_BASED\", \"product_name\": \"Coconut Raw\", \"is_returnable\": false, \"product_usage\": \"RAW_MATERIAL_COMMODITY\", \"reorder_level\": 0, \"selling_price\": 0, \"barcode_source\": \"store\", \"supplier_barcode\": null}',NULL),(71,'COMMODITY_PRICE_CHANGED',1,'admin',NULL,NULL,NULL,'2026-07-28 11:21:45','commodity_prices',5,NULL,'{\"product_id\": 13, \"product_name\": \"Coconut Raw\", \"price_per_unit\": 4}',NULL),(72,'COMMODITY_PURCHASE_SUBMITTED',4,'Clerk1',NULL,NULL,NULL,'2026-07-28 11:23:05','commodity_purchases',5,NULL,'{\"unit\": \"Pieces\", \"status\": \"PENDING_APPROVAL\", \"quantity\": 250, \"product_id\": 13, \"final_amount\": 1000, \"product_name\": \"Coconut Raw\", \"reference_price\": 4, \"deduction_amount\": 0, \"final_unit_price\": 4, \"payable_quantity\": 250, \"deducted_quantity\": 0, \"deduction_per_unit\": 0}',NULL),(73,'COMMODITY_PURCHASE_REJECTED',1,'admin',NULL,NULL,NULL,'2026-07-28 12:03:08','commodity_purchases',5,NULL,'{\"product_id\": 13, \"rejection_reason\": \"The count was not valid\"}',NULL),(74,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 16:49:36','sales',27,NULL,'{\"total_amount\": 119, \"customer_name\": \"Khl\", \"invoice_number\": \"INV-000025\"}',NULL),(75,'RETURN_REQUESTED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 16:54:03','returns',5,NULL,'{\"sale_id\": 27, \"return_number\": \"RTN-000001\", \"return_reason\": \"Wrong Item\"}',NULL),(76,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 16:54:47','sales',28,NULL,'{\"total_amount\": 200, \"customer_name\": \"KHYL\", \"invoice_number\": \"INV-000026\"}',NULL),(77,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:08:12','sales',29,NULL,'{\"total_amount\": 25, \"customer_name\": \"lik\", \"invoice_number\": \"INV-000027\"}',NULL),(78,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:14:55','sales',30,NULL,'{\"total_amount\": 25, \"customer_name\": \"lik\", \"invoice_number\": \"INV-000028\"}',NULL),(79,'SALE_COMPLETED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:19:34','sales',31,NULL,'{\"total_amount\": 225, \"customer_name\": \"KOL\", \"invoice_number\": \"INV-000029\"}',NULL),(80,'RETURN_APPROVED',1,'admin',NULL,NULL,NULL,'2026-07-28 19:23:30','returns',5,NULL,'{\"return_number\": \"RTN-000001\", \"invoice_number\": \"INV-000025\"}',NULL),(81,'REFUND_PROCESSED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:23:39','returns',5,NULL,'{\"refund_amount\": \"25.00\", \"return_number\": \"RTN-000001\", \"item_condition\": \"good\"}',NULL),(82,'RETURN_REQUESTED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:42:09','returns',6,NULL,'{\"sale_id\": 29, \"return_number\": \"RTN-000002\", \"return_reason\": \"Wrong Item\"}',NULL),(83,'RETURN_APPROVED',1,'admin',NULL,NULL,NULL,'2026-07-28 19:42:22','returns',6,NULL,'{\"return_number\": \"RTN-000002\", \"invoice_number\": \"INV-000027\"}',NULL),(84,'REFUND_PROCESSED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:42:34','returns',6,NULL,'{\"refund_amount\": \"25.00\", \"return_number\": \"RTN-000002\", \"item_condition\": \"good\"}',NULL),(85,'RETURN_REQUESTED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:51:02','returns',7,NULL,'{\"sale_id\": 30, \"return_number\": \"RTN-000003\", \"return_reason\": \"Missing Items\"}',NULL),(86,'RETURN_APPROVED',1,'admin',NULL,NULL,NULL,'2026-07-28 19:51:07','returns',7,NULL,'{\"return_number\": \"RTN-000003\", \"invoice_number\": \"INV-000028\"}',NULL),(87,'REFUND_PROCESSED',3,'Cashier1',NULL,NULL,NULL,'2026-07-28 19:51:14','returns',7,NULL,'{\"refund_amount\": \"25.00\", \"return_number\": \"RTN-000003\", \"item_condition\": \"good\"}',NULL);
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES (1,'Hand Tools',NULL,'2026-07-17 09:45:36'),(2,'Power Tool',NULL,'2026-07-17 09:45:36'),(3,'Fasteners',NULL,'2026-07-17 09:45:36'),(4,'Adhesives',NULL,'2026-07-17 09:45:36'),(5,'Plumbing',NULL,'2026-07-17 09:45:36'),(6,'Electrical',NULL,'2026-07-17 09:45:36'),(7,'Abrasives',NULL,'2026-07-17 09:45:36'),(8,'Painting',NULL,'2026-07-17 09:45:36'),(9,'Construction',NULL,'2026-07-17 09:45:36'),(11,'Roofing','For the roof','2026-07-21 08:20:22'),(12,'Crude coconut oil',NULL,'2026-07-23 10:07:08'),(13,'Fuel & Cooking',NULL,'2026-07-23 13:26:46');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `commodity_prices`
--

LOCK TABLES `commodity_prices` WRITE;
/*!40000 ALTER TABLE `commodity_prices` DISABLE KEYS */;
INSERT INTO `commodity_prices` VALUES (3,9,40.0000,'2026-07-24 17:26:44',1,NULL),(4,12,43.0000,'2026-07-27 17:52:18',1,NULL),(5,13,4.0000,'2026-07-28 11:21:45',1,NULL);
/*!40000 ALTER TABLE `commodity_prices` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `commodity_purchase_payments`
--

LOCK TABLES `commodity_purchase_payments` WRITE;
/*!40000 ALTER TABLE `commodity_purchase_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `commodity_purchase_payments` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `commodity_purchases`
--

LOCK TABLES `commodity_purchases` WRITE;
/*!40000 ALTER TABLE `commodity_purchases` DISABLE KEYS */;
INSERT INTO `commodity_purchases` VALUES (3,'APPROVED',4,9,NULL,'Lusay',100.0000,5.0000,95.0000,200.0000,11,'Kilograms',40.0000,0.0000,40.0000,4000.0000,200.0000,3800.0000,NULL,4,'2026-07-24','2026-07-24 17:27:29','UNPAID',0.0000,NULL,NULL,NULL,NULL,1,'2026-07-24 17:28:17',NULL,NULL,NULL,0),(4,'APPROVED',4,12,NULL,'Richard',150.0000,4.0000,146.0000,172.0000,11,'Kilograms',43.0000,0.0000,43.0000,6450.0000,172.0000,6278.0000,NULL,4,'2026-07-27','2026-07-27 18:00:56','UNPAID',0.0000,NULL,NULL,NULL,NULL,1,'2026-07-27 18:01:24',NULL,NULL,NULL,0),(5,'REJECTED',4,13,NULL,'Juan',250.0000,0.0000,250.0000,0.0000,6,'Pieces',4.0000,0.0000,4.0000,1000.0000,0.0000,1000.0000,NULL,4,'2026-07-28','2026-07-28 11:23:05','UNPAID',0.0000,NULL,NULL,NULL,NULL,NULL,NULL,1,'2026-07-28 12:03:08','The count was not valid',0);
/*!40000 ALTER TABLE `commodity_purchases` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `discounts`
--

LOCK TABLES `discounts` WRITE;
/*!40000 ALTER TABLE `discounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `discounts` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `external_processing_companies`
--

LOCK TABLES `external_processing_companies` WRITE;
/*!40000 ALTER TABLE `external_processing_companies` DISABLE KEYS */;
INSERT INTO `external_processing_companies` VALUES (4,'Tagum Processing plant','Tagum','n/a',1,'2026-07-24 17:59:19'),(5,'Cagayan Planta','Cagayan','n/a',1,'2026-07-24 20:10:07');
/*!40000 ALTER TABLE `external_processing_companies` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `external_processing_deliveries`
--

LOCK TABLES `external_processing_deliveries` WRITE;
/*!40000 ALTER TABLE `external_processing_deliveries` DISABLE KEYS */;
INSERT INTO `external_processing_deliveries` VALUES (1,'EPD-2026-000001',9,50.000,4,'2026-07-24','Mark yu',NULL,1,'2026-07-24 20:20:27');
/*!40000 ALTER TABLE `external_processing_deliveries` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `inventory_logs`
--

LOCK TABLES `inventory_logs` WRITE;
/*!40000 ALTER TABLE `inventory_logs` DISABLE KEYS */;
INSERT INTO `inventory_logs` VALUES (1,2,'Stock In',NULL,0.000,10.000,1,'2026-07-20 16:54:04','Received Stock',10.000,'SI-20250407-0001',NULL),(2,4,'Stock In',NULL,0.000,30.000,4,'2026-07-20 16:57:28','Received Stock',30.000,'SI-20260720-0002',NULL),(3,4,NULL,NULL,NULL,NULL,3,'2026-07-21 03:22:01','sale',-1.000,'INV-20260721-0001',NULL),(4,3,'Stock In',NULL,0.000,50.000,4,'2026-07-21 05:23:39','Received Stock',50.000,'SI-20260721-0003',NULL),(5,3,NULL,NULL,NULL,NULL,3,'2026-07-21 05:36:39','sale',-4.000,'INV-20260721-0002',NULL),(6,2,'Stock In',NULL,0.000,30.000,4,'2026-07-21 05:39:52','Received Stock',30.000,'SI-20260721-0004',NULL),(7,3,NULL,NULL,NULL,NULL,3,'2026-07-21 05:45:22','sale',-1.000,'INV-20260721-0003',NULL),(8,4,NULL,NULL,NULL,NULL,3,'2026-07-21 05:45:22','sale',-1.000,'INV-20260721-0003',NULL),(9,2,NULL,NULL,NULL,NULL,3,'2026-07-21 05:45:22','sale',-1.000,'INV-20260721-0003',NULL),(10,3,NULL,NULL,NULL,NULL,3,'2026-07-21 06:03:12','sale',-1.000,'INV-20260721-0004',NULL),(11,3,NULL,NULL,NULL,NULL,3,'2026-07-21 06:22:25','sale',-2.000,'INV-20260721-0005',NULL),(12,3,'Adjustment',NULL,42.000,41.000,4,'2026-07-21 06:47:01','Lost',-1.000,'Lost during transpo',NULL),(13,5,'Adjustment',NULL,0.000,5.000,4,'2026-07-21 06:48:55','Correction',5.000,'Stock count correction',NULL),(14,5,'Stock In',NULL,5.000,10.000,4,'2026-07-21 07:11:33','Received Stock',5.000,'SI-20260721-0005',NULL),(15,5,'Adjustment',NULL,10.000,11.000,4,'2026-07-21 07:13:14','Correction',1.000,'Stock count correction',NULL),(16,4,NULL,NULL,NULL,NULL,1,'2026-07-21 07:36:16','return_refund',1.000,'RTN-20260721-0001',NULL),(17,2,NULL,NULL,NULL,NULL,1,'2026-07-21 07:48:50','return_refund',1.000,'RTN-20260721-0002',NULL),(18,3,NULL,NULL,NULL,NULL,3,'2026-07-21 08:06:04','sale',-1.000,'INV-20260721-0006',NULL),(19,3,NULL,NULL,NULL,NULL,3,'2026-07-21 09:33:49','sale',-3.000,'INV-20260721-0007',NULL),(20,2,NULL,NULL,NULL,NULL,3,'2026-07-21 09:35:42','sale',-1.000,'INV-20260721-0008',NULL),(21,3,NULL,NULL,NULL,NULL,3,'2026-07-21 09:36:39','sale',-1.000,'INV-20260721-0009',NULL),(22,3,NULL,NULL,NULL,NULL,3,'2026-07-21 09:55:34','sale',-1.000,'INV-20260721-0010',NULL),(23,3,NULL,NULL,NULL,NULL,1,'2026-07-21 09:56:29','return_refund',1.000,'RTN-20260721-0004',NULL),(24,3,'Sale',NULL,NULL,NULL,3,'2026-07-22 14:52:46','sale',-1.000,'INV-20260722-0001',NULL),(25,6,'Stock In',NULL,0.000,50.000,4,'2026-07-22 15:39:55','Received Stock',50.000,'123',NULL),(26,2,'Stock In',NULL,29.000,44.000,4,'2026-07-22 15:39:55','Received Stock',15.000,'123',NULL),(27,3,'Stock In',NULL,35.000,55.000,4,'2026-07-22 15:39:55','Received Stock',20.000,'123',NULL),(28,4,'Stock In',NULL,29.000,44.000,4,'2026-07-22 15:39:55','Received Stock',15.000,'123',NULL),(29,6,'Sale',NULL,NULL,NULL,3,'2026-07-22 15:46:06','sale',-2.000,'INV-20260722-0002',NULL),(30,4,'Sale',NULL,NULL,NULL,3,'2026-07-22 15:46:06','sale',-1.000,'INV-20260722-0002',NULL),(31,5,'Sale',NULL,NULL,NULL,3,'2026-07-22 15:46:06','sale',-1.000,'INV-20260722-0002',NULL),(32,3,'Sale',NULL,NULL,NULL,3,'2026-07-22 17:30:59','sale',-2.000,'INV-000001',NULL),(33,3,'Sale',NULL,NULL,NULL,3,'2026-07-22 19:18:04','sale',-3.000,'INV-000012',NULL),(34,4,'Sale',NULL,NULL,NULL,3,'2026-07-22 19:18:04','sale',-1.000,'INV-000012',NULL),(35,2,'Sale',NULL,NULL,NULL,3,'2026-07-22 19:18:04','sale',-1.000,'INV-000012',NULL),(36,3,'Sale',NULL,NULL,NULL,3,'2026-07-22 19:27:22','sale',-3.000,'INV-000013',NULL),(38,3,'Stock In',NULL,47.000,47.000,4,'2026-07-23 11:17:04','Received Stock',15.000,'SI-20260723-000001',NULL),(40,9,'Stock In',NULL,0.000,100.000,1,'2026-07-24 09:28:17','Commodity Purchase Approved',100.000,'CP-3',3),(41,9,'Adjustment',NULL,100.000,50.000,1,'2026-07-24 12:20:27','External Processing Delivery',-50.000,'EPD-2026-000001',NULL),(42,3,'Sale',NULL,NULL,NULL,3,'2026-07-24 13:38:13','sale',-3.000,'INV-000014',NULL),(43,4,'Sale',NULL,NULL,NULL,3,'2026-07-24 14:25:10','sale',-2.000,'INV-000015',NULL),(44,3,'Sale',NULL,NULL,NULL,3,'2026-07-24 14:25:10','sale',-1.000,'INV-000015',NULL),(45,3,'Sale',NULL,NULL,NULL,3,'2026-07-26 04:42:10','sale',-2.000,'INV-000016',NULL),(46,3,'Sale',NULL,NULL,NULL,3,'2026-07-26 04:45:05','sale',-1.000,'INV-000017',NULL),(47,4,'Sale',NULL,NULL,NULL,3,'2026-07-26 04:45:05','sale',-1.000,'INV-000017',NULL),(48,5,'Sale',NULL,NULL,NULL,3,'2026-07-26 04:53:06','sale',-1.000,'INV-000018',NULL),(49,5,'Sale',NULL,NULL,NULL,3,'2026-07-26 04:59:59','sale',-1.000,'INV-000019',NULL),(50,3,'Sale',NULL,NULL,NULL,3,'2026-07-26 04:59:59','sale',-2.000,'INV-000019',NULL),(51,4,'Sale',NULL,NULL,NULL,3,'2026-07-26 04:59:59','sale',-1.000,'INV-000019',NULL),(52,3,'Sale',NULL,NULL,NULL,3,'2026-07-26 05:02:05','sale',-2.000,'INV-000020',NULL),(53,6,'Sale',NULL,NULL,NULL,3,'2026-07-26 05:05:24','sale',-2.000,'INV-000021',NULL),(54,11,'Stock In',NULL,0.000,0.001,4,'2026-07-27 07:01:39','Received Stock',50.000,'SI-20260727-000002',NULL),(55,11,'Stock In',NULL,0.001,0.001,4,'2026-07-27 08:32:56','Received Stock',100.000,'SI-20260727-000003',NULL),(56,11,'Stock In',NULL,0.001,0.002,4,'2026-07-27 09:10:50','Received Stock',50.000,'SI-20260727-000004',NULL),(57,11,'Stock In',NULL,0.002,0.003,4,'2026-07-27 09:11:33','Received Stock',50.000,'SI-20260727-000005',NULL),(58,11,'Stock In',NULL,0.000,0.001,4,'2026-07-27 09:19:36','Received Stock',50.000,'SI-20260727-000006',NULL),(59,11,'Stock In',NULL,0.001,20.001,4,'2026-07-27 09:22:48','Received Stock',20.000,'SI-20260727-000007',NULL),(60,11,'Stock In',NULL,20.001,30.001,4,'2026-07-27 09:49:04','Received Stock',10.000,'SI-20260727-000008',NULL),(61,12,'Stock In',NULL,0.000,146.000,1,'2026-07-27 10:01:24','Commodity Purchase Approved',146.000,'CP-4',4),(62,3,'Sale',NULL,NULL,NULL,3,'2026-07-27 10:22:42','sale',-2.000,'INV-000022',NULL),(63,3,'Sale',NULL,NULL,NULL,3,'2026-07-27 10:23:53','sale',-1.000,'INV-000023',NULL),(64,4,'Sale',NULL,NULL,NULL,3,'2026-07-27 10:23:53','sale',-1.000,'INV-000023',NULL),(65,3,'Sale',NULL,NULL,NULL,3,'2026-07-28 02:44:44','sale',-1.000,'INV-000024',NULL),(66,11,'Sale',NULL,NULL,NULL,3,'2026-07-28 08:49:36','sale',-2.000,'INV-000025',NULL),(67,3,'Sale',NULL,NULL,NULL,3,'2026-07-28 08:49:36','sale',-1.000,'INV-000025',NULL),(68,4,'Sale',NULL,NULL,NULL,3,'2026-07-28 08:54:47','sale',-1.000,'INV-000026',NULL),(69,3,'Sale',NULL,NULL,NULL,3,'2026-07-28 11:08:10','sale',-1.000,'INV-000027',NULL),(70,3,'Sale',NULL,NULL,NULL,3,'2026-07-28 11:14:54','sale',-1.000,'INV-000028',NULL),(71,3,'Sale',NULL,NULL,NULL,3,'2026-07-28 11:19:34','sale',-1.000,'INV-000029',NULL),(72,4,'Sale',NULL,NULL,NULL,3,'2026-07-28 11:19:34','sale',-1.000,'INV-000029',NULL),(73,3,'Return',NULL,NULL,NULL,3,'2026-07-28 11:23:39','return_refund',1.000,'RTN-000001',NULL),(74,3,'Return',NULL,NULL,NULL,3,'2026-07-28 11:42:34','return_refund',1.000,'RTN-000002',NULL),(75,3,'Return',NULL,NULL,NULL,3,'2026-07-28 11:51:13','return_refund',1.000,'RTN-000003',NULL);
/*!40000 ALTER TABLE `inventory_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `invoice_sequences`
--

LOCK TABLES `invoice_sequences` WRITE;
/*!40000 ALTER TABLE `invoice_sequences` DISABLE KEYS */;
INSERT INTO `invoice_sequences` VALUES (1,'SALES INVOICE','INV',29,'2026-07-23 01:19:57','2026-07-28 19:19:34'),(2,'RETURN','RTN',3,'2026-07-23 01:20:03','2026-07-28 19:51:02'),(3,'STOCK IN','SI',8,'2026-07-23 02:01:11','2026-07-27 17:49:04'),(4,'SALES INVOICE','EPD',1,'2026-07-24 17:43:40','2026-07-24 20:20:27'),(5,'SALES INVOICE','SUSP',1,'2026-07-28 18:23:47','2026-07-28 18:23:47');
/*!40000 ALTER TABLE `invoice_sequences` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `payment_methods`
--

LOCK TABLES `payment_methods` WRITE;
/*!40000 ALTER TABLE `payment_methods` DISABLE KEYS */;
INSERT INTO `payment_methods` VALUES (1,'Cash',1,0,'2026-07-16 14:50:19');
/*!40000 ALTER TABLE `payment_methods` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (2,'0001','store',NULL,'Claw Hammer',NULL,1,NULL,6,150.00,200.00,43.000,20,NULL,'Active','2026-07-20 16:25:42','2026-07-22 19:18:04',1,0.000,'VATABLE','FIXED_PRICE','RETAIL_PRODUCT','WHOLE_UNIT'),(3,'0002','store',NULL,'Nails',NULL,3,NULL,7,15.00,25.00,31.000,30,NULL,'Active','2026-07-20 16:43:47','2026-07-28 11:51:13',1,0.000,'VATABLE','FIXED_PRICE','RETAIL_PRODUCT','WHOLE_UNIT'),(4,'0003','store',NULL,'Clamps',NULL,1,NULL,6,150.00,200.00,35.000,30,NULL,'Active','2026-07-20 16:46:38','2026-07-28 11:19:34',1,0.000,'VATABLE','FIXED_PRICE','RETAIL_PRODUCT','WHOLE_UNIT'),(5,'6 920130 600854','manufacturer',NULL,'Paint Roller with Handle','For paint',8,1,6,100.00,150.00,8.000,20,NULL,'Active','2026-07-20 18:27:40','2026-07-26 04:59:59',1,0.000,'VATABLE','FIXED_PRICE','RETAIL_PRODUCT','WHOLE_UNIT'),(6,'0004','store',NULL,'Electrical Tape',NULL,6,NULL,6,35.00,40.00,46.000,20,NULL,'Active','2026-07-22 04:52:31','2026-07-26 05:05:24',1,0.000,'VATABLE','FIXED_PRICE','RETAIL_PRODUCT','WHOLE_UNIT'),(9,'0005','store',NULL,'Copra',NULL,12,NULL,11,0.00,0.00,50.000,0,NULL,'Active','2026-07-24 09:12:37','2026-07-24 12:20:27',1,0.000,'VATABLE','MARKET_BASED','RAW_MATERIAL_COMMODITY','WHOLE_UNIT'),(10,'0006','store',NULL,'E2E Product',NULL,7,1,10,50.00,100.00,0.000,10,NULL,'Active','2026-07-25 14:37:39','2026-07-25 14:37:39',1,0.000,'VATABLE','FIXED_PRICE','RETAIL_PRODUCT','WHOLE_UNIT'),(11,'0007','store',NULL,'Small Brush',NULL,8,NULL,6,40.00,47.00,28.001,20,NULL,'Active','2026-07-27 07:00:30','2026-07-28 08:49:36',1,0.000,'VATABLE','FIXED_PRICE','RETAIL_PRODUCT','WHOLE_UNIT'),(12,'0008','store',NULL,'Charcoal',NULL,13,NULL,11,0.00,0.00,146.000,0,NULL,'Active','2026-07-27 09:50:31','2026-07-27 10:01:24',1,0.000,'VATABLE','MARKET_BASED','RAW_MATERIAL_COMMODITY','WHOLE_UNIT'),(13,'0009','store',NULL,'Coconut Raw',NULL,12,NULL,6,0.00,0.00,0.000,0,NULL,'Active','2026-07-28 03:19:41','2026-07-28 03:20:05',0,0.000,'NON_TAXABLE','MARKET_BASED','RAW_MATERIAL_COMMODITY','WHOLE_UNIT');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `purchase_order_items`
--

LOCK TABLES `purchase_order_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_items` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `purchase_orders`
--

LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `receipt_reprint_log`
--

LOCK TABLES `receipt_reprint_log` WRITE;
/*!40000 ALTER TABLE `receipt_reprint_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `receipt_reprint_log` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `return_items`
--

LOCK TABLES `return_items` WRITE;
/*!40000 ALTER TABLE `return_items` DISABLE KEYS */;
INSERT INTO `return_items` VALUES (1,1,1,4,1,200.00),(2,2,5,2,1,200.00),(3,3,11,3,1,25.00),(4,4,9,3,1,25.00),(5,5,39,3,1,25.00),(6,6,41,3,1,25.00),(7,7,42,3,1,25.00);
/*!40000 ALTER TABLE `return_items` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `returns`
--

LOCK TABLES `returns` WRITE;
/*!40000 ALTER TABLE `returns` DISABLE KEYS */;
INSERT INTO `returns` VALUES (1,'RTN-20260721-0001',1,1,1,'approved','refund','good','Wrong Item',200.00,'2026-07-21 11:49:28','2026-07-21 15:36:16',0),(2,'RTN-20260721-0002',3,3,1,'approved','refund','good','Wrong Item',200.00,'2026-07-21 15:48:05','2026-07-21 15:48:50',0),(3,'RTN-20260721-0003',9,3,1,'approved',NULL,NULL,'Missing Items',NULL,'2026-07-21 17:39:49','2026-07-21 17:40:25',0),(4,'RTN-20260721-0004',7,3,1,'approved','refund','good','Missing Items',25.00,'2026-07-21 17:55:05','2026-07-21 17:56:29',0),(5,'RTN-000001',27,3,1,'approved','refund','good','Wrong Item',25.00,'2026-07-28 16:54:03','2026-07-28 19:23:39',0),(6,'RTN-000002',29,3,1,'approved','refund','good','Wrong Item',25.00,'2026-07-28 19:42:08','2026-07-28 19:42:34',0),(7,'RTN-000003',30,3,1,'approved','refund','good','Missing Items',25.00,'2026-07-28 19:51:02','2026-07-28 19:51:13',0);
/*!40000 ALTER TABLE `returns` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `sale_items`
--

LOCK TABLES `sale_items` WRITE;
/*!40000 ALTER TABLE `sale_items` DISABLE KEYS */;
INSERT INTO `sale_items` VALUES (1,1,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(2,2,3,4,NULL,NULL,25.00,100.00,'VATABLE',12.00,10.71,89.29),(3,3,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(4,3,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(5,3,2,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(6,4,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(7,5,3,2,NULL,NULL,25.00,50.00,'VATABLE',12.00,5.36,44.64),(8,6,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(9,7,3,3,NULL,NULL,25.00,75.00,'VATABLE',12.00,8.04,66.96),(10,8,2,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(11,9,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(12,10,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(13,11,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(14,12,6,2,NULL,NULL,40.00,80.00,'VATABLE',12.00,8.57,71.43),(15,12,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(16,12,5,1,NULL,NULL,150.00,150.00,'VATABLE',12.00,16.07,133.93),(17,13,3,2,NULL,NULL,25.00,50.00,'VATABLE',12.00,5.36,44.64),(18,14,3,3,NULL,NULL,25.00,75.00,'VATABLE',12.00,8.04,66.96),(19,14,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(20,14,2,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(21,15,3,3,NULL,NULL,25.00,75.00,'VATABLE',12.00,8.04,66.96),(22,16,3,3,NULL,NULL,25.00,75.00,'VATABLE',12.00,8.04,66.96),(23,17,4,2,NULL,NULL,200.00,400.00,'VATABLE',12.00,42.86,357.14),(24,17,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(25,18,3,2,NULL,NULL,25.00,50.00,'VATABLE',12.00,5.36,44.64),(26,19,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(27,19,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(28,20,5,1,NULL,NULL,150.00,150.00,'VATABLE',12.00,16.07,133.93),(29,21,5,1,NULL,NULL,150.00,150.00,'VATABLE',12.00,16.07,133.93),(30,21,3,2,NULL,NULL,25.00,50.00,'VATABLE',12.00,5.36,44.64),(31,21,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(32,22,3,2,NULL,NULL,25.00,50.00,'VATABLE',12.00,5.36,44.64),(33,23,6,2,NULL,NULL,40.00,80.00,'VATABLE',12.00,8.57,71.43),(34,24,3,2,NULL,NULL,25.00,50.00,'VATABLE',12.00,5.36,44.64),(35,25,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(36,25,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(37,26,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(38,27,11,2,NULL,NULL,47.00,94.00,'VATABLE',12.00,10.07,83.93),(39,27,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(40,28,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57),(41,29,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(42,30,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(43,31,3,1,NULL,NULL,25.00,25.00,'VATABLE',12.00,2.68,22.32),(44,31,4,1,NULL,NULL,200.00,200.00,'VATABLE',12.00,21.43,178.57);
/*!40000 ALTER TABLE `sale_items` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `sale_voids`
--

LOCK TABLES `sale_voids` WRITE;
/*!40000 ALTER TABLE `sale_voids` DISABLE KEYS */;
INSERT INTO `sale_voids` VALUES (1,16,1,1,'approved','Multiple product',NULL,'2026-07-24 21:40:05','2026-07-24 21:40:24'),(2,17,3,1,'rejected','Wrong item','not valid','2026-07-24 22:25:51','2026-07-26 12:09:57');
/*!40000 ALTER TABLE `sale_voids` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `sales`
--

LOCK TABLES `sales` WRITE;
/*!40000 ALTER TABLE `sales` DISABLE KEYS */;
INSERT INTO `sales` VALUES (1,'INV-20260721-0001',3,'Makapagal','Dumalinao',NULL,NULL,178.57,NULL,NULL,NULL,21.43,200.00,NULL,300.00,NULL,'Completed','2026-07-21 03:22:01',500.00,'active',1,NULL,'completed'),(2,'INV-20260721-0002',3,'Mahinay','san miguel',NULL,NULL,89.29,NULL,NULL,NULL,10.71,100.00,NULL,0.00,NULL,'Completed','2026-07-21 05:36:39',100.00,'active',1,NULL,'completed'),(3,'INV-20260721-0003',3,'Mahusay','san pablo',NULL,NULL,424.49,NULL,NULL,NULL,0.51,425.00,NULL,75.00,NULL,'Completed','2026-07-21 05:45:22',500.00,'active',1,NULL,'completed'),(4,'INV-20260721-0004',3,'Arayko',NULL,NULL,NULL,24.97,NULL,NULL,NULL,0.03,25.00,NULL,25.00,NULL,'Completed','2026-07-21 06:03:12',50.00,'active',1,NULL,'completed'),(5,'INV-20260721-0005',3,'fred',NULL,NULL,NULL,49.94,NULL,NULL,NULL,0.06,50.00,NULL,0.00,NULL,'Completed','2026-07-21 06:22:25',50.00,'active',1,NULL,'completed'),(6,'INV-20260721-0006',3,'aroyo',NULL,NULL,NULL,24.97,NULL,NULL,NULL,0.03,25.00,NULL,25.00,NULL,'Completed','2026-07-21 08:06:04',50.00,'active',1,NULL,'completed'),(7,'INV-20260721-0007',3,'Siloy',NULL,NULL,NULL,74.91,NULL,NULL,NULL,0.09,75.00,NULL,25.00,NULL,'Completed','2026-07-21 09:33:49',100.00,'active',1,NULL,'completed'),(8,'INV-20260721-0008',3,'Siloy',NULL,NULL,NULL,199.76,NULL,NULL,NULL,0.24,200.00,NULL,300.00,NULL,'Completed','2026-07-21 09:35:42',500.00,'active',1,NULL,'completed'),(9,'INV-20260721-0009',3,'mahusay',NULL,NULL,NULL,24.97,NULL,NULL,NULL,0.03,25.00,NULL,25.00,NULL,'Completed','2026-07-21 09:36:39',50.00,'active',1,NULL,'completed'),(10,'INV-20260721-0010',3,'Dripan',NULL,NULL,NULL,24.97,NULL,NULL,NULL,0.03,25.00,NULL,25.00,NULL,'Completed','2026-07-21 09:55:34',50.00,'active',1,NULL,'completed'),(11,'INV-20260722-0001',3,'Mark',NULL,NULL,NULL,22.32,NULL,NULL,NULL,2.68,25.00,NULL,25.00,NULL,'Completed','2026-07-22 14:52:46',50.00,'active',1,NULL,'completed'),(12,'INV-20260722-0002',3,'Nerf',NULL,NULL,NULL,383.93,NULL,NULL,NULL,46.07,430.00,NULL,70.00,NULL,'Completed','2026-07-22 15:46:05',500.00,'active',1,NULL,'completed'),(13,'INV-000001',3,'Nel',NULL,NULL,NULL,44.64,NULL,NULL,NULL,5.36,50.00,NULL,50.00,NULL,'Completed','2026-07-22 17:30:59',100.00,'active',1,NULL,'completed'),(14,'INV-000012',3,'Lipay',NULL,NULL,NULL,424.10,NULL,NULL,NULL,50.90,475.00,NULL,25.00,NULL,'Completed','2026-07-22 19:18:04',500.00,'active',1,NULL,'completed'),(15,'INV-000013',3,'Gerald',NULL,NULL,NULL,66.96,NULL,NULL,NULL,8.04,75.00,NULL,25.00,NULL,'Completed','2026-07-22 19:27:22',100.00,'active',1,NULL,'completed'),(16,'INV-000014',3,'lipay',NULL,NULL,NULL,66.96,NULL,NULL,NULL,8.04,75.00,NULL,25.00,NULL,'Completed','2026-07-24 13:38:13',100.00,'voided',1,NULL,'completed'),(17,'INV-000015',3,'mahusay',NULL,NULL,NULL,379.46,NULL,NULL,NULL,45.54,425.00,NULL,75.00,NULL,'Completed','2026-07-24 14:25:10',500.00,'active',1,NULL,'completed'),(18,'INV-000016',3,'Lads',NULL,NULL,NULL,44.64,NULL,NULL,NULL,5.36,50.00,NULL,50.00,NULL,'Completed','2026-07-26 04:42:10',100.00,'active',1,NULL,'completed'),(19,'INV-000017',3,'LEBRON',NULL,NULL,NULL,200.89,NULL,NULL,NULL,24.11,225.00,NULL,275.00,NULL,'Completed','2026-07-26 04:45:05',500.00,'active',1,NULL,'completed'),(20,'INV-000018',3,'BRAD',NULL,NULL,NULL,133.93,NULL,NULL,NULL,16.07,150.00,NULL,50.00,NULL,'Completed','2026-07-26 04:53:06',200.00,'active',1,NULL,'completed'),(21,'INV-000019',3,'LAS',NULL,NULL,NULL,357.14,NULL,NULL,NULL,42.86,400.00,NULL,100.00,NULL,'Completed','2026-07-26 04:59:59',500.00,'active',1,NULL,'completed'),(22,'INV-000020',3,'FRAD',NULL,NULL,NULL,44.64,NULL,NULL,NULL,5.36,50.00,NULL,50.00,NULL,'Completed','2026-07-26 05:02:05',100.00,'active',1,NULL,'completed'),(23,'INV-000021',3,'DALES',NULL,NULL,NULL,71.43,NULL,NULL,NULL,8.57,80.00,NULL,20.00,NULL,'Completed','2026-07-26 05:05:24',100.00,'active',1,NULL,'completed'),(24,'INV-000022',3,'LIS',NULL,NULL,NULL,44.64,NULL,NULL,NULL,5.36,50.00,NULL,0.00,NULL,'Completed','2026-07-27 10:22:42',50.00,'active',1,NULL,'completed'),(25,'INV-000023',3,'KOL',NULL,NULL,NULL,200.89,NULL,NULL,NULL,24.11,225.00,NULL,275.00,NULL,'Completed','2026-07-27 10:23:53',500.00,'active',1,NULL,'completed'),(26,'INV-000024',3,'HIO',NULL,NULL,NULL,22.32,NULL,NULL,NULL,2.68,25.00,NULL,25.00,NULL,'Completed','2026-07-28 02:44:44',50.00,'active',1,'TXN-ms41ytw7-5s18cr8g','completed'),(27,'INV-000025',3,'Khl',NULL,NULL,NULL,106.25,NULL,NULL,NULL,12.75,119.00,NULL,81.00,NULL,'Completed','2026-07-28 08:49:36',200.00,'active',1,'TXN-ms4f01ag-ov3xproc','completed'),(28,'INV-000026',3,'KHYL',NULL,NULL,NULL,178.57,NULL,NULL,NULL,21.43,200.00,NULL,0.00,NULL,'Completed','2026-07-28 08:54:47',200.00,'active',1,'TXN-ms4f6pn0-gfe01dsl','completed'),(29,'INV-000027',3,'lik',NULL,NULL,NULL,22.32,NULL,NULL,NULL,2.68,25.00,NULL,25.00,NULL,'Completed','2026-07-28 11:08:10',50.00,'active',1,'TXN-ms4jy90g-2zdl6ozr','completed'),(30,'INV-000028',3,'lik',NULL,NULL,NULL,22.32,NULL,NULL,NULL,2.68,25.00,NULL,25.00,NULL,'Completed','2026-07-28 11:14:54',50.00,'active',1,'TXN-ms4k6woh-wt1tugos','completed'),(31,'INV-000029',3,'KOL',NULL,NULL,NULL,200.89,NULL,NULL,NULL,24.11,225.00,NULL,275.00,NULL,'Completed','2026-07-28 11:19:34',500.00,'active',1,'TXN-ms4kcwgq-m5a0mnjk','completed');
/*!40000 ALTER TABLE `sales` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `stock_adjustments`
--

LOCK TABLES `stock_adjustments` WRITE;
/*!40000 ALTER TABLE `stock_adjustments` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_adjustments` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `stock_count_items`
--

LOCK TABLES `stock_count_items` WRITE;
/*!40000 ALTER TABLE `stock_count_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_count_items` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `stock_counts`
--

LOCK TABLES `stock_counts` WRITE;
/*!40000 ALTER TABLE `stock_counts` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_counts` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `stock_in`
--

LOCK TABLES `stock_in` WRITE;
/*!40000 ALTER TABLE `stock_in` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_in` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `stock_in_items`
--

LOCK TABLES `stock_in_items` WRITE;
/*!40000 ALTER TABLE `stock_in_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `stock_in_items` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `store_settings`
--

LOCK TABLES `store_settings` WRITE;
/*!40000 ALTER TABLE `store_settings` DISABLE KEYS */;
INSERT INTO `store_settings` VALUES (1,'Isra Hardware Trading','Rexjie Saludo','09093250717','Prk Lapu-Lapu, Tikwas 7015 Dumalinao, Zamboanga del Sur','PHP',12.00,'765-490-574-00000','2026-07-25 22:37:41','','',1,'PROPRIETOR: IRIES S. SALUDO','765-490-574-00000','SALES INVOICE');
/*!40000 ALTER TABLE `store_settings` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES (1,'TriumP','George','09986762','gorge@gmail.com','Tiguma','Active','2026-07-20 14:15:08'),(2,'Co','Flor Co','09882762',NULL,NULL,'Active','2026-07-28 02:46:29');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `suspended_sales`
--

LOCK TABLES `suspended_sales` WRITE;
/*!40000 ALTER TABLE `suspended_sales` DISABLE KEYS */;
INSERT INTO `suspended_sales` VALUES (1,'SUSP-000001',3,'lik',NULL,NULL,'[{\"name\": \"Nails\", \"barcode\": \"\", \"quantity\": 1, \"subtotal\": 25, \"tax_rate\": 12, \"tax_type\": \"VATABLE\", \"unitPrice\": 25, \"product_id\": 3}]','CANCELLED','Order #1 — lik','2026-07-28 10:23:47','2026-07-28 11:19:10');
/*!40000 ALTER TABLE `suspended_sales` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `system_settings`
--

LOCK TABLES `system_settings` WRITE;
/*!40000 ALTER TABLE `system_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `system_settings` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `units`
--

LOCK TABLES `units` WRITE;
/*!40000 ALTER TABLE `units` DISABLE KEYS */;
INSERT INTO `units` VALUES (5,'Gallon','gal',NULL),(6,'Pieces','pcs',NULL),(7,'Boxes','box',NULL),(8,'Sets','sets',NULL),(9,'Rolls','rolls',NULL),(10,'Bags','bags',NULL),(11,'Kilograms','kg',NULL),(12,'Liters','L',NULL),(13,'Sheets','sheets',NULL),(14,'Pairs','pairs',NULL),(15,'Lengths','lengths',NULL);
/*!40000 ALTER TABLE `units` ENABLE KEYS */;
UNLOCK TABLES;

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

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'EMP-001','System Administrator','admin','$2b$10$6VKud.m.edQ4ZKcQqd4yAOYQuVBoEEfTrJ.1hi2yyXOW.T2yKXr9O','Admin',NULL,NULL,'Active','2026-07-16 15:39:30','2026-07-20 17:51:18',0,'2026-07-21 01:51:18'),(3,NULL,'Cashier 1','Cashier1','$2b$10$TUlPuwUpfBPxD6ZUPYJgy.Y8YEsK7HHtFjY7gb49AWgD7mAM72VKS','Cashier',NULL,NULL,'Active','2026-07-16 18:31:25','2026-07-16 18:33:46',0,'2026-07-17 02:33:46'),(4,NULL,'Clerk 1','Clerk1','$2b$10$IyylhKWydM6AFh5ww5Pnr.O.sU1iN6m7Js90pL.zVvbzaZtbzSJWK','Inventory Clerk',NULL,NULL,'Active','2026-07-16 18:54:49','2026-07-16 18:59:54',0,'2026-07-17 02:59:54'),(5,NULL,'E2E Cashier','e2ecash3','$2b$10$F4.EmuufSsirSVA48/lXB.kCoZKGqo4tPsY8aDSEgir2NLQlJ6Wzm','Cashier',NULL,NULL,'Active','2026-07-25 14:37:40','2026-07-25 14:37:41',0,'2026-07-25 22:37:41'),(6,NULL,'Deact','e2edeact3','$2b$10$snpRSHtsWjyqFc0hZ3nPqOr3UfQB/zALe56TEcg2m7D76afPMwVr2','Cashier',NULL,NULL,'Active','2026-07-25 14:37:42','2026-07-26 04:47:01',1,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-29 14:42:00
