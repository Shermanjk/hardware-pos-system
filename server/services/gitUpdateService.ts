import { execFile } from "child_process";
import fs from "fs";
import path from "path";

function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Pass -c safe.directory=* so Git commands succeed even when executed under NT AUTHORITY/SYSTEM Windows Service
    const fullArgs = ["-c", "safe.directory=*", ...args];
    execFile("git", fullArgs, { cwd, windowsHide: true, timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

function runPackageManager(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const command = process.env.UPDATE_PACKAGE_MANAGER || (process.platform === "win32" ? "pnpm.cmd" : "pnpm");
  
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd,
      windowsHide: true,
      timeout: 10 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: "true" },
      shell: true,
    }, (error, stdout, stderr) => {
      if (error) {
        const fallbackCmd = process.platform === "win32" ? "npm.cmd" : "npm";
        execFile(fallbackCmd, args, {
          cwd,
          windowsHide: true,
          timeout: 10 * 60 * 1000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, CI: "true" },
          shell: true,
        }, (fallbackError, fallbackStdout, fallbackStderr) => {
          if (fallbackError) {
            reject(new Error(`Package manager failed. Tried ${command} and ${fallbackCmd}. Error: ${fallbackStderr.trim() || fallbackError.message}`));
          } else {
            resolve({ stdout: fallbackStdout, stderr: fallbackStderr });
          }
        });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function getRepositoryPath(): string {
  return path.resolve(process.env.UPDATE_REPOSITORY_PATH || process.cwd());
}

/**
 * Fetch remote refs without modifying the working tree. Returns whether
 * commits are available that haven't been merged yet.
 */
export async function checkForUpdates(): Promise<{ hasUpdates: boolean; output: string }> {
  const repositoryPath = getRepositoryPath();
  if (!fs.existsSync(path.join(repositoryPath, ".git"))) {
    throw new Error(`Update repository is unavailable at ${repositoryPath}`);
  }

  // Fetch silently — do not touch the working tree
  const fetchResult = await runGit(["fetch", "--quiet"], repositoryPath);

  // Compare HEAD with its remote tracking branch
  let behind = 0;
  try {
    const revResult = await runGit(["rev-list", "--count", "HEAD..@{u}"], repositoryPath);
    behind = parseInt(revResult.stdout.trim(), 10) || 0;
  } catch {
    // No upstream set — treat as no update available
    behind = 0;
  }

  const output = `${fetchResult.stdout}\n${fetchResult.stderr}`.trim();
  return { hasUpdates: behind > 0, output };
}

/**
 * Pull only fast-forward commits, never merging local changes during an update.
 * After this call config/version.json in the working tree reflects the new version
 * so versionService.getVersionStatus() will report updateAvailable correctly.
 */
export async function pullApplicationUpdate(): Promise<{ changed: boolean; output: string }> {
  const repositoryPath = getRepositoryPath();
  if (!fs.existsSync(path.join(repositoryPath, ".git"))) {
    throw new Error(`Update repository is unavailable at ${repositoryPath}`);
  }

  const result = await runGit(["pull", "--ff-only"], repositoryPath);
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return { changed: !/already up to date/i.test(output), output };
}

/**
 * Install lockfile-pinned dependencies and regenerate the client/server bundle.
 * In the browser-based architecture, this is called directly during the update
 * process before server restart.
 */
export async function buildApplicationUpdate(): Promise<void> {
  const repositoryPath = getRepositoryPath();
  if (!fs.existsSync(path.join(repositoryPath, "package.json"))) {
    throw new Error(`Application package is unavailable at ${repositoryPath}`);
  }

  await runPackageManager(["install", "--frozen-lockfile"], repositoryPath);
  await runPackageManager(["build"], repositoryPath);
}
