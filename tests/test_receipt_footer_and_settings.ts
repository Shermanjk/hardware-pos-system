import "dotenv/config";
import { formatStoreTIN, formatSalesInvoiceText } from "../client/src/shared/utils/birReceiptFormatter.js";
import { buildSaleReceiptEscpos } from "../client/src/shared/services/escpos/escposBuilder.js";
import type { StoreSettings } from "../client/src/shared/api/settingsApi.js";

async function runTests() {
  console.log("=================================================");
  console.log("TESTING RECEIPT FOOTER & SETTINGS RESPECT AUDIT");
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

  // 1. Settings with NO accreditation and NO branch code
  const settingsWithoutAcc: StoreSettings = {
    store_name: "ISRA HARDWARE TEST",
    facebook: "",
    contact_number: "",
    address: "Central City, PH",
    currency: "PHP",
    proprietor: "Juan Santos",
    registered_taxpayer_name: "DELA CRUZ, JUAN SANTOS",
    tin: "766490574",
    branch_code: "",
    business_license: "",
    document_type: "SALES INVOICE",
    vat_rate: 12,
    vat_enabled: true,
    vat_registered: true,
    pricing_type: null,
    receipt_footer: null,
    printer_name: null,
    cash_drawer_enabled: false,
    pos_min: "",
    pos_serial: "",
    ptu_or_accn_no: "",
    ptu_date_issued: null,
    accreditation_no: "",
    accreditation_date_issued: null,
  };

  const tinNoBranch = formatStoreTIN(settingsWithoutAcc);
  assert(tinNoBranch === "766-490-574", `TIN without branch code is '766-490-574' (Got: '${tinNoBranch}')`);

  const invoiceWithoutAcc = formatSalesInvoiceText({
    invoiceNumber: "INV-001",
    dateTime: new Date().toISOString(),
    cashierName: "Cashier 1",
    customer: { name: "Walk-in" },
    items: [{ name: "Hammer", quantity: 1, unit: "pc", unitPrice: 100, subtotal: 100, taxType: "VATABLE" }],
    subtotal: 100,
    totalAmountDue: 100,
    vatBreakdown: { vatableSales: 89.29, vatAmount: 10.71, vatExemptSales: 0, zeroRatedSales: 0, nonVatSales: 0 },
    payment: { method: "CASH", tendered: 100, change: 0 },
    settings: settingsWithoutAcc,
  });

  assert(!invoiceWithoutAcc.includes("Accreditation No:"), "Receipt does NOT contain 'Accreditation No:' when accreditation_no is empty");
  assert(!invoiceWithoutAcc.includes("000-000000000-000000"), "Receipt does NOT contain fallback '000-000000000-000000'");

  // 2. Settings WITH accreditation and branch code
  const settingsWithAcc: StoreSettings = {
    ...settingsWithoutAcc,
    branch_code: "00000",
    accreditation_no: "ACC-2026-BIR-000999",
    accreditation_date_issued: "2026-01-15",
  };

  const tinWithBranch = formatStoreTIN(settingsWithAcc);
  assert(tinWithBranch === "766-490-574-00000", `TIN with branch code is '766-490-574-00000' (Got: '${tinWithBranch}')`);

  const invoiceWithAcc = formatSalesInvoiceText({
    invoiceNumber: "INV-001",
    dateTime: new Date().toISOString(),
    cashierName: "Cashier 1",
    customer: { name: "Walk-in" },
    items: [{ name: "Hammer", quantity: 1, unit: "pc", unitPrice: 100, subtotal: 100, taxType: "VATABLE" }],
    subtotal: 100,
    totalAmountDue: 100,
    vatBreakdown: { vatableSales: 89.29, vatAmount: 10.71, vatExemptSales: 0, zeroRatedSales: 0, nonVatSales: 0 },
    payment: { method: "CASH", tendered: 100, change: 0 },
    settings: settingsWithAcc,
  });

  assert(invoiceWithAcc.includes("Accreditation No: ACC-2026-BIR-000999"), "Receipt contains 'Accreditation No: ACC-2026-BIR-000999' when configured");
  assert(invoiceWithAcc.includes("Date Issued: 2026-01-15"), "Receipt contains 'Date Issued: 2026-01-15' when configured");

  // 3. ESC/POS Builder check
  const escposBytesNoAcc = buildSaleReceiptEscpos({
    invoiceNumber: "INV-001",
    cartItems: [{ id: 1, name: "Hammer", quantity: 1, unitPrice: 100, subtotal: 100, tax_type: "VATABLE" }],
    customerInfo: { name: "Walk-in", address: "", tin: "", businessStyle: "" },
    subtotalCents: 10000,
    taxCents: 1071,
    totalCents: 10000,
    cashCents: 10000,
    changeCents: 0,
    cashierName: "Cashier 1",
    settings: settingsWithoutAcc,
    itemSnapshots: [],
  });

  const escposText = Buffer.from(escposBytesNoAcc).toString("latin1");
  assert(!escposText.includes("Accreditation No:"), "ESC/POS receipt does NOT contain 'Accreditation No:' when empty");

  console.log("=================================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
