# Senior Citizen & PWD Discount Implementation Report

**Date:** August 13, 2026  
**Module:** Philippine Statutory Senior Citizen (RA 9994) & PWD (RA 9442) Discount  
**Status:** ✅ PASS

---

## Executive Summary

Implemented the correct Philippine statutory Senior Citizen and PWD discount with proper VAT-exclusive calculation logic. The system now correctly:
1. Derives the VAT-exclusive amount from VAT-inclusive prices
2. Applies the 20% statutory discount on the VAT-exclusive base
3. Exempts the VAT (does not add it back to the final payable)
4. Requires SC/PWD identification details
5. Displays gross amount, VAT-exempt amount, discount, and final payable
6. Preserves all existing regular-customer VAT calculation

---

## Files Changed

### Database
| File | Change |
|------|--------|
| `migrations/042_sc_pwd_discount.sql` | **NEW** — Adds `sc_pwd_type`, `sc_pwd_id`, `vat_exempt_amount` columns to `sales` table |

### Server
| File | Change |
|------|--------|
| `server/routes/sales.ts` | Added `sc_pwd_type`/`sc_pwd_id` to schema; fixed SC/PWD final payable calculation (VAT-exempt base - discount); stores `vat_exempt_amount`; only applies discount to VATABLE items; returns new fields in responses |
| `server/routes/suspendedSales.ts` | Added SC/PWD fields to cart_data JSON; applies discount when completing held sales; stores SC/PWD type and ID |
| `server/routes/reports.ts` | Added `vat_exempt_amount`, `senior_count`, `pwd_count`, `sc_pwd_count` to summary KPIs; added `sc_pwd_type`, `sc_pwd_id`, `vat_exempt_amount` to sales and discount reports |

### Client
| File | Change |
|------|--------|
| `client/src/modules/cashier/pages/Cashier.tsx` | Fixed SC/PWD final payable calculation; added SC/PWD validation (requires type + ID); passes SC/PWD info to payment payload, receipt, and held orders |
| `client/src/modules/cashier/components/CustomerPanel.tsx` | Added SC/PWD type selector (Senior Citizen/PWD) and ID input; shown only when SC/PWD discount is selected |
| `client/src/modules/cashier/components/PaymentPanel.tsx` | Displays Gross Amount, VAT-Exempt Amount, VAT, Discount, and Amount Payable; shows SC/PWD badge with ID |
| `client/src/modules/cashier/components/DiscountApprovalModal.tsx` | Fixed SC/PWD final total calculation (VAT-exempt base - discount) |
| `client/src/modules/cashier/utils/receipt.ts` | Shows SC/PWD type and ID on receipt; displays VAT-exempt amount; correct VAT breakdown for SC/PWD (VAT = 0); shows gross, discount, VAT-exempt, and net totals |
| `client/src/shared/api/salesApi.ts` | Added `sc_pwd_type`, `sc_pwd_id`, `vat_exempt_amount` to types |
| `client/src/shared/api/suspendedSalesApi.ts` | Added `sc_pwd_type`, `sc_pwd_id` to types |

### Tests
| File | Change |
|------|--------|
| `tests/sc_pwd_discount_test.js` | **NEW** — Comprehensive test suite for SC/PWD calculation logic |

---

## Database Changes

Migration `042_sc_pwd_discount.sql` adds to the `sales` table:

```sql
ALTER TABLE sales ADD COLUMN sc_pwd_type ENUM('NONE','SENIOR_CITIZEN','PWD') NOT NULL DEFAULT 'NONE' AFTER discount_id;
ALTER TABLE sales ADD COLUMN sc_pwd_id VARCHAR(50) NULL AFTER sc_pwd_type;
ALTER TABLE sales ADD COLUMN vat_exempt_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER vat_amount;
```

These fields reuse the existing `discount_id` FK to the `discounts` table (which already has the `is_sc_pwd` flag from migration 041). No duplicate discount fields were created.

---

## Calculation Logic Implemented

### SC/PWD (Senior Citizen & PWD) — Correct per RA 9994 / RA 9442

For a ₱100.00 VAT-inclusive item with 12% VAT:

```
1. VAT-exclusive price = 100.00 / 1.12 = ₱89.29
2. 20% discount = 89.29 × 0.20 = ₱17.86
3. Final payable = 89.29 - 17.86 = ₱71.43
4. VAT-exempt amount = ₱89.29 (VAT is NOT added back)
```

Key rules:
- Only **VATABLE** items are eligible for the SC/PWD discount
- The discount is applied to the **VAT-exclusive base** of eligible items
- The **VAT is exempted** — the final payable does NOT include the 12% VAT
- Non-eligible items (VAT_EXEMPT, ZERO_RATED, NON_TAXABLE) are charged at full price

### Regular Customer — Unchanged

```
1. Gross total = ₱100.00 (VAT-inclusive)
2. VAT = 100.00 × 12/112 = ₱10.71
3. Subtotal (VAT-exclusive) = ₱89.29
4. Final payable = ₱100.00 (no discount)
```

### Regular Discount (non-SC/PWD) — Unchanged

```
1. Discount = total × percentage
2. Final payable = total - discount
```

---

## Test Cases Performed

All tests in `tests/sc_pwd_discount_test.js` passed (28/28):

| # | Scenario | Expected | Actual | Result |
|---|----------|----------|--------|--------|
| 1 | Regular customer, ₱100 VAT-inclusive item | ₱100.00 | ₱100.00 | ✅ |
| 2 | Senior Citizen, ₱100 item | ₱71.43 | ₱71.43 | ✅ |
| 3 | PWD, ₱100 item | ₱71.43 | ₱71.43 | ✅ |
| 4 | Multiple eligible items (₱100 + ₱200) | ₱214.29 | ₱214.29 | ✅ |
| 5 | Mixed eligible (₱100) + non-eligible (₱50) | ₱121.43 | ₱121.43 | ✅ |
| 6 | Multiple quantities (3 × ₱100) | ₱214.29 | ₱214.29 | ✅ |
| 7 | SC + PWD stacking | Not allowed | Not allowed | ✅ |
| 8 | Regular discount (10%) unchanged | ₱90.00 | ₱90.00 | ✅ |
| 9 | Cash/payment (₱100 tendered for ₱71.43) | ₱28.57 change | ₱28.57 | ✅ |
| 10 | Database schema verification | All columns exist | All columns exist | ✅ |

---

## Test Results

```
RESULTS: 28 passed, 0 failed
```

All calculation scenarios verified:
- ✅ Regular customer: ₱100.00 final payable (unchanged)
- ✅ Senior Citizen: ₱71.43 final payable (VAT-exempt)
- ✅ PWD: ₱71.43 final payable (VAT-exempt)
- ✅ Multiple eligible items: correct aggregate calculation
- ✅ Mixed eligible/non-eligible: discount only on eligible items
- ✅ Multiple quantities: correct per-quantity calculation
- ✅ SC + PWD cannot stack (single discount_id enforced)
- ✅ Cash/payment calculation correct
- ✅ Database schema verified

---

## Remaining Issues & Assumptions

### Assumptions
1. **SC/PWD discount applies only to VATABLE items** — This follows the BIR interpretation that the statutory discount applies to the selling price of goods/services subject to VAT. Non-VATABLE items (VAT_EXEMPT, ZERO_RATED, NON_TAXABLE) are not eligible for the SC/PWD discount.
2. **SC/PWD ID is required** — The system requires the cashier to enter the OSCA/SC ID or PWD ID when an SC/PWD discount is selected. This is enforced client-side before payment processing.
3. **Suspended sales** — When a held sale with an SC/PWD discount is completed, the system uses the stored `sc_pwd_type` from the cart data. If the held sale was created before this migration, it defaults to `PWD` type since the specific type cannot be determined from legacy data.
4. **Rounding** — All calculations round to 2 decimal places (centavos) at each calculation stage, consistent with the existing system behavior.

### Remaining Issues
1. **Receipt reprint** — The receipt reprint flow (from sales history) may not display the SC/PWD ID and VAT-exempt amount for older sales created before this migration. New sales will display correctly.
2. **Returns** — Return processing for SC/PWD transactions uses the stored `total_amount` from the sale, which is correct for the discounted amount. No changes were needed to the returns flow.
3. **Admin reports UI** — The backend reports API now returns `sc_pwd_type`, `vat_exempt_amount`, `senior_count`, and `pwd_count` fields. The admin report UI may need updates to display these new fields, but the API data is available.

---

## Verification Steps

1. **Database migration applied**: ✅ `node scripts/run-migration.js migrations/042_sc_pwd_discount.sql`
2. **TypeScript compilation**: ✅ `npx tsc --noEmit` — no errors
3. **Test suite**: ✅ `node tests/sc_pwd_discount_test.js` — 28/28 passed
4. **Database schema verified**: ✅ All 3 new columns exist in `sales` table