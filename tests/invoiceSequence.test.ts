/**
 * tests/invoiceSequence.test.ts
 *
 * Tests for:
 * - Concurrency-safe invoice number generation (Implementation 3)
 * - Duplicate invoice prevention
 * - Tax classification columns (Implementation 4)
 * - Void/cancellation table (Implementation 7)
 * - Extended audit_logs columns (Implementation 6)
 * - store_settings new columns (Implementation 1 & 2)
 *
 * Run with: npx ts-node --esm tests/invoiceSequence.test.ts
 *
 * IMPORTANT: Requires a running MySQL instance with hardware_pos database
 * and all migrations 001–010 applied.
 */

import { pool } from "../server/db.js";
import { generateInvoiceNumber, generateReturnNumber } from "../server/utils/invoiceNumber.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ─── Test 1: Sequential invoice numbers are unique ────────────────────────────
async function testSequentialUniqueness() {
  console.log("\n[Test 1] Sequential invoice numbers are unique");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const n1 = await generateInvoiceNumber(conn);
    await conn.commit();

    await conn.beginTransaction();
    const n2 = await generateInvoiceNumber(conn);
    await conn.commit();

    assert(n1 !== n2, `Two sequential calls produce different numbers (${n1}, ${n2})`);
    assert(/^INV-\d{6}$/.test(n1), `Format is INV-NNNNNN: ${n1}`);
  } finally {
    conn.release();
  }
}

// ─── Test 2: Concurrent invoice numbers are unique ────────────────────────────
async function testConcurrentUniqueness() {
  console.log("\n[Test 2] Concurrent invoice numbers are unique (simulated)");

  const results = await Promise.all([
    (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const n = await generateInvoiceNumber(conn);
        await conn.commit();
        return n;
      } finally {
        conn.release();
      }
    })(),
    (async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const n = await generateInvoiceNumber(conn);
        await conn.commit();
        return n;
      } finally {
        conn.release();
      }
    })(),
  ]);

  assert(results[0] !== results[1], `Concurrent calls produce different numbers (${results[0]}, ${results[1]})`);
}

// ─── Test 3: Return number sequence is separate from invoice sequence ─────────
async function testReturnSequenceSeparate() {
  console.log("\n[Test 3] Return number sequence is separate from invoice sequence");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const inv = await generateInvoiceNumber(conn);
    const rtn = await generateReturnNumber(conn);
    await conn.commit();

    assert(inv.startsWith("INV-"), `Invoice starts with INV-: ${inv}`);
    assert(rtn.startsWith("RTN-"), `Return starts with RTN-: ${rtn}`);
    assert(inv !== rtn, "Invoice and return numbers are different");
  } finally {
    conn.release();
  }
}

// ─── Test 4: Duplicate prefix insert is rejected ──────────────────────────────
async function testSequenceTableConstraint() {
  console.log("\n[Test 4] invoice_sequences unique constraint on prefix");
  const conn = await pool.getConnection();
  try {
    let threw = false;
    try {
      await conn.execute(
        `INSERT INTO invoice_sequences (document_type, prefix, current_number) VALUES ('TEST', 'INV', 0)`
      );
    } catch {
      threw = true;
    }
    assert(threw, "Duplicate prefix insert throws a unique constraint error");
  } finally {
    conn.release();
  }
}

// ─── Test 5: sale_items tax classification columns exist ──────────────────────
async function testTaxClassificationColumns() {
  console.log("\n[Test 5] sale_items tax classification columns exist");
  const [rows] = await pool.execute<any[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items'
       AND COLUMN_NAME IN ('tax_type','tax_rate','taxable_amount','vat_amount')`
  );
  const cols = (rows as any[]).map((r) => r.COLUMN_NAME);
  assert(cols.includes("tax_type"),       "tax_type column exists");
  assert(cols.includes("tax_rate"),       "tax_rate column exists");
  assert(cols.includes("taxable_amount"), "taxable_amount column exists");
  assert(cols.includes("vat_amount"),     "vat_amount column exists");
}

// ─── Test 6: store_settings has new taxpayer columns ─────────────────────────
async function testStoreSettingsColumns() {
  console.log("\n[Test 6] store_settings new columns exist");
  const [rows] = await pool.execute<any[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_settings'
       AND COLUMN_NAME IN ('registered_taxpayer_name','tin','document_type')`
  );
  const cols = (rows as any[]).map((r) => r.COLUMN_NAME);
  assert(cols.includes("registered_taxpayer_name"), "registered_taxpayer_name column exists");
  assert(cols.includes("tin"),                      "tin column exists");
  assert(cols.includes("document_type"),            "document_type column exists");
}

// ─── Test 7: sale_voids table exists ─────────────────────────────────────────
async function testSaleVoidsTable() {
  console.log("\n[Test 7] sale_voids table exists");
  const [rows] = await pool.execute<any[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_voids'`
  );
  assert((rows as any[]).length === 1, "sale_voids table exists");
}

// ─── Test 8: audit_logs has extended columns ──────────────────────────────────
async function testAuditLogColumns() {
  console.log("\n[Test 8] audit_logs extended columns exist");
  const [rows] = await pool.execute<any[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs'
       AND COLUMN_NAME IN ('entity_type','entity_id','previous_values','new_values','reason')`
  );
  const cols = (rows as any[]).map((r) => r.COLUMN_NAME);
  assert(cols.includes("entity_type"),     "entity_type column exists");
  assert(cols.includes("entity_id"),       "entity_id column exists");
  assert(cols.includes("previous_values"), "previous_values column exists");
  assert(cols.includes("new_values"),      "new_values column exists");
  assert(cols.includes("reason"),          "reason column exists");
}

// ─── Runner ───────────────────────────────────────────────────────────────────
async function runAll() {
  console.log("=== POS System — Implementation Tests ===");
  try {
    await testSequentialUniqueness();
    await testConcurrentUniqueness();
    await testReturnSequenceSeparate();
    await testSequenceTableConstraint();
    await testTaxClassificationColumns();
    await testStoreSettingsColumns();
    await testSaleVoidsTable();
    await testAuditLogColumns();
  } catch (err) {
    console.error("Unexpected test error:", err);
    failed++;
  } finally {
    await pool.end();
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAll();
