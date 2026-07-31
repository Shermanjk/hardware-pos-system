import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { verifyBackupFile } from "../utils/backupVerifier.js";
import { uploadToGoogleDrive } from "./googleDriveService";
import { logAuditEvent } from "../utils/auditLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BackupResult {
  success: boolean;
  filename?: string;
  filePath?: string;
  fileSize?: number;
  error?: string;
  stats?: {
    tables: number;
    rows: number;
  };
}

interface BackupMetadata {
  id: number;
  filename: string;
  file_path: string;
  file_size: number;
  application_version: string;
  database_version: string;
  backup_type: string;
  local_status: string;
  google_drive_status: string;
  google_drive_file_id: string | null;
  created_by: number;
  created_at: Date;
}

/**
 * Execute mysqldump to create a backup
 */
export async function createBackup(
  userId: number,
  backupType: "manual" | "pre_update" | "daily" = "manual"
): Promise<BackupResult> {
  return new Promise((resolve) => {
    // Read backup configuration
    const configPath = path.resolve(__dirname, "../../config/backup.json");
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent);

    const backupDir = config.localBackupDirectory || "E:\\Database Backup";

    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Generate timestamp for filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `hardware_pos_${timestamp}.sql`;
    const filePath = path.join(backupDir, filename);

    // Get database credentials from environment or use defaults
    const dbHost = process.env.DB_HOST || "127.0.0.1";
    const dbPort = process.env.DB_PORT || "3306";
    const dbUser = process.env.DB_USER || "root";
    const dbPassword = process.env.DB_PASSWORD || "";
    const dbName = process.env.DB_NAME || "hardware_pos";

    // Path to mysqldump
    const mysqldumpPath = "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe";

    // Build mysqldump command as a single string with comprehensive options
    const command = `"${mysqldumpPath}" --host=${dbHost} --port=${dbPort} --user=${dbUser} --password=${dbPassword} --single-transaction --routines --triggers --events --add-drop-database --databases ${dbName} --result-file="${filePath}"`;

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error("[backupService] Backup script failed:", stderr || error.message);
        resolve({
          success: false,
          error: stderr || error.message,
        });
        return;
      }

      // Command succeeded - verify the backup file was created
      try {
        if (!fs.existsSync(filePath)) {
          resolve({
            success: false,
            error: "Backup file was not created",
          });
          return;
        }

        const stats = fs.statSync(filePath);

        // Verify the backup file
        const verification = await verifyBackupFile(filePath);

        if (verification.valid) {
          // Get current versions
          const [versionRows] = await pool.execute<any[]>(
            "SELECT * FROM system_version WHERE id = 1 LIMIT 1"
          );
          const version = versionRows[0];

          // Save metadata to database
          await pool.execute(
            `INSERT INTO backup_metadata
               (filename, file_path, file_size, application_version, database_version,
                backup_type, local_status, google_drive_status, created_by)
               VALUES (?, ?, ?, ?, ?, ?, 'success', 'pending', ?)`,
            [
              filename,
              filePath,
              stats.size,
              version?.application_version || "1.0.0",
              version?.database_version || "030",
              backupType,
              userId,
            ]
          );

          // Log audit event
          await logAuditEvent({
            action: "BACKUP_CREATED",
            performedById: userId,
            performedByUsername: "system", // Will be updated by caller
            entityType: "backup",
            metadata: {
              filename,
              backupType,
              fileSize: stats.size,
            },
          });

          // Google Drive upload disabled - using local backups only
          // uploadToGoogleDrive(filePath, filename).catch(
          //   (err: unknown) => {
          //     console.error("[backupService] Google Drive upload failed:", err);
          //   }
          // );

          resolve({
            success: true,
            filename,
            filePath,
            fileSize: stats.size,
            stats: {
              tables: verification.stats?.tables || 0,
              rows: verification.stats?.rows || 0,
            },
          });
        } else {
          resolve({
            success: false,
            error: verification.error || "Backup verification failed",
          });
        }
      } catch (err) {
        console.error("[backupService] Error processing backup file:", err);
        resolve({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  });
}

/**
 * Restore database from backup file
 */
export async function restoreBackup(
  backupId: number,
  userId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get backup metadata
    const [backupRows] = await pool.execute<any[]>(
      "SELECT * FROM backup_metadata WHERE id = ?",
      [backupId]
    );
    const backup = backupRows[0];

    if (!backup) {
      return { success: false, error: "Backup not found" };
    }

    // Verify backup file exists
    if (!fs.existsSync(backup.file_path)) {
      return { success: false, error: "Backup file not found" };
    }

    // Read and execute SQL
    const sql = fs.readFileSync(backup.file_path, "utf-8");
    await pool.query(sql);

    // Log audit event
    await logAuditEvent({
      action: "RESTORE_EXECUTED",
      performedById: userId,
      performedByUsername: "system",
      entityType: "backup",
      entityId: backupId,
      metadata: {
        filename: backup.filename,
        backupDatabaseVersion: backup.database_version,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[backupService] Restore failed:", error);
    await logAuditEvent({
      action: "BACKUP_FAILED",
      performedById: userId,
      performedByUsername: "system",
      entityType: "backup",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get backup history
 */
export async function getBackupHistory(limit = 50): Promise<BackupMetadata[]> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT bm.*, u.username as created_by_username
       FROM backup_metadata bm
       LEFT JOIN users u ON bm.created_by = u.id
       ORDER BY bm.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  } catch (error) {
    console.error("[backupService] Failed to get backup history:", error);
    return [];
  }
}

/**
 * Get backups pending Google Drive upload
 */
export async function getPendingUploads(): Promise<BackupMetadata[]> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT * FROM backup_metadata 
       WHERE google_drive_status = 'pending' 
       ORDER BY created_at ASC`
    );
    return rows;
  } catch (error) {
    console.error("[backupService] Failed to get pending uploads:", error);
    return [];
  }
}

/**
 * Check if today's backup exists
 */
export async function getTodayBackupStatus(): Promise<{
  exists: boolean;
  lastBackup?: Date;
}> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [rows] = await pool.execute<any[]>(
      `SELECT created_at FROM backup_metadata 
       WHERE DATE(created_at) = CURDATE()
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (rows.length > 0) {
      return { exists: true, lastBackup: rows[0].created_at };
    }

    // Get last backup date
    const [lastRows] = await pool.execute<any[]>(
      `SELECT created_at FROM backup_metadata 
       ORDER BY created_at DESC
       LIMIT 1`
    );

    return {
      exists: false,
      lastBackup: lastRows.length > 0 ? lastRows[0].created_at : undefined,
    };
  } catch (error) {
    console.error("[backupService] Failed to check today's backup:", error);
    return { exists: false };
  }
}

/**
 * Update Google Drive upload status
 */
export async function updateGoogleDriveStatus(
  backupId: number,
  status: "success" | "failed",
  fileId?: string
): Promise<void> {
  try {
    if (status === "success" && fileId) {
      await pool.execute(
        `UPDATE backup_metadata 
         SET google_drive_status = 'success', google_drive_file_id = ?
         WHERE id = ?`,
        [fileId, backupId]
      );
    } else {
      await pool.execute(
        `UPDATE backup_metadata 
         SET google_drive_status = 'failed'
         WHERE id = ?`,
        [backupId]
      );
    }
  } catch (error) {
    console.error("[backupService] Failed to update Google Drive status:", error);
  }
}
