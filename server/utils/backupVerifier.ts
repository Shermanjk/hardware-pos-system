import fs from "fs";

interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify that a backup file is valid
 * Checks: file exists, readable, size > 0, contains SQL statements
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

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown verification error",
    };
  }
}
