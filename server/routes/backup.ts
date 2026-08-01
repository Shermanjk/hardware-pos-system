import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import {
  createBackup,
  restoreBackup,
  getBackupHistory,
  getPendingUploads,
  getTodayBackupStatus,
} from "../services/backupService.js";
import { uploadPendingBackups, testGoogleDriveConnection } from "../services/googleDriveService.js";

const router = Router();
router.use(authenticate);

// ─── POST /api/backup/create ────────────────────────────────────────────────
router.post("/create", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await createBackup(userId, "manual");

    if (result.success) {
      res.status(200).json({
        success: true,
        message: "Backup created successfully",
        filename: result.filename,
        filePath: result.filePath,
        fileSize: result.fileSize,
        stats: result.stats,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to create backup",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[backup/create] Error:", error);
    res.status(500).json({ message: "Failed to create backup" });
  }
});

// ─── POST /api/backup/restore/:id ─────────────────────────────────────────────
router.post("/restore/:id", requireRole("Admin"), async (req: Request, res: Response) => {
  try {
    const backupId = parseInt(req.params.id);
    const userId = req.user!.id;

    const result = await restoreBackup(backupId, userId);

    if (result.success) {
      // Auto-migrate after restore
      const { autoMigrateAfterRestore } = await import("../services/migrationService.js");
      const migrateResult = await autoMigrateAfterRestore(userId);

      res.status(200).json({
        message: "Backup restored successfully",
        migrationsExecuted: migrateResult.executed,
      });
    } else {
      res.status(500).json({
        message: "Failed to restore backup",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[backup/restore] Error:", error);
    res.status(500).json({ message: "Failed to restore backup" });
  }
});

// ─── GET /api/backup/pending-uploads ──────────────────────────────────────────
router.get("/pending-uploads", async (req: Request, res: Response) => {
  try {
    const pending = await getPendingUploads();
    res.status(200).json(pending);
  } catch (error) {
    console.error("[backup/pending-uploads] Error:", error);
    res.status(500).json({ message: "Failed to get pending uploads" });
  }
});

// ─── POST /api/backup/upload-pending/:id ──────────────────────────────────────
router.post("/upload-pending/:id", async (req: Request, res: Response) => {
  try {
    const backupId = parseInt(req.params.id);
    const { getPendingUploads, updateGoogleDriveStatus } = await import("../services/backupService.js");
    const { uploadToGoogleDrive } = await import("../services/googleDriveService.js");

    const pending = await getPendingUploads();
    const backup = pending.find((b) => b.id === backupId);

    if (!backup) {
      return res.status(404).json({ message: "Backup not found" });
    }

    const result = await uploadToGoogleDrive(backup.file_path, backup.filename);

    if (result.success && result.fileId) {
      await updateGoogleDriveStatus(backupId, "success", result.fileId);
      await logAuditEvent({
        action: "BACKUP_UPLOADED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "backup",
        entityId: backupId,
        metadata: {
          filename: backup.filename,
          fileId: result.fileId,
        },
      });
      res.status(200).json({ message: "Upload successful", fileId: result.fileId });
    } else {
      await updateGoogleDriveStatus(backupId, "failed");
      res.status(500).json({
        message: "Upload failed",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("[backup/upload-pending] Error:", error);
    res.status(500).json({ message: "Failed to upload backup" });
  }
});

// ─── POST /api/backup/upload-all-pending ──────────────────────────────────────
router.post("/upload-all-pending", async (req: Request, res: Response) => {
  try {
    await uploadPendingBackups();
    res.status(200).json({ message: "Pending uploads processed" });
  } catch (error) {
    console.error("[backup/upload-all-pending] Error:", error);
    res.status(500).json({ message: "Failed to process pending uploads" });
  }
});

// ─── GET /api/backup/settings ────────────────────────────────────────────────
router.get("/settings", async (req: Request, res: Response) => {
  try {
    const [rows] = await (await import("../db.js")).pool.execute<any[]>(
      "SELECT * FROM backup_settings WHERE id = 1 LIMIT 1"
    );
    const row = rows[0] || {};
    res.status(200).json(row);
  } catch (error) {
    console.error("[backup/settings] Error:", error);
    res.status(500).json({ message: "Failed to get backup settings" });
  }
});

// ─── PUT /api/backup/settings ────────────────────────────────────────────────
router.put("/settings", requireRole("Admin"), async (req: Request, res: Response) => {
  try {
    const {
      backup_reminder_time,
      backup_reminder_enabled,
      local_backup_directory,
      google_drive_folder_url,
      google_drive_folder_id,
      max_local_backups,
      automatic_cleanup_enabled,
    } = req.body;

    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];

    if (backup_reminder_time !== undefined) {
      setClauses.push("backup_reminder_time = ?");
      values.push(backup_reminder_time);
    }
    if (backup_reminder_enabled !== undefined) {
      setClauses.push("backup_reminder_enabled = ?");
      values.push(backup_reminder_enabled);
    }
    if (local_backup_directory !== undefined) {
      setClauses.push("local_backup_directory = ?");
      values.push(local_backup_directory);
    }
    if (google_drive_folder_url !== undefined) {
      setClauses.push("google_drive_folder_url = ?");
      values.push(google_drive_folder_url);
    }
    if (google_drive_folder_id !== undefined) {
      setClauses.push("google_drive_folder_id = ?");
      values.push(google_drive_folder_id);
    }
    if (max_local_backups !== undefined) {
      setClauses.push("max_local_backups = ?");
      values.push(max_local_backups);
    }
    if (automatic_cleanup_enabled !== undefined) {
      setClauses.push("automatic_cleanup_enabled = ?");
      values.push(automatic_cleanup_enabled);
    }

    values.push(1); // WHERE id = 1

    await (await import("../db.js")).pool.execute(
      `UPDATE backup_settings SET ${setClauses.join(", ")} WHERE id = ?`,
      values as any[]
    );

    // Fetch updated settings
    const [rows] = await (await import("../db.js")).pool.execute<any[]>(
      "SELECT * FROM backup_settings WHERE id = 1 LIMIT 1"
    );
    const row = rows[0] || {};

    await logAuditEvent({
      action: "SYSTEM_SETTINGS_UPDATED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "backup_settings",
      entityId: 1,
      newValues: req.body,
    });

    res.status(200).json(row);
  } catch (error) {
    console.error("[backup/settings PUT] Error:", error);
    res.status(500).json({ message: "Failed to update backup settings" });
  }
});

// ─── GET /api/backup/today-status ───────────────────────────────────────────────
router.get("/today-status", async (req: Request, res: Response) => {
  try {
    const status = await getTodayBackupStatus();
    res.status(200).json(status);
  } catch (error) {
    console.error("[backup/today-status] Error:", error);
    res.status(500).json({ message: "Failed to check today's backup status" });
  }
});

// ─── POST /api/backup/test-google-drive ────────────────────────────────────────
router.post("/test-google-drive", requireRole("Admin"), async (req: Request, res: Response) => {
  try {
    const result = await testGoogleDriveConnection();
    res.status(200).json(result);
  } catch (error) {
    console.error("[backup/test-google-drive] Error:", error);
    res.status(500).json({ message: "Failed to test Google Drive connection" });
  }
});

export default router;
