/**
 * Hardcoded barcode label printer configuration.
 *
 * Target hardware : Xprinter XP-365B (or any Windows-installed thermal label printer)
 * Label stock     : 50 × 30 mm direct thermal adhesive labels
 * Connection      : USB with official Windows printer driver
 *
 * To support a different printer in the future, change the values here or
 * swap in a different BarcodePrinterEngine in index.ts — no UI changes needed.
 */

export interface BarcodePrinterConfig {
  /** Windows printer name (exact match from Printers & Scanners).
   *  Empty string = OS default printer / user selects in print dialog. */
  printerName:      string;

  /** Printing engine type — determines which engine class is used. */
  printerType:      "windows_driver";   // extend union when new engines are added

  // ── Label physical dimensions ──────────────────────────────────────────────
  labelWidthMm:     number;   // 50
  labelHeightMm:    number;   // 30

  // ── Printer hardware ───────────────────────────────────────────────────────
  dpi:              number;   // 203

  // ── Margins (mm) ──────────────────────────────────────────────────────────
  marginTopMm:      number;   // 2
  marginBottomMm:   number;   // 2
  marginLeftMm:     number;   // 2
  marginRightMm:    number;   // 2

  // ── Barcode ────────────────────────────────────────────────────────────────
  barcodeSymbology: string;   // "CODE128"
  barcodeHeightMm:  number;   // 14  — optimized for scanner readability on 30 mm label

  // ── Label content ──────────────────────────────────────────────────────────
  storeName:        string;   // "ISRA HARDWARE TRADING"
  showStoreName:    boolean;  // true
  showBarcodeText:  boolean;  // true  — human-readable number below bars

  // ── Typography ─────────────────────────────────────────────────────────────
  fontFamily:       string;   // "monospace"
  fontSizePt:       number;   // 7
}

/**
 * The single source of truth for barcode label printing.
 * Matches the Xprinter XP-365B with 50 × 30 mm direct-thermal labels.
 */
export const BARCODE_PRINTER_CONFIG: BarcodePrinterConfig = {
  printerName:      "",               // leave blank → Windows print dialog appears
  printerType:      "windows_driver",
  labelWidthMm:     50,
  labelHeightMm:    30,
  dpi:              203,
  marginTopMm:      2,
  marginBottomMm:   2,
  marginLeftMm:     2,
  marginRightMm:    2,
  barcodeSymbology: "CODE128",
  barcodeHeightMm:  14,
  storeName:        "ISRA HARDWARE TRADING",
  showStoreName:    true,
  showBarcodeText:  true,
  fontFamily:       "monospace",
  fontSizePt:       7,
};
