import { execFile } from "child_process";
import fs from "fs";
import path from "path";

function runGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, windowsHide: true, timeout: 120_000 }, (error, stdout, stderr) => {
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
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

function getRepositoryPath(): string {
  return path.resolve(process.env.UPDATE_REPOSITORY_PATH || process.cwd());
}

/** Pull only fast-forward commits, never merging local changes during an update. */
export async function pullApplicationUpdate(): Promise<{ changed: boolean; output: string }> {
  const repositoryPath = getRepositoryPath();
  if (!fs.existsSync(path.join(repositoryPath, ".git"))) {
    throw new Error(`Update repository is unavailable at ${repositoryPath}`);
  }

  const result = await runGit(["pull", "--ff-only"], repositoryPath);
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return { changed: !/already up to date/i.test(output), output };
}

/** Install lockfile-pinned dependencies and regenerate the client/server bundle. */
export async function buildApplicationUpdate(): Promise<void> {
  const repositoryPath = getRepositoryPath();
  if (!fs.existsSync(path.join(repositoryPath, "package.json"))) {
    throw new Error(`Application package is unavailable at ${repositoryPath}`);
  }

  await runPackageManager(["install", "--frozen-lockfile"], repositoryPath);
  await runPackageManager(["build"], repositoryPath);
}
