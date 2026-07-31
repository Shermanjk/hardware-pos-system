import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { updateGoogleDriveStatus } from "./backupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface UploadResult {
  success: boolean;
  fileId?: string;
  error?: string;
}

/**
 * Initialize Google Drive API with Service Account
 */
function getDriveClient() {
  try {
    const configPath = path.resolve(__dirname, "../../config/backup.json");
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent);

    const keyPath = config.googleDriveServiceAccountKey;
    if (!keyPath || keyPath === "path/to/service-account-key.json") {
      console.error(
        "[googleDriveService] Service account key path not configured"
      );
      return null;
    }

    const keyFilePath = path.resolve(__dirname, "../../", keyPath);
    if (!fs.existsSync(keyFilePath)) {
      console.error(
        "[googleDriveService] Service account key file not found:",
        keyFilePath
      );
      return null;
    }

    const keyContent = fs.readFileSync(keyFilePath, "utf-8");
    const key = JSON.parse(keyContent);

    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    return google.drive({ version: "v3", auth });
  } catch (error) {
    console.error("[googleDriveService] Failed to initialize Drive client:", error);
    return null;
  }
}

/**
 * Upload file to Google Drive
 */
export async function uploadToGoogleDrive(
  filePath: string,
  filename: string
): Promise<UploadResult> {
  const drive = getDriveClient();
  if (!drive) {
    return { success: false, error: "Failed to initialize Google Drive client" };
  }

  try {
    const configPath = path.resolve(__dirname, "../../config/backup.json");
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent);

    const folderId = config.googleDriveFolderId;
    if (!folderId) {
      return { success: false, error: "Google Drive folder ID not configured" };
    }

    const fileMetadata = {
      name: filename,
      parents: [folderId],
    };

    const media = {
      mimeType: "application/x-sql",
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id",
    });

    const fileId = response.data.id;
    if (!fileId) {
      return { success: false, error: "Failed to get file ID from Google Drive" };
    }
    console.log(
      `[googleDriveService] File uploaded successfully: ${filename} (ID: ${fileId})`
    );

    // Find and update backup metadata
    // Note: This would need to be called with the backup ID from the caller
    // For now, we'll just return the file ID

    return { success: true, fileId };
  } catch (error) {
    console.error("[googleDriveService] Upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Upload pending backups to Google Drive
 */
export async function uploadPendingBackups(): Promise<void> {
  const { getPendingUploads } = await import("./backupService.js");
  const pendingBackups = await getPendingUploads();

  for (const backup of pendingBackups) {
    try {
      const result = await uploadToGoogleDrive(backup.file_path, backup.filename);
      if (result.success && result.fileId) {
        await updateGoogleDriveStatus(backup.id, "success", result.fileId);
      } else {
        await updateGoogleDriveStatus(backup.id, "failed");
      }
    } catch (error) {
      console.error(
        `[googleDriveService] Failed to upload pending backup ${backup.filename}:`,
        error
      );
      await updateGoogleDriveStatus(backup.id, "failed");
    }
  }
}

/**
 * Test Google Drive connection
 */
export async function testGoogleDriveConnection(): Promise<{
  success: boolean;
  error?: string;
}> {
  const drive = getDriveClient();
  if (!drive) {
    return { success: false, error: "Failed to initialize Google Drive client" };
  }

  try {
    const configPath = path.resolve(__dirname, "../../config/backup.json");
    const configContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configContent);

    const folderId = config.googleDriveFolderId;
    if (!folderId) {
      return { success: false, error: "Google Drive folder ID not configured" };
    }

    // Try to get folder info
    await drive.files.get({ fileId: folderId, fields: "id,name" });

    return { success: true };
  } catch (error) {
    console.error("[googleDriveService] Connection test failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
