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
using System.Drawing.Drawing2D;

namespace IsraPOS.PrintAgent
{
    public class EscPosRasterPrinter
    {
        public static byte[] ConvertBitmapToEscPosRaster(Bitmap sourceBmp, int targetDotsWidth = 576)
        {
            if (sourceBmp == null) return null;

            int width = targetDotsWidth; // 576 dots for standard 80mm thermal printheads (72mm @ 203 DPI)
            int height = (int)((float)sourceBmp.Height * ((float)width / (float)sourceBmp.Width));
            if (height <= 0) height = 1;

            int byteWidth = (width + 7) / 8; // 72 bytes per line for 576 dots

            using (Bitmap resized = new Bitmap(width, height))
            {
                using (Graphics g = Graphics.FromImage(resized))
                {
                    g.Clear(Color.White);
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.SmoothingMode = SmoothingMode.HighQuality;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.DrawImage(sourceBmp, new Rectangle(0, 0, width, height));
                }

                // High-speed 1-bit monochrome rasterization with LockBits
                byte[] dots = new byte[byteWidth * height];
                System.Drawing.Imaging.BitmapData bmpData = resized.LockBits(
                    new Rectangle(0, 0, width, height),
                    System.Drawing.Imaging.ImageLockMode.ReadOnly,
                    System.Drawing.Imaging.PixelFormat.Format32bppArgb);

                try
                {
                    int stride = bmpData.Stride;
                    int byteCount = Math.Abs(stride) * height;
                    byte[] rgbValues = new byte[byteCount];
                    Marshal.Copy(bmpData.Scan0, rgbValues, 0, byteCount);

                    for (int y = 0; y < height; y++)
                    {
                        int rowOffset = y * stride;
                        int dotRowOffset = y * byteWidth;
                        for (int x = 0; x < width; x++)
                        {
                            int pixelOffset = rowOffset + (x * 4);
                            byte b = rgbValues[pixelOffset];
                            byte g = rgbValues[pixelOffset + 1];
                            byte r = rgbValues[pixelOffset + 2];
                            byte a = rgbValues[pixelOffset + 3];

                            int lum = (int)(0.299 * r + 0.587 * g + 0.114 * b);
                            if (a > 128 && lum < 185)
                            {
                                int byteIndex = dotRowOffset + (x >> 3);
                                int bitIndex = 7 - (x & 7);
                                dots[byteIndex] |= (byte)(1 << bitIndex);
                            }
                        }
                    }
                }
                finally
                {
                    resized.UnlockBits(bmpData);
                }

                using (MemoryStream ms = new MemoryStream())
                {
                    // ESC @ (Initialize printer)
                    ms.Write(new byte[] { 0x1B, 0x40 }, 0, 2);
                    // ESC a 0 (Left alignment - locks to left edge)
                    ms.Write(new byte[] { 0x1B, 0x61, 0x00 }, 0, 3);

                    // Stream raster in small chunks (128 lines max) to prevent hardware buffer overflow
                    // and ensure firmware compatibility on clone printers where the yH byte is ignored.
                    int maxChunkHeight = 128;
                    int currentY = 0;

                    while (currentY < height)
                    {
                        int chunkH = Math.Min(maxChunkHeight, height - currentY);
                        byte xL = (byte)(byteWidth & 0xFF);
                        byte xH = (byte)((byteWidth >> 8) & 0xFF);
                        byte yL = (byte)(chunkH & 0xFF);
                        byte yH = 0; // Strictly 0 because chunkH <= 128 (fits completely within yL)

                        // GS v 0 0 xL xH yL yH
                        byte[] header = new byte[] { 0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH };
                        ms.Write(header, 0, header.Length);

                        int startOffset = currentY * byteWidth;
                        int count = chunkH * byteWidth;
                        ms.Write(dots, startOffset, count);

                        currentY += chunkH;
                    }

                    // Feed 6 lines for tear bar / cutter clearance
                    ms.Write(new byte[] { 0x1B, 0x64, 0x06 }, 0, 3);
                    // GS V 66 0 (Partial paper cut)
                    ms.Write(new byte[] { 0x1D, 0x56, 0x42, 0x00 }, 0, 4);

                    return ms.ToArray();
                }
            }
        }

        public static bool PrintReceiptImageEscpos(string printerName, byte[] imageBytes)
        {
            try
            {
                if (imageBytes == null || imageBytes.Length == 0) return false;

                using (MemoryStream ms = new MemoryStream(imageBytes))
                using (Bitmap sourceBmp = new Bitmap(ms))
                {
                    // 576 dots = 72mm printable width @ 203 DPI, perfect 1:1 match for standard 80mm thermal printers
                    byte[] rawEscPos = ConvertBitmapToEscPosRaster(sourceBmp, 576);
                    if (rawEscPos == null || rawEscPos.Length == 0) return false;

                    string res = RawPrinterHelper.SendBytesToPrinter(printerName, rawEscPos);
                    if (res == "OK") return true;

                    Console.WriteLine("[ESC/POS Raster Spooler Warning] " + res);
                    return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[ESC/POS Raster Print Error] " + ex.Message);
                return false;
            }
        }
    }

    public class PrinterMarginsConfig
    {
        public float topMarginMm = 2.0f;
        public float bottomMarginMm = 2.0f;
        public float leftMarginMm = 1.0f;
        public float contentWidthMm = 71.6f;

        public static PrinterMarginsConfig Load()
        {
            PrinterMarginsConfig cfg = new PrinterMarginsConfig();
            try
            {
                string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "printer_margins.json");
                if (!File.Exists(configPath))
                {
                    configPath = Path.Combine(Environment.CurrentDirectory, "printer_margins.json");
                }

                if (File.Exists(configPath))
                {
                    string json = File.ReadAllText(configPath);
                    JavaScriptSerializer serializer = new JavaScriptSerializer();
                    Dictionary<string, object> dict = serializer.Deserialize<Dictionary<string, object>>(json);
                    if (dict != null)
                    {
                        if (dict.ContainsKey("topMarginMm"))     cfg.topMarginMm    = Convert.ToSingle(dict["topMarginMm"]);
                        if (dict.ContainsKey("bottomMarginMm"))  cfg.bottomMarginMm = Convert.ToSingle(dict["bottomMarginMm"]);
                        if (dict.ContainsKey("leftMarginMm"))    cfg.leftMarginMm   = Convert.ToSingle(dict["leftMarginMm"]);
                        if (dict.ContainsKey("contentWidthMm"))  cfg.contentWidthMm = Convert.ToSingle(dict["contentWidthMm"]);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Margin Config Notice] Using defaults: " + ex.Message);
            }
            return cfg;
        }
    }

    public class TsplRasterPrinter
    {
        public static byte[] ConvertBitmapToTspl(Bitmap sourceBmp, int targetDotsWidth = 576)
        {
            if (sourceBmp == null) return null;

            PrinterMarginsConfig margins = PrinterMarginsConfig.Load();

            int width = targetDotsWidth; // 576 dots = 72mm @ 203 DPI (8 dots/mm)
            int height = (int)((float)sourceBmp.Height * ((float)width / (float)sourceBmp.Width));
            if (height <= 0) height = 1;

            int byteWidth = (width + 7) / 8; // 72 bytes per row for 576 dots
            int topOffsetDots = (int)(margins.topMarginMm * 8.0f);
            int leftOffsetDots = (int)(margins.leftMarginMm * 8.0f);
            int contentHeightMm = (int)Math.Ceiling(height / 8.0f);
            
            // EXACT dynamic total page height in TSPL: topMarginMm + contentHeightMm + exact bottomMarginMm
            int totalHeightMm = (int)Math.Ceiling(margins.topMarginMm + contentHeightMm + margins.bottomMarginMm);

            Console.ForegroundColor = ConsoleColor.DarkCyan;
            Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [TSPL MARGINS] Top: " + margins.topMarginMm.ToString("F1") +
                "mm | Left: " + margins.leftMarginMm.ToString("F1") +
                "mm | Content: " + contentHeightMm.ToString() +
                "mm | Bottom: " + margins.bottomMarginMm.ToString("F1") +
                "mm | Total Paper Roll: " + totalHeightMm.ToString() + "mm");
            Console.ResetColor();

            using (Bitmap resized = new Bitmap(width, height))
            {
                using (Graphics g = Graphics.FromImage(resized))
                {
                    g.Clear(Color.White);
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.SmoothingMode = SmoothingMode.HighQuality;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.DrawImage(sourceBmp, new Rectangle(0, 0, width, height));
                }

                // High-speed 1-bit monochrome rasterization with LockBits
                // In TSPL BITMAP mode: 1 = White (no thermal heat), 0 = Black (thermal heat / text)
                byte[] dots = new byte[byteWidth * height];
                for (int i = 0; i < dots.Length; i++)
                {
                    dots[i] = 0xFF; // Initialize all bits to 1 (Pure white paper background)
                }

                System.Drawing.Imaging.BitmapData bmpData = resized.LockBits(
                    new Rectangle(0, 0, width, height),
                    System.Drawing.Imaging.ImageLockMode.ReadOnly,
                    System.Drawing.Imaging.PixelFormat.Format32bppArgb);

                try
                {
                    int stride = bmpData.Stride;
                    int byteCount = Math.Abs(stride) * height;
                    byte[] rgbValues = new byte[byteCount];
                    Marshal.Copy(bmpData.Scan0, rgbValues, 0, byteCount);

                    for (int y = 0; y < height; y++)
                    {
                        int rowOffset = y * stride;
                        int dotRowOffset = y * byteWidth;
                        for (int x = 0; x < width; x++)
                        {
                            int pixelOffset = rowOffset + (x * 4);
                            byte b = rgbValues[pixelOffset];
                            byte g = rgbValues[pixelOffset + 1];
                            byte r = rgbValues[pixelOffset + 2];
                            byte a = rgbValues[pixelOffset + 3];

                            int lum = (int)(0.299 * r + 0.587 * g + 0.114 * b);
                            if (a > 128 && lum < 185)
                            {
                                int byteIndex = dotRowOffset + (x >> 3);
                                int bitIndex = 7 - (x & 7);
                                dots[byteIndex] &= (byte)~(1 << bitIndex); // Set bit to 0 (Black dot in TSPL)
                            }
                        }
                    }
                }
                finally
                {
                    resized.UnlockBits(bmpData);
                }

                using (MemoryStream ms = new MemoryStream())
                {
                    string header = string.Format(
                        "SIZE 72 mm, {0} mm\r\n" +
                        "GAP 0,0\r\n" +
                        "DIRECTION 0\r\n" +
                        "REFERENCE 0,0\r\n" +
                        "CLS\r\n" +
                        "BITMAP {1},{2},{3},{4},0,",
                        totalHeightMm, leftOffsetDots, topOffsetDots, byteWidth, height
                    );

                    byte[] headerBytes = Encoding.ASCII.GetBytes(header);
                    ms.Write(headerBytes, 0, headerBytes.Length);
                    ms.Write(dots, 0, dots.Length);

                    string footer = "\r\nPRINT 1,1\r\n";
                    byte[] footerBytes = Encoding.ASCII.GetBytes(footer);
                    ms.Write(footerBytes, 0, footerBytes.Length);

                    return ms.ToArray();
                }
            }
        }

        public static bool PrintReceiptImageTspl(string printerName, byte[] imageBytes)
        {
            try
            {
                if (imageBytes == null || imageBytes.Length == 0) return false;

                using (MemoryStream ms = new MemoryStream(imageBytes))
                using (Bitmap sourceBmp = new Bitmap(ms))
                {
                    byte[] rawTspl = ConvertBitmapToTspl(sourceBmp, 576);
                    if (rawTspl == null || rawTspl.Length == 0) return false;

                    string res = RawPrinterHelper.SendBytesToPrinter(printerName, rawTspl);
                    if (res == "OK") return true;

                    Console.WriteLine("[TSPL Spooler Warning] " + res);
                    return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[TSPL Print Error] " + ex.Message);
                return false;
            }
        }
    }

    public class ImageReceiptPrinter
    {
        public static bool PrintReceiptImage(string printerName, byte[] imageBytes)
        {
            try
            {
                if (imageBytes == null || imageBytes.Length == 0) return false;

                using (MemoryStream ms = new MemoryStream(imageBytes))
                using (Bitmap sourceBmp = new Bitmap(ms))
                {
                    PrintDocument pd = new PrintDocument();
                    pd.PrinterSettings.PrinterName = printerName;
                    pd.PrintController = new StandardPrintController();

                    PrinterMarginsConfig margins = PrinterMarginsConfig.Load();
                    float topMarginMm     = margins.topMarginMm;
                    float bottomMarginMm  = margins.bottomMarginMm;
                    float leftMarginMm    = margins.leftMarginMm;
                    float contentWidthMm  = margins.contentWidthMm;

                    // Convert mm to hundredths of an inch (1 inch = 25.4mm = 100 hundredths)
                    float leftMarginHundredths   = (leftMarginMm / 25.4f) * 100f;
                    float topMarginHundredths    = (topMarginMm / 25.4f) * 100f;
                    float bottomMarginHundredths = (bottomMarginMm / 25.4f) * 100f;
                    float drawWidthHundredths    = (contentWidthMm / 25.4f) * 100f;
                    
                    float aspectRatio            = (float)sourceBmp.Height / (float)sourceBmp.Width;
                    float totalDrawHeight        = drawWidthHundredths * aspectRatio;

                    // EXACT DYNAMIC PAGE HEIGHT CALCULATION:
                    // Content draw height + top margin + bottom margin
                    int totalPageHeightHundredths = (int)Math.Ceiling(topMarginHundredths + totalDrawHeight + bottomMarginHundredths + 4f);
                    if (totalPageHeightHundredths < 100) totalPageHeightHundredths = 100; // Minimum 25mm

                    // Find driver stock if defined (to inherit RawKind / driver binding)
                    PaperSize stock80mm = null;
                    foreach (PaperSize ps in pd.PrinterSettings.PaperSizes)
                    {
                        if (ps.PaperName.Equals("80mm Receipt", StringComparison.OrdinalIgnoreCase))
                        {
                            stock80mm = ps;
                            break;
                        }
                    }

                    if (stock80mm == null)
                    {
                        foreach (PaperSize ps in pd.PrinterSettings.PaperSizes)
                        {
                            if (ps.PaperName.IndexOf("80", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                ps.PaperName.IndexOf("Receipt", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                ps.PaperName.IndexOf("Continuous", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                stock80mm = ps;
                                break;
                            }
                        }
                    }

                    // CRITICAL FIX: Create dynamic PaperSize with the EXACT calculated height of this receipt
                    // This allows 2-item sales to be compact (~160mm) and 4+ item bulk sales to expand (270mm - 1000mm)
                    PaperSize dynamicReceiptSize = new PaperSize(
                        stock80mm != null ? stock80mm.PaperName : "80mm Receipt",
                        315, // 80.0 mm paper roll width
                        totalPageHeightHundredths // EXACT dynamic height for this specific sale!
                    );

                    if (stock80mm != null && stock80mm.RawKind > 0)
                    {
                        dynamicReceiptSize.RawKind = stock80mm.RawKind;
                    }
                    else
                    {
                        dynamicReceiptSize.RawKind = 256; // Custom User Paper
                    }

                    pd.DefaultPageSettings.PaperSize = dynamicReceiptSize;
                    pd.PrinterSettings.DefaultPageSettings.PaperSize = dynamicReceiptSize;
                    pd.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
                    pd.PrinterSettings.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

                    // Ensure page settings apply to all pages dynamically
                    pd.QueryPageSettings += (sender, e) =>
                    {
                        e.PageSettings.PaperSize = dynamicReceiptSize;
                        e.PageSettings.Margins = new Margins(0, 0, 0, 0);
                    };

                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [DYNAMIC PAGE SIZE] " +
                        "Paper: '" + dynamicReceiptSize.PaperName + "' (" + (dynamicReceiptSize.Width * 25.4f / 100f).ToString("F1") + "mm wide x " + (dynamicReceiptSize.Height * 25.4f / 100f).ToString("F1") + "mm length, RawKind: " + dynamicReceiptSize.RawKind + ")");
                    Console.ResetColor();

                    Console.ForegroundColor = ConsoleColor.DarkCyan;
                    Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [DYNAMIC CONTINUOUS ROLL] " +
                        "Top Margin: " + topMarginMm.ToString("F1") + "mm | Bottom Clearance Feed: " + bottomMarginMm.ToString("F1") + "mm" +
                        " | Content Draw: " + (totalDrawHeight * 25.4f / 100f).ToString("F1") + "mm | Total Paper Length: " + (totalPageHeightHundredths * 25.4f / 100f).ToString("F1") + "mm");
                    Console.ResetColor();

                    pd.PrintPage += (sender, e) =>
                    {
                        e.Graphics.ResetClip();

                        float srcW = (float)sourceBmp.Width;
                        float srcH = (float)sourceBmp.Height;

                        Console.ForegroundColor = ConsoleColor.Cyan;
                        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] [IMAGE RENDER] " +
                            "Draw: " + drawWidthHundredths.ToString("F1") + "x" + totalDrawHeight.ToString("F1") +
                            " hundredths (" + (drawWidthHundredths * 25.4f / 100f).ToString("F1") + "mm wide)" +
                            " | Full Src: " + srcW.ToString("F0") + "x" + srcH.ToString("F0") + " px (100% complete receipt)");
                        Console.ResetColor();

                        // Crisp thermal rendering: avoid anti-aliasing gray halftones that cause blur on thermal heads
                        e.Graphics.InterpolationMode = InterpolationMode.NearestNeighbor;
                        e.Graphics.SmoothingMode     = SmoothingMode.None;
                        e.Graphics.PixelOffsetMode   = PixelOffsetMode.Half;

                        // 1-pass complete continuous render (ZERO gaps, ZERO page breaks)
                        RectangleF srcRect  = new RectangleF(0f, 0f, srcW, srcH);
                        RectangleF destRect = new RectangleF(leftMarginHundredths, topMarginHundredths, drawWidthHundredths, totalDrawHeight);
                        e.Graphics.DrawImage(sourceBmp, destRect, srcRect, GraphicsUnit.Pixel);

                        e.HasMorePages = false; // Single continuous thermal receipt
                    };

                    pd.Print();
                    return true;
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[Image Print Error] " + ex.Message);
                Console.ResetColor();
                return false;
            }
        }
    }

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
                    string lower = p.ToLower();
                    // Exclude barcode/label printers from POS receipt agent
                    if (lower.Contains("365") || lower.Contains("label") || lower.Contains("barcode"))
                        continue;

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
            if (!string.IsNullOrEmpty(requestedPrinter) && requestedPrinter.Trim() != "Default" && !requestedPrinter.ToLower().Contains("365"))
            {
                return requestedPrinter.Trim();
            }

            string[] printers = GetInstalledPrinters();

            // 1. Explicitly prioritize dedicated 80mm POS receipt printers (POS-80, VOZY, Thermal, Receipt)
            foreach (string p in printers)
            {
                string lower = p.ToLower();
                if (lower.Contains("pos-80") || lower.Contains("pos 80") || lower.Contains("vozy") || lower.Contains("pos") || lower.Contains("receipt") || lower.Contains("thermal"))
                {
                    return p;
                }
            }

            // 2. Fallback to Windows default printer (if not a label printer)
            string def = GetDefaultPrinterName();
            if (!string.IsNullOrEmpty(def) && def != "Default" && !def.ToLower().Contains("365") && !def.ToLower().Contains("label"))
            {
                return def;
            }

            return printers.Length > 0 ? printers[0] : "POS-80";
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

        public static void SafeLog(string message, ConsoleColor? color = null)
        {
            try
            {
                if (color.HasValue) Console.ForegroundColor = color.Value;
                Console.WriteLine(message);
                if (color.HasValue) Console.ResetColor();
            }
            catch { }
            try
            {
                string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent_debug.log");
                File.AppendAllText(logPath, "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + message + "\r\n");
            }
            catch { }
        }

        public static void Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                try
                {
                    string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent_debug.log");
                    File.AppendAllText(logPath, "[" + DateTime.Now.ToString() + "] UnhandledException: " + (e.ExceptionObject != null ? e.ExceptionObject.ToString() : "null") + "\r\n");
                }
                catch { }
            };

            SafeLog("=================================================", ConsoleColor.Green);
            SafeLog("  Isra Hardware POS - Standalone Print Agent     ", ConsoleColor.Green);
            SafeLog("=================================================", ConsoleColor.Green);
            SafeLog("  Receipt Printer: " + ResolveTargetPrinter(null), ConsoleColor.Cyan);
            
            string[] all = GetInstalledPrinters();
            SafeLog("  Installed Receipt Printers (" + all.Length + "):", ConsoleColor.Cyan);
            foreach (string p in all)
            {
                SafeLog("    * " + p);
            }

            SafeLog("  100% Zero-Flash Printing Engine Ready.", ConsoleColor.Yellow);
            SafeLog("=================================================", ConsoleColor.Green);

            try
            {
                int currentPid = System.Diagnostics.Process.GetCurrentProcess().Id;
                foreach (var proc in System.Diagnostics.Process.GetProcessesByName("IsraPrintAgent"))
                {
                    if (proc.Id != currentPid)
                    {
                        try { proc.Kill(); proc.WaitForExit(1000); } catch { }
                    }
                }
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
                    SafeLog("\n[SUCCESS] Print Agent listening on http://127.0.0.1:" + ActivePort, ConsoleColor.Green);
                    break;
                }
                catch (Exception ex)
                {
                    SafeLog("Port " + port + " busy (" + ex.Message + "), trying next...", ConsoleColor.DarkGray);
                }
            }

            if (!started)
            {
                SafeLog("[FATAL ERROR] Could not bind to any candidate port (18181-18184).", ConsoleColor.Red);
                try { Console.ReadLine(); } catch { }
                return;
            }

            SafeLog("Waiting for print jobs from Chrome POS... (Logs will appear below)\n", ConsoleColor.White);

            while (true)
            {
                try
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch (Exception ex)
                {
                    SafeLog("[Socket Accept Exception] " + ex.Message);
                    Thread.Sleep(100);
                }
            }
        }

        private static void HandleClient(object obj)
        {
            using (TcpClient client = (TcpClient)obj)
            using (NetworkStream stream = client.GetStream())
            {
                // 30-second timeout: large base64 image payloads (100-400 KB JSON) need time
                // to transmit over TCP loopback + GDI pd.Print() blocks until spooler accepts.
                // The previous 4-second timeout truncated imageBase64 mid-transmission,
                // causing the agent to silently fall back to plain-text printing every time.
                stream.ReadTimeout = 30000;
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
                        // Use StreamReader.Read() to drain its internal buffer correctly.
                        // (Switching to raw stream.Read() would lose bytes already buffered by StreamReader.)
                        // The 30-second stream.ReadTimeout above is what actually prevents truncation
                        // of large imageBase64 payloads (100-400 KB JSON bodies).
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
                        string def = ResolveTargetPrinter(null);
                        SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] [HEALTH CHECK] Connected from Chrome POS (Port " + ActivePort + ", Printer: " + def + ")", ConsoleColor.DarkCyan);

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
                            SafeLog("[JSON Parse Warning] " + parseEx.Message);
                        }

                        string printerName = jsonDict != null && jsonDict.ContainsKey("printerName") ? Convert.ToString(jsonDict["printerName"]) : null;
                        string imageBase64 = jsonDict != null && jsonDict.ContainsKey("imageBase64") ? Convert.ToString(jsonDict["imageBase64"]) : null;
                        string base64 = jsonDict != null && jsonDict.ContainsKey("rawBase64") ? Convert.ToString(jsonDict["rawBase64"]) : null;
                        string text = jsonDict != null && jsonDict.ContainsKey("text") ? Convert.ToString(jsonDict["text"]) : null;
                        bool kickDrawer = jsonDict != null && jsonDict.ContainsKey("kickDrawer") && Convert.ToBoolean(jsonDict["kickDrawer"]);
                        string target = ResolveTargetPrinter(printerName);

                        SafeLog("\n[" + DateTime.Now.ToString("HH:mm:ss") + "] [PRINT REQUEST] Target: '" + target + "' (Image: " + (!string.IsNullOrEmpty(imageBase64) ? "YES" : "NO") + ", Text: " + (text != null ? text.Length : 0) + " chars, Base64: " + (base64 != null ? base64.Length : 0) + " chars, Drawer: " + kickDrawer + ")", ConsoleColor.Yellow);

                        bool printed = false;

                        // 1. PRIMARY: Exact HTML Raster Image
                        if (!string.IsNullOrEmpty(imageBase64))
                        {
                            try
                            {
                                byte[] imgBytes = Convert.FromBase64String(imageBase64);

                                SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] Printing canonical receipt image via Windows GDI...", ConsoleColor.Cyan);
                                printed = ImageReceiptPrinter.PrintReceiptImage(target, imgBytes);

                                if (!printed)
                                {
                                    SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] Windows GDI failed, trying ESC/POS raw backup...");
                                    printed = EscPosRasterPrinter.PrintReceiptImageEscpos(target, imgBytes);
                                }
                            }
                            catch (Exception imgEx)
                            {
                                SafeLog("[Image Decode Warning] " + imgEx.Message);
                            }
                        }

                        // 2. FALLBACK 1: GDI text rendering
                        if (!printed && !string.IsNullOrEmpty(text))
                        {
                            SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] Printing via GDI text engine...");
                            printed = GdiReceiptPrinter.PrintReceiptText(target, text);
                            if (!printed)
                            {
                                SafeLog("[GDI Warning] GDI failed — trying TEXT spooler fallback...");
                                string textRes = RawPrinterHelper.SendTextToPrinter(target, text);
                                if (textRes == "OK") printed = true;
                            }
                        }

                        // 3. FALLBACK 2: RAW ESC/POS bytes
                        if (!printed && !string.IsNullOrEmpty(base64))
                        {
                            try
                            {
                                byte[] bytes = Convert.FromBase64String(base64);
                                SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] Dispatching " + bytes.Length + " raw ESC/POS bytes to spooler...");
                                string res = RawPrinterHelper.SendBytesToPrinter(target, bytes);
                                if (res == "OK") printed = true;
                            }
                            catch (Exception ex)
                            {
                                SafeLog("[RAW Spooler Warning] " + ex.Message);
                            }
                        }

                        // Hardware Cash Drawer Kick (if requested for cash sale)
                        if (kickDrawer)
                        {
                            try
                            {
                                byte[] drawerBytes = BuildCashDrawerKick();
                                RawPrinterHelper.SendBytesToPrinter(target, drawerBytes);
                            }
                            catch { }
                        }

                        if (printed)
                        {
                            SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Print completed successfully to '" + target + "'", ConsoleColor.Green);
                            SendResponse(stream, 200, "OK", "{\"success\":true,\"printer\":\"" + EscapeJson(target) + "\"}");
                        }
                        else
                        {
                            SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] [FAILED] Print job failed", ConsoleColor.Red);
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

                        SafeLog("\n[" + DateTime.Now.ToString("HH:mm:ss") + "] [TEST PRINT] Printing test page to '" + target + "'...", ConsoleColor.Yellow);

                        // Primary: GDI engine with test receipt text
                        string testText = GetTestReceiptString(target);
                        bool testPrinted = GdiReceiptPrinter.PrintReceiptText(target, testText);

                        if (!testPrinted)
                        {
                            SafeLog("[GDI Warning] GDI failed — trying ESC/POS RAW fallback...");
                            byte[] testBytes = BuildTestReceiptEscpos(target);
                            string rawRes = RawPrinterHelper.SendBytesToPrinter(target, testBytes);
                            if (rawRes == "OK") testPrinted = true;
                        }

                        if (testPrinted)
                        {
                            SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Test receipt dispatched to '" + target + "'", ConsoleColor.Green);
                            SendResponse(stream, 200, "OK", "{\"success\":true,\"printer\":\"" + EscapeJson(target) + "\"}");
                        }
                        else
                        {
                            SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] [ERROR] Test print failed.", ConsoleColor.Red);
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
                            SafeLog("[" + DateTime.Now.ToString("HH:mm:ss") + "] [SUCCESS] Cash drawer kick sent.", ConsoleColor.Green);
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
                    SafeLog("[REQUEST EXCEPTION] " + ex.Message, ConsoleColor.Red);
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
