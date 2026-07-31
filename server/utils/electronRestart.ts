/**
 * Signal Electron main process to restart the application
 * This is called from the backend after a successful update installation
 */

export async function triggerElectronRestart(): Promise<void> {
  try {
    // In Electron, we can use IPC or a simple HTTP endpoint
    // For now, we'll use a simple approach: write a flag file that Electron watches
    const fs = await import("fs");
    const path = await import("path");
    
    const flagPath = path.resolve(process.cwd(), ".restart-flag");
    fs.writeFileSync(flagPath, "restart");
    
    console.log("[electronRestart] Restart flag created");
  } catch (error) {
    console.error("[electronRestart] Failed to create restart flag:", error);
  }
}

/**
 * Alternative: Use HTTP endpoint if Electron exposes one
 */
export async function triggerRestartViaHttp(): Promise<void> {
  try {
    const response = await fetch("http://localhost:3001/api/electron/restart", {
      method: "POST",
    });
    
    if (response.ok) {
      console.log("[electronRestart] Restart signal sent via HTTP");
    } else {
      console.error("[electronRestart] Failed to send restart signal via HTTP");
    }
  } catch (error) {
    console.error("[electronRestart] HTTP restart failed:", error);
    // Fallback to flag file method
    await triggerElectronRestart();
  }
}
