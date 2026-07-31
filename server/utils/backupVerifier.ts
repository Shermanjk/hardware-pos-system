import fs from "fs";
import { pool } from "../db.js";

interface VerificationResult {
  valid: boolean;
  error?: string;
  stats?: {
    tables: number;
    rows: number;
    size: number;
  };
}

/**
 * Verify that a backup file is valid
 * Checks: file exists, readable, size > 0, contains SQL statements, table count, row count
 */
export async function verifyBackupFile(
  filePath: string
): Promise<VerificationResult> {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: "Backup file does not exist" };
    }

    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return { valid: false, error: "Backup file is empty" };
    }

    // Check if file is readable
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
      return { valid: false, error: "Backup file is not readable" };
    }

    // Read and check for SQL content
    const content = fs.readFileSync(filePath, "utf-8");

    // Check for common SQL dump keywords
    const sqlKeywords = [
      "CREATE TABLE",
      "INSERT INTO",
      "LOCK TABLES",
      "UNLOCK TABLES",
      "CREATE DATABASE",
    ];

    const hasSqlContent = sqlKeywords.some((keyword) =>
      content.includes(keyword)
    );

    if (!hasSqlContent) {
      return {
        valid: false,
        error: "Backup file does not contain valid SQL statements",
      };
    }

    // Count tables in backup file
    const createTableMatches = content.match(/CREATE TABLE/g);
    const tableCount = createTableMatches ? createTableMatches.length : 0;

    if (tableCount === 0) {
      return {
        valid: false,
        error: "Backup file contains no table definitions",
      };
    }

    // Count INSERT statements to estimate rows
    const insertMatches = content.match(/INSERT INTO/g);
    const insertCount = insertMatches ? insertMatches.length : 0;

    // Get actual table count from database for comparison
    const [dbTables] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ?",
      [process.env.DB_NAME || "hardware_pos"]
    );
    const actualTableCount = dbTables[0]?.count || 0;

    // Verify backup has at least 80% of tables (allowing for some system tables)
    if (tableCount < actualTableCount * 0.8) {
      return {
        valid: false,
        error: `Backup contains only ${tableCount} tables, expected at least ${Math.floor(actualTableCount * 0.8)}`,
      };
    }

    return {
      valid: true,
      stats: {
        tables: tableCount,
        rows: insertCount,
        size: stats.size,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown verification error",
    };
  }
}
