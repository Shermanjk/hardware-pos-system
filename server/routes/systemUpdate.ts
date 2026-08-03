import { Router, Request, Response } from "express";
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
} from "../services/migrationService.js";
import { triggerElectronRestart } from "../utils/electronRestart.js";
import { maintenanceService } from "../services/maintenanceService.js";
import { buildApplicationUpdate, pullApplicationUpdate } from "../services/gitUpdateService.js";

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

// ─── GET /api/system-update/check ────────────────────────────────────────────
// Client polling endpoint to detect if an update was installed by another session
router.get("/check", async (req: Request, res: Response) => {
  try {
    const status = await getVersionStatus();
    const clientVersion = req.headers["x-client-version"] as string;
    
    // If client version differs from installed version, an update was installed
    const updateInstalled = clientVersion && clientVersion !== status.installedVersion;
    
    res.status(200).json({
      installedVersion: status.installedVersion,
      updateInstalled,
    });
  } catch (error) {
    console.error("[systemUpdate/check] Error:", error);
    res.status(500).json({ message: "Failed to check for updates" });
  }
});

// ─── POST /api/system-update/install ──────────────────────────────────────────
router.post("/install", requireRole("Admin"), async (req: Request, res: Response) => {
  if (!maintenanceService.enter()) {
    return res.status(409).json({ message: "An update or maintenance operation is already in progress" });
  }

  // Leave maintenance only when no database/application change was attempted.
  // After migrations begin, recovery must be deliberate; after success the
  // restarted process begins in normal mode.
  let keepMaintenance = false;
  try {
    const userId = req.user!.id;
    // Maintenance first blocks all new writes. Existing critical work is allowed
    // to finish before backup, source update, or migrations begin.
    const drained = await maintenanceService.waitForDrain();
    if (!drained) {
      return res.status(409).json({
        message: "Active transactions did not finish before the update timeout",
        activeOperations: maintenanceService.activeOperationCount(),
      });
    }

    // Update the working tree before reading the target versions so migrations
    // always come from the exact application revision being installed.
    const pullResult = await pullApplicationUpdate();
    const versionStatus = await getVersionStatus();

    if (!pullResult.changed && !versionStatus.updateAvailable && !versionStatus.databaseUpdateRequired) {
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
    keepMaintenance = true;
    const migrationResult = await executePendingMigrations(userId, backupId);
    if (!migrationResult.success) {
      return res.status(500).json({
        message: "Migration failed. Maintenance Mode remains enabled; restore the verified pre-update backup only under an explicit recovery procedure.",
        error: migrationResult.error,
      });
    }

    // Step 3: Install the lockfile-pinned dependencies and rebuild server-dist
    // and the web client. The existing shortcut continues to launch this folder.
    await buildApplicationUpdate();

    // Step 4: Update installed version
    // The database version is advanced by each successful forward-only
    // migration. Keep it unchanged when this release has no DB migration.
    await updateInstalledVersion(versionStatus.downloadedVersion, versionStatus.downloadedDatabaseVersion);

    // Step 5: Log audit event
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

    // Step 6: Trigger Electron restart
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
  } finally {
    if (!keepMaintenance) maintenanceService.exit();
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
