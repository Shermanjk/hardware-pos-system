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
    // ── Diagnostic: log exact dimensions before any browser interaction ──────
    // These values are what is written into @page and .label in the HTML.
    // If these match what you entered (e.g. 50×30), the application is correct.
    // Open browser DevTools (F12) → Console to see this log when printing.
    const pageMatch   = html.match(/@page\s*\{[^}]*size:\s*([\d.]+mm)\s+([\d.]+mm)/);
    const labelMatch  = html.match(/\.label\s*\{[^}]*width:\s*([\d.]+mm)/);
    console.log(
      "%c[BarcodePrinter] Print job dispatched",
      "color:#2563eb;font-weight:bold"
    );
    console.log(
      "  @page size in generated HTML:",
      pageMatch ? `${pageMatch[1]} × ${pageMatch[2]}` : "(not found — check _buildPrintDocument)"
    );
    console.log(
      "  .label width in generated HTML:",
      labelMatch ? labelMatch[1] : "(not found)"
    );
    console.log(
      "  Full generated HTML (copy to verify):",
      html
    );

    const popup = window.open("", "_blank", "width=600,height=400,toolbar=no,menubar=no");
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
      barcodeSymbology: barcode_symbology,
      showStoreName:   show_store_name,
      showBarcodeText: show_barcode_text,
      fontFamily:      font_family,
    } = config;

    const isSmall = label_width_mm <= 35 || label_height_mm <= 22;

    // Printable area inside margins
    const printW = Math.max(2, label_width_mm  - margin_left_mm  - margin_right_mm);
    const printH = Math.max(2, label_height_mm - margin_top_mm   - margin_bottom_mm);

    // Dynamic typography and barcode allocation
    const storeNameFontPt = Math.max(7, Math.min(18, Math.round(label_height_mm * 0.38 * 10) / 10));
    const barcodeFontPt   = Math.max(6.5, Math.min(16, Math.round(label_height_mm * 0.34 * 10) / 10));
    const barcodeHeightMm = Math.max(4, Math.round(printH * 0.58 * 10) / 10);
    const letterSpacingPx = isSmall ? "0.4px" : "1.2px";

    // Generate barcode SVG using JsBarcode (detached DOM element)
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svgEl, barcode, {
        format:       barcode_symbology as string,
        displayValue: false,               // we render the text ourselves for precise placement
        height:       barcodeHeightMm * 3.7795, // mm → px (96dpi: 1mm = 3.7795px)
        width:        1,                   // bar width multiplier — auto scaled via CSS
        margin:       0,
        background:   "#ffffff",
        lineColor:    "#000000",
      });
      // Ensure barcode bars stretch to fill printable width regardless of barcode length
      svgEl.setAttribute("preserveAspectRatio", "none");
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
      margin: 0mm;
    }

    @media print {
      @page {
        size: ${label_width_mm}mm ${label_height_mm}mm;
        margin: 0mm;
      }
      html, body {
        width:  ${label_width_mm}mm !important;
        height: ${label_height_mm}mm !important;
        margin: 0mm !important;
        padding: 0mm !important;
      }
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
      page-break-inside: avoid;
      overflow: hidden;
      box-sizing: border-box;
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
      box-sizing: border-box;
    }

    /* ── Store name — pinned to top, dynamic font size ── */
    .store-name {
      flex-shrink: 0;
      width:       100%;
      font-family: ${font_family}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size:   ${storeNameFontPt}pt;
      font-weight: 800;
      text-transform: uppercase;
      text-align:  center;
      white-space: nowrap;
      overflow:    hidden;
      line-height: 1.15;
      letter-spacing: 0.2px;
    }

    /* ── Barcode SVG — fills remaining space, dynamically fills full width and height ── */
    .barcode-svg {
      flex:       1;
      width:      100%;
      max-width:  ${printW}mm;
      display:    flex;
      align-items: center;
      justify-content: center;
      overflow:   hidden;
      min-height: 0;
      padding:    ${isSmall ? "0.2mm" : "0.5mm"} 0;
    }
    .barcode-svg svg {
      width:      100%;
      height:     100%;
      max-height: 100%;
      max-width:  ${printW}mm;
      display:    block;
    }

    /* ── Human-readable barcode number — pinned to bottom, dynamic font size ── */
    .barcode-text {
      flex-shrink:    0;
      width:          100%;
      font-family:    ${font_family}, "Courier New", monospace;
      font-size:      ${barcodeFontPt}pt;
      font-weight:    700;
      text-align:     center;
      letter-spacing: ${letterSpacingPx};
      white-space:    nowrap;
      line-height:    1.15;
    }
  </style>
</head>
<body>
  ${labels}
  <script>
    function fitTextElements() {
      // 1. Fit all Store Name elements across all label copies
      var storeNames = document.querySelectorAll('.store-name');
      storeNames.forEach(function(el) {
        var maxW = el.clientWidth;
        if (!maxW) return;
        var curSize = parseFloat(window.getComputedStyle(el).fontSize) || 12;
        var minSize = 5;
        while (el.scrollWidth > maxW && curSize > minSize) {
          curSize -= 0.3;
          el.style.fontSize = curSize + 'px';
        }
      });

      // 2. Fit all Barcode Text elements across all label copies
      var barcodeTexts = document.querySelectorAll('.barcode-text');
      barcodeTexts.forEach(function(el) {
        var maxW = el.clientWidth;
        if (!maxW) return;
        var curSize = parseFloat(window.getComputedStyle(el).fontSize) || 12;
        var minSize = 5;
        while (el.scrollWidth > maxW && curSize > minSize) {
          curSize -= 0.3;
          el.style.fontSize = curSize + 'px';
        }
      });
    }

    window.addEventListener('load', function() {
      fitTextElements();
      setTimeout(function() {
        window.print();
      }, 50);
    });

    window.addEventListener('afterprint', function() {
      window.close();
    });
  </script>
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
      <script>window.onload=function(){window.print();window.close();}</script>
    </body></html>`;
  }

  /** Minimal HTML entity escaping for user-supplied strings */
  private _esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}
