import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface VersionInfo {
  applicationVersion: string;
  databaseVersion: string;
}

interface SystemVersion {
  application_version: string;
  database_version: string;
  installed_at: Date;
  updated_at: Date;
}

interface VersionStatus {
  installedVersion: string;
  downloadedVersion: string;
  installedDatabaseVersion: string;
  downloadedDatabaseVersion: string;
  updateAvailable: boolean;
  databaseUpdateRequired: boolean;
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part) || 0);
  const b = right.split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

/**
 * Read version.json from config directory
 */
export function readVersionFile(): VersionInfo | null {
  try {
    const versionPath = path.resolve(__dirname, "../../config/version.json");
    const versionContent = fs.readFileSync(versionPath, "utf-8");
    return JSON.parse(versionContent) as VersionInfo;
  } catch (error) {
    console.error("[versionService] Failed to read version.json:", error);
    return null;
  }
}

/**
 * Get current installed version from database
 */
export async function getInstalledVersion(): Promise<SystemVersion | null> {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT * FROM system_version WHERE id = 1 LIMIT 1"
    );
    return rows[0] || null;
  } catch (error) {
    console.error("[versionService] Failed to get installed version:", error);
    return null;
  }
}

/**
 * Compare installed version with downloaded version
 */
export async function getVersionStatus(): Promise<VersionStatus> {
  const versionFile = readVersionFile();
  const installedVersion = await getInstalledVersion();

  const downloadedAppVersion = versionFile?.applicationVersion || "1.0.0";
  const downloadedDbVersion = versionFile?.databaseVersion || "030";
  const installedAppVersion = installedVersion?.application_version || "1.0.0";
  const installedDbVersion = installedVersion?.database_version || "030";

  // Production updates are forward-only. A stale configuration file must
  // never make the updater offer (or record) a downgrade.
  const updateAvailable = compareVersions(downloadedAppVersion, installedAppVersion) > 0;
  const databaseUpdateRequired = compareVersions(downloadedDbVersion, installedDbVersion) > 0;

  return {
    installedVersion: installedAppVersion,
    downloadedVersion: downloadedAppVersion,
    installedDatabaseVersion: installedDbVersion,
    downloadedDatabaseVersion: downloadedDbVersion,
    updateAvailable,
    databaseUpdateRequired,
  };
}

/**
 * Update installed version in database
 */
export async function updateInstalledVersion(
  applicationVersion: string,
  databaseVersion: string
): Promise<void> {
  try {
    const installed = await getInstalledVersion();
    const safeApplicationVersion = installed && compareVersions(applicationVersion, installed.application_version) < 0
      ? installed.application_version
      : applicationVersion;
    const safeDatabaseVersion = installed && compareVersions(databaseVersion, installed.database_version) < 0
      ? installed.database_version
      : databaseVersion;
    await pool.execute(
      `UPDATE system_version 
       SET application_version = ?, database_version = ?, updated_at = NOW() 
       WHERE id = 1`,
      [safeApplicationVersion, safeDatabaseVersion]
    );
  } catch (error) {
    console.error("[versionService] Failed to update installed version:", error);
    throw error;
  }
}
