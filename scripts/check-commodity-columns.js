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

async function checkColumns() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    const [rows] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'commodity_purchases'
      ORDER BY ORDINAL_POSITION
    `, [DB_NAME]);

    console.log('Current columns in commodity_purchases:');
    rows.forEach(row => {
      console.log(`  - ${row.COLUMN_NAME} (${row.DATA_TYPE})`);
    });

    const requiredColumns = [
      'deducted_quantity',
      'payable_quantity', 
      'deduction_amount',
      'status',
      'prepared_by',
      'approved_by',
      'approved_at',
      'rejected_by',
      'rejected_at',
      'rejection_reason',
      'payment_status',
      'amount_paid',
      'payment_method',
      'payment_reference',
      'paid_at'
    ];

    const existingColumns = rows.map(r => r.COLUMN_NAME);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log('\nMissing columns:', missingColumns);
    } else {
      console.log('\nAll required columns exist.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkColumns();
