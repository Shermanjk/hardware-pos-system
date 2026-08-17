import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";
import { logAuditEvent } from "../utils/auditLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrationFile {
  number: string;
  filename: string;
  path: string;
}

interface MigrationRecord {
  id: number;
  migration_number: string;
  description: string;
  execution_time: Date;
  applied_date: Date;
  status: string;
  executed_by: number;
  backup_id: number | null;
}

/**
 * Get list of migration files from migrations directory
 */
function getMigrationFiles(): MigrationFile[] {
  const candidates = [
    path.resolve(__dirname, "../../migrations"),
    path.resolve(__dirname, "../migrations"),
    path.resolve(process.cwd(), "migrations"),
  ];

  const migrationsDir = candidates.find((dir) => fs.existsSync(dir));
  if (!migrationsDir) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir);
  const migrationFiles = files
    .filter((f) => f.match(/^\d+_[^.]+\.sql$/))
    .map((f) => ({
      number: f.split("_")[0],
      filename: f,
      path: path.join(migrationsDir, f),
    }))
    .sort((a, b) => parseInt(a.number) - parseInt(b.number));

  return migrationFiles;
}

/**
 * Get the latest migration number available on disk (e.g. "043")
 */
export function getLatestAvailableDatabaseVersion(): string {
  const migrations = getMigrationFiles();
  if (migrations.length === 0) return "000";
  return migrations[migrations.length - 1].number;
}

/**
 * Get current database version from system_version table
 */
export async function getCurrentDatabaseVersion(): Promise<string> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT database_version FROM system_version WHERE id = 1 LIMIT 1"
    );
    return rows[0]?.database_version || "000";
  } catch (error) {
    console.error("[migrationService] Failed to get current version:", error);
    return "000";
  }
}

/**
 * Get list of pending migrations (not yet executed)
 */
export async function getPendingMigrations(): Promise<MigrationFile[]> {
  const currentVersion = await getCurrentDatabaseVersion();
  const currentNum = parseInt(currentVersion);

  const allMigrations = getMigrationFiles();
  return allMigrations.filter((m) => parseInt(m.number) > currentNum);
}

/**
 * Get migration history
 */
export async function getMigrationHistory(
  limit = 50
): Promise<MigrationRecord[]> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT mh.*, u.username as executed_by_username
       FROM migration_history mh
       LEFT JOIN users u ON mh.executed_by = u.id
       ORDER BY mh.applied_date DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  } catch (error) {
    console.error("[migrationService] Failed to get migration history:", error);
    return [];
  }
}

/**
 * Execute a single migration.
 * Opens a dedicated connection with multipleStatements enabled so migration
 * files can contain batches of statements (SET, PREPARE, EXECUTE, DDL, etc.)
 * without needing special escaping.
 */
async function executeMigration(
  migration: MigrationFile,
  userId: number,
  backupId?: number
): Promise<{ success: boolean; error?: string }> {
  const startTime = new Date();

  // Create a one-off connection with multipleStatements so that migration
  // files containing SET / PREPARE / EXECUTE blocks (and semicolon-separated
  // DDL batches) execute correctly. The shared pool deliberately omits this
  // flag to prevent SQL-injection via user-supplied multi-statement queries.
  const mysql = (await import("mysql2/promise")).default;

  // Read env vars directly (already validated at startup)
  const singleConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    connectTimeout: 30_000,
  });

  try {
    const sql = fs.readFileSync(migration.path, "utf-8");

    await singleConn.query(sql);

    const executionTime = new Date();
    await pool.execute(
      `INSERT INTO migration_history 
       (migration_number, description, execution_time, status, executed_by, backup_id)
       VALUES (?, ?, ?, 'success', ?, ?)`,
      [
        migration.number,
        migration.filename,
        executionTime,
        userId,
        backupId || null,
      ]
    );

    await pool.execute(
      `UPDATE system_version 
       SET database_version = ?, updated_at = NOW() 
       WHERE id = 1`,
      [migration.number]
    );

    console.log(
      `[migrationService] Migration ${migration.number} completed successfully`
    );

    return { success: true };
  } catch (error) {
    console.error(
      `[migrationService] Migration ${migration.number} failed:`,
      error
    );

    const executionTime = new Date();
    await pool.execute(
      `INSERT INTO migration_history 
       (migration_number, description, execution_time, status, executed_by, backup_id)
       VALUES (?, ?, ?, 'failed', ?, ?)`,
      [
        migration.number,
        migration.filename,
        executionTime,
        userId,
        backupId || null,
      ]
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    await singleConn.end();
  }
}

/**
 * Execute all pending migrations
 */
export async function executePendingMigrations(
  userId: number,
  backupId?: number
): Promise<{ success: boolean; executed: string[]; error?: string }> {
  const pendingMigrations = await getPendingMigrations();

  if (pendingMigrations.length === 0) {
    return { success: true, executed: [] };
  }

  const executed: string[] = [];

  for (const migration of pendingMigrations) {
    await logAuditEvent({
      action: "MIGRATION_STARTED",
      performedById: userId,
      performedByUsername: "system",
      entityType: "migration",
      metadata: {
        migrationNumber: migration.number,
        filename: migration.filename,
      },
    });

    const result = await executeMigration(migration, userId, backupId);

    if (result.success) {
      executed.push(migration.number);
      await logAuditEvent({
        action: "MIGRATION_COMPLETED",
        performedById: userId,
        performedByUsername: "system",
        entityType: "migration",
        metadata: {
          migrationNumber: migration.number,
          filename: migration.filename,
        },
      });
    } else {
      await logAuditEvent({
        action: "MIGRATION_FAILED",
        performedById: userId,
        performedByUsername: "system",
        entityType: "migration",
        metadata: {
          migrationNumber: migration.number,
          filename: migration.filename,
          error: result.error,
        },
      });

      return {
        success: false,
        executed,
        error: `Migration ${migration.number} failed: ${result.error}`,
      };
    }
  }

  return { success: true, executed };
}

/**
 * Rollback to a specific backup and restore database version
 */
export async function rollbackToBackup(
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

    // Restore backup
    const { restoreBackup } = await import("./backupService.js");
    const restoreResult = await restoreBackup(backupId, userId);

    if (!restoreResult.success) {
      return restoreResult;
    }

    // Update system_version to backup's database version
    if (backup.database_version) {
      await pool.execute(
        `UPDATE system_version 
         SET database_version = ?, updated_at = NOW() 
         WHERE id = 1`,
        [backup.database_version]
      );
    }

    return { success: true };
  } catch (error) {
    console.error("[migrationService] Rollback failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Auto-migrate after restore (run missing migrations)
 */
export async function autoMigrateAfterRestore(
  userId: number
): Promise<{ success: boolean; executed: string[]; error?: string }> {
  const pendingMigrations = await getPendingMigrations();

  if (pendingMigrations.length === 0) {
    return { success: true, executed: [] };
  }

  console.log(
    `[migrationService] Auto-migrating ${pendingMigrations.length} migrations after restore`
  );

  return executePendingMigrations(userId);
}
