# Design Document: Return Management

## Overview

The Return Management feature adds two sequential capabilities to the Isra Hardware POS System:

1. **Phase 1 — Save Transactions**: Wire the cashier terminal's "Process Payment" action to `POST /api/sales`, persisting every completed sale to MySQL before printing the receipt.
2. **Phase 2 — Return Management**: A full return workflow where cashiers look up a sale by invoice number and submit return requests, admins approve or reject those requests, and either the cashier or admin finalises the return via cash refund or same-product replacement — with inventory and receipt updates at every step.

The Inventory Clerk role has zero access to either phase.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client (React + TypeScript + Vite)                             │
│                                                                 │
│  /cashier  ──────────── Cashier.tsx (POS terminal)             │
│                             ├── SalePaymentHandler             │
│                             └── CashierReturnsPanel            │
│                                                                 │
│  /returns  ──────────── AdminReturns.tsx (admin page)          │
│                             ├── ReturnsList                    │
│                             ├── ReturnDetailDialog             │
│                             ├── ApproveRejectButtons           │
│                             ├── ResolutionDialog               │
│                             └── SalesSearchPanel (no-receipt)  │
└────────────────────────┬────────────────────────────────────────┘
                         │ axios + JWT Bearer token
┌────────────────────────▼────────────────────────────────────────┐
│  Server (Express + TypeScript)                                  │
│                                                                 │
│  /api/sales   ── salesRoutes.ts                                 │
│  /api/returns ── returnsRoutes.ts                               │
│                                                                 │
│  Middleware: authenticate (JWT) → role guard                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ mysql2/promise pool
┌────────────────────────▼────────────────────────────────────────┐
│  MySQL 8 — hardware_pos database                                │
│                                                                 │
│  products ← sales → sale_items                                  │
│                ↑                                                │
│             returns → return_items                              │
│  inventory_logs, activity_logs                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

- **Single transaction for all mutations**: Every endpoint that touches multiple tables (save sale, finalise refund, finalise replacement) wraps all DB writes in a `BEGIN … COMMIT` with `ROLLBACK` on any error. This is the primary data integrity guarantee.
- **Server generates invoice/return numbers**: The client never generates `INV-*` or `RTN-*` identifiers. The server selects the current day's max counter, increments it, and returns the number in the response.
- **No separate state management library**: The cashier terminal and admin returns page each manage their own local React state (`useState` / `useCallback`). No Redux or Zustand is introduced — consistent with the existing codebase.
- **Print receipts via `window.open`**: Exactly the same pattern as the existing sale receipt in `Cashier.tsx`. The return receipt HTML is assembled client-side and printed.
- **Role guard helper**: A small `requireRole(...roles)` middleware factory is introduced in `server/middleware/requireRole.ts` and applied per-route to avoid repeating role checks.

---

## Components and Interfaces

### Server-side

#### `server/routes/sales.ts`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `POST` | `/api/sales` | Cashier | Save a completed sale + decrement stock |
| `GET` | `/api/sales` | Admin | Search/list sales (invoice #, customer name, date range) |
| `GET` | `/api/sales/:invoiceNumber` | Cashier, Admin | Look up one sale with all items and return quantities |

#### `server/routes/returns.ts`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `POST` | `/api/returns` | Cashier, Admin | Submit a new return request |
| `GET` | `/api/returns` | Admin | List all returns with filters |
| `GET` | `/api/returns/:id` | Cashier, Admin | Get full detail of one return |
| `PATCH` | `/api/returns/:id/approve` | Admin | Approve a pending return |
| `PATCH` | `/api/returns/:id/reject` | Admin | Reject a pending return |
| `PATCH` | `/api/returns/:id/resolve` | Cashier, Admin | Finalise approved return (refund or replacement) |

#### `server/middleware/requireRole.ts`

```typescript
export function requireRole(...roles: AuthPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  };
}
```

### Client-side

#### Cashier module additions (within `Cashier.tsx` or extracted components)

| Component | Purpose |
|-----------|---------|
| `SalePaymentHandler` | Replaces `handlePrint` — calls `POST /api/sales`, awaits invoice number, then prints; shows error toast on failure |
| `CashierReturnsPanel` | Slide-in panel (same pattern as `HeldOrdersPanel`); contains invoice lookup, sale detail, item selection, barcode scan field, reason select, and submit button |

#### Admin module additions

| File | Purpose |
|------|---------|
| `client/src/modules/admin/pages/Returns.tsx` | Main admin returns management page |
| `client/src/shared/api/salesApi.ts` | Typed axios wrappers for `/api/sales` endpoints |
| `client/src/shared/api/returnsApi.ts` | Typed axios wrappers for `/api/returns` endpoints |

##### `Returns.tsx` sub-components

| Component | Purpose |
|-----------|---------|
| `ReturnsList` | Table of all returns with status badges and action column |
| `ReturnDetailDialog` | Dialog showing full return detail; admin fills item condition and picks approve/reject |
| `ResolutionDialog` | Dialog for cashier/admin to choose Refund vs Replacement; sets item condition; triggers resolve endpoint |
| `SalesSearchPanel` | Search form (invoice #, customer name, date range) for no-receipt returns; renders results and "Initiate Return" button per row |
| `ReturnReceiptPrinter` | Pure function `printReturnReceipt(data)` — assembles HTML and calls `window.open` |

---

## Data Models

### Migration: `002_return_management.sql`

```sql
USE hardware_pos;

-- ── 1. Products table additions ───────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_returnable  TINYINT(1)    NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS damaged_stock  INT           NOT NULL DEFAULT 0;

-- ── 2. sales ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id               INT            NOT NULL AUTO_INCREMENT,
  invoice_number   VARCHAR(20)    NOT NULL,
  customer_name    VARCHAR(255)   NOT NULL,
  customer_address VARCHAR(500)   NULL,
  customer_tin     VARCHAR(50)    NULL,
  cashier_id       INT            NOT NULL,
  subtotal         DECIMAL(10,2)  NOT NULL,
  vat_amount       DECIMAL(10,2)  NOT NULL,
  total_amount     DECIMAL(10,2)  NOT NULL,
  cash_tendered    DECIMAL(10,2)  NOT NULL,
  change_amount    DECIMAL(10,2)  NOT NULL,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_number (invoice_number),
  CONSTRAINT fk_sales_cashier FOREIGN KEY (cashier_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. sale_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id          INT            NOT NULL AUTO_INCREMENT,
  sale_id     INT            NOT NULL,
  product_id  INT            NOT NULL,
  quantity    INT            NOT NULL,
  unit_price  DECIMAL(10,2)  NOT NULL,
  subtotal    DECIMAL(10,2)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_sale_items_sale    FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. returns ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS returns (
  id             INT            NOT NULL AUTO_INCREMENT,
  return_number  VARCHAR(20)    NOT NULL,
  sale_id        INT            NOT NULL,
  processed_by   INT            NOT NULL,
  approved_by    INT            NULL,
  status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  resolution     ENUM('refund','replacement')          NULL,
  item_condition ENUM('good','damaged')                NULL,
  return_reason  VARCHAR(500)   NOT NULL,
  refund_amount  DECIMAL(10,2)  NULL,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at    DATETIME       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_number (return_number),
  CONSTRAINT fk_returns_sale         FOREIGN KEY (sale_id)      REFERENCES sales(id),
  CONSTRAINT fk_returns_processed_by FOREIGN KEY (processed_by) REFERENCES users(id),
  CONSTRAINT fk_returns_approved_by  FOREIGN KEY (approved_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. return_items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS return_items (
  id                INT            NOT NULL AUTO_INCREMENT,
  return_id         INT            NOT NULL,
  sale_item_id      INT            NOT NULL,
  product_id        INT            NOT NULL,
  quantity_returned INT            NOT NULL,
  unit_price        DECIMAL(10,2)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_return_items_return    FOREIGN KEY (return_id)    REFERENCES returns(id)    ON DELETE CASCADE,
  CONSTRAINT fk_return_items_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  CONSTRAINT fk_return_items_product   FOREIGN KEY (product_id)   REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### TypeScript types (shared between server and client via inline definitions)

```typescript
// Sale
interface Sale {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_address: string | null;
  customer_tin: string | null;
  cashier_id: number;
  cashier_name?: string;        // joined from users
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  cash_tendered: number;
  change_amount: number;
  created_at: string;           // ISO datetime string from MySQL
  items: SaleItem[];
}

interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  product_name: string;         // joined from products
  barcode?: string | null;      // joined from products
  brand?: string | null;
  size?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  quantity_returned: number;    // sum of approved/pending return_items
  is_returnable: number;        // 0 or 1
}

// Return
interface Return {
  id: number;
  return_number: string;
  sale_id: number;
  invoice_number: string;       // joined from sales
  customer_name: string;        // joined from sales
  processed_by: number;
  cashier_name: string;         // joined from users
  approved_by: number | null;
  admin_name: string | null;    // joined from users
  status: "pending" | "approved" | "rejected";
  resolution: "refund" | "replacement" | null;
  item_condition: "good" | "damaged" | null;
  return_reason: string;
  refund_amount: number | null;
  created_at: string;
  resolved_at: string | null;
  items: ReturnItem[];
}

interface ReturnItem {
  id: number;
  return_id: number;
  sale_item_id: number;
  product_id: number;
  product_name: string;         // joined from products
  quantity_returned: number;
  unit_price: number;
}

// POST /api/sales request body
interface CreateSalePayload {
  invoice_number: string;       // client pre-generates for optimistic receipt; server validates uniqueness
  customer_name: string;
  customer_address?: string;
  customer_tin?: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  cash_tendered: number;
  change_amount: number;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

// POST /api/returns request body
interface CreateReturnPayload {
  sale_id: number;
  return_reason: string;
  items: Array<{
    sale_item_id: number;
    product_id: number;
    quantity_returned: number;
    unit_price: number;
  }>;
}

// PATCH /api/returns/:id/resolve request body
interface ResolveReturnPayload {
  resolution: "refund" | "replacement";
  item_condition: "good" | "damaged";
}
```

### Invoice and Return Number Generation

The server uses a `SELECT … FOR UPDATE` pattern inside a transaction to guarantee sequential numbering:

```sql
-- Get today's last counter for invoice numbers
SELECT COUNT(*) AS cnt
FROM sales
WHERE DATE(created_at) = CURDATE();
-- next counter = cnt + 1, zero-padded to 4 digits
-- e.g. INV-20250120-0001
```

The same pattern applies for `RTN-YYYYMMDD-XXXX` in the returns table.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sale persistence round-trip

*For any* valid sale payload (any number of items, any customer details, any cash amount ≥ total), posting the sale and then fetching it by invoice number should return a sale whose `invoice_number`, `total_amount`, `items` count, and per-item `product_id` + `quantity` + `unit_price` are equivalent to the submitted payload.

**Validates: Requirements 2.1, 2.2, 2.5**

### Property 2: Stock decrement invariant

*For any* valid sale payload, the Sellable_Stock of each product after the sale equals the Sellable_Stock before the sale minus the quantity sold for that product. If any product would go below 0, the sale is rejected and all stock levels are unchanged.

**Validates: Requirements 2.3, 2.8**

### Property 3: Invoice number format and uniqueness

*For any* sale created on a given calendar date, the generated invoice number must match the regex `^INV-\d{8}-\d{4}$` and the embedded date must equal the creation date. For any two sales created on the same day, their sequential counters must be distinct.

**Validates: Requirements 2.4**

### Property 4: Return validation completeness

*For any* return submission that violates at least one of the five validation rules (invoice not found, item not on invoice, quantity exceeds remaining, outside Return_Window, product not returnable), the system must reject the request and leave the `returns` and `return_items` tables unchanged.

**Validates: Requirements 3.8, 3.9, 7.1, 7.2, 7.3**

### Property 5: Duplicate return prevention

*For any* sale item that already has a `return_items` row associated with a `returns` record in `pending` or `approved` status, submitting a new return request for that same `sale_item_id` must be rejected.

**Validates: Requirements 7.7**

### Property 6: Stock adjustment correctness for refund

*For any* finalised refund, the change in each product's stock fields must satisfy: if `item_condition = 'good'`, Sellable_Stock increases by `quantity_returned` and Damaged_Stock is unchanged; if `item_condition = 'damaged'`, Damaged_Stock increases by `quantity_returned` and Sellable_Stock is unchanged.

**Validates: Requirements 5.4, 5.5**

### Property 7: Stock adjustment correctness for replacement

*For any* finalised replacement, for each returned item: the stock change of the returned product follows the same good/damaged rule as Property 6, AND the Sellable_Stock of the replacement product decreases by `quantity_returned` — both within the same transaction.

**Validates: Requirements 6.5, 6.6, 6.7**

### Property 8: Access control — role enforcement

*For any* request to `/api/sales` or `/api/returns` bearing an Inventory Clerk JWT, the server must respond with HTTP 403. For any request to those endpoints with no JWT or an invalid JWT, the server must respond with HTTP 401.

**Validates: Requirements 8.3, 8.4, 8.5**

---

## Error Handling

### Server-side

| Scenario | HTTP Status | Response body |
|----------|-------------|---------------|
| Missing / invalid JWT | 401 | `{ message: "Unauthorized" }` |
| Valid JWT but wrong role | 403 | `{ message: "Forbidden" }` |
| Validation failure (zod) | 400 | `{ message: "...", errors: [{field, message}] }` |
| Invoice not found | 404 | `{ message: "Invoice not found." }` |
| Insufficient stock on sale | 409 | `{ message: "Insufficient stock for product: <name>." }` |
| Return window expired | 422 | `{ message: "Return window has expired. Expiry: <date>." }` |
| Product not returnable | 422 | `{ message: "This product is not eligible for return." }` |
| Quantity exceeds eligible | 422 | `{ message: "Return quantity exceeds the eligible quantity for: <name>." }` |
| Duplicate in-progress return | 409 | `{ message: "A return for this item is already in progress." }` |
| Resolution on non-approved return | 422 | `{ message: "Return must be approved before resolution." }` |
| No replacement stock | 409 | `{ message: "Replacement cannot be processed — no available stock for: <name>." }` |
| Unexpected DB error | 500 | `{ message: "An unexpected error occurred. Please try again." }` |

All route handlers wrap their logic in `try/catch`. On any caught exception, the transaction is rolled back before returning 500.

### Client-side

- All API calls use the `authHeaders()` pattern from `usersApi.ts`.
- On HTTP 4xx/5xx, the client shows a `sonner` toast via `toast.error(message)`.
- `POST /api/sales` failure: toast error, no receipt printed, cart unchanged.
- Return submission failure: inline error message in the returns panel; panel remains open.
- Approve/reject/resolve failure: toast error, dialog remains open.

---

## Testing Strategy

This feature involves server-side business logic (sale persistence, stock mutations, return validation, resolution calculations) that is well-suited for property-based testing, combined with example-based tests for specific UI interactions and integration tests for end-to-end flows.

### Unit and Property Tests

Use **fast-check** (TypeScript property-based testing library) for server-side logic. Each property test runs a minimum of 100 iterations.

Tag format: `// Feature: return-management, Property N: <property title>`

**Property tests** (pure server-logic functions extracted for testability):
- `generateInvoiceNumber(date, count)` — Property 3
- `validateReturnRequest(sale, payload, currentDate)` — Property 4
- `calculateRefundAmount(returnItems)` — Property 6 (calculation portion)
- `applyStockChanges(items, condition)` — Properties 6 and 7

**Example-based unit tests** (using Vitest):
- `POST /api/sales` with a valid payload returns 201 and an invoice number
- `POST /api/sales` with insufficient stock returns 409
- `PATCH /api/returns/:id/approve` sets `status = 'approved'`
- `PATCH /api/returns/:id/reject` with a reason sets `status = 'rejected'`

**Integration tests** (Vitest + in-memory test DB or mock pool):
- Full sale → return → approve → resolve refund flow
- Full sale → return → approve → resolve replacement flow
- Access control: Clerk JWT on `/api/sales` → 403; no JWT → 401

### Client-side Tests

- `ReturnReceiptPrinter`: unit test that the generated HTML contains return number, invoice number, and all item lines
- `CashierReturnsPanel`: example test that submitting with no items shows a validation error

### What Is Not Property-Tested

The React UI components (dialog rendering, form state, receipt HTML layout) use example-based snapshot tests. The MySQL migration itself is verified by a smoke test that runs the migration and checks `SHOW TABLES`.
