import axios from "axios";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getInstalledVersion } from "./versionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || "Shermanjk";
const REPO_NAME = process.env.GITHUB_REPO_NAME || "hardware-pos-system";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

export interface GitHubReleaseInfo {
  tagName: string;
  version: string;
  targetDatabaseVersion?: string;
  name: string;
  body: string;
  publishedAt: string;
  zipAssetUrl: string | null;
  zipAssetName: string | null;
  zipSize: number;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  installedVersion: string;
  latestVersion: string;
  release: GitHubReleaseInfo | null;
}

function getAppRoot(): string {
  // When running in dev: server/services -> root is 2 levels up
  // When running in server-dist: server-dist -> root is 1 level up
  const devPath = path.resolve(__dirname, "../../");
  if (fs.existsSync(path.join(devPath, "package.json"))) return devPath;
  const prodPath = path.resolve(__dirname, "../");
  if (fs.existsSync(path.join(prodPath, "package.json"))) return prodPath;
  return process.cwd();
}

function compareVersions(left: string, right: string): number {
  const a = left.replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
  const b = right.replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  }
  return 0;
}

/**
 * Fetch latest release metadata from GitHub
 */
export async function fetchLatestRelease(): Promise<GitHubReleaseInfo | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Isra-POS-System-Updater",
      Accept: "application/vnd.github.v3+json",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await axios.get(GITHUB_API_URL, {
      headers,
      timeout: 15_000,
    });

    const data = response.data;
    const tagName = data.tag_name || "";
    const cleanVersion = tagName.replace(/^v/i, "");

    // Fetch target database version from raw version.json for this tag/main
    let targetDatabaseVersion = "000";
    try {
      const rawVersionUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${tagName || "main"}/config/version.json`;
      const rawRes = await axios.get(rawVersionUrl, {
        headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
        timeout: 5000,
      });
      if (rawRes.data?.databaseVersion) {
        targetDatabaseVersion = String(rawRes.data.databaseVersion);
      }
    } catch {
      // Non-blocking fallback
    }

    // Find the release zip asset (pre-compiled bundle if attached by Actions)
    const zipAsset = Array.isArray(data.assets)
      ? data.assets.find((asset: any) =>
          asset.name.endsWith(".zip") || asset.content_type === "application/zip"
        )
      : null;

    // Fallback directly to GitHub tag archive zip (always available immediately)
    const fallbackZipUrl = tagName
      ? `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/tags/${tagName}.zip`
      : data.zipball_url || null;

    const zipAssetUrl = zipAsset?.browser_download_url || fallbackZipUrl;

    return {
      tagName,
      version: cleanVersion || "1.0.0",
      targetDatabaseVersion,
      name: data.name || tagName,
      body: data.body || "",
      publishedAt: data.published_at || "",
      zipAssetUrl,
      zipAssetName: zipAsset?.name || `${tagName}.zip`,
      zipSize: zipAsset?.size || 0,
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log("[githubReleaseService] No releases found on repository yet.");
      return null;
    }
    console.error("[githubReleaseService] Failed to fetch latest release:", error.message);
    throw error;
  }
}

/**
 * Check if a newer version is available on GitHub Releases
 */
export async function checkForReleaseUpdates(): Promise<UpdateCheckResult> {
  const release = await fetchLatestRelease();
  const installed = await getInstalledVersion();
  const installedVersion = installed?.application_version || "1.0.0";

  if (!release) {
    return {
      hasUpdate: false,
      installedVersion,
      latestVersion: installedVersion,
      release: null,
    };
  }

  const hasUpdate = compareVersions(release.version, installedVersion) > 0;

  return {
    hasUpdate,
    installedVersion,
    latestVersion: release.version,
    release,
  };
}

/**
 * Download the release ZIP to a local temporary path
 */
export async function downloadReleaseZip(
  downloadUrl: string,
  destinationPath: string
): Promise<void> {
  const destDir = path.dirname(destinationPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const writer = fs.createWriteStream(destinationPath);
  const response = await axios.get(downloadUrl, {
    responseType: "stream",
    maxRedirects: 5,
    timeout: 120_000,
    headers: {
      "User-Agent": "Isra-POS-System-Updater",
    },
  });

  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

/**
 * Extract release ZIP bundle into a staging directory
 */
export async function extractReleaseBundle(
  zipPath: string,
  stagingDir: string
): Promise<void> {
  if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    // bsdtar / tar handles .zip files natively on both Windows 10+ and Linux
    execFile("tar", ["-xf", zipPath, "-C", stagingDir], (tarErr) => {
      if (!tarErr) {
        return resolve();
      }

      // Fallback on Windows: PowerShell Expand-Archive
      if (process.platform === "win32") {
        const psCmd = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${stagingDir.replace(/'/g, "''")}' -Force`;
        execFile("powershell", ["-NoProfile", "-Command", psCmd], (psErr) => {
          if (psErr) {
            reject(new Error(`Failed to extract update bundle: ${psErr.message}`));
          } else {
            resolve();
          }
        });
      } else {
        reject(new Error(`Failed to extract update bundle: ${tarErr.message}`));
      }
    });
  });
}

/**
 * Copy directory recursively
 */
function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Apply extracted staging files to the live application directories
 */
export async function applyStagedUpdate(stagingDir: string): Promise<void> {
  const root = getAppRoot();

  // If the archive unpacked into a single wrapper folder (e.g. GitHub archive zipballs), unnest it
  let effectiveDir = stagingDir;
  if (fs.existsSync(stagingDir)) {
    const entries = fs.readdirSync(stagingDir);
    if (entries.length === 1) {
      const singlePath = path.join(stagingDir, entries[0]);
      if (fs.statSync(singlePath).isDirectory()) {
        effectiveDir = singlePath;
      }
    }
  }

  // 1. Copy new migrations to root/migrations
  const stagedMigrations = path.join(effectiveDir, "migrations");
  const targetMigrations = path.join(root, "migrations");
  if (fs.existsSync(stagedMigrations)) {
    copyDirSync(stagedMigrations, targetMigrations);
  }

  // 2. Copy new frontend dist to root/dist
  const stagedDist = path.join(effectiveDir, "dist");
  const targetDist = path.join(root, "dist");
  if (fs.existsSync(stagedDist)) {
    copyDirSync(stagedDist, targetDist);
  }

  // 3. Copy new config to root/config
  const stagedConfig = path.join(effectiveDir, "config");
  const targetConfig = path.join(root, "config");
  if (fs.existsSync(stagedConfig)) {
    copyDirSync(stagedConfig, targetConfig);
  }

  // 4. Update server-dist:
  const stagedServerDist = path.join(effectiveDir, "server-dist");
  const targetServerDist = path.join(root, "server-dist");
  if (fs.existsSync(stagedServerDist)) {
    copyDirSync(stagedServerDist, targetServerDist);
  }

  // 5. Update package.json
  const stagedPkg = path.join(effectiveDir, "package.json");
  if (fs.existsSync(stagedPkg)) {
    try {
      fs.copyFileSync(stagedPkg, path.join(root, "package.json"));
    } catch {}
  }

  console.log("[githubReleaseService] Staged release files applied successfully.");
}
