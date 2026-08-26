/**
 * Barcode Printer Factory
 *
 * Returns the correct BarcodePrinterEngine implementation based on the
 * printer_type field in BarcodePrinterConfig. The POS never instantiates
 * a concrete engine directly — it always goes through this factory.
 *
 * Adding a new printer type:
 *   1. Create a new engine file (e.g. ZplEngine.ts) implementing BarcodePrinterEngine
 *   2. Add a new case to the switch statement below
 *   3. Add the new type to the printer_type enum in barcodePrinterApi.ts and
 *      the server-side Zod schema
 *   No other files need to change.
 */

import type { BarcodePrinterConfig } from "./config";
import { LocalAgentBarcodeEngine } from "./LocalAgentBarcodeEngine";
import type { BarcodePrinterEngine } from "./types";
import { WindowsDriverEngine } from "./WindowsDriverEngine";

// ─── Singleton engine cache ───────────────────────────────────────────────────

const engineCache = new Map<string, BarcodePrinterEngine>();

export function getPrinterEngine(config: BarcodePrinterConfig): BarcodePrinterEngine {
  const { printerType } = config;

  if (engineCache.has(printerType)) {
    return engineCache.get(printerType)!;
  }

  let engine: BarcodePrinterEngine;

  switch (printerType) {
    case "windows_driver":
    default:
      engine = new WindowsDriverEngine();
      break;
  }

  engineCache.set(printerType, engine);
  return engine;
}

export {
  BARCODE_PRINTER_CONFIG,
  createDynamicBarcodeConfig,
  getDynamicBarcodeMargins,
} from "./config";
export type { BarcodePrinterConfig } from "./config";
export type { BarcodePrinterEngine, BarcodePrintItem } from "./types";


