/**
 * WindowsDriverEngine
 *
 * Sends barcode label print jobs using the browser's built-in window.print()
 * API directed at a Windows-installed thermal label printer driver.
 *
 * How it works:
 *   1. Opens a small popup window (the Windows print dialog selects the
 *      thermal label printer that has been set as default, or the user can
 *      select it manually).
 *   2. Writes an HTML page whose @page CSS rule exactly matches the physical
 *      label size so the printer driver places content on each label without
 *      feeding blank labels between them.
 *   3. Generates real Code128 (or configured symbology) SVG barcodes using
 *      JsBarcode — fully scannable by standard handheld barcode scanners.
 *   4. Auto-triggers window.print() on load and closes the popup on afterprint.
 *
 * Gap detection is handled entirely by the printer driver. Because each @page
 * is sized to match the label, the driver advances exactly one label per page.
 * No extra blank labels are fed.
 *
 * To add a new printer engine (Zebra ZPL, TSC TSPL, network, etc.) create a
 * new file implementing the same BarcodePrinterEngine interface. The factory
 * in index.ts will select it based on printer_type.
 */

import JsBarcode from "jsbarcode";
import type { BarcodePrinterConfig } from "./config";
import type { BarcodePrintItem, BarcodePrinterEngine } from "./types";

export class WindowsDriverEngine implements BarcodePrinterEngine {
  readonly name = "Windows Printer Driver";

  async print(item: BarcodePrintItem, config: BarcodePrinterConfig): Promise<void> {
    const html = this._buildPrintDocument(
      item.barcode,
      item.storeName,
      item.quantity,
      config
    );
    this._openAndPrint(item.barcode, html);
  }

  async testPrint(config: BarcodePrinterConfig): Promise<void> {
    const testBarcode = "TEST-12345";
    const html = this._buildPrintDocument(
      testBarcode,
      config.storeName || "ISRA HARDWARE TRADING",
      1,
      config
    );
    this._openAndPrint("TEST PRINT", html);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _openAndPrint(title: string, html: string): void {
    const popup = window.open("", "_blank", "width=400,height=300,toolbar=no,menubar=no");
    if (!popup) {
      throw new Error(
        "Pop-up blocked. Please allow pop-ups for this site in your browser settings and try again."
      );
    }
    popup.document.write(html);
    popup.document.close();
  }

  /**
   * Build a complete, self-contained HTML print document.
   *
   * Key CSS decisions:
   * - @page sets size to exact label dimensions in mm, margin 0. The printer
   *   driver reads @page size and maps it to one physical label.
   * - Each .label div is sized to 100vw × 100vh which equals exactly one page,
   *   so one label = one printer page = one physical label from the roll.
   * - page-break-after: always ensures the driver advances the label roll
   *   between copies without feeding a blank label.
   * - The script uses window.print() then listens to afterprint to close the
   *   popup so the Windows print dialog is not left open.
   */
  private _buildPrintDocument(
    barcode: string,
    storeName: string,
    quantity: number,
    config: BarcodePrinterConfig
  ): string {
    const {
      labelWidthMm:    label_width_mm,
      labelHeightMm:   label_height_mm,
      marginTopMm:     margin_top_mm,
      marginBottomMm:  margin_bottom_mm,
      marginLeftMm:    margin_left_mm,
      marginRightMm:   margin_right_mm,
      barcodeHeightMm: barcode_height_mm,
      barcodeSymbology: barcode_symbology,
      showStoreName:   show_store_name,
      showBarcodeText: show_barcode_text,
      fontFamily:      font_family,
      fontSizePt:      font_size_pt,
    } = config;

    // Printable area inside margins
    const printW = label_width_mm  - margin_left_mm  - margin_right_mm;
    const printH = label_height_mm - margin_top_mm   - margin_bottom_mm;

    // Generate barcode SVG using JsBarcode (detached DOM element)
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svgEl, barcode, {
        format:       barcode_symbology as string,
        displayValue: false,               // we render the text ourselves for precise placement
        height:       barcode_height_mm * 3.7795, // mm → px (96dpi: 1mm = 3.7795px)
        width:        1,                   // bar width multiplier — auto scaled via CSS
        margin:       0,
        background:   "#ffffff",
        lineColor:    "#000000",
      });
    } catch {
      // Invalid barcode — generate an error label
      return this._buildErrorDocument(barcode, label_width_mm, label_height_mm);
    }
    const svgHTML = svgEl.outerHTML;

    // Build one label block
    const storeNameLine = (show_store_name && storeName)
      ? `<div class="store-name">${this._esc(storeName)}</div>`
      : "";
    const barcodeTextLine = show_barcode_text
      ? `<div class="barcode-text">${this._esc(barcode)}</div>`
      : "";

    const singleLabel = `
      <div class="label">
        <div class="label-inner">
          ${storeNameLine}
          <div class="barcode-svg">${svgHTML}</div>
          ${barcodeTextLine}
        </div>
      </div>`;

    const labels = Array.from({ length: Math.max(1, quantity) })
      .map(() => singleLabel)
      .join("\n");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${this._esc(barcode)}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page = exactly one physical label ── */
    @page {
      size: ${label_width_mm}mm ${label_height_mm}mm;
      margin: 0;
    }

    html, body {
      width:  ${label_width_mm}mm;
      height: ${label_height_mm}mm;
      background: #fff;
      overflow: hidden;
    }

    /* ── One label = one page ── */
    .label {
      width:  ${label_width_mm}mm;
      height: ${label_height_mm}mm;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      overflow: hidden;
    }
    .label:last-child { page-break-after: auto; }

    /* ── Printable inner area (respects margins) ── */
    .label-inner {
      width:   ${printW}mm;
      height:  ${printH}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      overflow: hidden;
    }

    /* ── Store name — pinned to top, never shrinks ── */
    .store-name {
      flex-shrink: 0;
      width:       100%;
      font-family: ${font_family}, sans-serif;
      font-size:   ${font_size_pt}pt;
      font-weight: 700;
      text-align:  center;
      white-space: nowrap;
      overflow:    hidden;
      line-height: 1.2;
      letter-spacing: 0.3px;
    }

    /* ── Barcode SVG — fills remaining space ── */
    .barcode-svg {
      flex:      1;
      width:     100%;
      display:   flex;
      align-items: center;
      justify-content: center;
      overflow:  hidden;
      min-height: 0;
    }
    .barcode-svg svg {
      width:     100%;
      height:    auto;
      display:   block;
      max-width: ${printW}mm;
    }

    /* ── Human-readable barcode number — pinned to bottom, never shrinks ── */
    .barcode-text {
      flex-shrink:    0;
      width:          100%;
      font-family:    ${font_family}, monospace;
      font-size:      ${font_size_pt}pt;
      text-align:     center;
      letter-spacing: 1px;
      white-space:    nowrap;
      line-height:    1.2;
    }
  </style>
</head>
<body>
  ${labels}
  <script>
    // Auto-fit store name to one line by shrinking font until it fits
    window.addEventListener('load', function() {
      var el = document.querySelector('.store-name');
      if (el) {
        var minPt = 4;
        var sizePt = parseFloat(window.getComputedStyle(el).fontSize);
        // getComputedStyle returns px; convert: 1pt = 1.3333px
        var sizePx = sizePt;
        while (el.scrollWidth > el.clientWidth && sizePx > minPt * 1.3333) {
          sizePx -= 0.5;
          el.style.fontSize = sizePx + 'px';
        }
      }
      window.print();
    });
    window.addEventListener('afterprint', function() {
      window.close();
    });
  <\/script>
</body>
</html>`;
  }

  private _buildErrorDocument(barcode: string, w: number, h: number): string {
    return `<!DOCTYPE html><html><head><style>
      @page { size: ${w}mm ${h}mm; margin: 0; }
      body { display:flex; align-items:center; justify-content:center;
             width:${w}mm; height:${h}mm; font-family:sans-serif; font-size:6pt;
             color:red; text-align:center; padding:2mm; }
    </style></head><body>
      Invalid barcode:<br>${this._esc(barcode)}
      <script>window.onload=function(){window.print();window.close();}<\/script>
    </body></html>`;
  }

  /** Minimal HTML entity escaping for user-supplied strings */
  private _esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
