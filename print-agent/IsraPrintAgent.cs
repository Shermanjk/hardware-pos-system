using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Drawing;
using System.Drawing.Printing;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace IsraPOS.PrintAgent
{
    public class GdiReceiptPrinter
    {
        public static bool PrintReceiptText(string printerName, string text)
        {
            try
            {
                if (string.IsNullOrEmpty(text)) return false;

                string[] lines = text.Replace("\r\n", "\n").Split('\n');
                if (lines.Length == 0) return false;

                PrintDocument pd = new PrintDocument();
                pd.PrinterSettings.PrinterName = printerName;

                // Inherit the printer's own page settings (paper size, DPI, etc.)
                pd.DefaultPageSettings = pd.PrinterSettings.DefaultPageSettings;
                pd.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

                // Suppress print dialog (console app — no UI needed)
                pd.PrintController = new StandardPrintController();

                pd.PrintPage += (sender, e) =>
                {
                    float dpiX = e.Graphics.DpiX;
                    float dpiY = e.Graphics.DpiY;
                    if (dpiX <= 0) dpiX = 203f;
                    if (dpiY <= 0) dpiY = 203f;

                    // 7.0pt Courier New fits 42 columns perfectly on standard 58mm/80mm thermal receipt rolls
                    Font bodyFont   = new Font("Courier New", 7.0f, FontStyle.Regular, GraphicsUnit.Point);
                    Font headerFont = new Font("Courier New", 8.0f, FontStyle.Bold,    GraphicsUnit.Point);
                    Font boldFont   = new Font("Courier New", 7.0f, FontStyle.Bold,    GraphicsUnit.Point);

                    // Line height at printer DPI
                    float lineH = bodyFont.GetHeight(dpiY) + 1.5f;

                    // Bitmap width: standard 576 dots (72mm printable width on 80mm roll @ 203 DPI) or driver paper width
                    float paperWidthIn = pd.DefaultPageSettings.PaperSize.Width / 100f;
                    int bmpW = (int)(paperWidthIn * dpiX);
                    if (bmpW <= 20) bmpW = 576;

                    // Bitmap height: exact content height based on actual decoded line count
                    int bmpH = (int)(lines.Length * lineH) + 60;
                    if (bmpH < 100) bmpH = 100;

                    Console.ForegroundColor = ConsoleColor.Cyan;
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [GDI RENDER] Canvas: " + bmpW + "x" + bmpH + "px (" + (bmpH * 25.4f / dpiY).ToString("F1") + "mm tall, " + lines.Length + " lines)");
                    Console.ResetColor();

                    // === RASTERIZATION: Render all decoded text to an in-memory bitmap ===
                    // This produces crisp raster output matching the browser's HTML print engine
                    using (Bitmap bmp = new Bitmap(bmpW, bmpH))
                    {
                        bmp.SetResolution(dpiX, dpiY);
                        using (Graphics g = Graphics.FromImage(bmp))
                        {
                            g.Clear(Color.White);
                            // SingleBitPerPixelGridFit = crisp monochrome text (optimal for thermal printheads)
                            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;

                            float y = 4f;
                            float x = 4f;

                            foreach (string line in lines)
                            {
                                if (string.IsNullOrEmpty(line))
                                {
                                    y += lineH;
                                    continue;
                                }

                                Font currentFont = bodyFont;
                                string upper = line.ToUpper();
                                if (upper.Contains("ISRA HARDWARE") || upper.Contains("OFFICIAL RECEIPT") ||
                                    upper.Contains("SALES INVOICE")  || upper.Contains("CREDIT PAYMENT") ||
                                    upper.Contains("SALES RETURN"))
                                    currentFont = headerFont;
                                else if (upper.Contains("TOTAL") || upper.Contains("CASH") ||
                                         upper.Contains("CHANGE") || upper.Contains("AMOUNT DUE") ||
                                         upper.Contains("DISCOUNT"))
                                    currentFont = boldFont;

                                g.DrawString(line, currentFont, Brushes.Black, new PointF(x, y));
                                y += lineH;
                            }
                        }

                        // Draw the rasterized bitmap to the printer context
                        e.Graphics.DrawImage(bmp, new PointF(0, 0));
                    }

                    bodyFont.Dispose();
                    headerFont.Dispose();
                    boldFont.Dispose();

                    e.HasMorePages = false;
                };

                pd.Print();
                return true;
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[GDI Print Error] " + ex.Message);
                Console.ResetColor();
                return false;
            }
        }
    }


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

        /// <summary>
        /// Sends plain text to the Windows print spooler using the TEXT datatype.
        /// The printer driver renders the text natively — handles line length and paper feed automatically.
        /// This is the most reliable method for all thermal printer drivers (Xprinter, Epson, Star, Bixolon).
        /// </summary>
        public static string SendTextToPrinter(string szPrinterName, string text)
        {
            // Normalize line endings to \r\n (required by Windows print spooler TEXT mode)
            string normalized = text.Replace("\r\n", "\n").Replace("\n", "\r\n");
            // Append a form-feed to signal end-of-document to the driver
            if (!normalized.EndsWith("\f"))
                normalized += "\f";
            byte[] pBytes = Encoding.ASCII.GetBytes(normalized);
            return SendTextBytes(szPrinterName, pBytes);
        }

        private static string SendTextBytes(string szPrinterName, byte[] pBytes)
        {
            IntPtr hPrinter = IntPtr.Zero;
            DOCINFOW di = new DOCINFOW();
            di.pDocName = "ISRA POS Receipt";
            di.pDataType = "TEXT";

            if (!OpenPrinter(szPrinterName.Trim(), out hPrinter, IntPtr.Zero))
            {
                int err = Marshal.GetLastWin32Error();
                return "OpenPrinter failed for '" + szPrinterName + "': Win32 Error " + err + " (" + new Win32Exception(err).Message + ")";
            }

            try
            {
                if (!StartDocPrinter(hPrinter, 1, di))
                {
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

        /// <summary>
        /// Sends raw ESC/POS bytes directly to the printer spooler (RAW datatype).
        /// Used for ESC/POS binary commands — auto-paper-cut, cash drawer kick, etc.
        /// </summary>
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
                var list = new List<string>();
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

        public static string GetTestReceiptString(string targetPrinter)
        {
            return "      ISRA HARDWARE POS\r\n" +
                   "     Hardware POS System\r\n" +
                   "--------------------------------\r\n" +
                   "TEST RECEIPT PRINT (0% FLASH)\r\n" +
                   "DATE: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\r\n" +
                   "PRINTER: " + targetPrinter + "\r\n" +
                   "PORT: " + ActivePort + "\r\n" +
                   "STATUS: SUCCESSFUL\r\n" +
                   "--------------------------------\r\n" +
                   "Direct Hardware Printing Active!\r\n" +
                   "Thank you for your business!\r\n\r\n\r\n";
        }

        public static byte[] BuildTestReceiptEscpos(string targetPrinter)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                byte[] init = new byte[] { 0x1B, 0x40 };
                byte[] center = new byte[] { 0x1B, 0x61, 0x01 };
                byte[] left = new byte[] { 0x1B, 0x61, 0x00 };
                byte[] boldOn = new byte[] { 0x1B, 0x45, 0x01 };
                byte[] boldOff = new byte[] { 0x1B, 0x45, 0x00 };
                byte[] feedLines = new byte[] { 0x1B, 0x64, 0x06 };
                byte[] cut = new byte[] { 0x1D, 0x56, 0x42, 0x00 };

                ms.Write(init, 0, init.Length);
                ms.Write(center, 0, center.Length);
                ms.Write(boldOn, 0, boldOn.Length);
                byte[] header = Encoding.UTF8.GetBytes("ISRA HARDWARE POS\r\n");
                ms.Write(header, 0, header.Length);
                ms.Write(boldOff, 0, boldOff.Length);
                byte[] sub = Encoding.UTF8.GetBytes("Hardware POS System\r\n--------------------------------\r\n");
                ms.Write(sub, 0, sub.Length);

                ms.Write(left, 0, left.Length);
                byte[] info = Encoding.UTF8.GetBytes(
                    "PRINT AGENT:    STANDALONE EXE\r\n" +
                    "DATE/TIME:      " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\r\n" +
                    "PRINTER:        " + targetPrinter + "\r\n" +
                    "PORT:           " + ActivePort + "\r\n" +
                    "--------------------------------\r\n"
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
            try
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
                Console.WriteLine("  100% Zero-Flash Printing Engine Ready.");
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("=================================================");
                Console.ResetColor();
            }
            catch { }

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
                catch (Exception ex)
                {
                    try
                    {
                        Console.WriteLine("[Socket Accept Exception] " + ex.Message);
                    }
                    catch { }
                    Thread.Sleep(100);
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
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [HEALTH CHECK] Connected from Chrome POS (Port " + ActivePort + ")");
                        Console.ResetColor();

                        string json = "{\"status\":\"ok\",\"agent\":\"IsraPOS-StandaloneExe\",\"version\":\"3.3.0\",\"defaultPrinter\":\"" + EscapeJson(def) + "\",\"port\":" + ActivePort + ",\"timestamp\":\"" + DateTime.UtcNow.ToString("o") + "\"}";
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

                    JavaScriptSerializer jsonSerializer = new JavaScriptSerializer();

                    if (method == "POST" && path == "/print")
                    {
                        Dictionary<string, object> jsonDict = null;
                        try
                        {
                            if (!string.IsNullOrEmpty(body))
                                jsonDict = jsonSerializer.Deserialize<Dictionary<string, object>>(body);
                        }
                        catch (Exception parseEx)
                        {
                            Console.WriteLine("[JSON Parse Warning] " + parseEx.Message);
                        }

                        string printerName = jsonDict != null && jsonDict.ContainsKey("printerName") ? Convert.ToString(jsonDict["printerName"]) : null;
                        string base64 = jsonDict != null && jsonDict.ContainsKey("rawBase64") ? Convert.ToString(jsonDict["rawBase64"]) : null;
                        string text = jsonDict != null && jsonDict.ContainsKey("text") ? Convert.ToString(jsonDict["text"]) : null;
                        string target = ResolveTargetPrinter(printerName);

                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("\n[" + DateTime.Now.ToString("HH:mm:ss") + "] [PRINT REQUEST] Target: '" + target + "' (Text: " + (text != null ? text.Length : 0) + " chars, Base64: " + (base64 != null ? base64.Length : 0) + " chars)");
                        Console.ResetColor();

                        bool printed = false;

                        // 1. PRIMARY: GDI PrintDocument — renders properly decoded multi-line text to thermal bitmap
                        if (!string.IsNullOrEmpty(text))
                        {
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] Printing via GDI engine (using printer's own paper settings)...");
                            printed = GdiReceiptPrinter.PrintReceiptText(target, text);
                            if (!printed)
                            {
                                Console.WriteLine("[GDI Warning] GDI failed — trying TEXT spooler fallback...");
                                string textRes = RawPrinterHelper.SendTextToPrinter(target, text);
                                if (textRes == "OK") printed = true;
                            }
                        }

                        // 2. FALLBACK: RAW ESC/POS bytes — used when no text was provided or GDI/TEXT both failed.
                        if (!printed && !string.IsNullOrEmpty(base64))
                        {
                            try
                            {
                                byte[] bytes = Convert.FromBase64String(base64);
                                Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] Dispatching " + bytes.Length + " raw ESC/POS bytes to spooler...");
                                string res = RawPrinterHelper.SendBytesToPrinter(target, bytes);
                                if (res == "OK") printed = true;
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine("[RAW Spooler Warning] " + ex.Message);
                            }
                        }

                        if (printed)
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Print completed successfully to '" + target + "'");
                            Console.ResetColor();
                            SendResponse(stream, 200, "OK", "{\"success\":true,\"printer\":\"" + EscapeJson(target) + "\"}");
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [FAILED] Print job failed");
                            Console.ResetColor();
                            SendResponse(stream, 500, "Internal Server Error", "{\"error\":\"Print job failed to spool\"}");
                        }
                        return;
                    }

                    if (method == "POST" && path == "/test-print")
                    {
                        Dictionary<string, object> jsonDict = null;
                        try
                        {
                            if (!string.IsNullOrEmpty(body))
                                jsonDict = jsonSerializer.Deserialize<Dictionary<string, object>>(body);
                        }
                        catch { }

                        string printerName = jsonDict != null && jsonDict.ContainsKey("printerName") ? Convert.ToString(jsonDict["printerName"]) : null;
                        string target = ResolveTargetPrinter(printerName);

                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.WriteLine("\n[" + DateTime.Now.ToString("HH:mm:ss") + "] [TEST PRINT] Printing test page to '" + target + "'...");
                        Console.ResetColor();

                        // Primary: GDI engine with test receipt text
                        string testText = GetTestReceiptString(target);
                        bool testPrinted = GdiReceiptPrinter.PrintReceiptText(target, testText);

                        if (!testPrinted)
                        {
                            Console.WriteLine("[GDI Warning] GDI failed — trying ESC/POS RAW fallback...");
                            byte[] testBytes = BuildTestReceiptEscpos(target);
                            string rawRes = RawPrinterHelper.SendBytesToPrinter(target, testBytes);
                            if (rawRes == "OK") testPrinted = true;
                        }

                        if (testPrinted)
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Test receipt dispatched to '" + target + "'");
                            Console.ResetColor();
                            SendResponse(stream, 200, "OK", "{\"success\":true,\"printer\":\"" + EscapeJson(target) + "\"}");
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.Red;
                            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [ERROR] Test print failed.");
                            Console.ResetColor();
                            SendResponse(stream, 500, "Internal Server Error", "{\"error\":\"Print job failed on all methods\"}");
                        }
                        return;
                    }

                    if (method == "POST" && path == "/open-drawer")
                    {
                        Dictionary<string, object> jsonDict = null;
                        try
                        {
                            if (!string.IsNullOrEmpty(body))
                                jsonDict = jsonSerializer.Deserialize<Dictionary<string, object>>(body);
                        }
                        catch { }

                        string printerName = jsonDict != null && jsonDict.ContainsKey("printerName") ? Convert.ToString(jsonDict["printerName"]) : null;
                        string target = ResolveTargetPrinter(printerName);
                        byte[] drawerBytes = BuildCashDrawerKick();

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
    }
}
