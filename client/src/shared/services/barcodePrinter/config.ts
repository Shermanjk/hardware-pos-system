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
  printerType:      "windows_driver" | "tspl" | "agent";

  // ── Label physical dimensions ──────────────────────────────────────────────
  labelWidthMm:     number;   // e.g. 30, 50, 60, 100
  labelHeightMm:    number;   // e.g. 20, 30, 40, 50

  // ── Printer hardware ───────────────────────────────────────────────────────
  dpi:              number;   // 203

  // ── Margins (mm) ──────────────────────────────────────────────────────────
  marginTopMm:      number;
  marginBottomMm:   number;
  marginLeftMm:     number;
  marginRightMm:    number;

  // ── Barcode ────────────────────────────────────────────────────────────────
  barcodeSymbology: string;   // "CODE128"
  barcodeHeightMm:  number;   // optimized for scanner readability

  // ── Label content ──────────────────────────────────────────────────────────
  storeName:        string;   // "ISRA HARDWARE TRADING"
  showStoreName:    boolean;  // true
  showBarcodeText:  boolean;  // true  — human-readable number below bars

  // ── Typography ─────────────────────────────────────────────────────────────
  fontFamily:       string;   // "monospace"
  fontSizePt:       number;   // dynamically scaled
}

/**
 * Calculates optimal margins for any label size (small, medium, large).
 */
export function getDynamicBarcodeMargins(widthMm: number, heightMm: number) {
  const isSmall = widthMm <= 35 || heightMm <= 22;
  const isMedium = !isSmall && (widthMm <= 55 || heightMm <= 35);

  return {
    marginTopMm:    isSmall ? 0.8 : isMedium ? 1.0 : 1.5,
    marginBottomMm: isSmall ? 0.8 : isMedium ? 1.0 : 1.5,
    marginLeftMm:   isSmall ? 1.0 : isMedium ? 1.2 : 1.5,
    marginRightMm:  isSmall ? 1.0 : isMedium ? 1.2 : 1.5,
  };
}

/**
 * Creates a fully calculated BarcodePrinterConfig dynamically fitted to any label width and height.
 */
export function createDynamicBarcodeConfig(
  widthMm: number,
  heightMm: number,
  overrides?: Partial<BarcodePrinterConfig>
): BarcodePrinterConfig {
  const margins = getDynamicBarcodeMargins(widthMm, heightMm);
  const marginTopMm    = overrides?.marginTopMm    ?? margins.marginTopMm;
  const marginBottomMm = overrides?.marginBottomMm ?? margins.marginBottomMm;
  const marginLeftMm   = overrides?.marginLeftMm   ?? margins.marginLeftMm;
  const marginRightMm  = overrides?.marginRightMm  ?? margins.marginRightMm;

  const isSmall = widthMm <= 35 || heightMm <= 22;
  const isMedium = !isSmall && (widthMm <= 55 || heightMm <= 35);
  const is25mm = isMedium && heightMm <= 26;

  const defaultBarcodeHeightMm = isSmall
    ? 7.5
    : is25mm
    ? 9.5
    : isMedium
    ? 11.5
    : Math.max(14, Math.round((heightMm - marginTopMm - marginBottomMm) * 0.44 * 10) / 10);

  const barcodeHeightMm = overrides?.barcodeHeightMm ?? defaultBarcodeHeightMm;
  const fontSizePt = overrides?.fontSizePt ?? (isSmall ? 5.4 : isMedium ? 7.2 : 8.5);

  return {
    printerName:      overrides?.printerName      ?? "",
    printerType:      overrides?.printerType      ?? "windows_driver",
    labelWidthMm:     widthMm,
    labelHeightMm:    heightMm,
    dpi:              overrides?.dpi              ?? 203,
    marginTopMm,
    marginBottomMm,
    marginLeftMm,
    marginRightMm,
    barcodeSymbology: overrides?.barcodeSymbology ?? "CODE128",
    barcodeHeightMm,
    storeName:        overrides?.storeName        ?? "ISRA HARDWARE TRADING",
    showStoreName:    overrides?.showStoreName    ?? true,
    showBarcodeText:  overrides?.showBarcodeText  ?? true,
    fontFamily:       overrides?.fontFamily       ?? "monospace",
    fontSizePt,
  };
}

/**
 * Default fallback configuration.
 */
export const BARCODE_PRINTER_CONFIG: BarcodePrinterConfig = createDynamicBarcodeConfig(50, 30);

