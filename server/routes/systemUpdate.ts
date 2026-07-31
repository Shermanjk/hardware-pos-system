import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import {
  getVersionStatus,
  updateInstalledVersion,
} from "../services/versionService.js";
import {
  createBackup,
} from "../services/backupService.js";
import {
  executePendingMigrations,
  rollbackToBackup,
  autoMigrateAfterRestore,
} from "../services/migrationService.js";
import { triggerElectronRestart } from "../utils/electronRestart.js";

const router = Router();
router.use(authenticate);

// ─── GET /api/system-update/version ─────────────────────────────────────────
router.get("/version", async (req: Request, res: Response) => {
  try {
    const status = await getVersionStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error("[systemUpdate/version] Error:", error);
    res.status(500).json({ message: "Failed to get version status" });
  }
});

// ─── POST /api/system-update/install ──────────────────────────────────────────
router.post("/install", requireRole("Admin"), async (req: Request, res: Response) => {

  try {
    const userId = req.user!.id;
    const versionStatus = await getVersionStatus();

    if (!versionStatus.updateAvailable) {
      return res.status(400).json({ message: "No update available" });
    }

    // Step 1: Create backup
    const backupResult = await createBackup(userId, "pre_update");
    if (!backupResult.success) {
      return res.status(500).json({
        message: "Failed to create backup before update",
        error: backupResult.error,
      });
    }

    // Get backup ID from metadata
    const [backupRows] = await (await import("../db.js")).pool.execute<any[]>(
      "SELECT id FROM backup_metadata WHERE filename = ? ORDER BY created_at DESC LIMIT 1",
      [backupResult.filename || ""]
    );
    const backupId = backupRows[0]?.id;

    // Step 2: Execute migrations
    const migrationResult = await executePendingMigrations(userId, backupId);
    if (!migrationResult.success) {
      // Rollback to backup
      await rollbackToBackup(backupId!, userId);
      return res.status(500).json({
        message: "Migration failed, database rolled back",
        error: migrationResult.error,
      });
    }

    // Step 3: Update installed version
    await updateInstalledVersion(
      versionStatus.downloadedVersion,
      versionStatus.downloadedDatabaseVersion
    );

    // Step 4: Log audit event
    await logAuditEvent({
      action: "UPDATE_INSTALLED",
      performedById: userId,
      performedByUsername: req.user!.username,
      entityType: "system_update",
      metadata: {
        previousVersion: versionStatus.installedVersion,
        newVersion: versionStatus.downloadedVersion,
        migrationsExecuted: migrationResult.executed,
      },
    });

    // Step 5: Trigger Electron restart
    await triggerElectronRestart();

    res.status(200).json({
      message: "Update installed successfully",
      previousVersion: versionStatus.installedVersion,
      newVersion: versionStatus.downloadedVersion,
      migrationsExecuted: migrationResult.executed,
    });
  } catch (error) {
    console.error("[systemUpdate/install] Error:", error);
    res.status(500).json({ message: "Failed to install update" });
  }
});

// ─── GET /api/system-update/migration-history ────────────────────────────────
router.get("/migration-history", async (req: Request, res: Response) => {
  try {
    const { getMigrationHistory } = await import(
      "../services/migrationService.js"
    );
    const history = await getMigrationHistory(100);
    res.status(200).json(history);
  } catch (error) {
    console.error("[systemUpdate/migration-history] Error:", error);
    res.status(500).json({ message: "Failed to get migration history" });
  }
});

// ─── GET /api/system-update/backup-history ───────────────────────────────────
router.get("/backup-history", async (req: Request, res: Response) => {
  try {
    const { getBackupHistory } = await import("../services/backupService.js");
    const history = await getBackupHistory(100);
    res.status(200).json(history);
  } catch (error) {
    console.error("[systemUpdate/backup-history] Error:", error);
    res.status(500).json({ message: "Failed to get backup history" });
  }
});

export default router;
