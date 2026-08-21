using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.Threading;
using System.Diagnostics;

namespace IsraPOS.PrintAgent
{
    public class RawPrinterHelper
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public class DOCINFOW
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
        }

        [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

        [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool ClosePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

        [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndDocPrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool StartPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool EndPagePrinter(IntPtr hPrinter);

        [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
        public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

        public static string SendBytesToPrinter(string szPrinterName, byte[] pBytes)
        {
            IntPtr hPrinter = IntPtr.Zero;
            DOCINFOW di = new DOCINFOW();
            di.pDocName = "ISRA POS Receipt";
            di.pDataType = "RAW";

            if (!OpenPrinter(szPrinterName.Trim(), out hPrinter, IntPtr.Zero))
            {
                int err = Marshal.GetLastWin32Error();
                return "OpenPrinter failed for '" + szPrinterName + "': Win32 Error " + err + " (" + new Win32Exception(err).Message + ")";
            }

            try
            {
                if (!StartDocPrinter(hPrinter, 1, di))
                {
                    // Fallback to default data type if "RAW" rejected
                    di.pDataType = null;
                    if (!StartDocPrinter(hPrinter, 1, di))
                    {
                        int err = Marshal.GetLastWin32Error();
                        return "StartDocPrinter failed: Win32 Error " + err + " (" + new Win32Exception(err).Message + ")";
                    }
                }

                try
                {
                    if (!StartPagePrinter(hPrinter))
                    {
                        int err = Marshal.GetLastWin32Error();
                        return "StartPagePrinter failed: Win32 Error " + err + " (" + new Win32Exception(err).Message + ")";
                    }

                    try
                    {
                        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
                        Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
                        int dwWritten = 0;
                        bool bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
                        Marshal.FreeCoTaskMem(pUnmanagedBytes);

                        if (!bSuccess || dwWritten != pBytes.Length)
                        {
                            int err = Marshal.GetLastWin32Error();
                            return "WritePrinter failed: Win32 Error " + err + " (written " + dwWritten + "/" + pBytes.Length + ")";
                        }
                    }
                    finally
                    {
                        EndPagePrinter(hPrinter);
                    }
                }
                finally
                {
                    EndDocPrinter(hPrinter);
                }
            }
            finally
            {
                ClosePrinter(hPrinter);
            }

            return "OK";
        }
    }

    public class Program
    {
        private static readonly int[] CandidatePorts = new int[] { 18181, 18182, 18183, 18184 };
        private static int ActivePort = 18181;
        private static TcpListener listener;

        public static string GetDefaultPrinterName()
        {
            try
            {
                PrinterSettings settings = new PrinterSettings();
                return settings.PrinterName ?? "Default";
            }
            catch
            {
                return "Default";
            }
        }

        public static string[] GetInstalledPrinters()
        {
            try
            {
                var list = new System.Collections.Generic.List<string>();
                foreach (string p in PrinterSettings.InstalledPrinters)
                {
                    list.Add(p);
                }
                return list.ToArray();
            }
            catch
            {
                return new string[0];
            }
        }

        public static string ResolveTargetPrinter(string requestedPrinter)
        {
            if (!string.IsNullOrEmpty(requestedPrinter) && requestedPrinter.Trim() != "Default")
            {
                return requestedPrinter.Trim();
            }

            string def = GetDefaultPrinterName();
            if (!string.IsNullOrEmpty(def) && def != "Default")
            {
                return def;
            }

            string[] printers = GetInstalledPrinters();
            foreach (string p in printers)
            {
                string lower = p.ToLower();
                if (lower.Contains("pos") || lower.Contains("thermal") || lower.Contains("receipt") || lower.Contains("xprinter") || lower.Contains("epson") || lower.Contains("365"))
                {
                    return p;
                }
            }

            return printers.Length > 0 ? printers[0] : "Default";
        }

        public static byte[] BuildTestReceipt(string targetPrinter)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                byte[] init = new byte[] { 0x1B, 0x40 };              // Init ESC @
                byte[] center = new byte[] { 0x1B, 0x61, 0x01 };        // Center
                byte[] left = new byte[] { 0x1B, 0x61, 0x00 };          // Left
                byte[] boldOn = new byte[] { 0x1B, 0x45, 0x01 };        // Bold ON
                byte[] boldOff = new byte[] { 0x1B, 0x45, 0x00 };       // Bold OFF
                byte[] feedLines = new byte[] { 0x1B, 0x64, 0x05 };     // ESC d 5 (feed 5 lines)
                byte[] cut = new byte[] { 0x1D, 0x56, 0x42, 0x00 };     // GS V 66 0 (Cut)

                ms.Write(init, 0, init.Length);
                ms.Write(center, 0, center.Length);
                ms.Write(boldOn, 0, boldOn.Length);
                byte[] header = Encoding.UTF8.GetBytes("ISRA HARDWARE POS\r\n");
                ms.Write(header, 0, header.Length);
                ms.Write(boldOff, 0, boldOff.Length);
                byte[] sub = Encoding.UTF8.GetBytes("Hardware POS System\r\n------------------------------------------\r\n");
                ms.Write(sub, 0, sub.Length);

                ms.Write(left, 0, left.Length);
                byte[] info = Encoding.UTF8.GetBytes(
                    "PRINT AGENT:    STANDALONE EXE (0% FLASH)\r\n" +
                    "DATE/TIME:      " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\r\n" +
                    "TARGET PRINTER: " + targetPrinter + "\r\n" +
                    "PORT:           " + ActivePort + "\r\n" +
                    "SPOOLER:        Direct Win32 Raw Spooler\r\n" +
                    "------------------------------------------\r\n"
                );
                ms.Write(info, 0, info.Length);

                ms.Write(center, 0, center.Length);
                byte[] footer = Encoding.UTF8.GetBytes(
                    "Direct Hardware Printing Active!\r\n" +
                    "0% Flash, Zero-Preview Thermal Print.\r\n\r\n\r\n\r\n\r\n"
                );
                ms.Write(footer, 0, footer.Length);
                ms.Write(feedLines, 0, feedLines.Length);
                ms.Write(cut, 0, cut.Length);

                return ms.ToArray();
            }
        }

        public static byte[] BuildCashDrawerKick()
        {
            return new byte[] { 0x1B, 0x70, 0x00, 0x19, 0xFA };
        }

        public static void Main(string[] args)
        {
            Console.Title = "Isra POS Hardware Print Agent (Active)";
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("=================================================");
            Console.WriteLine("  Isra Hardware POS - Standalone Print Agent     ");
            Console.WriteLine("=================================================");
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("  Default Printer: " + GetDefaultPrinterName());
            
            string[] all = GetInstalledPrinters();
            Console.WriteLine("  Installed Printers (" + all.Length + "):");
            foreach (string p in all)
            {
                Console.WriteLine("    * " + p);
            }

            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("  100% Zero-Flash ESC/POS printing ready.");
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("=================================================");
            Console.ResetColor();

            IPAddress ip = IPAddress.Parse("127.0.0.1");
            bool started = false;

            foreach (int port in CandidatePorts)
            {
                try
                {
                    listener = new TcpListener(ip, port);
                    listener.ExclusiveAddressUse = false;
                    listener.Start();
                    ActivePort = port;
                    started = true;
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("\n[SUCCESS] Print Agent listening on http://127.0.0.1:" + ActivePort);
                    Console.ResetColor();
                    break;
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.DarkGray;
                    Console.WriteLine("Port " + port + " busy (" + ex.Message + "), trying next...");
                    Console.ResetColor();
                }
            }

            if (!started)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[FATAL ERROR] Could not bind to any candidate port (18181-18184).");
                Console.ResetColor();
                Console.ReadLine();
                return;
            }

            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("Waiting for print jobs from Chrome POS... (Logs will appear below)\n");
            Console.ResetColor();

            while (true)
            {
                try
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch
                {
                    break;
                }
            }
        }

        private static void HandleClient(object obj)
        {
            using (TcpClient client = (TcpClient)obj)
            using (NetworkStream stream = client.GetStream())
            {
                stream.ReadTimeout = 4000;
                StreamReader reader = new StreamReader(stream, Encoding.UTF8);

                try
                {
                    string requestLine = reader.ReadLine();
                    if (string.IsNullOrEmpty(requestLine)) return;

                    string[] parts = requestLine.Split(' ');
                    string method = parts[0].ToUpper();
                    string rawUrl = parts.Length > 1 ? parts[1] : "/";
                    string path = rawUrl.Split('?')[0];

                    int contentLength = 0;
                    string line;
                    while (!string.IsNullOrEmpty(line = reader.ReadLine()))
                    {
                        if (line.ToLower().StartsWith("content-length:"))
                        {
                            int.TryParse(line.Split(':')[1].Trim(), out contentLength);
                        }
                    }

                    if (method == "OPTIONS")
                    {
                        SendResponse(stream, 204, "No Content", "");
                        return;
                    }

                    string body = "";
                    if (contentLength > 0)
                    {
                        char[] buf = new char[contentLength];
                        int total = 0;
                        while (total < contentLength)
                        {
                            int read = reader.Read(buf, total, contentLength - total);
                            if (read <= 0) break;
                            total += read;
                        }
                        body = new string(buf, 0, total);
                    }

                    if (method == "GET" && (path == "/health" || path == "/status"))
                    {
                        string def = GetDefaultPrinterName();
                        Console.ForegroundColor = ConsoleColor.DarkCyan;
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [HEALTH CHECK] Connected from Chrome POS");
                        Console.ResetColor();

                        string json = "{\"status\":\"ok\",\"agent\":\"IsraPOS-StandaloneExe\",\"version\":\"3.2.0\",\"defaultPrinter\":\"" + EscapeJson(def) + "\",\"port\":" + ActivePort + ",\"timestamp\":\"" + DateTime.UtcNow.ToString("o") + "\"}";
                        SendResponse(stream, 200, "OK", json);
                        return;
                    }

                    if (method == "GET" && path == "/printers")
                    {
                        string[] list = GetInstalledPrinters();
                        string def = GetDefaultPrinterName();
                        StringBuilder sb = new StringBuilder("[");
                        for (int i = 0; i < list.Length; i++)
                        {
                            if (i > 0) sb.Append(",");
                            bool isDef = list[i].Equals(def, StringComparison.OrdinalIgnoreCase);
                            sb.Append("{\"Name\":\"").Append(EscapeJson(list[i])).Append("\",\"Default\":").Append(isDef ? "true" : "false").Append("}");
                        }
                        sb.Append("]");
                        SendResponse(stream, 200, "OK", sb.ToString());
                        return;
                    }

                    if (method == "POST" && path == "/print")
                    {
                        string printerName = ExtractJsonString(body, "printerName");
                        string base64 = ExtractJsonString(body, "rawBase64");
                        string text = ExtractJsonString(body, "text");

                        byte[] bytes = null;
                        if (!string.IsNullOrEmpty(base64))
                        {
                            bytes = Convert.FromBase64String(base64);
                        }
                        else if (!string.IsNullOrEmpty(text))
                        {
                            bytes = Encoding.UTF8.GetBytes(text);
                        }

                        if (bytes == null || bytes.Length == 0)
                        {
                            SendResponse(stream, 400, "Bad Request", "{\"error\":\"Missing rawBase64 or text\"}");
                            return;
                        }

                        string target = ResolveTargetPrinter(printerName);
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("\n[" + DateTime.Now.ToString("HH:mm:ss") + "] [RECEIPT PRINT JOB] Sending " + bytes.Length + " bytes to '" + target + "'...");
                        Console.ResetColor();

                        string res = RawPrinterHelper.SendBytesToPrinter(target, bytes);
                        if (res == "OK")
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Print dispatched to '" + target + "' (" + bytes.Length + " bytes)");
                            Console.ResetColor();
                            SendResponse(stream, 200, "OK", "{\"success\":true,\"printer\":\"" + EscapeJson(target) + "\",\"bytes\":" + bytes.Length + "}");
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SPOOLER ERROR] " + res);
                            Console.ResetColor();
                            SendResponse(stream, 500, "Internal Server Error", "{\"error\":\"" + EscapeJson(res) + "\"}");
                        }
                        return;
                    }

                    if (method == "POST" && path == "/test-print")
                    {
                        string printerName = ExtractJsonString(body, "printerName");
                        string target = ResolveTargetPrinter(printerName);
                        byte[] testBytes = BuildTestReceipt(target);

                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("\n[" + DateTime.Now.ToString("HH:mm:ss") + "] [TEST PRINT] Sending test receipt (" + testBytes.Length + " bytes) to '" + target + "'...");
                        Console.ResetColor();

                        string res = RawPrinterHelper.SendBytesToPrinter(target, testBytes);
                        if (res == "OK")
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Test receipt printed to '" + target + "'");
                            Console.ResetColor();
                            SendResponse(stream, 200, "OK", "{\"success\":true,\"printer\":\"" + EscapeJson(target) + "\",\"bytes\":" + testBytes.Length + "}");
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SPOOLER ERROR] " + res);
                            Console.ResetColor();
                            SendResponse(stream, 500, "Internal Server Error", "{\"error\":\"" + EscapeJson(res) + "\"}");
                        }
                        return;
                    }

                    if (method == "POST" && path == "/open-drawer")
                    {
                        string printerName = ExtractJsonString(body, "printerName");
                        string target = ResolveTargetPrinter(printerName);
                        byte[] drawerBytes = BuildCashDrawerKick();

                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("\n[" + DateTime.Now.ToString("HH:mm:ss") + "] [CASH DRAWER] Kicking drawer on '" + target + "'...");
                        Console.ResetColor();

                        string res = RawPrinterHelper.SendBytesToPrinter(target, drawerBytes);
                        if (res == "OK")
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Cash drawer kick sent.");
                            Console.ResetColor();
                            SendResponse(stream, 200, "OK", "{\"success\":true,\"printer\":\"" + EscapeJson(target) + "\"}");
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [DRAWER ERROR] " + res);
                            Console.ResetColor();
                            SendResponse(stream, 500, "Internal Server Error", "{\"error\":\"" + EscapeJson(res) + "\"}");
                        }
                        return;
                    }

                    SendResponse(stream, 404, "Not Found", "{\"error\":\"Not Found\"}");
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[REQUEST EXCEPTION] " + ex.Message);
                    Console.ResetColor();
                }
            }
        }

        private static void SendResponse(Stream stream, int statusCode, string statusText, string json)
        {
            byte[] bodyBytes = Encoding.UTF8.GetBytes(json);
            string headers =
                "HTTP/1.1 " + statusCode + " " + statusText + "\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Content-Length: " + bodyBytes.Length + "\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type, Authorization, Access-Control-Request-Private-Network\r\n" +
                "Access-Control-Allow-Private-Network: true\r\n" +
                "Connection: close\r\n\r\n";

            byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0)
            {
                stream.Write(bodyBytes, 0, bodyBytes.Length);
            }
            stream.Flush();
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }

        private static string ExtractJsonString(string json, string key)
        {
            if (string.IsNullOrEmpty(json)) return null;
            string needle = "\"" + key + "\"";
            int idx = json.IndexOf(needle, StringComparison.OrdinalIgnoreCase);
            if (idx == -1) return null;

            int colon = json.IndexOf(':', idx + needle.Length);
            if (colon == -1) return null;

            int quoteStart = json.IndexOf('"', colon + 1);
            if (quoteStart == -1) return null;

            int quoteEnd = quoteStart + 1;
            while (quoteEnd < json.Length)
            {
                if (json[quoteEnd] == '"' && json[quoteEnd - 1] != '\\') break;
                quoteEnd++;
            }

            if (quoteEnd >= json.Length) return null;
            return json.Substring(quoteStart + 1, quoteEnd - quoteStart - 1).Replace("\\\"", "\"").Replace("\\\\", "\\");
        }
    }
}
