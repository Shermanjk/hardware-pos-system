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
    const storeY = isSmall ? 6 : 10;
    if (config.showStoreName && store) {
      const cleanStore = store.replace(/"/g, "'").substring(0, isSmall ? 28 : 34);
      const centerX = Math.round(widthDots / 2);
      cmd += `TEXT ${centerX},${storeY},"${storeFont}",0,1,1,2,"${cleanStore}"\r\n`;
    }

    // 2. Product Name (Left-Aligned, alignment = 1)
    let barcodeY = isSmall ? Math.round(heightDots * 0.28) : Math.round(heightDots * 0.32);
    let barcodeHeight = isSmall
      ? Math.max(30, Math.round(heightDots * 0.44))
      : Math.max(40, Math.round(heightDots * 0.48));

    if (productName) {
      const cleanProduct = productName.replace(/"/g, "'");
      const leftMarginX = isSmall ? 10 : Math.max(12, Math.round(widthDots * 0.04));

      if (isSmall) {
        // Small label (30x20): 1 or 2 lines
        const maxCharsPerLine = Math.floor((widthDots - leftMarginX * 2) / 8); // ~26 chars for Font 1
        const lines = this._wrapWords(cleanProduct, maxCharsPerLine, 2);

        if (lines.length <= 1) {
          cmd += `TEXT ${leftMarginX},20,"1",0,1,1,1,"${lines[0] || ""}"\r\n`;
          barcodeY = 36;
          barcodeHeight = Math.max(30, heightDots - barcodeY - (config.showBarcodeText ? 28 : 10));
        } else {
          cmd += `TEXT ${leftMarginX},18,"1",0,1,1,1,"${lines[0]}"\r\n`;
          cmd += `TEXT ${leftMarginX},30,"1",0,1,1,1,"${lines[1]}"\r\n`;
          barcodeY = 46;
          barcodeHeight = Math.max(26, heightDots - barcodeY - (config.showBarcodeText ? 26 : 8));
        }
      } else {
        // Standard label (50x30): Font 1 (8x12 dots)
        const maxCharsPerLine = Math.floor((widthDots - leftMarginX * 2) / 8); // ~45 chars for Font 1
        const lines = this._wrapWords(cleanProduct, maxCharsPerLine, 3);

        if (lines.length <= 1) {
          cmd += `TEXT ${leftMarginX},32,"1",0,1,1,1,"${lines[0] || ""}"\r\n`;
          barcodeY = 50;
          barcodeHeight = Math.max(45, heightDots - barcodeY - (config.showBarcodeText ? 30 : 10));
        } else if (lines.length === 2) {
          cmd += `TEXT ${leftMarginX},30,"1",0,1,1,1,"${lines[0]}"\r\n`;
          cmd += `TEXT ${leftMarginX},44,"1",0,1,1,1,"${lines[1]}"\r\n`;
          barcodeY = 62;
          barcodeHeight = Math.max(38, heightDots - barcodeY - (config.showBarcodeText ? 30 : 10));
        } else {
          cmd += `TEXT ${leftMarginX},28,"1",0,1,1,1,"${lines[0]}"\r\n`;
          cmd += `TEXT ${leftMarginX},42,"1",0,1,1,1,"${lines[1]}"\r\n`;
          cmd += `TEXT ${leftMarginX},56,"1",0,1,1,1,"${lines[2]}"\r\n`;
          barcodeY = 74;
          barcodeHeight = Math.max(32, heightDots - barcodeY - (config.showBarcodeText ? 30 : 10));
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
