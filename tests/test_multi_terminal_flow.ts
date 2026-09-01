import "dotenv/config";
import { pool } from "../server/db.js";
import {
  formatSalesInvoiceText,
  formatXReadingText,
  formatZReadingText,
} from "../client/src/shared/utils/birReceiptFormatter.js";
import type { StoreSettings } from "../client/src/shared/api/settingsApi.js";

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING MULTI-TERMINAL WORKSTATION AUDIT TESTS");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // ─── Test 1: Query pos_terminals from DB ────────────────────────────────────
  const [terminals] = await pool.query<any[]>(
    "SELECT * FROM pos_terminals WHERE is_active = TRUE ORDER BY terminal_code ASC"
  );
  assert(terminals.length >= 2, `pos_terminals table contains at least 2 terminals (found ${terminals.length})`);

  const term1 = terminals.find((t) => t.terminal_code === "TERM-01");
  const term2 = terminals.find((t) => t.terminal_code === "TERM-02");

  assert(Boolean(term1), "TERM-01 (Counter 1) exists in database");
  assert(Boolean(term2), "TERM-02 (Counter 2) exists in database");
  assert(term1?.pos_serial === "PF3QX4HD", `TERM-01 pos_serial matches '${term1?.pos_serial}'`);
  assert(term1?.pos_min === "0000-932749901", `TERM-01 pos_min matches '${term1?.pos_min}'`);
  assert(term2?.pos_min === "0000-932749902", `TERM-02 pos_min matches '${term2?.pos_min}'`);

  const mockSettings: StoreSettings = {
    store_name: "ISRA HARDWARE TEST",
    facebook: "fb.com/israhardware",
    contact_number: "09123456789",
    address: "Central City, PH",
    currency: "PHP",
    proprietor: "Juan Santos",
    registered_taxpayer_name: "DELA CRUZ, JUAN SANTOS",
    tin: "766490574",
    branch_code: "00000",
    business_license: "BP-2026",
    document_type: "SALES INVOICE",
    vat_rate: 12,
    vat_enabled: true,
    vat_registered: true,
    pricing_type: null,
    receipt_footer: null,
    printer_name: null,
    cash_drawer_enabled: false,
    pos_min: "DEFAULT-MIN",
    pos_serial: "DEFAULT-SERIAL",
    ptu_or_accn_no: "PTU-2026-BIR-0012345",
    ptu_date_issued: "2026-01-15",
    accreditation_no: "ACC-2026-BIR-000999",
    accreditation_date_issued: "2026-01-15",
  };

  // ─── Test 2: Receipt printed from Terminal 01 ──────────────────────────────
  const receiptTerm1 = formatSalesInvoiceText({
    invoiceNumber: "INV-2026-0001",
    dateTime: new Date().toISOString(),
    cashierName: "Maria Cashier",
    terminalId: term1.terminal_code,
    posMin: term1.pos_min,
    posSerial: term1.pos_serial,
    customer: { name: "Juan Customer" },
    items: [
      { name: "Portland Cement", quantity: 2, unit: "bag", unitPrice: 250, subtotal: 500, taxType: "VATABLE" },
    ],
    subtotal: 500,
    totalAmountDue: 500,
    vatBreakdown: {
      vatableSales: 446.43,
      vatAmount: 53.57,
      vatExemptSales: 0,
      zeroRatedSales: 0,
      nonVatSales: 0,
    },
    payment: {
      method: "CASH",
      tendered: 500,
      change: 0,
    },
    settings: mockSettings,
  });

  assert(receiptTerm1.includes("MIN: 0000-932749901 | S/N: PF3QX4HD"), "Terminal 01 receipt has MIN: 0000-932749901 | S/N: PF3QX4HD");
  assert(/Terminal:\s+TERM-01/.test(receiptTerm1), "Terminal 01 receipt has 'Terminal: ... TERM-01'");
  assert(!receiptTerm1.includes("DEFAULT-MIN"), "Terminal 01 receipt does not use fallback default MIN");

  // ─── Test 3: Receipt printed from Terminal 02 ──────────────────────────────
  const receiptTerm2 = formatSalesInvoiceText({
    invoiceNumber: "INV-2026-0002",
    dateTime: new Date().toISOString(),
    cashierName: "John Cashier",
    terminalId: term2.terminal_code,
    posMin: term2.pos_min,
    posSerial: "SN-PC02-LENOVO",
    customer: { name: "Maria Customer" },
    items: [
      { name: "Steel Bar 10mm", quantity: 5, unit: "pc", unitPrice: 180, subtotal: 900, taxType: "VATABLE" },
    ],
    subtotal: 900,
    totalAmountDue: 900,
    vatBreakdown: {
      vatableSales: 803.57,
      vatAmount: 96.43,
      vatExemptSales: 0,
      zeroRatedSales: 0,
      nonVatSales: 0,
    },
    payment: {
      method: "CASH",
      tendered: 1000,
      change: 100,
    },
    settings: mockSettings,
  });

  assert(receiptTerm2.includes("MIN: 0000-932749902 | S/N: SN-PC02-LENOVO"), "Terminal 02 receipt has MIN: 0000-932749902 | S/N: SN-PC02-LENOVO");
  assert(/Terminal:\s+TERM-02/.test(receiptTerm2), "Terminal 02 receipt has 'Terminal: ... TERM-02'");

  // ─── Test 4: X-Reading from Terminal 01 ────────────────────────────────────
  const xReadingTerm1 = formatXReadingText({
    sessionId: 1,
    shiftLabel: "Morning Shift",
    cashierName: "Cashier 1",
    terminalId: "TERM-01",
    posMin: "0000-932749901",
    posSerial: "PF3QX4HD",
    openedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    begInvoiceNo: "INV-001",
    endInvoiceNo: "INV-010",
    transactionCount: 10,
    shiftGross: 5000,
    shiftDiscounts: 0,
    shiftRefunds: 0,
    shiftNet: 5000,
    openingCash: 1000,
    cashSales: 5000,
    creditCollections: 0,
    cashRefunds: 0,
    expectedCash: 6000,
    actualCash: 6000,
    variance: 0,
    status: "Balanced",
    settings: mockSettings,
  });

  assert(xReadingTerm1.includes("MIN: 0000-932749901 | S/N: PF3QX4HD"), "X-Reading has Terminal 01 MIN & S/N");
  assert(/Terminal:\s+TERM-01/.test(xReadingTerm1), "X-Reading has 'Terminal: ... TERM-01'");

  console.log("=================================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  await pool.end();
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
