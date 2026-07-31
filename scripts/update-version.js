const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function updateVersion() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'israhardware',
    database: 'hardware_pos'
  });

  try {
    await connection.execute(
      "UPDATE system_version SET application_version = '2.8.9' WHERE id = 1"
    );
    console.log('Version updated to 2.8.9 in database');
  } catch (error) {
    console.error('Error updating version:', error);
  } finally {
    await connection.end();
  }
}

updateVersion();
