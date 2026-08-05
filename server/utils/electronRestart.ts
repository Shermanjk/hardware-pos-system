import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the project root regardless of whether the server is running from
 * the source tree (server/utils/ → ../../) or from server-dist (server-dist/ → ../).
 *
 * We walk up until we find a directory that contains electron/main.cjs, which
 * is always present in the repo and is never moved during a build. That gives
 * us the same root path that electron/main.cjs uses for its __dirname/../
 * flag-file watch.
 */
function resolveProjectRoot(): string {
  // From server/utils/ (dev)  : ../../
  // From server-dist/  (prod) : ../
  const candidates = [
    path.resolve(__dirname, "../../"),  // dev: POS System/
    path.resolve(__dirname, "../"),     // prod: POS System/  (server-dist is one level deep)
    process.cwd(),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "electron", "main.cjs"))) {
      return candidate;
    }
  }

  // Fallback: use cwd
  return process.cwd();
}

/**
 * Signal Electron main process to restart the application by writing a flag
 * file that electron/main.cjs watches with fs.watchFile.
 *
 * The flag is written to <project-root>/.restart-flag, which is the same path
 * that electron/main.cjs monitors.
 */
export async function triggerElectronRestart(): Promise<void> {
  const projectRoot = resolveProjectRoot();
  const flagPath = path.join(projectRoot, ".restart-flag");

  try {
    fs.writeFileSync(flagPath, new Date().toISOString());
    console.log(`[electronRestart] Restart flag written to ${flagPath}`);
  } catch (error) {
    console.error("[electronRestart] Failed to create restart flag:", error);
    throw error;
  }
}
