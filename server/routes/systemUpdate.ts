import { Request, Response, Router } from "express";
import fs from "fs";
import path from "path";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { createBackup } from "../services/backupService.js";
import {
    applyStagedUpdate,
    checkForReleaseUpdates,
    downloadReleaseZip,
    extractReleaseBundle,
    fetchLatestRelease,
} from "../services/githubReleaseService.js";
import { checkForUpdates, pullApplicationUpdate } from "../services/gitUpdateService.js";
import { maintenanceService } from "../services/maintenanceService.js";
import { executePendingMigrations } from "../services/migrationService.js";
import { getVersionStatus, updateInstalledVersion } from "../services/versionService.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { broadcastServerMaintenance } from "../ws.js";

const router = Router();

// ─── GET /api/system-update/version ─────────────────────────────────────────
router.get("/version", authenticate, async (req: Request, res: Response) => {
  try {
    const status = await getVersionStatus();
    
    // Optionally augment with latest release info if reachable
    let releaseInfo = null;
    try {
      const check = await checkForReleaseUpdates();
      if (check.release) {
        releaseInfo = {
          latestVersion: check.latestVersion,
          releaseName: check.release.name,
          releaseNotes: check.release.body,
          publishedAt: check.release.publishedAt,
          hasUpdate: check.hasUpdate,
        };
      }
    } catch {
      // Offline or GitHub unreachable - proceed with local status
    }

    res.status(200).json({
      ...status,
      releaseInfo,
    });
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

    const updateInstalled = Boolean(
      clientVersion && clientVersion !== status.installedVersion
    );

    res.status(200).json({
      installedVersion: status.installedVersion,
      updateInstalled,
    });
  } catch (error) {
    console.error("[systemUpdate/check] Error:", error);
    res.status(500).json({ message: "Failed to check for updates" });
  }
});

// ─── POST /api/system-update/fetch ───────────────────────────────────────────
// Check for available updates via GitHub Releases (or Git fallback)
router.post("/fetch", authenticate, requireRole("Admin"), async (req: Request, res: Response) => {
  try {
    const versionStatus = await getVersionStatus();
    let releaseCheck = null;

    try {
      releaseCheck = await checkForReleaseUpdates();
    } catch (ghErr: any) {
      console.log("[systemUpdate/fetch] GitHub check skipped/unavailable:", ghErr.message);
    }

    if (releaseCheck?.release) {
      const hasUpdates = releaseCheck.hasUpdate || versionStatus.databaseUpdateRequired;
      return res.status(200).json({
        ...versionStatus,
        message: hasUpdates ? "New release update available" : "Already running latest version",
        hasUpdates,
        updateAvailable: releaseCheck.hasUpdate,
        downloadedVersion: releaseCheck.latestVersion,
        release: releaseCheck.release,
      });
    }

    // Fallback: Git comparison
    try {
      const gitFetch = await checkForUpdates();
      return res.status(200).json({
        message: gitFetch.hasUpdates ? "Updates are available" : "Already up to date",
        hasUpdates: gitFetch.hasUpdates,
        ...versionStatus,
      });
    } catch {
      return res.status(200).json({
        message: "Already up to date",
        hasUpdates: false,
        ...versionStatus,
      });
    }
  } catch (error) {
    console.error("[systemUpdate/fetch] Error:", error);
    res.status(500).json({ message: "Failed to check for updates" });
  }
});

// ─── POST /api/system-update/install ──────────────────────────────────────────
router.post("/install", authenticate, requireRole("Admin"), async (req: Request, res: Response) => {
  if (!maintenanceService.enter()) {
    return res.status(409).json({ message: "An update or maintenance operation is already in progress" });
  }

  // Notify all connected terminals in real time that maintenance is starting
  broadcastServerMaintenance({
    status: "started",
    message: "System update in progress. Server will restart momentarily.",
  });

  let keepMaintenance = false;
  const tempDir = path.resolve(process.cwd(), "temp-update");
  const tempZipPath = path.join(tempDir, "isra-pos-update.zip");
  const stagingDir = path.join(tempDir, "staging");

  try {
    const userId = req.user!.id;
    const drained = await maintenanceService.waitForDrain();
    if (!drained) {
      return res.status(409).json({
        message: "Active transactions did not finish before the update timeout",
        activeOperations: maintenanceService.activeOperationCount(),
      });
    }

    // Step 1: Check GitHub Release
    let releaseInfo = null;
    try {
      releaseInfo = await fetchLatestRelease();
    } catch (err: any) {
      console.log("[systemUpdate/install] GitHub Release fetch warning:", err.message);
    }

    let targetAppVersion = "";
    let targetDbVersion = "";

    // Step 2: Download & unpack pre-built release bundle if available
    if (releaseInfo?.zipAssetUrl) {
      console.log(`[systemUpdate/install] Downloading release ${releaseInfo.tagName}...`);
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });

      await downloadReleaseZip(releaseInfo.zipAssetUrl, tempZipPath);
      console.log("[systemUpdate/install] Extracting release bundle...");
      await extractReleaseBundle(tempZipPath, stagingDir);

      // Step 3: Create database pre-update backup
      console.log("[systemUpdate/install] Creating pre-update backup...");
      const backupResult = await createBackup(userId, "pre_update");
      if (!backupResult.success) {
        return res.status(500).json({
          message: "Failed to create backup before update",
          error: backupResult.error,
        });
      }

      // Read target version from staging config if available
      const stagingVersionPath = path.join(stagingDir, "config", "version.json");
      if (fs.existsSync(stagingVersionPath)) {
        try {
          const vData = JSON.parse(fs.readFileSync(stagingVersionPath, "utf-8"));
          targetAppVersion = vData.applicationVersion || releaseInfo.version;
          targetDbVersion = vData.databaseVersion || "000";
        } catch {
          targetAppVersion = releaseInfo.version;
        }
      } else {
        targetAppVersion = releaseInfo.version;
      }

      // Step 4: Apply staging files
      console.log("[systemUpdate/install] Applying staged files...");
      await applyStagedUpdate(stagingDir);

      // Get backup ID for migration history
      const [backupRows] = await (await import("../db.js")).pool.execute<any[]>(
        "SELECT id FROM backup_metadata WHERE filename = ? ORDER BY created_at DESC LIMIT 1",
        [backupResult.filename || ""]
      );
      const backupId = backupRows[0]?.id;

      // Step 5: Execute pending migrations
      keepMaintenance = true;
      console.log("[systemUpdate/install] Executing pending migrations...");
      const migrationResult = await executePendingMigrations(userId, backupId);
      if (!migrationResult.success) {
        return res.status(500).json({
          message: "Migration failed. Maintenance Mode remains enabled; restore verified pre-update backup.",
          error: migrationResult.error,
        });
      }

      // Step 6: Update database version
      const statusAfterUpdate = await getVersionStatus();
      await updateInstalledVersion(
        targetAppVersion || statusAfterUpdate.downloadedVersion,
        statusAfterUpdate.downloadedDatabaseVersion
      );

      // Step 7: Log audit event
      await logAuditEvent({
        action: "UPDATE_INSTALLED",
        performedById: userId,
        performedByUsername: req.user!.username,
        entityType: "system_update",
        metadata: {
          previousVersion: statusAfterUpdate.installedVersion,
          newVersion: targetAppVersion || statusAfterUpdate.downloadedVersion,
          migrationsExecuted: migrationResult.executed,
          releaseSource: "github_release",
        },
      });

      // Cleanup temp directory
      try {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}

      keepMaintenance = false;
      maintenanceService.exit();

      console.log("[systemUpdate/install] Update applied. Triggering process restart...");
      setTimeout(() => {
        process.exit(0); // NSSM Windows Service restarts the server
      }, 1000);

      return res.status(200).json({
        message: "Update installed successfully",
        newVersion: targetAppVersion || statusAfterUpdate.downloadedVersion,
        migrationsExecuted: migrationResult.executed,
      });
    }

    // ─── Git Fallback (Development Environment) ─────────────────────────────
    console.log("[systemUpdate/install] Running Git fallback update...");
    const pullResult = await pullApplicationUpdate();
    const versionStatus = await getVersionStatus();

    const backupResult = await createBackup(userId, "pre_update");
    if (!backupResult.success) {
      return res.status(500).json({ message: "Failed to create backup", error: backupResult.error });
    }

    const [backupRows] = await (await import("../db.js")).pool.execute<any[]>(
      "SELECT id FROM backup_metadata WHERE filename = ? ORDER BY created_at DESC LIMIT 1",
      [backupResult.filename || ""]
    );
    const backupId = backupRows[0]?.id;

    keepMaintenance = true;
    const migrationResult = await executePendingMigrations(userId, backupId);
    if (!migrationResult.success) {
      return res.status(500).json({ message: "Migration failed", error: migrationResult.error });
    }

    await updateInstalledVersion(versionStatus.downloadedVersion, versionStatus.downloadedDatabaseVersion);

    await logAuditEvent({
      action: "UPDATE_INSTALLED",
      performedById: userId,
      performedByUsername: req.user!.username,
      entityType: "system_update",
      metadata: {
        previousVersion: versionStatus.installedVersion,
        newVersion: versionStatus.downloadedVersion,
        migrationsExecuted: migrationResult.executed,
        releaseSource: "git_pull",
      },
    });

    keepMaintenance = false;
    maintenanceService.exit();

    setTimeout(() => {
      process.exit(0);
    }, 1000);

    return res.status(200).json({
      message: "Update installed successfully",
      newVersion: versionStatus.downloadedVersion,
      migrationsExecuted: migrationResult.executed,
    });
  } catch (error: any) {
    console.error("[systemUpdate/install] Error:", error);
    res.status(500).json({ message: "Failed to install update", error: error.message });
  } finally {
    if (!keepMaintenance) {
      maintenanceService.exit();
      broadcastServerMaintenance({ status: "ended" });
    }
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

// ─── POST /api/system-update/reset-maintenance ───────────────────────────────
router.post("/reset-maintenance", authenticate, requireRole("Admin"), (req: Request, res: Response) => {
  const wasMaintenance = maintenanceService.isMaintenanceMode();
  if (wasMaintenance) {
    maintenanceService.exit();
    broadcastServerMaintenance({ status: "ended" });
  }
  res.status(200).json({
    message: wasMaintenance ? "Maintenance mode cleared" : "System was not in maintenance mode",
  });
});

// ─── GET /api/system-update/migration-history ────────────────────────────────
router.get("/migration-history", authenticate, async (req: Request, res: Response) => {
  try {
    const { getMigrationHistory } = await import("../services/migrationService.js");
    const history = await getMigrationHistory(100);
    res.status(200).json(history);
  } catch (error) {
    console.error("[systemUpdate/migration-history] Error:", error);
    res.status(500).json({ message: "Failed to get migration history" });
  }
});

// ─── GET /api/system-update/backup-history ───────────────────────────────────
router.get("/backup-history", authenticate, async (req: Request, res: Response) => {
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
