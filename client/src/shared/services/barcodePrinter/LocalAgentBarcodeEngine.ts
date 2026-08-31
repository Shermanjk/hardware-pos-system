/**
 * LocalAgentBarcodeEngine
 *
 * Sends native TSPL barcode label print jobs directly to the thermal label printer
 * (e.g. Xprinter XP-365B) via the local background print agent.
 *
 * Benefits:
 * - 0% browser popup / zero flash
 * - Instant dispatch (<5ms)
 * - Exact hardware quantity replication (TSPL: PRINT 1, <quantity>)
 * - Native hardware gap sensing and clean form feeds
 * - Automatic fallback to WindowsDriverEngine if print agent is offline
 */

import { localPrintAgent } from "@/shared/services/escpos/localPrintAgent";
import type { BarcodePrinterConfig } from "./config";
import type { BarcodePrintItem, BarcodePrinterEngine } from "./types";
import { WindowsDriverEngine } from "./WindowsDriverEngine";

export class LocalAgentBarcodeEngine implements BarcodePrinterEngine {
  readonly name = "Local Print Agent (TSPL Direct)";
  private fallbackEngine = new WindowsDriverEngine();

  async print(item: BarcodePrintItem, config: BarcodePrinterConfig): Promise<void> {
    // Check if background print agent is online
    const status = await localPrintAgent.checkHealth();
    if (!status.online) {
      console.log("[LocalAgentBarcodeEngine] Agent offline, falling back to Windows driver popup...");
      return this.fallbackEngine.print(item, config);
    }

    const tsplBytes = this._buildTsplCommand(item, config);
    const targetPrinter = config.printerName || undefined;

    const success = await localPrintAgent.printRaw(
      tsplBytes,
      targetPrinter,
      undefined,
      undefined,
      false
    );

    if (!success) {
      console.warn("[LocalAgentBarcodeEngine] TSPL print failed via agent, falling back to browser print...");
      return this.fallbackEngine.print(item, config);
    }
  }

  async testPrint(config: BarcodePrinterConfig): Promise<void> {
    return this.print(
      {
        barcode: "TEST-12345",
        storeName: config.storeName || "ISRA HARDWARE TRADING",
        quantity: 1,
      },
      config
    );
  }

  /**
   * Generates pure TSPL binary command stream for thermal barcode sticker printing.
   * Compatible with Xprinter XP-365B, XP-235B, XP-420B, TSC, and 4BARCODE series.
   */
  private _buildTsplCommand(item: BarcodePrintItem, config: BarcodePrinterConfig): Uint8Array {
    const w = config.labelWidthMm || 30;
    const h = config.labelHeightMm || 20;
    const qty = Math.max(1, Math.min(500, item.quantity));
    const store = (item.storeName || config.storeName || "").trim();
    const barcode = item.barcode.trim();

    // 203 DPI = 8 dots per mm
    const widthDots = Math.round(w * 8);
    const heightDots = Math.round(h * 8);

    // Dynamic layout calculations based on label dimensions
    const isSmall = w <= 35 || h <= 22;
    
    // Top text: Store Name
    const storeY = isSmall ? 10 : 16;
    const storeFont = isSmall ? "1" : "2"; // TSPL Font 1 (8x12), Font 2 (12x20)

    // Barcode dimensions & position
    const barcodeY = isSmall ? Math.round(heightDots * 0.28) : Math.round(heightDots * 0.32);
    const barcodeHeight = isSmall
      ? Math.max(30, Math.round(heightDots * 0.44))
      : Math.max(40, Math.round(heightDots * 0.48));
    
    // Centering offset for barcode (Code 128)
    const barcodeX = Math.max(10, Math.round(widthDots * 0.06));

    let cmd = "";
    cmd += `SIZE ${w} mm, ${h} mm\r\n`;
    cmd += `GAP 2 mm, 0 mm\r\n`;
    cmd += `DIRECTION 1\r\n`;
    cmd += `REFERENCE 0,0\r\n`;
    cmd += `CLS\r\n`;

    // Store Name Header (centered via TSPL TEXT command with alignment)
    if (config.showStoreName && store) {
      // Clean special characters for TSPL text
      const cleanStore = store.replace(/"/g, "'").substring(0, 32);
      const centerX = Math.round(widthDots / 2);
      // Format: TEXT x,y,"font",rotation,x-mul,y-mul,alignment,"content" (alignment 2 = center)
      cmd += `TEXT ${centerX},${storeY},"${storeFont}",0,1,1,2,"${cleanStore}"\r\n`;
    }

    // Barcode: Code 128
    // Format: BARCODE x,y,"type",height,human_readable,rotation,narrow,wide,"content"
    // human_readable: 1 (bottom), 0 (none)
    const readable = config.showBarcodeText ? 1 : 0;
    const narrow = isSmall ? 2 : 2;
    const wide = isSmall ? 2 : 3;
    cmd += `BARCODE ${barcodeX},${barcodeY},"128",${barcodeHeight},${readable},0,${narrow},${wide},"${barcode}"\r\n`;

    // Dispatch exact hardware copies
    cmd += `PRINT 1,${qty}\r\n`;

    return new TextEncoder().encode(cmd);
  }
}
