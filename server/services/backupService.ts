import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { verifyBackupFile } from "../utils/backupVerifier.js";

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

function readBackupConfig(): { localBackupDirectory?: string } {
  const candidates = [
    path.resolve(__dirname, "../../config/backup.json"),
    path.resolve(__dirname, "../config/backup.json"),
    path.resolve(process.cwd(), "config/backup.json"),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      }
    } catch {}
  }
  return { localBackupDirectory: "E:\\Database Backup" };
}

async function getEffectiveBackupDirectory(): Promise<string> {
  let preferredDir: string | undefined;

  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT local_backup_directory FROM backup_settings WHERE id = 1 LIMIT 1"
    );
    if (rows && rows.length > 0 && rows[0].local_backup_directory) {
      preferredDir = String(rows[0].local_backup_directory).trim();
    }
  } catch (err) {
    console.warn("[backupService] Could not query backup_settings table:", err);
  }

  if (!preferredDir) {
    const config = readBackupConfig();
    preferredDir = config.localBackupDirectory;
  }

  return getValidBackupDirectory(preferredDir);
}

function getValidBackupDirectory(preferredDir?: string): string {
  // 1. Try preferred directory
  if (preferredDir && preferredDir.trim().length > 0) {
    const cleanDir = preferredDir.trim();
    try {
      if (!fs.existsSync(cleanDir)) {
        fs.mkdirSync(cleanDir, { recursive: true });
      }
      return cleanDir;
    } catch (err) {
      console.warn(`[backupService] Cannot use preferred backup directory '${cleanDir}':`, err);
    }
  }

  // 2. Try C:\POS-Backups
  const fallbackC = "C:\\POS-Backups";
  try {
    if (!fs.existsSync(fallbackC)) {
      fs.mkdirSync(fallbackC, { recursive: true });
    }
    return fallbackC;
  } catch {}

  // 3. Fallback to local backups in current working directory
  const fallbackLocal = path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(fallbackLocal)) {
    fs.mkdirSync(fallbackLocal, { recursive: true });
  }
  return fallbackLocal;
}

function findMysqldump(): string {
  if (process.env.MYSQLDUMP_PATH && fs.existsSync(process.env.MYSQLDUMP_PATH)) {
    return process.env.MYSQLDUMP_PATH;
  }

  const commonLocations = [
    "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.1\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.2\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 8.3\\bin\\mysqldump.exe",
    "C:\\Program Files\\MySQL\\MySQL Server 9.0\\bin\\mysqldump.exe",
    "C:\\Program Files (x86)\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe",
    "C:\\xampp\\mysql\\bin\\mysqldump.exe",
    "C:\\laragon\\bin\\mysql\\current\\bin\\mysqldump.exe",
  ];

  for (const loc of commonLocations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return "mysqldump";
}

/**
 * Execute mysqldump to create a backup
 */
export async function createBackup(
  userId: number,
  backupType: "manual" | "pre_update" | "daily" = "manual"
): Promise<BackupResult> {
  const backupDir = await getEffectiveBackupDirectory();
  return new Promise((resolve) => {
    try {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `hardware_pos_${timestamp}.sql`;
      const filePath = path.join(backupDir, filename);

      const dbHost = process.env.DB_HOST || "127.0.0.1";
      const dbPort = process.env.DB_PORT || "3306";
      const dbUser = process.env.DB_USER || "root";
      const dbPassword = process.env.DB_PASSWORD || "";
      const dbName = process.env.DB_NAME || "hardware_pos";

      const mysqldumpBin = findMysqldump();
      const passwordArg = dbPassword ? `--password="${dbPassword}"` : "";
      const normalizedResultFile = filePath.replace(/\\/g, "/");
      const command = `"${mysqldumpBin}" --host=${dbHost} --port=${dbPort} --user=${dbUser} ${passwordArg} --single-transaction --routines --triggers --events --add-drop-database --databases ${dbName} --result-file="${normalizedResultFile}"`;

      exec(command, { timeout: 180_000 }, async (error, stdout, stderr) => {
        if (error) {
          console.error("[backupService] Backup command failed:", stderr || error.message);
          resolve({
            success: false,
            error: stderr || error.message,
          });
          return;
        }

        try {
          if (!fs.existsSync(filePath)) {
            resolve({
              success: false,
              error: "Backup file was not created",
            });
            return;
          }

          const stats = fs.statSync(filePath);
          const verification = await verifyBackupFile(filePath);

          if (verification.valid) {
            const [versionRows] = await pool.execute<any[]>(
              "SELECT * FROM system_version WHERE id = 1 LIMIT 1"
            );
            const version = versionRows[0];

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

            await logAuditEvent({
              action: "BACKUP_CREATED",
              performedById: userId,
              performedByUsername: "system",
              entityType: "backup",
              metadata: {
                filename,
                backupType,
                fileSize: stats.size,
              },
            });

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
        } catch (err: any) {
          console.error("[backupService] Error verifying backup file:", err);
          resolve({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      });
    } catch (err: any) {
      console.error("[backupService] Failed to initialize backup:", err);
      resolve({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
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
    const [backupRows] = await pool.execute<any[]>(
      "SELECT * FROM backup_metadata WHERE id = ?",
      [backupId]
    );
    const backup = backupRows[0];

    if (!backup) {
      return { success: false, error: "Backup not found" };
    }

    if (!fs.existsSync(backup.file_path)) {
      return { success: false, error: "Backup file not found" };
    }

    const sql = fs.readFileSync(backup.file_path, "utf-8");
    await pool.query(sql);

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
    const [rows] = await pool.execute<any[]>(
      `SELECT created_at FROM backup_metadata 
       WHERE DATE(created_at) = CURDATE()
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (rows.length > 0) {
      return { exists: true, lastBackup: rows[0].created_at };
    }

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
