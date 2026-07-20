# Implementation Plan: Return Management

## Overview

Implementation is split into seven phases that build on each other:
1. Database migration
2. Server — sales endpoints
3. Server — returns endpoints
4. Client — save sale on payment
5. Client — cashier returns panel
6. Client — admin returns page
7. Integration (route registration, access control)

Spec path: `E:\POS System\.kiro\specs\return-management\`

---

## Tasks

- [x] 1. Database migration
  - Create `E:\POS System\migrations\002_return_management.sql` using the schema from the design document (`design.md` — Data Models section)
  - Include: `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_returnable` and `damaged_stock`
  - Include: `CREATE TABLE IF NOT EXISTS sales`, `sale_items`, `returns`, `return_items` with all columns, foreign keys, and unique constraints exactly as specified
  - Run the migration against the `hardware_pos` database to verify it applies cleanly with no errors
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Server — role guard middleware
  - Create `E:\POS System\server\middleware\requireRole.ts`
  - Export `requireRole(...roles: AuthPayload["role"][])` — returns an Express middleware that returns 403 if `req.user` is missing or its role is not in the list
  - Import `AuthPayload` from `../middleware/authenticate.js`
  - _Requirements: 8.3, 8.4, 8.5_

- [x] 3. Server — sales routes
  - Create `E:\POS System\server\routes\sales.ts`
  - [x] 3.1 Implement `POST /api/sales` (Cashier only)
    - Validate request body with zod: `invoice_number` (string), `customer_name` (string, min 1), `subtotal`/`vat_amount`/`total_amount`/`cash_tendered`/`change_amount` (positive numbers), `items` (non-empty array with `product_id`, `quantity`, `unit_price`, `subtotal`)
    - Open a DB transaction; check each product's `quantity >= item.quantity`; if any fail, rollback and return 409 with the product name
    - Insert one row into `sales`; insert one row per item into `sale_items`; decrement `products.quantity` for each item; insert `inventory_logs` rows (action `sale`, negative quantity, reference = invoice number) — all within the same transaction
    - Return 201 `{ invoice_number }` on success
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 2.9, 2.10_
  - [x] 3.2 Implement invoice number generation helper
    - Create `E:\POS System\server\utils\invoiceNumber.ts`
    - Export `generateInvoiceNumber(conn: PoolConnection): Promise<string>`
    - Query `SELECT COUNT(*) FROM sales WHERE DATE(created_at) = CURDATE()` inside the existing transaction connection, compute `INV-YYYYMMDD-XXXX` (zero-padded 4-digit counter = count + 1)
    - _Requirements: 2.4_
  - [ ]* 3.3 Write property test for invoice number generation
    - **Property 3: Invoice number format and uniqueness**
    - **Validates: Requirements 2.4**
    - Use fast-check to generate arbitrary dates and counts; assert all outputs match `^INV-\d{8}-\d{4}$` and that the date segment equals the input date
  - [x] 3.4 Implement `GET /api/sales/:invoiceNumber` (Cashier, Admin)
    - Look up `sales` by `invoice_number`; join `users` for cashier name; join `sale_items` joined with `products` (name, barcode, brand, size, unit, is_returnable); compute `quantity_returned` per item via subquery on `return_items` where the parent `returns.status IN ('pending','approved')`
    - Return 200 with full `Sale` object or 404
    - _Requirements: 3.2, 3.3_
  - [x] 3.5 Implement `GET /api/sales` (Admin only)
    - Accept query params: `invoice_number` (exact match), `customer_name` (LIKE), `date_from` / `date_to` (DATE range)
    - Return paginated list of sales (no items array — summary only: id, invoice_number, customer_name, cashier_name, total_amount, created_at)
    - _Requirements: 4.6_

- [x] 4. Checkpoint — sales routes
  - Ensure all tests for Phase 2-3 pass; manually test `POST /api/sales` with a real DB connection; ask the user if questions arise.

- [x] 5. Server — returns routes
  - Create `E:\POS System\server\routes\returns.ts`
  - [x] 5.1 Implement return number generation helper
    - Create `E:\POS System\server\utils\returnNumber.ts`
    - Same pattern as `invoiceNumber.ts` but queries `returns` table and produces `RTN-YYYYMMDD-XXXX`
    - _Requirements: glossary (Return_Number)_
  - [x] 5.2 Implement return validation helper
    - Create `E:\POS System\server\utils\validateReturn.ts`
    - Export `validateReturnItems(conn, saleId, items, currentDate)`: checks invoice exists, each item is on the invoice, `is_returnable = 1`, within 7-day Return_Window, quantity does not exceed remaining returnable quantity, no duplicate in-progress return for each `sale_item_id`
    - Return a typed result: `{ valid: true }` or `{ valid: false; message: string }`
    - _Requirements: 3.8, 7.1, 7.2, 7.3, 7.7_
  - [ ]* 5.3 Write property test for return validation
    - **Property 4: Return validation completeness**
    - **Validates: Requirements 3.8, 7.1, 7.2, 7.3**
    - Use fast-check to generate sale and return payloads that violate each rule; assert `validateReturnItems` returns `{ valid: false }` for all invalid cases and `{ valid: true }` for valid ones
  - [x] 5.4 Implement `POST /api/returns` (Cashier, Admin)
    - Validate body with zod: `sale_id` (int), `return_reason` (string, min 1), `items` (non-empty array)
    - Call `validateReturnItems`; on failure return the appropriate 4xx with the message
    - Open transaction; generate `RTN-*` number; insert `returns` (status `pending`, `processed_by` = `req.user.id`); insert `return_items`; commit
    - Return 201 `{ return_number, id }`
    - _Requirements: 3.10, 3.11, 3.12_
  - [x] 5.5 Implement `GET /api/returns` (Admin only)
    - Accept query params: `status` filter, `date_from` / `date_to`
    - Join `sales` (invoice_number, customer_name), `users` (cashier name), aggregate `return_items`
    - Return list sorted by `created_at DESC`
    - _Requirements: 4.1_
  - [x] 5.6 Implement `GET /api/returns/:id` (Cashier, Admin)
    - Return full `Return` object including items with product names (joined from `products`)
    - _Requirements: 4.2_
  - [x] 5.7 Implement `PATCH /api/returns/:id/approve` (Admin only)
    - Validate return exists and `status = 'pending'`; set `status = 'approved'`, `approved_by = req.user.id`, `resolved_at = NOW()`
    - Enforce: `approved_by` must reference a user with `Admin` role (verified via `req.user.role`)
    - Return 200 with updated return summary
    - _Requirements: 4.3, 7.4_
  - [x] 5.8 Implement `PATCH /api/returns/:id/reject` (Admin only)
    - Validate return exists and `status = 'pending'`; require `return_reason` in body; set `status = 'rejected'`, `approved_by = req.user.id`, `resolved_at = NOW()`, update `return_reason`
    - Return 200 with updated return summary
    - _Requirements: 4.4, 4.5_
  - [x] 5.9 Implement `PATCH /api/returns/:id/resolve` (Cashier, Admin)
    - Validate return exists, `status = 'approved'`, and `resolution` is not yet set; return 422 otherwise
    - Accept body: `{ resolution: 'refund' | 'replacement', item_condition: 'good' | 'damaged' }`
    - **Refund path**: open transaction; for each `return_item`: if `item_condition = 'good'` increment `products.quantity`; if `damaged` increment `products.damaged_stock`; update `returns` (`resolution`, `item_condition`, `refund_amount`); insert `inventory_logs` (action `return_refund`); insert `activity_logs`; commit
    - **Replacement path**: for each `return_item`: check `products.quantity >= 1`; if any fail return 409; then in one transaction: apply returned item stock (good/damaged rule); decrement `products.quantity` for replacement product; insert two `inventory_logs` rows (`return_replacement_in`, `return_replacement_out`); update `returns`; insert `activity_logs`; commit
    - Return 200 with full resolved return
    - _Requirements: 5.1–5.12, 6.1–6.12, 7.5, 7.6_
  - [ ]* 5.10 Write property test for stock adjustment correctness
    - **Property 6: Stock adjustment correctness for refund**
    - **Property 7: Stock adjustment correctness for replacement**
    - **Validates: Requirements 5.4, 5.5, 6.5, 6.6, 6.7**
    - Use fast-check to generate return items and conditions; mock the DB pool; assert stock deltas match expected values for both refund and replacement paths

- [x] 6. Checkpoint — returns routes
  - Ensure all tests for Phase 5 pass; manually test approve → resolve flows end to end; ask the user if questions arise.

- [x] 7. Client — shared API modules
  - [x] 7.1 Create `E:\POS System\client\src\shared\api\salesApi.ts`
    - Export: `createSale(payload: CreateSalePayload)` → `POST /api/sales`
    - Export: `getSaleByInvoice(invoiceNumber: string)` → `GET /api/sales/:invoiceNumber`
    - Export: `searchSales(params)` → `GET /api/sales`
    - All functions attach `Authorization: Bearer <token>` via `loadToken()` (same pattern as `usersApi.ts`)
    - _Requirements: 2.1, 3.2, 4.6_
  - [x] 7.2 Create `E:\POS System\client\src\shared\api\returnsApi.ts`
    - Export: `createReturn(payload)` → `POST /api/returns`
    - Export: `getReturns(params)` → `GET /api/returns`
    - Export: `getReturnById(id)` → `GET /api/returns/:id`
    - Export: `approveReturn(id)` → `PATCH /api/returns/:id/approve`
    - Export: `rejectReturn(id, reason)` → `PATCH /api/returns/:id/reject`
    - Export: `resolveReturn(id, payload)` → `PATCH /api/returns/:id/resolve`
    - _Requirements: 3.10, 4.3, 4.4, 5.1, 6.1_

- [x] 8. Client — wire sale save on payment (Phase 1)
  - Modify `E:\POS System\client\src\modules\cashier\pages\Cashier.tsx`
  - [x] 8.1 Replace `handlePrint` with `handleProcessPayment`
    - On button click: build a `CreateSalePayload` from current `cartItems`, `customerInfo`, and computed totals (use existing centavo helpers to produce DECIMAL-safe floats)
    - Call `createSale(payload)`; await the response; on success store the returned `invoice_number` in state
    - Only after a successful save: call `printSaleReceipt(invoiceNumber, ...)` (rename and extract the existing receipt HTML block into a separate function that accepts `invoiceNumber` as a parameter — replace the client-generated `receiptNo` placeholder)
    - On API error: call `toast.error(errorMessage)`; do NOT print, do NOT clear the cart
    - Show a spinner/disabled state on the button while the request is in-flight
    - _Requirements: 2.1, 2.5, 2.6, 2.7_
  - [x] 8.2 Extract `printSaleReceipt` helper
    - Move the `window.open` receipt HTML block out of the click handler into a standalone function `printSaleReceipt(params: SaleReceiptParams): void` in the same file (or a co-located `receiptPrinter.ts`)
    - Accept `invoiceNumber: string` as a parameter (replaces the local `receiptNo`)
    - _Requirements: 2.6_

- [x] 9. Client — cashier returns panel
  - All new UI lives within `Cashier.tsx` or extracted components imported there
  - [x] 9.1 Add "Returns" tab/button to the cashier top bar
    - Add a button in the header that opens `CashierReturnsPanel` (slide-in panel, same CSS pattern as the held-orders panel)
    - Only render for Cashier role (already guaranteed by route, but guard with `user?.role === 'Cashier'` for clarity)
    - _Requirements: 3.1_
  - [x] 9.2 Implement `CashierReturnsPanel` component
    - Invoice number input + "Look Up" button; on submit call `getSaleByInvoice`; display error "Invoice not found." on 404
    - Display found sale: invoice number, customer name, purchase date, and a table of items with product name, qty purchased, unit price, qty already returned, qty returnable (purchased − returned)
    - Hide items where qty returnable = 0
    - _Requirements: 3.2, 3.3, 3.4_
  - [x] 9.3 Implement item selection and quantity entry
    - Checkbox per row to select items for return; numeric input for return quantity (min 1, max = qty returnable); select for reason (`Damaged`, `Missing Items`, `Wrong Item`, `Other`)
    - Barcode field: if `item.barcode` is non-null, show a barcode scan input; disable Submit until scanned value matches `item.barcode`; if barcode is null, show product name/brand/size/unit and a confirm checkbox
    - _Requirements: 3.5, 3.6, 3.7_
  - [x] 9.4 Implement return submission
    - "Submit Return" button calls `createReturn(payload)` with selected items
    - On success: display confirmation with `return_number`; message "Direct customer to wait for admin approval."
    - On error: display the error message from the server inline in the panel
    - _Requirements: 3.10, 3.11_
  - [x] 9.5 Implement resolution flow for cashier
    - When cashier views an approved return (fetch by return number from the confirmation step or via a second lookup), show a "Process Return" button
    - "Process Return" opens `ResolutionDialog`: two options (Cash Refund / Replace Same Product), item condition select (good/damaged), confirm button
    - On "Replace" with out-of-stock: display the server's 409 message; offer "Switch to Cash Refund" button
    - On confirm: call `resolveReturn`; on success: show toast "Return Completed Successfully" or "Replacement Completed Successfully"; call `printReturnReceipt`; trigger cash drawer for refunds (`window.print()` zero-value job)
    - _Requirements: 5.1, 5.3, 6.1–6.3, 6.2_

- [x] 10. Client — return receipt printer
  - Create `E:\POS System\client\src\shared\utils\returnReceiptPrinter.ts`
  - Export `printReturnReceipt(data: ReturnReceiptData): void`
  - Build the HTML string using the same monospace/340px/thermal-printer styling as `handlePrint` in `Cashier.tsx`
  - Include: return number, original invoice number, customer name, cashier/admin name, date/time, line per item (name, qty returned, unit price), total refund amount or "REPLACEMENT" label, footer "Thank you for your business.", barcode-style text representation of `return_number` (styled `font-family: monospace; letter-spacing: 4px; font-size: 18px`)
  - Call `window.open` and inject the HTML (same pattern as existing receipt)
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 11. Client — admin returns page
  - Create `E:\POS System\client\src\modules\admin\pages\Returns.tsx`
  - [x] 11.1 Implement `ReturnsList` component
    - Fetch `GET /api/returns` on mount; display table with columns: Return #, Invoice #, Customer, Cashier, Submitted, Status badge, Action
    - Status badges: yellow = pending, green = approved, red = rejected, blue = resolved (has `resolution` set)
    - Action column: "View" button for all rows; pending rows also show "Approve" and "Reject" buttons inline
    - Filter bar: status dropdown, date range pickers
    - _Requirements: 4.1_
  - [x] 11.2 Implement `ReturnDetailDialog` component
    - Opens on "View"; fetches `GET /api/returns/:id` for full detail
    - Displays: original sale info, each return item with product name, qty, unit price, reason
    - For pending returns: item condition select; Approve and Reject buttons
    - For approved, not-yet-resolved returns: "Process Resolution" button
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 11.3 Implement approve and reject actions
    - Approve: call `approveReturn(id)`; on success close dialog and refresh list; show toast
    - Reject: show rejection reason input inline; call `rejectReturn(id, reason)`; on success close and refresh; show toast
    - _Requirements: 4.3, 4.4, 4.5_
  - [x] 11.4 Implement `ResolutionDialog` (shared with cashier, or duplicate for admin with admin-specific text)
    - Same logic as 9.5 but used by admin; `approved_by` is set to the admin's user ID server-side
    - Call `resolveReturn(id, payload)`; on success call `printReturnReceipt` and show toast
    - _Requirements: 5.1–5.12, 6.1–6.12_
  - [x] 11.5 Implement `SalesSearchPanel` for no-receipt returns
    - Section at the top (or a separate tab) of the Returns page: search form (invoice #, customer name, date_from, date_to)
    - On submit: call `searchSales(params)`; render results table with invoice #, customer, date, total, "Initiate Return" button per row
    - "Initiate Return" opens `ReturnDetailDialog` in "new return" mode (pre-populated with the sale, admin is `processed_by`, no prior cashier step)
    - Apply same validations server-side (requirement 4.8); admin override toggle (requirement 4.9) — send `{ override: true }` in body; server stores `processed_by = admin.id` and a note in `return_reason`
    - _Requirements: 4.6, 4.7, 4.8, 4.9_

- [x] 12. Client — admin sidebar navigation
  - Add "Returns" nav item to the admin sidebar (`AdminSidebar.tsx`)
  - Route: `/returns`; icon: `RotateCcw` from lucide-react
  - Add `<Route path="/returns" component={Returns} />` to `AdminRouter` in `App.tsx`
  - Do NOT add any returns-related nav item or route to the Clerk sidebar
  - _Requirements: 8.1, 8.2, 8.6_

- [x] 13. Server — register routes in index.ts
  - Import `salesRoutes` from `./routes/sales.js` and mount at `/api/sales`
  - Import `returnsRoutes` from `./routes/returns.js` and mount at `/api/returns`
  - Both mounts must appear before the static file handler and after `express.json()`
  - Apply `authenticate` middleware globally per-route (already handled within each router file using `authenticate` + `requireRole`)
  - _Requirements: 8.3, 8.4, 8.5_

- [x] 14. Final checkpoint
  - Ensure all automated tests pass
  - Verify the full flow: complete a sale → save to DB → look up by invoice in cashier panel → submit return → approve as admin → resolve as cashier with receipt print
  - Verify Inventory Clerk cannot see Returns nav or access `/api/returns` (403)
  - Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional property/unit tests and can be skipped for a faster MVP
- All DB mutations (sale save, return resolve) must use transactions — this is non-negotiable for data integrity
- The `requireRole` middleware must be applied in addition to `authenticate` on every route — never rely on `authenticate` alone for role enforcement
- The cashier `POST /api/sales` call happens before printing; the receipt must use the server-returned invoice number (not a client-generated placeholder)
- The existing `handlePrint` code in `Cashier.tsx` is the model for all receipt printing — reuse the same HTML structure and `window.open` approach
