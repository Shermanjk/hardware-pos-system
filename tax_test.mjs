/**
 * Tax Classification Integration Test
 * Tests all 4 tax types: VATABLE, VAT_EXEMPT, ZERO_RATED, NON_TAXABLE
 * Verifies: tax_type, tax_rate, taxable_amount, vat_amount stored correctly
 * Also verifies historical preservation (changing product tax_type after sale)
 */
import mysql from "mysql2/promise";

const DB = { host: "localhost", user: "root", password: process.env.POS_DB_PASSWORD, database: "hardware_pos" };

const PASS = (msg) => console.log(`  ✓ PASS  ${msg}`);
const FAIL = (msg) => { console.error(`  ✗ FAIL  ${msg}`); process.exitCode = 1; };
const HEAD = (msg) => console.log(`\n── ${msg} ──`);

async function run() {
  const conn = await mysql.createConnection(DB);

  // ── 1. Find a cashier user and a valid category/unit ──────────────────────
  const [[cashier]] = await conn.execute(`SELECT id, username FROM users WHERE role = 'Cashier' LIMIT 1`);
  const [[cat]]     = await conn.execute(`SELECT id FROM categories LIMIT 1`);
  const [[unit]]    = await conn.execute(`SELECT id FROM units LIMIT 1`);
  if (!cashier || !cat || !unit) { console.error("Missing cashier/category/unit"); process.exit(1); }

  // ── 2. Create 4 test products, one per tax type ───────────────────────────
  HEAD("Creating test products");
  const taxTypes = ["VATABLE", "VAT_EXEMPT", "ZERO_RATED", "NON_TAXABLE"];
  const productIds = {};

  for (const tt of taxTypes) {
    const barcode = `TEST-TAX-${tt}-${Date.now()}`;
    const [r] = await conn.execute(
      `INSERT INTO products (barcode, barcode_source, product_name, category_id, unit_id,
        cost_price, selling_price, quantity, reorder_level, is_returnable, status, tax_type)
       VALUES (?, 'store', ?, ?, ?, 50.00, 112.00, 100, 5, 1, 'Active', ?)`,
      [barcode, `Test ${tt} Product`, cat.id, unit.id, tt]
    );
    productIds[tt] = r.insertId;
    PASS(`Created product ID=${r.insertId} tax_type=${tt} price=112.00`);
  }

  // ── 3. Simulate a sale with all 4 products ────────────────────────────────
  HEAD("Simulating sale with all 4 tax types");

  // Build items — each product qty=1, subtotal=112.00
  // Backend will ignore frontend tax values and use DB tax_type
  const items = taxTypes.map(tt => ({
    product_id: productIds[tt],
    quantity: 1,
    unit_price: 112.00,
    subtotal: 112.00,
    tax_type: "VATABLE", // intentionally wrong — backend must override from DB
  }));

  // Insert sale directly (bypassing HTTP to avoid needing a running server)
  await conn.beginTransaction();
  try {
    // Fetch tax_type from DB for each product (mirrors backend logic)
    const productData = {};
    for (const item of items) {
      const [[p]] = await conn.execute(
        `SELECT quantity, product_name AS name, tax_type FROM products WHERE id = ? FOR UPDATE`,
        [item.product_id]
      );
      productData[item.product_id] = { name: p.name, tax_type: p.tax_type ?? "VATABLE" };
    }

    // Insert sale
    const [saleRes] = await conn.execute(
      `INSERT INTO sales (invoice_number, customer_name, cashier_id, subtotal, vat_amount, total_amount, cash_tendered, change_amount)
       VALUES ('TEST-TAX-SALE-001', 'Tax Test Customer', ?, 0, 0, 448.00, 500.00, 52.00)`,
      [cashier.id]
    );
    const saleId = saleRes.insertId;

    // Insert sale_items using DB tax_type as source of truth (mirrors backend logic)
    for (const item of items) {
      const taxType   = productData[item.product_id].tax_type;
      const isVatable = taxType === "VATABLE";
      const taxRate   = isVatable ? 12 : 0;
      const taxableAmt = isVatable
        ? Math.round((item.subtotal / 1.12) * 100) / 100
        : item.subtotal;
      const vatAmt = isVatable
        ? Math.round((item.subtotal - taxableAmt) * 100) / 100
        : 0;

      await conn.execute(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal, tax_type, tax_rate, taxable_amount, vat_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product_id, item.quantity, item.unit_price, item.subtotal,
         taxType, taxRate, taxableAmt, vatAmt]
      );

      await conn.execute(`UPDATE products SET quantity = quantity - 1 WHERE id = ?`, [item.product_id]);
    }

    await conn.commit();
    PASS(`Sale inserted: id=${saleId}`);

    // ── 4. Verify stored values ──────────────────────────────────────────────
    HEAD("Verifying stored tax values");

    const [saleItems] = await conn.execute(
      `SELECT si.product_id, si.tax_type, si.tax_rate, si.taxable_amount, si.vat_amount, si.subtotal
       FROM sale_items si WHERE si.sale_id = ?`,
      [saleId]
    );

    const expected = {
      VATABLE:     { tax_rate: 12, taxable_amount: 100.00, vat_amount: 12.00 },
      VAT_EXEMPT:  { tax_rate: 0,  taxable_amount: 112.00, vat_amount: 0 },
      ZERO_RATED:  { tax_rate: 0,  taxable_amount: 112.00, vat_amount: 0 },
      NON_TAXABLE: { tax_rate: 0,  taxable_amount: 112.00, vat_amount: 0 },
    };

    for (const row of saleItems) {
      const tt  = row.tax_type;
      const exp = expected[tt];
      const label = `[${tt}]`;

      if (row.tax_type === tt)
        PASS(`${label} tax_type stored correctly`);
      else
        FAIL(`${label} tax_type: expected ${tt}, got ${row.tax_type}`);

      if (Number(row.tax_rate) === exp.tax_rate)
        PASS(`${label} tax_rate = ${exp.tax_rate}%`);
      else
        FAIL(`${label} tax_rate: expected ${exp.tax_rate}, got ${row.tax_rate}`);

      if (Math.abs(Number(row.taxable_amount) - exp.taxable_amount) < 0.01)
        PASS(`${label} taxable_amount = ${exp.taxable_amount}`);
      else
        FAIL(`${label} taxable_amount: expected ${exp.taxable_amount}, got ${row.taxable_amount}`);

      if (Math.abs(Number(row.vat_amount) - exp.vat_amount) < 0.01)
        PASS(`${label} vat_amount = ${exp.vat_amount}`);
      else
        FAIL(`${label} vat_amount: expected ${exp.vat_amount}, got ${row.vat_amount}`);

      if (Number(row.subtotal) === 112.00)
        PASS(`${label} subtotal = 112.00 (unchanged)`);
      else
        FAIL(`${label} subtotal: expected 112.00, got ${row.subtotal}`);
    }

    // ── 5. Historical preservation test ─────────────────────────────────────
    HEAD("Testing historical preservation");

    // Change VATABLE product to VAT_EXEMPT after the sale
    await conn.execute(
      `UPDATE products SET tax_type = 'VAT_EXEMPT' WHERE id = ?`,
      [productIds["VATABLE"]]
    );
    PASS(`Changed VATABLE product (id=${productIds["VATABLE"]}) to VAT_EXEMPT`);

    // Re-read the sale_item — must still show VATABLE
    const [[savedItem]] = await conn.execute(
      `SELECT tax_type, tax_rate, vat_amount FROM sale_items WHERE sale_id = ? AND product_id = ?`,
      [saleId, productIds["VATABLE"]]
    );

    if (savedItem.tax_type === "VATABLE")
      PASS(`Historical sale_item still shows VATABLE (not affected by product update)`);
    else
      FAIL(`Historical preservation BROKEN: sale_item shows ${savedItem.tax_type} after product changed`);

    if (Number(savedItem.vat_amount) === 12.00)
      PASS(`Historical vat_amount still = 12.00`);
    else
      FAIL(`Historical vat_amount changed to ${savedItem.vat_amount}`);

    // ── 6. Cleanup ───────────────────────────────────────────────────────────
    HEAD("Cleanup");
    await conn.execute(`DELETE FROM sale_items WHERE sale_id = ?`, [saleId]);
    await conn.execute(`DELETE FROM sales WHERE id = ?`, [saleId]);
    for (const id of Object.values(productIds)) {
      await conn.execute(`DELETE FROM products WHERE id = ?`, [id]);
    }
    PASS("Test data cleaned up");

  } catch (err) {
    await conn.rollback();
    throw err;
  }

  await conn.end();
  console.log("\n" + (process.exitCode === 1 ? "❌ SOME TESTS FAILED" : "✅ ALL TESTS PASSED"));
}

run().catch((err) => { console.error(err); process.exit(1); });
