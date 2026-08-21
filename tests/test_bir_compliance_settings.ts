import "dotenv/config";
import { pool } from "../server/db.js";
import {
  formatSalesInvoiceText,
  formatXReadingText,
  formatZReadingText,
  formatStoreTIN,
  buildStoreHeaderLines
} from "../client/src/shared/utils/birReceiptFormatter.js";
import type { StoreSettings } from "../client/src/shared/api/settingsApi.js";

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING BIR COMPLIANCE SETTINGS AUDIT TESTS");
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

  // ─── Test 1: Database Schema & Default Values ──────────────────────────────
  const [rows] = await pool.execute<any[]>(
    "SELECT tin, branch_code, ptu_or_accn_no, pos_min, pos_serial FROM system_settings WHERE id = 1"
  );
  const dbSettings = rows[0] || {};
  assert(dbSettings.tin !== undefined, "system_settings has 'tin' column");
  assert(dbSettings.branch_code !== undefined, "system_settings has 'branch_code' column");
  assert(dbSettings.ptu_or_accn_no !== undefined, "system_settings has 'ptu_or_accn_no' column");
  assert(dbSettings.branch_code === "00000" || /^\d{3,5}$/.test(dbSettings.branch_code), "Default branch_code is valid (00000)");

  // ─── Test 2: Formatter TIN Concatenation ───────────────────────────────────
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
    pos_min: "MIN-000123456789",
    pos_serial: "SN-2026-9999",
    ptu_or_accn_no: "PTU-2026-BIR-0012345",
  };

  const formattedTIN = formatStoreTIN(mockSettings);
  assert(formattedTIN === "766-490-574-00000", `TIN concatenated as ${formattedTIN}`);

  // ─── Test 3: Header Lines Generation (MIN, Serial, PTU/ACCN) ───────────────
  const headerLines = buildStoreHeaderLines(mockSettings);
  const headerJoined = headerLines.join("\n");
  assert(headerJoined.includes("TIN: 766-490-574-00000"), "Header includes TIN: 766-490-574-00000");
  assert(headerJoined.includes("MIN: MIN-000123456789 | S/N: SN-2026-9999"), "Header includes MIN and S/N");
  assert(headerJoined.includes("PTU / ACCN: PTU-2026-BIR-0012345"), "Header includes PTU / ACCN number below MIN & S/N");

  // ─── Test 4: Sales Invoice Strict 4-Line Tax Breakdown ─────────────────────
  const invoiceText = formatSalesInvoiceText({
    invoiceNumber: "INV-2026-0001",
    dateTime: new Date().toISOString(),
    cashierName: "Maria Cashier",
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

  assert(invoiceText.includes("PTU / ACCN: PTU-2026-BIR-0012345"), "Sales Invoice has PTU/ACCN in header");
  assert(invoiceText.includes("TIN: 766-490-574-00000"), "Sales Invoice has split TIN-Branch in header");
  assert(invoiceText.includes("VATable Sales:"), "Sales Invoice has 'VATable Sales:' line");
  assert(invoiceText.includes("12% VAT Amount:"), "Sales Invoice has '12% VAT Amount:' line");
  assert(invoiceText.includes("VAT-Exempt Sales:"), "Sales Invoice has 'VAT-Exempt Sales:' line (even if 0.00)");
  assert(invoiceText.includes("Zero-Rated Sales:"), "Sales Invoice has 'Zero-Rated Sales:' line (even if 0.00)");

  // ─── Test 5: Z-Reading Strict 4-Line Tax Breakdown ─────────────────────────
  const zReadingText = formatZReadingText({
    zCounterNo: 1,
    resetCounterNo: 0,
    readingDate: new Date().toISOString(),
    openedAt: new Date().toISOString(),
    closedAt: new Date().toISOString(),
    generatedByName: "Admin User",
    oldGrandTotal: 10000,
    dailyGrossSales: 5000,
    newGrandTotal: 15000,
    vatableSales: 4464.29,
    vatAmount: 535.71,
    vatExemptSales: 0,
    zeroRatedSales: 0,
    nonVatSales: 0,
    scDiscount: 0,
    pwdDiscount: 0,
    regularDiscount: 0,
    totalDiscounts: 0,
    totalReturns: 0,
    totalVoids: 0,
    netSales: 5000,
    cashSales: 5000,
    creditSales: 0,
    transactionCount: 10,
    voidCount: 0,
    returnCount: 0,
    settings: mockSettings,
  });

  assert(zReadingText.includes("PTU / ACCN: PTU-2026-BIR-0012345"), "Z-Reading has PTU/ACCN in header");
  assert(zReadingText.includes("TIN: 766-490-574-00000"), "Z-Reading has split TIN-Branch in header");
  assert(zReadingText.includes("VATable Sales:"), "Z-Reading has 'VATable Sales:' line");
  assert(zReadingText.includes("12% VAT Amount:"), "Z-Reading has '12% VAT Amount:' line");
  assert(zReadingText.includes("VAT-Exempt Sales:"), "Z-Reading has 'VAT-Exempt Sales:' line");
  assert(zReadingText.includes("Zero-Rated Sales:"), "Z-Reading has 'Zero-Rated Sales:' line");

  // ─── Test 6: X-Reading Full Header with PTU/ACCN ───────────────────────────
  const xReadingText = formatXReadingText({
    sessionId: 1,
    shiftLabel: "Morning Shift",
    cashierName: "Cashier 1",
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

  assert(xReadingText.includes("PTU / ACCN: PTU-2026-BIR-0012345"), "X-Reading has PTU/ACCN in header");
  assert(xReadingText.includes("TIN: 766-490-574-00000"), "X-Reading has split TIN-Branch in header");

  console.log("=================================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  await pool.end();
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
