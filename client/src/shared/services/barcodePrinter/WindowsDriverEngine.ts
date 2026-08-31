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
      item.productName,
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
      "TEST PRODUCT 100MM",
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
    productName: string | undefined,
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

    const isSmall  = label_width_mm <= 35 || label_height_mm <= 22;
    const isMedium = !isSmall && (label_width_mm <= 55 || label_height_mm <= 35);

    // Printable area inside margins
    const printW = Math.max(2, label_width_mm  - margin_left_mm  - margin_right_mm);
    const printH = Math.max(2, label_height_mm - margin_top_mm   - margin_bottom_mm);

    const nameLen = (productName || "").trim().length;
    const isVeryLong = nameLen > 60;
    const isLong     = nameLen > 28;

    let storeNameFontPt: number;
    let productNameFontPt: number;
    let barcodeFontPt: number;
    let barcodeHeightMm: number;
    let productLineClamp: number;
    let letterSpacingPx: string;

    if (isSmall) {
      // 30 × 20 mm (Compact)
      storeNameFontPt   = isLong ? 5.2 : 5.5;
      productNameFontPt = isLong ? 4.2 : 4.8;
      barcodeFontPt     = isLong ? 5.0 : 5.5;
      barcodeHeightMm   = isLong ? 7.5 : 9.5;
      productLineClamp  = isLong ? 2 : 1;
      letterSpacingPx   = "0.4px";
    } else if (isMedium) {
      // 38 × 25 mm & 50 × 30 mm (Standard)
      const is25mm = label_height_mm <= 26;
      if (is25mm) {
        storeNameFontPt   = isVeryLong ? 6.2 : isLong ? 6.5 : 7.0;
        productNameFontPt = isVeryLong ? 4.8 : isLong ? 5.4 : 6.0;
        barcodeFontPt     = isVeryLong ? 6.0 : isLong ? 6.5 : 7.0;
        barcodeHeightMm   = isVeryLong ? 9.5 : isLong ? 11.0 : 13.0;
        productLineClamp  = isVeryLong ? 3 : isLong ? 2 : 1;
        letterSpacingPx   = "0.6px";
      } else {
        // 50 × 30 mm
        storeNameFontPt   = isVeryLong ? 7.0 : isLong ? 7.5 : 8.0;
        productNameFontPt = isVeryLong ? 5.2 : isLong ? 5.8 : 6.5;
        barcodeFontPt     = isVeryLong ? 6.8 : isLong ? 7.0 : 7.5;
        barcodeHeightMm   = isVeryLong ? 11.5 : isLong ? 13.5 : 16.0;
        productLineClamp  = isVeryLong ? 3 : isLong ? 2 : 1;
        letterSpacingPx   = "0.8px";
      }
    } else {
      // Large labels (60 × 40 mm, 100 × 50 mm)
      storeNameFontPt   = label_height_mm >= 45 ? 12.0 : 10.0;
      productNameFontPt = label_height_mm >= 45 ? 9.5  : 8.0;
      barcodeFontPt     = label_height_mm >= 45 ? 11.0 : 9.0;
      barcodeHeightMm   = label_height_mm >= 45 ? 26.0 : 20.0;
      productLineClamp  = 3;
      letterSpacingPx   = "1.2px";
    }

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
    const productNameLine = (productName && productName.trim())
      ? `<div class="product-name">${this._esc(productName)}</div>`
      : "";
    const barcodeTextLine = show_barcode_text
      ? `<div class="barcode-text">${this._esc(barcode)}</div>`
      : "";

    const singleLabel = `
      <div class="label">
        <div class="label-inner">
          ${storeNameLine}
          ${productNameLine}
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
        width:  100% !important;
        height: auto !important;
        margin: 0mm !important;
        padding: 0mm !important;
        background: #fff !important;
        overflow: visible !important;
      }
      .label {
        width:  ${label_width_mm}mm !important;
        height: ${label_height_mm}mm !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
        break-after: page !important;
        break-inside: avoid !important;
      }
      .label:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }

    html, body {
      width:  100%;
      height: auto;
      background: #fff;
      margin: 0;
      padding: 0;
    }

    /* ── One label = one page ── */
    .label {
      display: block !important;
      width:  ${label_width_mm}mm !important;
      height: ${label_height_mm}mm !important;
      page-break-after: always !important;
      page-break-inside: avoid !important;
      break-after: page !important;
      break-inside: avoid !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }
    .label:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }

    /* ── Printable inner area (respects margins) ── */
    .label-inner {
      width:   100% !important;
      height:  100% !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: space-between !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      padding-top:    ${margin_top_mm}mm !important;
      padding-bottom: ${margin_bottom_mm}mm !important;
      padding-left:   ${margin_left_mm}mm !important;
      padding-right:  ${margin_right_mm}mm !important;
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
      color: #000000 !important;
    }

    /* ── Product name — left-aligned with distinct font size and natural wrapping ── */
    .product-name {
      flex-shrink: 0;
      width:       100%;
      font-family: ${font_family}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size:   ${productNameFontPt}pt;
      font-weight: 600;
      text-transform: none;
      text-align:  left;
      line-height: 1.12;
      display:     -webkit-box;
      -webkit-line-clamp: ${productLineClamp};
      -webkit-box-orient: vertical;
      overflow:    hidden;
      word-break:  normal;
      overflow-wrap: break-word;
      color: #000000 !important;
      margin-top: 0.1mm;
      margin-bottom: 0.1mm;
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
      padding:    ${isSmall ? "0.2mm" : "0.4mm"} 0;
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
      color: #000000 !important;
    }
  </style>
</head>
<body>
  ${labels}
  <script>
    function doPrint() {
      setTimeout(function() {
        window.print();
      }, 80);
    }

    if (document.readyState === 'complete') {
      doPrint();
    } else {
      window.addEventListener('load', doPrint);
    }

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
