import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// 1. Bundle server with esbuild
execSync("esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=server-dist", {
  stdio: "inherit",
});

// 2. Ensure server-dist/config exists
const configDir = path.resolve("server-dist/config");
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// 3. Copy config files cross-platform
for (const file of ["version.json", "backup.json"]) {
  const src = path.resolve("config", file);
  const dest = path.resolve(configDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

console.log("[build-server] Server build and config files copied successfully.");
