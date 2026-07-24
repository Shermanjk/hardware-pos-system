const mysql = require('mysql2/promise');

async function deleteMarketBasedProducts() {
  const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: 'israhardware',
    database: 'hardware_pos',
    waitForConnections: true,
    connectionLimit: 10,
  });

  try {
    // Preview what will be deleted
    const [preview] = await pool.execute(
      'SELECT id, barcode, product_name, pricing_type FROM products WHERE pricing_type = ?',
      ['MARKET_BASED']
    );
    
    console.log('Products to be deleted:');
    console.table(preview);
    
    if (preview.length === 0) {
      console.log('No market-based products found.');
      return;
    }

    const productIds = preview.map(p => p.id);
    const placeholders = productIds.map(() => '?').join(',');

    // Delete all related records in dependent tables
    const tables = [
      'commodity_prices',
      'commodity_purchases',
      'commodity_deducted_quantities',
      'inventory_logs',
      'stock_adjustments',
      'stock_counts',
    ];

    for (const table of tables) {
      try {
        const result = await pool.execute(
          `DELETE FROM ${table} WHERE product_id IN (${placeholders})`,
          productIds
        );
        if (result.affectedRows > 0) {
          console.log(`Deleted ${result.affectedRows} record(s) from ${table}`);
        }
      } catch (err) {
        if (err.code !== 'ER_NO_SUCH_TABLE') {
          console.log(`Note: ${table} - ${err.message}`);
        }
      }
    }

    // Delete the products
    const [result] = await pool.execute(
      'DELETE FROM products WHERE pricing_type = ?',
      ['MARKET_BASED']
    );
    
    console.log(`\nDeleted ${result.affectedRows} market-based product(s).`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

deleteMarketBasedProducts();