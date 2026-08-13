import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

async function check() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "sherman",
    database: process.env.DB_NAME || "hardware_pos",
  });

  try {
    const [rows] = await pool.execute("SELECT id, product_name, selling_price, tax_type, quantity FROM products WHERE product_name LIKE '%Paint%' OR product_name LIKE '%Hammer%' OR product_name LIKE '%Nail%'");
    console.log("PRODUCTS:", JSON.stringify(rows, null, 2));

    const [discounts] = await pool.execute("SELECT * FROM discounts");
    console.log("DISCOUNTS:", JSON.stringify(discounts, null, 2));
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await pool.end();
  }
}

check();
