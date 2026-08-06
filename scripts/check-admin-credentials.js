// Script to check and fix admin credentials for commodity purchase authorization
// Run with: node scripts/check-admin-credentials.js

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

async function checkAdminCredentials() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    console.log('\n=== Checking Admin Users ===\n');

    const [users] = await connection.execute(
      `SELECT id, username, full_name, role, status FROM users WHERE role = 'Admin'`
    );

    if (users.length === 0) {
      console.log('❌ No admin users found in the database.');
      console.log('\nTo create an admin user, you can run this SQL:');
      console.log(`
INSERT INTO users (username, full_name, password_hash, role, status, employee_id, created_at)
VALUES ('admin', 'Administrator', '$2a$10$placeholder_hash', 'Admin', 'Active', 'ADM001', NOW());
      `);
      console.log('\nThen you would need to set a proper password hash using bcrypt.');
      return;
    }

    console.log(`Found ${users.length} admin user(s):\n`);
    
    for (const user of users) {
      console.log(`ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Full Name: ${user.full_name}`);
      console.log(`Role: ${user.role}`);
      console.log(`Status: ${user.status}`);
      
      if (user.status !== 'Active') {
        console.log(`⚠️  WARNING: Status is "${user.status}" - should be "Active" for authorization to work`);
      }
      console.log('---');
    }

    // Get password hash for the admin user
    const [adminWithHash] = await connection.execute(
      `SELECT id, username, password_hash, role, status FROM users WHERE username = 'admin'`
    );

    if (adminWithHash.length > 0) {
      const admin = adminWithHash[0];
      console.log('\n=== Password Hash Check ===\n');
      console.log(`Password hash exists: ${admin.password_hash ? 'Yes' : 'No'}`);
      console.log(`Password hash length: ${admin.password_hash?.length || 0}`);
      
      // Test with common passwords
      console.log('\nTesting common passwords:');
      const commonPasswords = ['admin', 'password', '123456', 'admin123'];
      
      for (const testPwd of commonPasswords) {
        const match = await bcrypt.compare(testPwd, admin.password_hash);
        console.log(`  "${testPwd}": ${match ? '✅ MATCH' : '❌ No match'}`);
      }
      
      console.log('\nIf none of these match, you may need to reset the admin password.');
      console.log('To reset the password, you can use the Users page in the Admin panel,');
      console.log('or run a SQL update with a new bcrypt hash.');
    }

    // Check if there's a user with username 'admin'
    const [adminUser] = await connection.execute(
      `SELECT id, username, full_name, role, status FROM users WHERE username = 'admin'`
    );

    if (adminUser.length === 0) {
      console.log('\n⚠️  No user with username "admin" found.');
      console.log('The modal in your screenshot shows "admin" as the username.');
      console.log('Make sure you have an admin user with that exact username.');
    } else {
      console.log('\n✅ User "admin" exists and is configured correctly.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkAdminCredentials();
