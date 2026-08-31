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
        productName: "TEST PRODUCT 100MM",
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
    const productName = (item.productName || "").trim();
    const barcode = item.barcode.trim();

    // 203 DPI = 8 dots per mm
    const widthDots = Math.round(w * 8);
    const heightDots = Math.round(h * 8);

    // Dynamic layout calculations based on label dimensions
    const isSmall = w <= 35 || h <= 22;

    let cmd = "";
    cmd += `SIZE ${w} mm, ${h} mm\r\n`;
    cmd += `GAP 2 mm, 0 mm\r\n`;
    cmd += `DIRECTION 1\r\n`;
    cmd += `REFERENCE 0,0\r\n`;
    cmd += `CLS\r\n`;

    // 1. Store Name Header (centered via TSPL TEXT command with alignment = 2)
    const storeFont = isSmall ? "1" : "2"; // TSPL Font 1 (8x12), Font 2 (12x20)
    const storeY = isSmall ? 6 : 8;
    if (config.showStoreName && store) {
      const cleanStore = store.replace(/"/g, "'").substring(0, isSmall ? 28 : 34);
      const centerX = Math.round(widthDots / 2);
      cmd += `TEXT ${centerX},${storeY},"${storeFont}",0,1,1,2,"${cleanStore}"\r\n`;
    }

    // 2. Product Name (Left-Aligned, alignment = 1) with 1-space gap below store name
    let barcodeY = isSmall ? Math.round(heightDots * 0.30) : Math.round(heightDots * 0.34);
    let barcodeHeight = isSmall
      ? Math.max(30, Math.round(heightDots * 0.42))
      : Math.max(40, Math.round(heightDots * 0.46));

    if (productName) {
      const cleanProduct = productName.replace(/"/g, "'");
      const leftMarginX = isSmall ? 10 : Math.max(12, Math.round(widthDots * 0.04));

      if (isSmall) {
        // Small label (30x20): Font 1 (8x12 dots)
        const maxCharsPerLine = Math.floor((widthDots - leftMarginX * 2) / 8); // ~26 chars
        const lines = this._wrapWords(cleanProduct, maxCharsPerLine, 2);

        if (lines.length <= 1) {
          // 1-space gap (Y=22 vs Store Y=6)
          cmd += `TEXT ${leftMarginX},22,"1",0,1,1,1,"${lines[0] || ""}"\r\n`;
          barcodeY = 38;
          barcodeHeight = Math.max(28, heightDots - barcodeY - (config.showBarcodeText ? 28 : 10));
        } else {
          cmd += `TEXT ${leftMarginX},20,"1",0,1,1,1,"${lines[0]}"\r\n`;
          cmd += `TEXT ${leftMarginX},32,"1",0,1,1,1,"${lines[1]}"\r\n`;
          barcodeY = 48;
          barcodeHeight = Math.max(24, heightDots - barcodeY - (config.showBarcodeText ? 26 : 8));
        }
      } else {
        // Standard label (50x30): Font 2 (12x20 dots, matching Store Name) for 1 line, Font 1 for 2+ lines
        const maxCharsPerLineFont2 = Math.floor((widthDots - leftMarginX * 2) / 12); // ~30 chars
        const maxCharsPerLineFont1 = Math.floor((widthDots - leftMarginX * 2) / 8);  // ~45 chars

        if (cleanProduct.length <= maxCharsPerLineFont2) {
          // 1-line matching font size (Font 2 = 12x20 dots) with 1-space gap (Y=36 vs Store Y=8 + height 20)
          cmd += `TEXT ${leftMarginX},36,"2",0,1,1,1,"${cleanProduct}"\r\n`;
          barcodeY = 64;
          barcodeHeight = Math.max(42, heightDots - barcodeY - (config.showBarcodeText ? 30 : 10));
        } else {
          const lines = this._wrapWords(cleanProduct, maxCharsPerLineFont1, 3);
          if (lines.length === 2) {
            cmd += `TEXT ${leftMarginX},34,"1",0,1,1,1,"${lines[0]}"\r\n`;
            cmd += `TEXT ${leftMarginX},48,"1",0,1,1,1,"${lines[1]}"\r\n`;
            barcodeY = 66;
            barcodeHeight = Math.max(36, heightDots - barcodeY - (config.showBarcodeText ? 30 : 10));
          } else {
            cmd += `TEXT ${leftMarginX},32,"1",0,1,1,1,"${lines[0]}"\r\n`;
            cmd += `TEXT ${leftMarginX},46,"1",0,1,1,1,"${lines[1]}"\r\n`;
            cmd += `TEXT ${leftMarginX},60,"1",0,1,1,1,"${lines[2]}"\r\n`;
            barcodeY = 76;
            barcodeHeight = Math.max(30, heightDots - barcodeY - (config.showBarcodeText ? 30 : 10));
          }
        }
      }
    }

    // 3. Barcode: Code 128
    const barcodeX = Math.max(10, Math.round(widthDots * 0.06));
    const readable = config.showBarcodeText ? 1 : 0;
    const narrow = isSmall ? 2 : 2;
    const wide = isSmall ? 2 : 3;
    cmd += `BARCODE ${barcodeX},${barcodeY},"128",${barcodeHeight},${readable},0,${narrow},${wide},"${barcode}"\r\n`;

    // Dispatch exact hardware copies
    cmd += `PRINT 1,${qty}\r\n`;

    return new TextEncoder().encode(cmd);
  }

  /** Natural word wrapping helper that splits into up to maxLines lines when reaching the right edge */
  private _wrapWords(text: string, maxLen: number, maxLines: number = 3): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= maxLen) {
      return [trimmed];
    }
    const words = trimmed.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (let i = 0; i < words.length; i++) {
      const candidate = currentLine ? `${currentLine} ${words[i]}` : words[i];
      if (candidate.length <= maxLen) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = words[i];
          if (lines.length === maxLines - 1) {
            const remaining = words.slice(i).join(" ");
            const lastLine = remaining.length > maxLen
              ? remaining.substring(0, maxLen - 2) + ".."
              : remaining;
            lines.push(lastLine);
            return lines;
          }
        } else {
          lines.push(candidate.substring(0, maxLen));
          currentLine = candidate.substring(maxLen);
        }
      }
    }
    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }
    return lines;
  }
}
