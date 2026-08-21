# ==============================================================================
# Isra Hardware POS - Native Windows Hardware Print Agent (TcpListener v2.1)
# 
# Runs on ANY Windows 10/11 system using user-space TcpListener sockets.
# Zero administrator rights required, zero URL ACL reservations, zero dependencies.
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
    $bytes.AddRange([System.Text.Encoding]::UTF8.GetBytes("PRINT AGENT:    TCP SOCKET (0% FLASH)`n"))
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

# ─── Start User-Space TCP Socket HTTP Server ──────────────────────────────────
$ip = [System.Net.IPAddress]::Parse("127.0.0.1")
$tcpListener = New-Object System.Net.Sockets.TcpListener($ip, $Port)
$tcpListener.Server.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)

try {
    $tcpListener.Start()
} catch {
    Write-Host "[ERROR] Could not start TCP listener on 127.0.0.1:$Port ($($_.Exception.Message))" -ForegroundColor Red
    exit 1
}

$defPrinter = Get-DefaultPrinterName
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Isra Hardware POS - Native Print Agent v2.1    " -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Host "  Status:          ONLINE (TcpListener Socket)" -ForegroundColor Cyan
Write-Host "  Listening:       http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "  Default Printer: $defPrinter" -ForegroundColor Cyan
Write-Host "  100% Zero-Flash ESC/POS printing ready." -ForegroundColor Yellow
Write-Host "=================================================" -ForegroundColor Green

function Send-HttpResponse($stream, [int]$statusCode, [string]$statusText, [string]$jsonBody) {
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
    $headers = "HTTP/1.1 $statusCode $statusText`r`n" +
               "Content-Type: application/json; charset=utf-8`r`n" +
               "Content-Length: $($bodyBytes.Length)`r`n" +
               "Access-Control-Allow-Origin: *`r`n" +
               "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
               "Access-Control-Allow-Headers: Content-Type, Authorization, Access-Control-Request-Private-Network`r`n" +
               "Access-Control-Allow-Private-Network: true`r`n" +
               "Connection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($bodyBytes.Length -gt 0) {
        $stream.Write($bodyBytes, 0, $bodyBytes.Length)
    }
    $stream.Flush()
}

while ($true) {
    try {
        $client = $tcpListener.AcceptTcpClient()
        $stream = $client.GetStream()
        $stream.ReadTimeout = 3000

        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        
        # Read request line
        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            $client.Close()
            continue
        }

        $parts = $requestLine.Split(" ")
        $method = $parts[0].ToUpper()
        $rawUrl = if ($parts.Length -gt 1) { $parts[1] } else { "/" }
        $path = $rawUrl.Split("?")[0]

        # Read headers
        $contentLength = 0
        while ($true) {
            $headerLine = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($headerLine)) { break }
            if ($headerLine.ToLower().StartsWith("content-length:")) {
                $contentLength = [int]($headerLine.Split(":")[1].Trim())
            }
        }

        # Handle OPTIONS (CORS preflight)
        if ($method -eq "OPTIONS") {
            Send-HttpResponse $stream 204 "No Content" ""
            $client.Close()
            continue
        }

        # Read body if POST
        $body = ""
        if ($contentLength -gt 0) {
            $charBuffer = New-Object char[] $contentLength
            $readTotal = 0
            while ($readTotal -lt $contentLength) {
                $read = $reader.Read($charBuffer, $readTotal, $contentLength - $readTotal)
                if ($read -le 0) { break }
                $readTotal += $read
            }
            $body = New-Object string ($charBuffer, 0, $readTotal)
        }

        # Route: GET /health or /status
        if ($method -eq "GET" -and ($path -eq "/health" -or $path -eq "/status")) {
            $def = Get-DefaultPrinterName
            $resp = @{
                status = "ok"
                agent = "IsraPOS-NativePrintAgent"
                version = "2.1.0"
                defaultPrinter = $def
                timestamp = (Get-Date).ToString("o")
            } | ConvertTo-Json
            Send-HttpResponse $stream 200 "OK" $resp
            $client.Close()
            continue
        }

        # Route: GET /printers
        if ($method -eq "GET" -and $path -eq "/printers") {
            $printers = Get-CimInstance Win32_Printer | Select-Object Name, Default, PortName
            $resp = $printers | ConvertTo-Json
            Send-HttpResponse $stream 200 "OK" $resp
            $client.Close()
            continue
        }

        # Route: POST /print
        if ($method -eq "POST" -and $path -eq "/print") {
            $payload = $body | ConvertFrom-Json
            $printBytes = $null
            if ($payload.rawBase64) {
                $printBytes = [System.Convert]::FromBase64String($payload.rawBase64)
            } elseif ($payload.text) {
                $printBytes = [System.Text.Encoding]::UTF8.GetBytes($payload.text)
            }

            if (-not $printBytes) {
                Send-HttpResponse $stream 400 "Bad Request" (@{ error = "Missing rawBase64 or text" } | ConvertTo-Json)
                $client.Close()
                continue
            }

            try {
                $res = Send-RawPrintJob $payload.printerName $printBytes
                Send-HttpResponse $stream 200 "OK" ($res | ConvertTo-Json)
            } catch {
                Send-HttpResponse $stream 500 "Internal Server Error" (@{ error = $_.Exception.Message } | ConvertTo-Json)
            }
            $client.Close()
            continue
        }

        # Route: POST /test-print
        if ($method -eq "POST" -and $path -eq "/test-print") {
            $payload = if ($body) { $body | ConvertFrom-Json } else { @{} }
            try {
                $testBytes = Build-TestReceipt
                $res = Send-RawPrintJob $payload.printerName $testBytes
                Send-HttpResponse $stream 200 "OK" ($res | ConvertTo-Json)
            } catch {
                Send-HttpResponse $stream 500 "Internal Server Error" (@{ error = $_.Exception.Message } | ConvertTo-Json)
            }
            $client.Close()
            continue
        }

        # Route: POST /open-drawer
        if ($method -eq "POST" -and $path -eq "/open-drawer") {
            $payload = if ($body) { $body | ConvertFrom-Json } else { @{} }
            try {
                $drawerBytes = Build-CashDrawerKick
                $res = Send-RawPrintJob $payload.printerName $drawerBytes
                Send-HttpResponse $stream 200 "OK" ($res | ConvertTo-Json)
            } catch {
                Send-HttpResponse $stream 500 "Internal Server Error" (@{ error = $_.Exception.Message } | ConvertTo-Json)
            }
            $client.Close()
            continue
        }

        # 404 Not Found
        Send-HttpResponse $stream 404 "Not Found" (@{ error = "Endpoint not found" } | ConvertTo-Json)
        $client.Close()
    } catch {
        # Catch connection disconnects gracefully
    }
}
