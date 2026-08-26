# ISRA HARDWARE POS & INVENTORY MANAGEMENT SYSTEM
## Interactive HTML Entity Relationship Diagram (ERD) Documentation

### Document Overview
This repository contains the official, verified, and interactive Entity Relationship Diagram (ERD) for the **ISRA Hardware POS & Inventory Management System**. The ERD is designed to support technical documentation, developer onboarding, system architecture auditing, and formal **Bureau of Internal Revenue (BIR)** Computerized Accounting System (CAS) / POS Permit to Use (PTU) technical accreditation submissions.

---

## 1. Key Statistics

| Metric | Value | Notes |
| :--- | :--- | :--- |
| **Total Verified Tables** | **37** | 30 Core + 1 Singleton Settings + 4 Version/Backup + 2 Auxiliary |
| **Total Verified Relationships** | **66** | Explicit Foreign Keys & Referential Relationships |
| **Total Primary Keys** | **37** | Verified unique identifiers across all active tables |
| **Total Foreign Keys** | **66** | Verified database-level & application-enforced linkages |
| **Unverified / Legacy Exclusions** | **5** | Deprecated base dump tables not queried by active code |
| **Date of Generation** | **August 25, 2026** | Audited against Schema baseline & Migrations 001–051 |

---

## 2. Single Source of Truth
This ERD was generated strictly from the comprehensive codebase and database architecture audit of the ISRA POS System:
1. **Database Schema & Migrations**: `Database-schema/Schema.sql` and all 51 migration files in `migrations/001_*.sql` through `migrations/051_*.sql`.
2. **Database Engine Triggers**: MySQL 8.0+ Immutability Triggers defined in Migration 047 (`trg_prevent_sales_delete`, `trg_prevent_sale_items_delete`, `trg_protect_sales_financial_data`).
3. **Backend API Handlers & Services**: Active TypeScript Express routes under `server/routes/` and services under `server/services/`.
4. **No invented tables, columns, cardinalities, or theoretical relations were introduced.**

---

## 3. Verified Logical Domains

The visualizer organizes the 37 tables into seven (7) architectural domains:

1. **Security & Users** (`users`, `audit_logs`)
2. **Product & Inventory** (`categories`, `units`, `suppliers`, `products`, `inventory_logs`, `stock_count_adjustment_requests`, `market_based_adjustment_requests`)
3. **Sales & Fiscal Core** (`discounts`, `discount_requests`, `payment_methods`, `sales`, `sale_items`, `sale_voids`, `returns`, `return_items`, `customer_store_credit`, `suspended_sales`, `receipt_reprint_log`)
4. **Customer & Credit / Utang** (`customers`, `credit_ledger`, `credit_allocations`, `credit_limit_overrides`)
5. **Purchasing** (`commodity_prices`, `commodity_purchases`, `commodity_purchase_payments`, `external_processing_companies`, `external_processing_deliveries`)
6. **Cashiering & Z-Reading** (`cash_sessions`, `z_readings`, `invoice_sequences`)
7. **Audit & System Configuration** (`system_settings`, `system_version`, `backup_metadata`, `backup_settings`, `migration_history`)

---

## 4. Documentation Discrepancies Resolved (Legacy ERD vs Actual)

| Area | Inaccurate in Legacy `docs/` | Actual Verified Implementation |
| :--- | :--- | :--- |
| **System Settings** | Not represented in old diagram | `system_settings` (Singleton `id=1` with BIR PTU, MIN, Serial, TIN, Branch Code) |
| **Store Settings** | Mentioned as active table | Dropped in Migration 032; consolidated into `system_settings` |
| **Commodity Payments** | Omitted | `commodity_purchase_payments` (Active installment payment ledger) |
| **External Processing** | Omitted | `external_processing_companies` & `external_processing_deliveries` |
| **Returns Resolution** | Documented only as refund/replace | `returns.resolution` enum includes `refund`, `exchange`, `store_credit`, `rejected` |
| **Credit Ledger Enum** | Omitted return credits | `credit_ledger.entry_type` includes `'RETURN_CREDIT'` (Migration 044) |
| **Suspended Sales** | Omitted | `suspended_sales` (Active cart holding in JSON) |
| **Discount Requests** | Omitted from diagram | `discount_requests` (Active cashier discount authorization table) |

---

## 5. Excluded Items (NOT INCLUDED BECAUSE UNVERIFIED)

The following tables exist in the early `Schema.sql` dump prototype but are **EXCLUDED** from the active ERD because they are not implemented, queried, or utilized in the active application logic:
1. `purchase_orders` & `purchase_order_items` *(Superseded by `commodity_purchases` & direct Stock In)*
2. `stock_in` & `stock_in_items` *(Superseded by `inventory_logs` with `SI` document sequence)*
3. `stock_adjustments`, `stock_counts` & `stock_count_items` *(Superseded by `stock_count_adjustment_requests` and `market_based_adjustment_requests`)*
4. `activity_logs` *(Superseded by `audit_logs`)*
5. `store_settings` *(Explicitly dropped in Migration 032)*

---

## 6. How to Open and Use the Visualizer

### Quick Launch
1. Locate [`ISRA_POS_ERD.html`](./ISRA_POS_ERD.html) in the root directory.
2. Double-click or open it with any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari).
3. The visualizer is **100% self-contained**—no internet connection, backend server, database, npm, or node runtime is required.

### Interactive Navigation & Controls
- **Pan Canvas**: Click and drag on empty canvas space.
- **Zoom In / Out**: Use the mouse scroll wheel or press the `+` / `-` keys.
- **Reset & Fit View**: Click **"Fit View"** or press the `0` key.
- **Select Table**: Click any table card to highlight connected relationships, related tables, and open the **Inspector Panel**.
- **Inspect Relationship**: Click on any relationship line to inspect foreign keys, cardinality (`1 ────< N`), and verified business meaning.
- **Search**: Type in the top search bar to filter tables, columns, and foreign keys in real-time.
- **Filter by Domain**: Click the domain filter chips to isolate specific functional areas.
- **Highlight BIR Fiscal Entities**: Click **"Highlight BIR Fiscal"** to visually spotlight all 14 BIR-regulated fiscal tables.
- **Detailed vs Overview Mode**: Toggle the view mode button to switch between full field schemas and compact architecture boxes.
- **Clear Selection**: Press `Escape` or click empty canvas space.

---

## 7. Printing & Exporting to PDF (BIR Document Ready)

1. Open [`ISRA_POS_ERD.html`](./ISRA_POS_ERD.html) in your browser.
2. Click the **"Export / Print"** button in the top right control bar, or press `Ctrl + P` (`Cmd + P` on macOS).
3. In the print dialog:
   - **Destination**: Choose *"Save as PDF"* or select your printer.
   - **Layout**: Choose **Landscape**.
   - **Background Graphics**: Ensure **checked / enabled**.
4. The print stylesheet automatically hides UI toolbars, floating widgets, and sidebars, outputting a clean, high-contrast, publication-grade ERD schematic suitable for formal BIR accreditation dossiers.
