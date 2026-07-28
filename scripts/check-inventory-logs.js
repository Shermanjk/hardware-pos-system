import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT || 3306;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_HOST || !DB_USER || DB_PASSWORD === undefined || !DB_NAME) {
  console.error('Missing required database environment variables');
  process.exit(1);
}

async function checkTable() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    // Check if table exists
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'inventory_logs'
    `, [DB_NAME]);

    if (tables.length === 0) {
      console.log('ERROR: inventory_logs table does not exist');
      return;
    }

    console.log('inventory_logs table exists');

    // Check columns
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'inventory_logs'
      ORDER BY ORDINAL_POSITION
    `, [DB_NAME]);

    console.log('\nColumns in inventory_logs:');
    columns.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Test a simple query
    console.log('\nTesting simple query...');
    const [testRows] = await connection.query('SELECT COUNT(*) as count FROM inventory_logs');
    console.log(`Row count: ${testRows[0].count}`);

    // Test the problematic query
    console.log('\nTesting problematic query...');
    const [rows] = await connection.query(`
      SELECT
        il.id,
        il.product_id,
        p.product_name,
        p.barcode,
        il.transaction_type,
        il.action,
        il.quantity_change,
        il.quantity,
        il.remaining_stock,
        il.reference,
        il.created_at,
        COALESCE(u.full_name, '—') AS performed_by
      FROM inventory_logs il
      LEFT JOIN products p ON p.id = il.product_id
      LEFT JOIN users u ON u.id = il.user_id
      WHERE 1=1
      ORDER BY il.created_at DESC
      LIMIT ? OFFSET ?
    `, [50, 0]);

    console.log(`Query returned ${rows.length} rows`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkTable();
