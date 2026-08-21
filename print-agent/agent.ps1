# ==============================================================================
# Isra Hardware POS - Native Windows Hardware Print Agent (100% Zero-Dependency)
# 
# Runs natively on Windows 10/11 using built-in .NET HttpListener and Win32 Spooler.
# NO Node.js, NO external software, NO installations required on the Cashier PC.
# ==============================================================================

param(
    [int]$Port = 18181
)

$ErrorActionPreference = "Continue"

# ─── Win32 Raw Printer Spooler Type Definition ────────────────────────────────
$typeDef = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.ComponentModel;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static string SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOW di = new DOCINFOW();
        di.pDocName = "ISRA POS Receipt";
        di.pDataType = "RAW";

        if (!OpenPrinter(szPrinterName.Trim(), out hPrinter, IntPtr.Zero)) {
            int err = Marshal.GetLastWin32Error();
            return "OpenPrinter failed: Win32 Error " + err + " (" + new Win32Exception(err).Message + ")";
        }

        try {
            if (!StartDocPrinter(hPrinter, 1, di)) {
                int err = Marshal.GetLastWin32Error();
                return "StartDocPrinter failed: Win32 Error " + err + " (" + new Win32Exception(err).Message + ")";
            }

            try {
                if (!StartPagePrinter(hPrinter)) {
                    int err = Marshal.GetLastWin32Error();
                    return "StartPagePrinter failed: Win32 Error " + err + " (" + new Win32Exception(err).Message + ")";
                }

                try {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                    Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                    int dwWritten = 0;
                    bool bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);

                    if (!bSuccess || dwWritten != pBytes.Length) {
                        int err = Marshal.GetLastWin32Error();
                        return "WritePrinter failed: Win32 Error " + err + " (written " + dwWritten + "/" + pBytes.Length + ")";
                    }
                } finally {
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }

        return "OK";
    }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'RawPrinterHelper').Type) {
    Add-Type -TypeDefinition $typeDef
}

function Get-DefaultPrinterName {
    try {
        $p = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true }).Name
        if ($p) { return $p.Trim() }
    } catch {}
    try {
        $p2 = (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default = TRUE").Name
        if ($p2) { return $p2.Trim() }
    } catch {}
    return "Default"
}

function Send-RawPrintJob($printerName, [byte[]]$bytes) {
    $target = if ($printerName) { $printerName.Trim() } else { $null }
    if ([string]::IsNullOrWhiteSpace($target) -or $target -eq "Default") {
        $target = Get-DefaultPrinterName
    }
    if ([string]::IsNullOrWhiteSpace($target) -or $target -eq "Default") {
        $list = (Get-CimInstance Win32_Printer).Name
        $target = $list | Where-Object { $_ -match "pos|thermal|receipt|xprinter|epson" } | Select-Object -First 1
        if (-not $target) { $target = $list | Select-Object -First 1 }
    }

    Write-Host "[PrintAgent] Sending $($bytes.Length) bytes to '$target'..." -ForegroundColor Cyan
    $resultMsg = [RawPrinterHelper]::SendBytesToPrinter($target, $bytes)
    if ($resultMsg -eq "OK") {
        Write-Host "[PrintAgent] Print successful to '$target'" -ForegroundColor Green
        return @{ success = $true; printer = $target; bytes = $bytes.Length }
    } else {
        Write-Host "[PrintAgent] Error printing to '$target': $resultMsg" -ForegroundColor Red
        throw $resultMsg
    }
}

function Build-TestReceipt {
    $ESC = 0x1B
    $GS = 0x1D
    $bytes = [System.Collections.Generic.List[byte]]::new()
    
    $bytes.AddRange([byte[]]@($ESC, 0x40))              # Init
    $bytes.AddRange([byte[]]@($ESC, 0x61, 0x01))        # Center
    $bytes.AddRange([byte[]]@($ESC, 0x45, 0x01))        # Bold ON
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("ISRA HARDWARE POS`n"))
    $bytes.AddRange([byte[]]@($ESC, 0x45, 0x00))        # Bold OFF
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("Hardware POS System`n"))
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("------------------------------------------`n"))
    $bytes.AddRange([byte[]]@($ESC, 0x61, 0x00))        # Left
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("PRINT AGENT:    NATIVE WINDOWS (0% FLASH)`n"))
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("DATE/TIME:      $((Get-Date).ToString())`n"))
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("PRINTER:        $(Get-DefaultPrinterName)`n"))
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("SPOOLER:        Win32 Raw Spooler (C#)`n"))
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("------------------------------------------`n"))
    $bytes.AddRange([byte[]]@($ESC, 0x61, 0x01))        # Center
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("Direct Hardware Printing Active!`n"))
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("0% Flash, Zero-Preview Printing.`n`n`n`n"))
    $bytes.AddRange([byte[]]@($GS, 0x56, 0x42, 0x00))   # Cut
    
    return $bytes.ToArray()
}

function Build-CashDrawerKick {
    $ESC = 0x1B
    return [byte[]]@($ESC, 0x70, 0x00, 0x19, 0xFA)
}

# ─── Start HTTP Server ────────────────────────────────────────────────────────
$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "[ERROR] Could not bind to $prefix. Port may already be in use." -ForegroundColor Red
    exit 1
}

$defPrinter = Get-DefaultPrinterName
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Isra Hardware POS - Native Print Agent v2.0    " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Status:          ONLINE (Zero-Dependency)" -ForegroundColor Cyan
Write-Host "  Listening:       http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "  Default Printer: $defPrinter" -ForegroundColor Cyan
Write-Host "  100% Zero-Flash ESC/POS printing ready." -ForegroundColor Yellow
Write-Host "=================================================" -ForegroundColor Green

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # CORS & Chrome Private Network Access (PNA) Headers
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Access-Control-Request-Private-Network")
        $response.AddHeader("Access-Control-Allow-Private-Network", "true")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        $path = $request.Url.AbsolutePath

        if ($request.HttpMethod -eq "GET" -and ($path -eq "/health" -or $path -eq "/status")) {
            $def = Get-DefaultPrinterName
            $json = @{
                status = "ok"
                agent = "IsraPOS-NativePrintAgent"
                version = "2.0.0"
                defaultPrinter = $def
                timestamp = (Get-Date).ToString("o")
            } | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "GET" -and $path -eq "/printers") {
            $printers = Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName
            $json = $printers | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "POST" -and $path -eq "/print") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $payload = $body | ConvertFrom-Json
            
            $printBytes = $null
            if ($payload.rawBase64) {
                $printBytes = [System.Convert]::FromBase64String($payload.rawBase64)
            } elseif ($payload.text) {
                $printBytes = [System.Text.Encoding]::UTF8.GetBytes($payload.text)
            }

            if (-not $printBytes) {
                $response.StatusCode = 400
                $errJson = @{ error = "Missing rawBase64 or text" } | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.OutputStream.Write($buf, 0, $buf.Length)
                $response.Close()
                continue
            }

            try {
                $res = Send-RawPrintJob $payload.printerName $printBytes
                $json = $res | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buf, 0, $buf.Length)
            } catch {
                $response.StatusCode = 500
                $errJson = @{ error = $_.Exception.Message } | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "POST" -and $path -eq "/test-print") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $payload = if ($body) { $body | ConvertFrom-Json } else { @{} }
            
            try {
                $testBytes = Build-TestReceipt
                $res = Send-RawPrintJob $payload.printerName $testBytes
                $json = $res | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buf, 0, $buf.Length)
            } catch {
                $response.StatusCode = 500
                $errJson = @{ error = $_.Exception.Message } | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            $response.Close()
            continue
        }

        if ($request.HttpMethod -eq "POST" -and $path -eq "/open-drawer") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $payload = if ($body) { $body | ConvertFrom-Json } else { @{} }
            
            try {
                $drawerBytes = Build-CashDrawerKick
                $res = Send-RawPrintJob $payload.printerName $drawerBytes
                $json = $res | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buf, 0, $buf.Length)
            } catch {
                $response.StatusCode = 500
                $errJson = @{ error = $_.Exception.Message } | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.ContentType = "application/json"
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            $response.Close()
            continue
        }

        # 404
        $response.StatusCode = 404
        $response.Close()
    } catch {
        Write-Host "[PrintAgent] Request error: $_" -ForegroundColor Red
    }
}
