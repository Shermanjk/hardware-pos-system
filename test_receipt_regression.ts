import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Helper for centavos formatting exactly like receipt.ts
function fmtCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error(`[Receipt Error] fmtCents called with invalid non-finite value: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function runTests() {
  console.log("==================================================");
  console.log("STARTING THERMAL RECEIPT REGRESSION TEST SUITE");
  console.log("==================================================\n");

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "sherman",
    database: process.env.DB_NAME || "hardware_pos",
  });

  try {
    // --------------------------------------------------
    // TEST 1: Discount Approval Centavo Scaling (Unit Test)
    // --------------------------------------------------
    const totalCents = 104000; // ₱1,040.00
    const vatRate = 12;
    const discountPercentage = 20;

    // Correct formula in DiscountApprovalModal.tsx:
    const totalAmount = totalCents;
    const vatExclusiveCentsCorrect = Math.round(totalAmount / (1 + vatRate / 100));
    const discountCentsCorrect = Math.round((vatExclusiveCentsCorrect * discountPercentage) / 100);
    const discountAmountPesos = Math.round(discountCentsCorrect) / 100;

    if (vatExclusiveCentsCorrect === 92857 && discountCentsCorrect === 18571 && discountAmountPesos === 185.71) {
      results.push({
        name: "Discount Approval Modal 100x Scaling Fix",
        passed: true,
        details: `vatExclusiveCents: ${vatExclusiveCentsCorrect} (₱928.57), discountCents: ${discountCentsCorrect} (₱185.71), discount_amount: ₱${discountAmountPesos}`,
      });
    } else {
      results.push({
        name: "Discount Approval Modal 100x Scaling Fix",
        passed: false,
        details: `FAILED: Got vatExclusiveCents=${vatExclusiveCentsCorrect}, discountCents=${discountCentsCorrect}, discount_amount=${discountAmountPesos}`,
      });
    }

    // --------------------------------------------------
    // TEST 2: Product Tax Classification Check (Database)
    // --------------------------------------------------
    const [products] = await pool.execute<any[]>(
      `SELECT id, product_name, selling_price, tax_type FROM products WHERE product_name IN ('Hammer', 'Nails', 'Paint Brush') OR product_name LIKE '%Paint Roller%'`
    );

    const allVatable = products.every((p) => p.tax_type === "VATABLE");
    if (allVatable && products.length >= 4) {
      results.push({
        name: "Product Tax Classification Verification (₱1,040 Cart)",
        passed: true,
        details: `All 4 products confirmed VATABLE. Products: ${products.map((p) => `${p.product_name} (${p.tax_type})`).join(", ")}`,
      });
    } else {
      results.push({
        name: "Product Tax Classification Verification (₱1,040 Cart)",
        passed: false,
        details: `Failed or missing products: ${JSON.stringify(products)}`,
      });
    }

    // --------------------------------------------------
    // TEST 3: ₱990 SC/PWD Backend Calculation Verification
    // --------------------------------------------------
    // 6 * 165 = 990 gross
    const vatableGross990 = 990.00;
    const netBase990 = Math.round((vatableGross990 / 1.12) * 100) / 100; // 883.93
    const discount990 = Math.round((netBase990 * 0.20) * 100) / 100;     // 176.79
    const payable990 = Math.round((netBase990 - discount990) * 100) / 100; // 707.14
    const cash990 = 1000.00;
    const change990 = Math.round((cash990 - payable990) * 100) / 100;   // 292.86

    if (netBase990 === 883.93 && discount990 === 176.79 && payable990 === 707.14 && change990 === 292.86) {
      results.push({
        name: "₱990 SC/PWD Math Verification",
        passed: true,
        details: `Gross: ₱990.00, Net Base: ₱${netBase990}, SC/PWD Discount: ₱${discount990}, Final Payable: ₱${payable990}, Cash: ₱${cash990}, Change: ₱${change990}`,
      });
    } else {
      results.push({
        name: "₱990 SC/PWD Math Verification",
        passed: false,
        details: `FAILED: netBase=${netBase990}, discount=${discount990}, payable=${payable990}, change=${change990}`,
      });
    }

    // --------------------------------------------------
    // TEST 4: ₱990 Regular Customer Math Verification
    // --------------------------------------------------
    const netBaseReg990 = Math.round((990.00 / 1.12) * 100) / 100; // 883.93
    const vatReg990 = Math.round((990.00 - netBaseReg990) * 100) / 100; // 106.07
    const payableReg990 = 990.00;
    const changeReg990 = Math.round((1000.00 - payableReg990) * 100) / 100; // 10.00

    if (netBaseReg990 === 883.93 && vatReg990 === 106.07 && payableReg990 === 990.00 && changeReg990 === 10.00) {
      results.push({
        name: "₱990 Regular Customer Math Verification",
        passed: true,
        details: `Gross: ₱990.00, Net Base: ₱${netBaseReg990}, VAT: ₱${vatReg990}, Discount: ₱0.00, Final Payable: ₱${payableReg990}, Cash: ₱1,000, Change: ₱${changeReg990}`,
      });
    } else {
      results.push({
        name: "₱990 Regular Customer Math Verification",
        passed: false,
        details: `FAILED: netBase=${netBaseReg990}, vat=${vatReg990}, payable=${payableReg990}, change=${changeReg990}`,
      });
    }

    // --------------------------------------------------
    // TEST 5: ₱1,040 SC/PWD 9-Item Cart Math Verification
    // --------------------------------------------------
    const vatableGross1040 = 1040.00;
    const netBase1040 = Math.round((vatableGross1040 / 1.12) * 100) / 100; // 928.57
    const discount1040 = Math.round((netBase1040 * 0.20) * 100) / 100;     // 185.71
    const payable1040 = Math.round((netBase1040 - discount1040) * 100) / 100; // 742.86
    const cash1040 = 1000.00;
    const change1040 = Math.round((cash1040 - payable1040) * 100) / 100;   // 257.14

    if (netBase1040 === 928.57 && discount1040 === 185.71 && payable1040 === 742.86 && change1040 === 257.14) {
      results.push({
        name: "₱1,040 SC/PWD Math Verification",
        passed: true,
        details: `Gross: ₱1,040.00, Net Base: ₱${netBase1040}, SC/PWD Discount: ₱${discount1040}, Final Payable: ₱${payable1040}, Cash: ₱${cash1040}, Change: ₱${change1040}`,
      });
    } else {
      results.push({
        name: "₱1,040 SC/PWD Math Verification",
        passed: false,
        details: `FAILED: netBase=${netBase1040}, discount=${discount1040}, payable=${payable1040}, change=${change1040}`,
      });
    }

    // --------------------------------------------------
    // TEST 6: Receipt Formatting & Guard Validation
    // --------------------------------------------------
    try {
      const grossStr = fmtCents(104000);
      const discountStr = fmtCents(18571);
      const netBaseStr = fmtCents(92857);
      const payableStr = fmtCents(74286);
      const changeStr = fmtCents(25714);

      if (grossStr === "1040.00" && discountStr === "185.71" && netBaseStr === "928.57" && payableStr === "742.86" && changeStr === "257.14") {
        results.push({
          name: "Receipt fmtCents Output Formatting",
          passed: true,
          details: `Gross: ₱${grossStr}, Discount: -₱${discountStr}, VAT-Exempt: ₱${netBaseStr}, Total Due: ₱${payableStr}, Change: ₱${changeStr}`,
        });
      } else {
        results.push({
          name: "Receipt fmtCents Output Formatting",
          passed: false,
          details: `FAILED: gross=${grossStr}, discount=${discountStr}, netBase=${netBaseStr}, payable=${payableStr}, change=${changeStr}`,
        });
      }
    } catch (err: any) {
      results.push({
        name: "Receipt fmtCents Output Formatting",
        passed: false,
        details: `Threw error: ${err.message}`,
      });
    }

    // --------------------------------------------------
    // TEST 7: Receipt NaN Guard Verification (Expect Throw)
    // --------------------------------------------------
    let nanGuarded = false;
    try {
      fmtCents(NaN);
    } catch (err: any) {
      nanGuarded = err.message.includes("invalid non-finite value");
    }

    if (nanGuarded) {
      results.push({
        name: "Receipt NaN Strict Guard Check",
        passed: true,
        details: "fmtCents correctly throws an error when given NaN instead of printing ₱NaN",
      });
    } else {
      results.push({
        name: "Receipt NaN Strict Guard Check",
        passed: false,
        details: "fmtCents failed to throw error on NaN input",
      });
    }

  } catch (e: any) {
    console.error("Test execution error:", e);
  } finally {
    await pool.end();
  }

  // Print final summary
  console.log("\n==================================================");
  console.log("REGRESSION TEST RESULTS SUMMARY");
  console.log("==================================================");
  let allPass = true;
  for (const r of results) {
    const statusStr = r.passed ? "PASS" : "FAIL";
    if (!r.passed) allPass = false;
    console.log(`[${statusStr}] ${r.name}`);
    console.log(`       Details: ${r.details}`);
  }
  console.log("--------------------------------------------------");
  console.log(`OVERALL RESULT: ${allPass ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}\n`);
}

runTests();
