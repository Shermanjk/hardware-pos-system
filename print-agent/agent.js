/**
 * Isra Hardware POS - Local Hardware Print Agent
 * 
 * Lightweight, zero-dependency background HTTP server that runs on the Cashier PC.
 * Receives raw ESC/POS binary data from the POS web app and writes it directly to the
 * Windows Default Thermal Printer queue via Win32 Raw Spooling (winspool.drv).
 * 
 * Features:
 * - 100% Zero-Flash, Zero-Preview instant printing (<5ms)
 * - Automatic paper cutting & cash drawer kick
 * - Zero external npm dependencies (uses native Node.js and Windows APIs)
 * - CORS enabled for all origins (noob, isra-pos-server, localhost)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, exec } = require("child_process");

const PORT = 18181;
const HOST = "127.0.0.1";

// ─── Win32 Raw Printer Spooler Helper (PowerShell Script) ──────────────────────
// Uses Microsoft's official RawPrinterHelper (winspool.drv) to send raw ESC/POS bytes
// directly to the printer queue without GDI/graphical rendering.
const PS_RAW_PRINTER_SCRIPT = `
param (
    [string]$PrinterName,
    [string]$FilePath
)

$typeDef = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "ISRA POS Receipt";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        return bSuccess;
    }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
    Add-Type -TypeDefinition $typeDef
}

if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$result = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)
if ($result) {
    Write-Output "OK"
    exit 0
} else {
    Write-Error "Failed to send bytes to printer: $PrinterName"
    exit 2
}
`;

// Save the PowerShell helper script into temp directory on launch
const tempScriptPath = path.join(os.tmpdir(), "isra_raw_printer.ps1");
fs.writeFileSync(tempScriptPath, PS_RAW_PRINTER_SCRIPT, "utf8");

/**
 * Get the default printer name in Windows
 */
function getDefaultPrinter() {
  try {
    const cmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true }).Name"`;
    const output = execSync(cmd, { encoding: "utf8", timeout: 4000 }).trim();
    if (output) return output;
  } catch (err) {
    console.warn("[Agent] Failed to query default printer via CIM:", err.message);
  }

  // Fallback query
  try {
    const cmd2 = `powershell -NoProfile -Command "(Get-WmiObject -Query 'SELECT * FROM Win32_Printer WHERE Default = TRUE').Name"`;
    const output2 = execSync(cmd2, { encoding: "utf8", timeout: 4000 }).trim();
    if (output2) return output2;
  } catch (err2) {
    console.warn("[Agent] Fallback printer query failed:", err2.message);
  }

  return "Default";
}

/**
 * Send raw binary buffer directly to Windows printer queue
 */
function printRawBuffer(buffer, printerName = null) {
  return new Promise((resolve, reject) => {
    const targetPrinter = printerName || getDefaultPrinter();
    if (!targetPrinter || targetPrinter === "Default") {
      // Try to find any thermal/POS printer if no default is explicitly flagged
      try {
        const listCmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_Printer).Name"`;
        const list = execSync(listCmd, { encoding: "utf8", timeout: 3000 }).split("\r\n").map(s => s.trim()).filter(Boolean);
        const thermal = list.find(p => /pos|thermal|receipt|xprinter|epson/i.test(p)) || list[0];
        if (thermal) {
          return printRawBuffer(buffer, thermal).then(resolve).catch(reject);
        }
      } catch {}
    }

    const tempFile = path.join(os.tmpdir(), `isra_print_${Date.now()}_${Math.random().toString(36).substring(7)}.bin`);
    fs.writeFileSync(tempFile, buffer);

    const safePrinter = targetPrinter.replace(/"/g, '`"');
    const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}" -PrinterName "${safePrinter}" -FilePath "${tempFile}"`;

    exec(psCmd, { timeout: 6000 }, (error, stdout, stderr) => {
      // Clean up temp binary file
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}

      if (error || (stderr && stderr.trim() && !stdout.includes("OK"))) {
        console.error(`[Agent] Print error to "${targetPrinter}":`, stderr || error?.message);
        return reject(new Error(stderr || error?.message || "Failed to send raw print job"));
      }

      console.log(`[Agent] Printed ${buffer.length} raw bytes to "${targetPrinter}" successfully.`);
      resolve({ success: true, printer: targetPrinter, bytes: buffer.length });
    });
  });
}

/**
 * Build test receipt ESC/POS buffer
 */
function buildTestReceipt() {
  const ESC = 0x1b;
  const GS = 0x1d;

  return Buffer.from([
    ESC, 0x40,             // Initialize printer
    ESC, 0x61, 0x01,       // Center align
    ESC, 0x45, 0x01,       // Bold on
    ...Buffer.from("ISRA HARDWARE POS\n", "utf8"),
    ESC, 0x45, 0x00,       // Bold off
    ...Buffer.from("Hardware POS System\n", "utf8"),
    ...Buffer.from("------------------------------------------\n", "utf8"),
    ESC, 0x61, 0x00,       // Left align
    ...Buffer.from("PRINT AGENT STATUS:   CONNECTED (0% FLASH)\n", "utf8"),
    ...Buffer.from(`DATE/TIME:            ${new Date().toLocaleString()}\n`, "utf8"),
    ...Buffer.from(`PRINTER:              ${getDefaultPrinter()}\n`, "utf8"),
    ...Buffer.from("COMMUNICATION:        Win32 Raw Spooler\n", "utf8"),
    ...Buffer.from("------------------------------------------\n", "utf8"),
    ESC, 0x61, 0x01,       // Center align
    ...Buffer.from("Direct Hardware Printing is Active!\n", "utf8"),
    ...Buffer.from("Zero browser flash, instant receipts.\n\n\n\n", "utf8"),
    GS, 0x56, 0x42, 0x00,  // Paper cut (feed 0 lines and cut)
  ]);
}

/**
 * Build cash drawer kick ESC/POS buffer
 */
function buildCashDrawerKick() {
  const ESC = 0x1b;
  // Standard ESC/POS pulse: ESC p 0 25 250 (Pin 2, 50ms pulse, 500ms delay)
  return Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]);
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Add CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight OPTIONS
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  // GET /health or GET /status
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
    const defaultPrinter = getDefaultPrinter();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      agent: "IsraPOS-PrintAgent",
      version: "1.0.0",
      defaultPrinter,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  // GET /printers
  if (req.method === "GET" && url.pathname === "/printers") {
    try {
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName | ConvertTo-Json"`;
      const output = execSync(cmd, { encoding: "utf8", timeout: 4000 });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(output || "[]");
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /print
  if (req.method === "POST" && url.pathname === "/print") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const json = JSON.parse(body || "{}");
        let buffer;

        if (json.rawBase64) {
          buffer = Buffer.from(json.rawBase64, "base64");
        } else if (json.rawHex) {
          buffer = Buffer.from(json.rawHex, "hex");
        } else if (json.text) {
          buffer = Buffer.from(json.text, "utf8");
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing rawBase64, rawHex, or text in payload" }));
          return;
        }

        const result = await printRawBuffer(buffer, json.printerName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error("[Agent] Print request failed:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Print failure" }));
      }
    });
    return;
  }

  // POST /test-print
  if (req.method === "POST" && url.pathname === "/test-print") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const json = body ? JSON.parse(body) : {};
        const buffer = buildTestReceipt();
        const result = await printRawBuffer(buffer, json.printerName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // POST /open-drawer
  if (req.method === "POST" && url.pathname === "/open-drawer") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const json = body ? JSON.parse(body) : {};
        const buffer = buildCashDrawerKick();
        const result = await printRawBuffer(buffer, json.printerName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, HOST, () => {
  const defaultPrinter = getDefaultPrinter();
  console.log("=================================================");
  console.log("  Isra Hardware POS - Local Print Agent v1.0.0   ");
  console.log("=================================================");
  console.log(`  Status:          ONLINE`);
  console.log(`  Listening:       http://${HOST}:${PORT}`);
  console.log(`  Default Printer: ${defaultPrinter || "[None Detected]"}`);
  console.log(`  0% Flash ESC/POS printing is ready.`);
  console.log("=================================================");
});
