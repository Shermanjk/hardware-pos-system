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

    // Dynamic typography and height allocations
    const nameLen = (productName || "").length;
    const isVeryLong = nameLen > 90;
    const isLong     = nameLen > 50;
    const isMid      = nameLen > 30;

    let storeHeightMm: number;
    let storeNameFontPt: number;
    let productHeightMm: number;
    let productNameFontPt: number;
    let productLineClamp: number;
    let barcodeHeightMm: number;
    let textHeightMm: number;
    let barcodeFontPt: number;
    let letterSpacingPx: string;

    if (isSmall) {
      // 30 × 20 mm (Compact)
      storeHeightMm     = 2.4;
      storeNameFontPt   = 5.8;
      productHeightMm   = 4.6;
      productNameFontPt = isVeryLong ? 4.2 : isLong ? 4.6 : 5.0;
      productLineClamp  = isVeryLong ? 3 : 2;
      barcodeHeightMm   = isVeryLong ? 7.2 : isLong ? 7.6 : 8.2;
      textHeightMm      = 2.6;
      barcodeFontPt     = 6.0;
      letterSpacingPx   = "0.4px";
    } else if (isMedium) {
      const is25mm = label_height_mm <= 26;
      if (is25mm) {
        // 38 × 25 mm
        storeHeightMm     = 2.8;
        storeNameFontPt   = 7.0;
        productHeightMm   = 5.6;
        productNameFontPt = isVeryLong ? 5.2 : isLong ? 5.8 : 6.5;
        productLineClamp  = isVeryLong ? 3 : 2;
        barcodeHeightMm   = isVeryLong ? 9.5 : isLong ? 10.2 : 11.2;
        textHeightMm      = 2.8;
        barcodeFontPt     = 7.0;
        letterSpacingPx   = "0.6px";
      } else {
        // 50 × 30 mm (Standard)
        storeHeightMm     = 3.2;
        storeNameFontPt   = 8.5;
        productHeightMm   = isVeryLong ? 7.5 : isLong ? 6.8 : 6.0;
        productNameFontPt = isVeryLong ? 5.8 : isLong ? 6.5 : isMid ? 7.0 : 7.6;
        productLineClamp  = isVeryLong ? 3 : 2;
        barcodeHeightMm   = isVeryLong ? 12.8 : isLong ? 13.6 : 14.5;
        textHeightMm      = 3.2;
        barcodeFontPt     = 8.0;
        letterSpacingPx   = "0.8px";
      }
    } else {
      // 60 × 40 mm, 100 × 50 mm (Large labels)
      storeHeightMm     = label_height_mm >= 45 ? 5.5 : 4.2;
      storeNameFontPt   = label_height_mm >= 45 ? 12.0 : 10.0;
      productHeightMm   = label_height_mm >= 45 ? 12.0 : 9.0;
      productNameFontPt = isVeryLong ? 7.5 : isLong ? 8.5 : 10.0;
      productLineClamp  = 3;
      barcodeHeightMm   = label_height_mm >= 45 ? 22.0 : 19.0;
      textHeightMm      = label_height_mm >= 45 ? 5.5 : 4.2;
      barcodeFontPt     = label_height_mm >= 45 ? 11.0 : 9.0;
      letterSpacingPx   = "1.2px";
    }

    // Generate barcode SVG using JsBarcode (detached DOM element)
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svgEl, barcode, {
        format:       barcode_symbology as string,
        displayValue: false,
        margin:       0,
        flat:         true,
        width:        2,
        height:       Math.round(barcodeHeightMm * 3.7795),
        lineColor:    "#000000",
      });
      svgEl.setAttribute("preserveAspectRatio", "none");
      svgEl.setAttribute("style", `width: 100%; height: ${barcodeHeightMm}mm; display: block;`);
    } catch {
      // Fallback placeholder
      svgEl.setAttribute("viewBox", "0 0 100 30");
    }

    const barcodeSvgHtml = svgEl.outerHTML;

    // Build one label block
    const storeNameLine = (show_store_name && storeName)
      ? `<div class="store-name">${this._esc(storeName)}</div>`
      : "";
    const productNameLine = productName
      ? `<div class="product-name">${this._esc(productName)}</div>`
      : "";
    const barcodeTextLine = show_barcode_text
      ? `<div class="barcode-text">${this._esc(barcode)}</div>`
      : "";

    const singleLabel = `
      <div class="label-page">
        ${storeNameLine}
        ${productNameLine}
        <div class="barcode-svg">${barcodeSvgHtml}</div>
        ${barcodeTextLine}
      </div>`;

    const labels = Array.from({ length: Math.max(1, quantity) })
      .map(() => singleLabel)
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Barcode Print - ${barcode}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    /* ── Page setup — exact mm sizing, zero browser margin ── */
    @page {
      size: ${label_width_mm}mm ${label_height_mm}mm;
      margin: 0;
    }

    @media print {
      *, *::before, *::after {
        box-sizing: border-box !important;
      }
      html, body {
        width:  ${label_width_mm}mm !important;
        height: ${label_height_mm}mm !important;
        max-width:  ${label_width_mm}mm !important;
        max-height: ${label_height_mm}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        overflow: hidden !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .label-page {
        page-break-after: always !important;
        break-after: page !important;
      }
      .label-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }

    /* ── Screen fallback ── */
    body {
      background: #f3f4f6;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 0;
      gap: 4px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    /* ── Label card container ── */
    .label-page {
      width:  ${label_width_mm}mm !important;
      height: ${label_height_mm}mm !important;
      max-width:  ${label_width_mm}mm !important;
      max-height: ${label_height_mm}mm !important;
      background: #ffffff !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      padding: ${margin_top_mm}mm ${margin_right_mm}mm ${margin_bottom_mm}mm ${margin_left_mm}mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      align-items: center !important;
      color: #000000 !important;
    }

    /* ── Store name — pinned to top ── */
    .store-name {
      flex-shrink: 0;
      width:       100%;
      height:      ${storeHeightMm}mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size:   ${storeNameFontPt}pt;
      font-weight: 800;
      text-transform: uppercase;
      text-align:  center;
      white-space: nowrap;
      overflow:    hidden;
      text-overflow: ellipsis;
      line-height: ${storeHeightMm}mm;
      letter-spacing: 0.2px;
      color: #000000 !important;
    }

    /* ── Product name — left-aligned with clean word wrapping ── */
    .product-name {
      flex-shrink: 0;
      width:       100%;
      height:      ${productHeightMm}mm;
      max-height:  ${productHeightMm}mm;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size:   ${productNameFontPt}pt;
      font-weight: 600;
      text-transform: none;
      text-align:  left;
      line-height: 1.15;
      display:     -webkit-box;
      -webkit-line-clamp: ${productLineClamp};
      -webkit-box-orient: vertical;
      overflow:    hidden;
      word-break:  normal;
      overflow-wrap: break-word;
      color: #000000 !important;
    }

    /* ── Barcode SVG — full height prominent barcode ── */
    .barcode-svg {
      flex-shrink: 0;
      width:      100%;
      max-width:  ${printW}mm;
      height:     ${barcodeHeightMm}mm !important;
      max-height: ${barcodeHeightMm}mm !important;
      display:    block;
      overflow:   hidden;
    }
    .barcode-svg svg {
      width:      100% !important;
      height:     ${barcodeHeightMm}mm !important;
      max-height: ${barcodeHeightMm}mm !important;
      max-width:  ${printW}mm !important;
      display:    block !important;
    }

    /* ── Human-readable barcode number — pinned to bottom ── */
    .barcode-text {
      flex-shrink:    0;
      width:          100%;
      height:         ${textHeightMm}mm;
      font-family:    "Courier New", Courier, monospace;
      font-size:      ${barcodeFontPt}pt;
      font-weight:    800;
      text-align:     center;
      letter-spacing: ${letterSpacingPx};
      white-space:    nowrap;
      overflow:       hidden;
      line-height:    ${textHeightMm}mm;
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
      }, 100);
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
