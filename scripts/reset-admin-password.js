// Script to reset admin password
// Run with: node scripts/reset-admin-password.js

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

async function resetAdminPassword() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const newPassword = 'admin123'; // Default password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    console.log('\n=== Resetting Admin Password ===\n');
    console.log(`New password: ${newPassword}`);
    console.log(`Password hash: ${passwordHash}`);

    const [result] = await connection.execute(
      `UPDATE users SET password_hash = ? WHERE username = 'admin'`,
      [passwordHash]
    );

    if (result.affectedRows > 0) {
      console.log('\n✅ Password reset successfully!');
      console.log('\nYou can now use these credentials to authorize:');
      console.log('  Username: admin');
      console.log('  Password: admin123');
      console.log('\n⚠️  Please change this password after logging in via the Admin panel.');
    } else {
      console.log('\n❌ Failed to reset password. Admin user not found.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

resetAdminPassword();
