# Requirements Document

## Introduction

This document specifies requirements for the Return Management feature of the Isra Hardware POS and Inventory Management System. The feature is split into two sequential phases:

- **Phase 1 — Save Transactions**: Persist completed sales to the database (prerequisite for returns). The cashier terminal currently only prints a browser receipt without saving anything to MySQL.
- **Phase 2 — Return Management**: Full return workflow supporting cashier-initiated returns (with receipt), admin-initiated returns (without receipt), admin approval, and resolution via cash refund or same-product replacement.

The Inventory Clerk role has no access to any part of this feature.

---

## Glossary

- **POS_System**: The Isra Hardware Point-of-Sale and Inventory Management System.
- **Cashier**: A user with the `Cashier` role operating the POS terminal.
- **Admin**: A user with the `Admin` role managing sales, returns, and inventory.
- **Inventory_Clerk**: A user with the `Inventory Clerk` role. Has zero access to sales or returns.
- **Sale**: A completed payment transaction recorded in the `sales` table, containing one or more sale items.
- **Sale_Item**: A single line in a sale: product, quantity, unit price, and subtotal, stored in `sale_items`.
- **Invoice_Number**: A system-generated unique identifier for a sale. Format: `INV-YYYYMMDD-XXXX` (sequential 4-digit counter per day).
- **Return**: A request to reverse one or more items from a completed sale, stored in the `returns` table.
- **Return_Number**: A system-generated unique identifier for a return. Format: `RTN-YYYYMMDD-XXXX`.
- **Return_Item**: A single line in a return: product, quantity returned, and unit price, stored in `return_items`.
- **Return_Window**: The 7-calendar-day period starting from the sale date during which a return may be requested.
- **Returnable_Product**: A product whose `is_returnable` flag is `TRUE` in the `products` table.
- **Item_Condition**: The physical state of a returned item: `good` (sellable) or `damaged` (defective/unsellable).
- **Resolution**: The outcome of an approved return: `refund` (cash returned to customer) or `replacement` (same product exchanged).
- **Pending_Return**: A return with `status = 'pending'` awaiting admin review.
- **Approved_Return**: A return with `status = 'approved'` that is ready for resolution.
- **Rejected_Return**: A return with `status = 'rejected'` that will not be processed.
- **Sellable_Stock**: The `quantity` field on the `products` table representing units available for sale.
- **Damaged_Stock**: The `damaged_stock` field on the `products` table representing units that are defective and not available for sale.
- **Return_Receipt**: A printed document summarising a completed return, referencing the original invoice.
- **VAT**: Value Added Tax at 12%, applied to all sales and included in refund calculations.
- **JWT**: JSON Web Token used for authentication and role identification.
- **authenticate**: The Express middleware (`authenticate.ts`) that validates the JWT and populates `req.user`.

---

## Requirements

### Requirement 1: Database Schema — Sales and Returns Tables

**User Story:** As a system architect, I want the required database tables to exist, so that sales and return data can be persisted and queried reliably.

#### Acceptance Criteria

1. THE POS_System SHALL create a `sales` table with columns: `id` (PK, auto-increment), `invoice_number` (VARCHAR, unique), `customer_name` (VARCHAR), `customer_address` (VARCHAR, nullable), `customer_tin` (VARCHAR, nullable), `cashier_id` (FK → users.id), `subtotal` (DECIMAL 10,2), `vat_amount` (DECIMAL 10,2), `total_amount` (DECIMAL 10,2), `cash_tendered` (DECIMAL 10,2), `change_amount` (DECIMAL 10,2), `created_at` (DATETIME, default CURRENT_TIMESTAMP).
2. THE POS_System SHALL create a `sale_items` table with columns: `id` (PK, auto-increment), `sale_id` (FK → sales.id, ON DELETE CASCADE), `product_id` (FK → products.id), `quantity` (INT), `unit_price` (DECIMAL 10,2), `subtotal` (DECIMAL 10,2).
3. THE POS_System SHALL create a `returns` table with columns: `id` (PK, auto-increment), `return_number` (VARCHAR, unique), `sale_id` (FK → sales.id), `processed_by` (FK → users.id, cashier who submitted), `approved_by` (FK → users.id, nullable, admin who resolved), `status` (ENUM: `pending`, `approved`, `rejected`), `resolution` (ENUM: `refund`, `replacement`, nullable), `item_condition` (ENUM: `good`, `damaged`, nullable), `return_reason` (VARCHAR), `refund_amount` (DECIMAL 10,2, nullable), `created_at` (DATETIME, default CURRENT_TIMESTAMP), `resolved_at` (DATETIME, nullable).
4. THE POS_System SHALL create a `return_items` table with columns: `id` (PK, auto-increment), `return_id` (FK → returns.id, ON DELETE CASCADE), `sale_item_id` (FK → sale_items.id), `product_id` (FK → products.id), `quantity_returned` (INT), `unit_price` (DECIMAL 10,2).
5. THE POS_System SHALL add an `is_returnable` column (TINYINT(1), default 1) to the `products` table if it does not already exist.
6. THE POS_System SHALL add a `damaged_stock` column (INT, default 0) to the `products` table if it does not already exist.

---

### Requirement 2: Save Sale on Payment (Phase 1)

**User Story:** As a cashier, I want the system to save a completed sale to the database when I process payment, so that every transaction is recorded and can later be referenced for returns.

#### Acceptance Criteria

1. WHEN a cashier clicks "Process Payment" on the POS terminal with a non-empty cart and sufficient cash tendered, THE POS_System SHALL send a `POST /api/sales` request containing: invoice number, customer details, cashier ID, all cart items (product ID, quantity, unit price, subtotal), subtotal, VAT amount, total amount, cash tendered, and change amount.
2. WHEN the `POST /api/sales` endpoint receives a valid request, THE POS_System SHALL insert a row into `sales` and one row per item into `sale_items` within a single database transaction.
3. WHEN a sale is saved, THE POS_System SHALL decrement each product's `quantity` (Sellable_Stock) in the `products` table by the sold quantity within the same database transaction.
4. WHEN generating an Invoice_Number, THE POS_System SHALL use the format `INV-YYYYMMDD-XXXX` where `XXXX` is a zero-padded 4-digit sequential counter that resets to `0001` each calendar day.
5. WHEN the sale is saved successfully, THE POS_System SHALL return the generated invoice number to the client.
6. WHEN the cashier's browser receipt is printed after a successful save, THE POS_System SHALL display the real invoice number (returned from the server) instead of a client-generated placeholder.
7. IF the `POST /api/sales` request fails (network error or server error), THEN THE POS_System SHALL display an error toast and SHALL NOT print the receipt or clear the cart.
8. IF a product's `quantity` in the `products` table would drop below 0 after the sale, THEN THE POS_System SHALL reject the sale, return an error, and leave the database unchanged.
9. WHILE saving a sale, THE POS_System SHALL record an entry in the `inventory_logs` table for each sold product (action: `sale`, quantity change: negative sold quantity, reference: invoice number).
10. THE `POST /api/sales` endpoint SHALL be protected by the `authenticate` middleware and SHALL only accept requests from users with the `Cashier` role.

---

### Requirement 3: Cashier — Initiate Return With Receipt

**User Story:** As a cashier, I want to look up a completed sale by invoice number and submit a return request for specific items, so that customers with receipts can begin the return process at the counter.

#### Acceptance Criteria

1. THE POS_System SHALL provide a "Returns" section accessible to the Cashier from the POS terminal.
2. WHEN a cashier enters an Invoice_Number in the return lookup field, THE POS_System SHALL retrieve and display the matching sale: invoice number, customer name, purchase date, and a list of all Sale_Items with product name, quantity purchased, unit price, and quantity already returned.
3. IF the invoice number does not match any sale in the database, THEN THE POS_System SHALL display an error message "Invoice not found."
4. WHEN displaying sale items for return selection, THE POS_System SHALL show only items with a remaining returnable quantity greater than zero (purchased quantity minus already-returned quantity).
5. WHEN a cashier selects one or more items to return, THE POS_System SHALL allow entry of a return quantity (between 1 and the remaining returnable quantity) and a return reason selected from: `Damaged`, `Missing Items`, `Wrong Item`, `Other`.
6. WHEN a product on the invoice has a barcode, THE POS_System SHALL require the cashier to scan the product barcode before submitting; the system SHALL compare the scanned barcode to the invoice item's barcode and reject the submission if they do not match.
7. WHEN a product on the invoice does not have a barcode, THE POS_System SHALL display the product's name, brand, size, and unit for manual verification, and the cashier SHALL confirm the item before proceeding.
8. WHEN a cashier submits a return request, THE POS_System SHALL validate: the invoice exists, each selected item exists on the invoice, return quantity does not exceed remaining returnable quantity, the sale is within the Return_Window (7 calendar days of `sales.created_at`), and each product is a Returnable_Product.
9. IF any validation in Acceptance Criterion 3.8 fails, THEN THE POS_System SHALL display a specific error message identifying the failed validation and SHALL NOT create a Return record.
10. WHEN all validations pass, THE POS_System SHALL create a `returns` record with `status = 'pending'` and `processed_by` set to the cashier's user ID, and create corresponding `return_items` records.
11. WHEN a return request is submitted successfully, THE POS_System SHALL display a confirmation message showing the Return_Number and instruct the cashier to direct the customer to wait for admin approval.
12. THE cashier return submission endpoint SHALL be protected by `authenticate` and SHALL only accept requests from users with the `Cashier` role.

---

### Requirement 4: Admin — Manage Returns (Approve, Reject, No-Receipt)

**User Story:** As an admin, I want to view pending returns, search sales history for no-receipt returns, and approve or reject return requests, so that I can control all return decisions.

#### Acceptance Criteria

1. THE POS_System SHALL provide a Returns management view in the Admin panel listing all Return records with: return number, original invoice number, customer name, cashier name, submission date, status, and an action column.
2. WHEN an admin views a pending return, THE POS_System SHALL display the full return detail: original sale information, each Return_Item with product name, quantity returned, unit price, reason, and the item condition field for the admin to fill in.
3. WHEN an admin approves a return, THE POS_System SHALL update the `returns` record: set `status = 'approved'`, set `approved_by` to the admin's user ID, and set `resolved_at` to the current timestamp.
4. WHEN an admin rejects a return, THE POS_System SHALL update the `returns` record: set `status = 'rejected'`, set `approved_by` to the admin's user ID, and set `resolved_at` to the current timestamp.
5. IF an admin rejects a return, THEN THE POS_System SHALL display a rejection reason input field and SHALL store the rejection reason in the `returns.return_reason` field.
6. THE POS_System SHALL allow an admin to search sales history by invoice number, customer name, or purchase date range to handle no-receipt returns.
7. WHEN an admin selects a sale from search results for a no-receipt return, THE POS_System SHALL display the sale details and allow the admin to select items, enter return quantities and reasons, and approve or reject directly without a prior cashier submission step.
8. WHEN an admin initiates a no-receipt return, THE POS_System SHALL apply the same validations as Requirement 3.8 (invoice exists, item on invoice, quantity within limit, within Return_Window, product is returnable) unless the admin explicitly overrides.
9. WHERE the admin chooses to override Return_Window or returnability restrictions, THE POS_System SHALL record the override and the admin's user ID in the `returns` record.
10. THE admin returns endpoints SHALL be protected by `authenticate` and SHALL only accept requests from users with the `Admin` role.

---

### Requirement 5: Return Resolution — Cash Refund

**User Story:** As a cashier or admin, I want to process a cash refund for an approved return, so that the customer receives their money back and inventory is updated correctly.

#### Acceptance Criteria

1. WHEN a return has `status = 'approved'` and `resolution` is not yet set, THE POS_System SHALL present the Cashier and Admin with a resolution dialog offering "Cash Refund" and "Replace Same Product" options.
2. WHEN "Cash Refund" is selected, THE POS_System SHALL calculate the refund amount as the sum of (unit_price × quantity_returned) for each Return_Item, VAT-inclusive (no separate VAT deduction).
3. WHEN "Cash Refund" is selected, THE POS_System SHALL require the cashier or admin to set the Item_Condition as `good` or `damaged` before finalising.
4. WHEN the refund is finalised with Item_Condition = `good`, THE POS_System SHALL increment the product's `quantity` (Sellable_Stock) by the quantity_returned for each Return_Item.
5. WHEN the refund is finalised with Item_Condition = `damaged`, THE POS_System SHALL increment the product's `damaged_stock` by the quantity_returned for each Return_Item and SHALL NOT change the Sellable_Stock.
6. WHEN the refund is finalised, THE POS_System SHALL update the `returns` record: set `resolution = 'refund'`, set `item_condition` to the selected condition, set `refund_amount` to the calculated amount.
7. WHEN the refund is finalised, THE POS_System SHALL record an `inventory_logs` entry for each Return_Item (action: `return_refund`, quantity change: value per 5.4 or 5.5, reference: Return_Number).
8. WHEN the refund is finalised, THE POS_System SHALL record an `activity_logs` entry describing the return transaction.
9. WHEN the refund is finalised, THE POS_System SHALL trigger a cash drawer open signal (print a zero-value print job or equivalent browser trigger accepted by the system's cash drawer configuration).
10. WHEN the refund is finalised, THE POS_System SHALL display a Return_Receipt in a print window containing: return number, original invoice number, customer name, cashier/admin name, date, items returned with quantities and unit prices, total refund amount, and a label "CASH REFUND".
11. WHEN the refund is finalised, THE POS_System SHALL display a success toast "Return Completed Successfully."
12. THE refund finalisation endpoint SHALL be protected by `authenticate` and SHALL only accept requests from users with the `Cashier` or `Admin` role.

---

### Requirement 6: Return Resolution — Same-Product Replacement

**User Story:** As a cashier or admin, I want to process a same-product replacement for an approved return, so that the customer receives a working unit without a separate re-sale transaction.

#### Acceptance Criteria

1. WHEN "Replace Same Product" is selected for an approved return, THE POS_System SHALL check the current Sellable_Stock of each returned product.
2. IF the Sellable_Stock of any returned product is 0, THEN THE POS_System SHALL display "Replacement cannot be processed — no available stock" and SHALL prompt the cashier or admin to offer a cash refund instead.
3. WHEN all returned products have Sellable_Stock ≥ 1, THE POS_System SHALL allow the replacement to proceed.
4. WHEN the replacement is finalised, THE POS_System SHALL require the cashier or admin to set the Item_Condition of the returned item as `good` or `damaged`.
5. WHEN the replacement is finalised with Item_Condition = `good`, THE POS_System SHALL add the quantity_returned to Sellable_Stock for the returned item.
6. WHEN the replacement is finalised with Item_Condition = `damaged`, THE POS_System SHALL add the quantity_returned to Damaged_Stock for the returned item and SHALL NOT change Sellable_Stock.
7. WHEN the replacement is finalised, THE POS_System SHALL decrement the Sellable_Stock of the replacement product by the quantity_returned within the same database transaction as steps 6.5 or 6.6.
8. WHEN the replacement is finalised, THE POS_System SHALL record an `inventory_logs` entry for the returned item (action: `return_replacement_in`, reference: Return_Number) and a separate entry for the replacement item (action: `return_replacement_out`, reference: Return_Number).
9. WHEN the replacement is finalised, THE POS_System SHALL update the `returns` record: set `resolution = 'replacement'`, set `item_condition` to the selected condition.
10. WHEN the replacement is finalised, THE POS_System SHALL record an `activity_logs` entry describing the replacement transaction.
11. WHEN the replacement is finalised, THE POS_System SHALL print a Return_Receipt containing: return number, original invoice number, items returned, replacement items issued, and the label "REPLACEMENT".
12. WHEN the replacement is finalised, THE POS_System SHALL display a success toast "Replacement Completed Successfully."
13. IF a customer requests a different product instead of a replacement, THE POS_System SHALL complete the return as a cash refund first, and a new sale transaction SHALL be created separately.
14. THE replacement finalisation endpoint SHALL be protected by `authenticate` and SHALL only accept requests from users with the `Cashier` or `Admin` role.

---

### Requirement 7: Validation and Business Rules

**User Story:** As a system, I want all return requests to be validated against business rules before being created or finalised, so that policy violations are prevented.

#### Acceptance Criteria

1. IF a return request is submitted for a product where `is_returnable = FALSE`, THEN THE POS_System SHALL reject the request and display "This product is not eligible for return."
2. IF a return request is submitted after the Return_Window has expired (more than 7 calendar days since `sales.created_at`), THEN THE POS_System SHALL reject the request and display the expiry date and "Return window has expired."
3. IF the requested return quantity for any item exceeds (original purchased quantity − sum of already-returned quantities for that item), THEN THE POS_System SHALL reject the request and display "Return quantity exceeds the eligible quantity."
4. THE POS_System SHALL enforce that no return reaches `status = 'approved'` without an entry in `returns.approved_by` referencing a user with the `Admin` role.
5. WHILE a return has `status = 'pending'`, THE POS_System SHALL prevent any inventory changes (stock adjustments) for the items in that return.
6. IF a resolution is attempted on a return with `status ≠ 'approved'`, THEN THE POS_System SHALL reject the resolution and display "Return must be approved before resolution."
7. THE POS_System SHALL prevent duplicate returns: IF a return_item row already exists for the same `sale_item_id` with a `status` of `pending` or `approved`, THEN THE POS_System SHALL reject a new return request for that item and display "A return for this item is already in progress."

---

### Requirement 8: Access Control

**User Story:** As a system administrator, I want strict role-based access control on all return endpoints and UI, so that only authorised roles can perform each action.

#### Acceptance Criteria

1. THE POS_System SHALL allow the Cashier to: enter an invoice number, view a sale, select items for return, submit a return request, and process an approved return (refund or replacement).
2. THE POS_System SHALL allow the Admin to: search sales history, view all returns, approve or reject returns, initiate no-receipt returns, and process or override any return.
3. THE POS_System SHALL deny the Inventory_Clerk access to all return-related UI routes and API endpoints.
4. WHEN an Inventory_Clerk's JWT is presented to any `/api/sales` or `/api/returns` endpoint, THE POS_System SHALL respond with HTTP 403 Forbidden.
5. WHEN an unauthenticated request is made to any `/api/sales` or `/api/returns` endpoint, THE POS_System SHALL respond with HTTP 401 Unauthorized.
6. THE POS_System SHALL NOT display any return-related navigation items or routes in the Inventory Clerk UI.

---

### Requirement 9: Inventory and Reporting Updates

**User Story:** As an admin, I want inventory levels and sales reports to reflect completed returns automatically, so that stock counts and revenue figures remain accurate.

#### Acceptance Criteria

1. WHEN a return is finalised (refund or replacement), THE POS_System SHALL update the `inventory_logs` table within the same database transaction as the stock adjustment.
2. WHEN a return is finalised, THE POS_System SHALL update the `activity_logs` table with the performing user's ID, action type, and Return_Number as reference.
3. WHEN the admin views the Sales report, THE POS_System SHALL display a returns summary showing total return count, total refunded amount, and net sales (total sales − total refunds) for the selected period.
4. WHEN the admin views the Inventory page, THE POS_System SHALL reflect updated Sellable_Stock and Damaged_Stock quantities immediately after a return is finalised.

---

### Requirement 10: Return Receipt Printing

**User Story:** As a cashier or admin, I want to print a return receipt after every finalised return, so that the customer has a physical record of the transaction.

#### Acceptance Criteria

1. WHEN a return is finalised, THE POS_System SHALL open a browser print window with a Return_Receipt.
2. THE Return_Receipt SHALL contain: return number, original invoice number, customer name, name of the cashier or admin who processed the return, date and time of finalisation, a line per returned item showing product name, quantity returned, and unit price, total refund amount (for refunds) or "REPLACEMENT" label (for replacements), and a footer "Thank you for your business."
3. THE Return_Receipt SHALL use the same print styling as the sale receipt (monospace font, 340px width, thermal-printer-compatible layout).
4. WHEN the return number is available, THE POS_System SHALL display a barcode or scannable code of the Return_Number on the receipt for future reference.
