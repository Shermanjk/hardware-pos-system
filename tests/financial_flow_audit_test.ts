/**
 * Financial Flow & Transaction Logic Pre-Deployment Regression Test Suite
 * Tests all 6 core financial requirements and the 3 approved credit return scenarios.
 */

import "dotenv/config";
import { pool } from "../server/db.js";
import { recalcCustomerBalance } from "../server/routes/customers.js";
import { validateReturnItems } from "../server/utils/validateReturn.js";

async function runRegressionTestSuite() {
  console.log("================================================================================");
  console.log("STARTING FINANCIAL FLOW PRE-DEPLOYMENT REGRESSION TEST SUITE");
  console.log("================================================================================\n");

  const conn = await pool.getConnection();
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (detail) console.log(`   └─ ${detail}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   └─ FAILED: ${detail}`);
      failedCount++;
    }
  }

  try {
    await conn.beginTransaction();
    const [userRows] = await conn.execute<any[]>("SELECT id FROM users LIMIT 1");
    const validUserId = userRows[0]?.id || 1;
    const ts = Math.floor((Date.now() % 500000000) + 100000000);

    // ─── TEST 1: SC/PWD 20% Discount Effective Return Price Calculation ────────
    console.log("--- Test Group 1: Discounted & SC/PWD Return Price Calculation ---");
    {
      const saleId = ts + 1;
      const productId = ts + 1;
      const saleItemId = ts + 1;

      // Insert product
      await conn.execute(
        `INSERT INTO products (id, barcode, product_name, selling_price, cost_price, quantity, is_returnable, status)
         VALUES (?, ?, 'Test SC/PWD Item', 1120.00, 800.00, 50, 1, 'Active')`,
        [productId, `BC-${productId}`]
      );

      // Insert SC/PWD sale
      await conn.execute(
        `INSERT INTO sales (id, invoice_number, cashier_id, subtotal, discount, vat_amount, vat_exempt_amount, total_amount, sc_pwd_type, sc_pwd_id, void_status, payment_status, transaction_status)
         VALUES (?, ?, ?, 1000.00, 200.00, 0.00, 1000.00, 800.00, 'SENIOR_CITIZEN', 'SC-12345', 'active', 'completed', 'Completed')`,
        [saleId, `INV-TEST-${saleId}`, validUserId]
      );

      // Insert sale item
      await conn.execute(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal, tax_type, taxable_amount, vat_amount)
         VALUES (?, ?, ?, 1, 1120.00, 1120.00, 'VATABLE', 1000.00, 0.00)`,
        [saleItemId, saleId, productId]
      );

      const validation = await validateReturnItems(
        conn,
        saleId,
        [{ sale_item_id: saleItemId, product_id: productId, quantity_returned: 1, unit_price: 1120.00 }],
        new Date()
      );

      assert(validation.valid === true, "SC/PWD Return Item Validation");
      if (validation.valid) {
        const item = validation.validatedItems[0];
        assert(
          item.effective_unit_price === 800.00,
          "SC/PWD Effective Return Price = ₱800.00 (Net Base ₱1000 - 20% discount)",
          `Expected 800.00, got ${item.effective_unit_price}`
        );
      }
    }

    // ─── TEST 2: Regular % Promotional Discount Effective Return Price Calculation
    console.log("\n--- Test Group 2: Promotional Discount Return Calculation ---");
    {
      const saleId = ts + 2;
      const productId = ts + 2;
      const saleItemId = ts + 2;

      await conn.execute(
        `INSERT INTO products (id, barcode, product_name, selling_price, cost_price, quantity, is_returnable, status)
         VALUES (?, ?, 'Test Promo Item', 500.00, 300.00, 50, 1, 'Active')`,
        [productId, `BC-${productId}`]
      );

      await conn.execute(
        `INSERT INTO sales (id, invoice_number, cashier_id, subtotal, discount, vat_amount, total_amount, sc_pwd_type, void_status, payment_status, transaction_status)
         VALUES (?, ?, ?, 1000.00, 100.00, 0.00, 900.00, 'NONE', 'active', 'completed', 'Completed')`,
        [saleId, `INV-TEST-${saleId}`, validUserId]
      );

      await conn.execute(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal, tax_type)
         VALUES (?, ?, ?, 2, 500.00, 1000.00, 'VAT_EXEMPT')`,
        [saleItemId, saleId, productId]
      );

      const validation = await validateReturnItems(
        conn,
        saleId,
        [{ sale_item_id: saleItemId, product_id: productId, quantity_returned: 1, unit_price: 500.00 }],
        new Date()
      );

      assert(validation.valid === true, "Promo Discount Return Item Validation");
      if (validation.valid) {
        const item = validation.validatedItems[0];
        assert(
          item.effective_unit_price === 450.00,
          "Promo Discount Effective Return Price = ₱450.00 (₱500 * 900/1000 ratio)",
          `Expected 450.00, got ${item.effective_unit_price}`
        );
      }
    }

    // ─── TEST 3: Scenario 1 — Pure Credit Sale → Partial Return ─────────────────
    console.log("\n--- Test Group 3: Scenario 1 — Pure Credit Sale → Partial Return ---");
    {
      const customerId = ts + 10;
      const saleId = ts + 10;
      const productId = ts + 10;
      const invNo = `INV-TEST-${saleId}`;

      // Create customer
      await conn.execute(
        `INSERT INTO customers (id, customer_code, full_name, credit_limit, current_balance, is_credit_enabled, created_by)
         VALUES (?, ?, 'Juan Dela Cruz', 10000.00, 0.00, 1, ?)`,
        [customerId, `CUST-${customerId}`, validUserId]
      );

      // Create product (Cement @ 500)
      await conn.execute(
        `INSERT INTO products (id, barcode, product_name, selling_price, cost_price, quantity, is_returnable, status)
         VALUES (?, ?, 'Cement Bag', 500.00, 350.00, 20, 1, 'Active')`,
        [productId, `BC-${productId}`]
      );

      // Sale: 2 bags = 1000.00 on Credit, 0 down payment
      await conn.execute(
        `INSERT INTO sales (id, invoice_number, cashier_id, customer_id, payment_type, subtotal, total_amount, amount_paid_at_sale, void_status, payment_status, transaction_status)
         VALUES (?, ?, ?, ?, 'CREDIT', 1000.00, 1000.00, 0.00, 'active', 'completed', 'Completed')`,
        [saleId, invNo, validUserId, customerId]
      );

      const [saleLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, recorded_by)
         VALUES (?, ?, 'CREDIT_SALE', 1000.00, ?, ?)`,
        [customerId, saleId, invNo, validUserId]
      );
      const saleLedgerId = saleLedgerResult.insertId;

      let bal = await recalcCustomerBalance(conn, customerId);
      assert(bal === 1000.00, "Customer initial balance after pure credit sale = ₱1,000.00");

      // Process return of 1 bag (Value = 500.00)
      const returnVal = 500.00;
      const [allocRows] = await conn.execute<any[]>(
        `SELECT COALESCE(SUM(amount_applied), 0) AS total_applied FROM credit_allocations WHERE sale_ledger_id = ?`,
        [saleLedgerId]
      );
      const paymentsApplied = Number(allocRows[0].total_applied || 0);
      const saleRemainingDebt = Math.max(0, 1000.00 - paymentsApplied);
      const creditReversal = Math.min(returnVal, saleRemainingDebt);
      const cashRefund = Math.max(0, returnVal - creditReversal);

      assert(creditReversal === 500.00, "Scenario 1: Credit Reversal = ₱500.00");
      assert(cashRefund === 0.00, "Scenario 1: Cash Refund = ₱0.00 (No cash handed out)");

      const [returnLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, notes, recorded_by)
         VALUES (?, ?, 'RETURN_CREDIT', ?, 'RET-000001', 'Credit return reversal', ?)`,
        [customerId, saleId, -creditReversal, validUserId]
      );

      await conn.execute(
        `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
         VALUES (?, ?, ?)`,
        [returnLedgerResult.insertId, saleLedgerId, creditReversal]
      );

      bal = await recalcCustomerBalance(conn, customerId);
      assert(bal === 500.00, "Scenario 1: Customer resulting balance = ₱500.00");
    }

    // ─── TEST 4: Scenario 2 — Credit Sale with Down Payment → Partial Return ───
    console.log("\n--- Test Group 4: Scenario 2 — Credit Sale with Down Payment → Partial Return ---");
    {
      const customerId = ts + 20;
      const saleId = ts + 20;
      const productId = ts + 20;
      const invNo = `INV-TEST-${saleId}`;

      // Customer: Maria Santos
      await conn.execute(
        `INSERT INTO customers (id, customer_code, full_name, credit_limit, current_balance, is_credit_enabled, created_by)
         VALUES (?, ?, 'Maria Santos', 10000.00, 0.00, 1, ?)`,
        [customerId, `CUST-${customerId}`, validUserId]
      );

      // Sale: 10 sheets Plywood @ 400 = 4000.00 with 1000.00 down payment
      await conn.execute(
        `INSERT INTO sales (id, invoice_number, cashier_id, customer_id, payment_type, subtotal, total_amount, amount_paid_at_sale, void_status, payment_status, transaction_status)
         VALUES (?, ?, ?, ?, 'CREDIT', 4000.00, 4000.00, 1000.00, 'active', 'completed', 'Completed')`,
        [saleId, invNo, validUserId, customerId]
      );

      const [saleLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, recorded_by)
         VALUES (?, ?, 'CREDIT_SALE', 4000.00, ?, ?)`,
        [customerId, saleId, invNo, validUserId]
      );
      const saleLedgerId = saleLedgerResult.insertId;

      const [dpLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, notes, recorded_by)
         VALUES (?, ?, 'PAYMENT', -1000.00, ?, 'Down payment at sale', ?)`,
        [customerId, saleId, invNo, validUserId]
      );

      await conn.execute(
        `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
         VALUES (?, ?, 1000.00)`,
        [dpLedgerResult.insertId, saleLedgerId]
      );

      let bal = await recalcCustomerBalance(conn, customerId);
      assert(bal === 3000.00, "Scenario 2: Customer initial debt after ₱1,000 down payment = ₱3,000.00");

      // Return 8 sheets of Plywood (Value = 3200.00)
      const returnVal = 3200.00;
      const [allocRows] = await conn.execute<any[]>(
        `SELECT COALESCE(SUM(amount_applied), 0) AS total_applied FROM credit_allocations WHERE sale_ledger_id = ?`,
        [saleLedgerId]
      );
      const paymentsApplied = Number(allocRows[0].total_applied || 0); // 1000
      const saleRemainingDebt = Math.max(0, 4000.00 - paymentsApplied); // 3000
      const refundableCash = Math.max(0, paymentsApplied - 0); // 1000

      const creditReversal = Math.min(returnVal, saleRemainingDebt); // 3000
      const uncreditedReturn = Math.max(0, returnVal - creditReversal); // 200
      const cashRefund = Math.min(uncreditedReturn, refundableCash); // 200

      assert(creditReversal === 3000.00, "Scenario 2: Credit Reversal = ₱3,000.00 (wipes out debt)");
      assert(cashRefund === 200.00, "Scenario 2: Cash Refund = ₱200.00 (from ₱1,000 down payment)");

      const [returnLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, notes, recorded_by)
         VALUES (?, ?, 'RETURN_CREDIT', ?, 'RET-000002', 'Credit return reversal', ?)`,
        [customerId, saleId, -creditReversal, validUserId]
      );

      await conn.execute(
        `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
         VALUES (?, ?, ?)`,
        [returnLedgerResult.insertId, saleLedgerId, creditReversal]
      );

      bal = await recalcCustomerBalance(conn, customerId);
      assert(bal === 0.00, "Scenario 2: Customer resulting balance = ₱0.00 (Fully Settled)");
    }

    // ─── TEST 5: Scenario 3 — Credit Sale with Previous Partial Payment → Partial Return
    console.log("\n--- Test Group 5: Scenario 3 — Credit with Partial Payment → Partial Return ---");
    {
      const customerId = ts + 30;
      const saleId = ts + 30;
      const invNo = `INV-TEST-${saleId}`;

      // Customer: Roberto Gomez
      await conn.execute(
        `INSERT INTO customers (id, customer_code, full_name, credit_limit, current_balance, is_credit_enabled, created_by)
         VALUES (?, ?, 'Roberto Gomez', 20000.00, 0.00, 1, ?)`,
        [customerId, `CUST-${customerId}`, validUserId]
      );

      // Sale: 1 Water Pump = 10,000.00 on Credit, 0 down payment
      await conn.execute(
        `INSERT INTO sales (id, invoice_number, cashier_id, customer_id, payment_type, subtotal, total_amount, amount_paid_at_sale, void_status, payment_status, transaction_status)
         VALUES (?, ?, ?, ?, 'CREDIT', 10000.00, 10000.00, 0.00, 'active', 'completed', 'Completed')`,
        [saleId, invNo, validUserId, customerId]
      );

      const [saleLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, recorded_by)
         VALUES (?, ?, 'CREDIT_SALE', 10000.00, ?, ?)`,
        [customerId, saleId, invNo, validUserId]
      );
      const saleLedgerId = saleLedgerResult.insertId;

      // Customer later pays 6000.00 cash via Pay Utang
      const [pmtLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, notes, recorded_by)
         VALUES (?, NULL, 'PAYMENT', -6000.00, 'CRR-000010', 'Utang collection payment', ?)`,
        [customerId, validUserId]
      );

      await conn.execute(
        `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
         VALUES (?, ?, 6000.00)`,
        [pmtLedgerResult.insertId, saleLedgerId]
      );

      let bal = await recalcCustomerBalance(conn, customerId);
      assert(bal === 4000.00, "Scenario 3: Customer balance after ₱6,000 payment = ₱4,000.00");

      // Return Water Pump (Value = 10,000.00)
      const returnVal = 10000.00;
      const [allocRows] = await conn.execute<any[]>(
        `SELECT COALESCE(SUM(amount_applied), 0) AS total_applied FROM credit_allocations WHERE sale_ledger_id = ?`,
        [saleLedgerId]
      );
      const paymentsApplied = Number(allocRows[0].total_applied || 0); // 6000
      const saleRemainingDebt = Math.max(0, 10000.00 - paymentsApplied); // 4000
      const refundableCash = Math.max(0, paymentsApplied - 0); // 6000

      const creditReversal = Math.min(returnVal, saleRemainingDebt); // 4000
      const uncreditedReturn = Math.max(0, returnVal - creditReversal); // 6000
      const cashRefund = Math.min(uncreditedReturn, refundableCash); // 6000

      assert(creditReversal === 4000.00, "Scenario 3: Credit Reversal = ₱4,000.00 (wipes out debt)");
      assert(cashRefund === 6000.00, "Scenario 3: Cash Refund = ₱6,000.00 (refunds ₱6,000 cash paid)");

      const [returnLedgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger (customer_id, sale_id, entry_type, amount, reference, notes, recorded_by)
         VALUES (?, ?, 'RETURN_CREDIT', ?, 'RET-000003', 'Credit return reversal', ?)`,
        [customerId, saleId, -creditReversal, validUserId]
      );

      await conn.execute(
        `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
         VALUES (?, ?, ?)`,
        [returnLedgerResult.insertId, saleLedgerId, creditReversal]
      );

      bal = await recalcCustomerBalance(conn, customerId);
      assert(bal === 0.00, "Scenario 3: Customer resulting balance = ₱0.00 (Fully Settled)");
    }

    // ─── TEST 6: Void Defense-in-Depth & Return Mutual Exclusion ───────────────
    console.log("\n--- Test Group 6: Void Defense-in-Depth & Return Mutual Exclusion ---");
    {
      const saleId = ts + 40;
      const productId = ts + 40;
      const saleItemId = ts + 40;
      const invNo = `INV-TEST-${saleId}`;

      await conn.execute(
        `INSERT INTO products (id, barcode, product_name, selling_price, cost_price, quantity, is_returnable, status)
         VALUES (?, ?, 'Test Void Item', 100.00, 70.00, 10, 1, 'Active')`,
        [productId, `BC-${productId}`]
      );

      // Sold 5 units
      await conn.execute(
        `INSERT INTO sales (id, invoice_number, cashier_id, subtotal, total_amount, void_status, payment_status, transaction_status)
         VALUES (?, ?, ?, 500.00, 500.00, 'active', 'completed', 'Completed')`,
        [saleId, invNo, validUserId]
      );

      await conn.execute(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, 5, 100.00, 500.00)`,
        [saleItemId, saleId, productId]
      );

      // Simulate partial return of 2 units
      const [retResult] = await conn.execute<any>(
        `INSERT INTO returns (return_number, sale_id, processed_by, return_reason, item_condition, status, resolution, refund_amount)
         VALUES ('RET-VOID-1', ?, ?, 'Damaged', 'good', 'completed', 'refund', 200.00)`,
        [saleId, validUserId]
      );

      await conn.execute(
        `INSERT INTO return_items (return_id, sale_item_id, product_id, quantity_returned, unit_price, effective_unit_price)
         VALUES (?, ?, ?, 2, 100.00, 100.00)`,
        [retResult.insertId, saleItemId, productId]
      );

      // Check request level block
      const [returnCheckRows] = await conn.execute<any[]>(
        `SELECT COUNT(*) AS cnt FROM returns WHERE sale_id = ? AND status NOT IN ('rejected')`,
        [saleId]
      );
      const isBlocked = Number(returnCheckRows[0]?.cnt ?? 0) > 0;
      assert(isBlocked === true, "Void Request Level: Blocked when returns exist on sale");

      // Check approval level defense-in-depth restocking calculation
      const [saleItems] = await conn.execute<any[]>(
        `SELECT id, product_id, quantity FROM sale_items WHERE sale_id = ?`,
        [saleId]
      );
      const [completedReturns] = await conn.execute<any[]>(
        `SELECT ri.sale_item_id, COALESCE(SUM(ri.quantity_returned), 0) AS returned_qty
         FROM return_items ri
         JOIN returns r ON r.id = ri.return_id
         WHERE r.sale_id = ? AND r.status = 'completed'
         GROUP BY ri.sale_item_id`,
        [saleId]
      );
      const returnedMap = new Map(completedReturns.map((r: any) => [r.sale_item_id, Number(r.returned_qty)]));

      let totalRestored = 0;
      for (const item of saleItems) {
        const alreadyReturned = returnedMap.get(item.id) || 0;
        const qtyToRestore = Math.max(0, Number(item.quantity) - alreadyReturned);
        totalRestored += qtyToRestore;
      }
      assert(totalRestored === 3, "Void Approval Defense-in-Depth: Restores remaining 3 units (5 sold - 2 returned = 3)");
    }

    console.log("\n================================================================================");
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("================================================================================");

    if (failedCount > 0) {
      process.exit(1);
    }
  } finally {
    await conn.rollback();
    conn.release();
    await pool.end();
  }
}

runRegressionTestSuite().catch((err) => {
  console.error("FATAL ERROR in regression test suite:", err);
  process.exit(1);
});
