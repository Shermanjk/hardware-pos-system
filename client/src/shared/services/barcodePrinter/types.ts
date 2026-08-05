/**
 * Printer abstraction types.
 *
 * The POS interacts only with BarcodePrintItem and BarcodePrinterEngine.
 * A concrete engine (WindowsDriverEngine, ZplEngine, etc.) implements
 * BarcodePrinterEngine and is selected by the factory in index.ts.
 * Adding a new printer requires only a new engine file — no UI changes.
 */

import type { BarcodePrinterConfig } from "./config";

export type { BarcodePrinterConfig };

// ─── Print job descriptor ─────────────────────────────────────────────────────

export interface BarcodePrintItem {
  barcode:   string;   // The barcode value to encode (CODE128 or configured symbology)
  storeName: string;   // Header text — line 1 of the label
  quantity:  number;   // Number of identical labels to print
}

// ─── Engine interface ─────────────────────────────────────────────────────────

export interface BarcodePrinterEngine {
  /** Human-readable engine name (shown in error messages) */
  readonly name: string;

  /**
   * Dispatch a print job. Resolves when the job has been sent to the printer
   * subsystem. Rejects with an Error if it could not be dispatched.
   */
  print(item: BarcodePrintItem, config: BarcodePrinterConfig): Promise<void>;

  /**
   * Print one test label so the operator can verify alignment, margins,
   * and barcode scannability before a real job.
   */
  testPrint(config: BarcodePrinterConfig): Promise<void>;
}
