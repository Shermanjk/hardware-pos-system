import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { getInventoryLogs, type InventoryLog } from "@/shared/api/inventoryApi";
import { deriveStatus, getCategories, getProducts, getSuppliers, lookupProduct, type ProductRecord } from "@/shared/api/productsApi";
import { getStoreSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";
import {
    BARCODE_PRINTER_CONFIG,
    createDynamicBarcodeConfig,
    getPrinterEngine,
    type BarcodePrinterConfig,
} from "@/shared/services/barcodePrinter";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";
import JsBarcode from "jsbarcode";
import {
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Eye,
    Hash,
    History,
    Layers,
    Package,
    Printer,
    RefreshCw,
    ScanLine,
    Search,
    Tag,
    Truck,
    X,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const PAGE_SIZE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(quantity: number, reorder_level: number) {
  const status = deriveStatus(quantity, reorder_level);
  switch (status) {
    case "In Stock":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> In Stock
        </span>
      );
    case "Low Stock":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3 text-amber-600" /> Low Stock
        </span>
      );
    case "Critical":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="h-3 w-3 text-rose-600 animate-pulse" /> Critical
        </span>
      );
    case "Out of Stock":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          <XCircle className="h-3 w-3 text-slate-500" /> Out of Stock
        </span>
      );
  }
}

// ─── Product Detail Sheet (Right-Side Sliding Drawer) ─────────────────────────

interface ProductDetailModalProps {
  product: ProductRecord | null;
  open: boolean;
  onClose: () => void;
  onPrintBarcode: (product: ProductRecord) => void;
}

function ProductDetailModal({ product, open, onClose, onPrintBarcode }: ProductDetailModalProps) {
  const [activeProduct, setActiveProduct] = useState<ProductRecord | null>(null);

  useEffect(() => {
    if (product) {
      setActiveProduct(product);
    }
  }, [product]);

  const displayProduct = product || activeProduct;
  if (!displayProduct) return null;

  const quantityParts = formatQuantityParts(
    displayProduct.quantity,
    displayProduct.unit_abbreviation,
    displayProduct.quantity_type,
    displayProduct.unit_allow_decimal
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-2xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
        <SheetTitle className="sr-only">Product Details - {displayProduct.product_name}</SheetTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h2 className="text-lg font-bold text-white truncate">{displayProduct.product_name}</h2>
            <p className="text-xs text-blue-100 mt-0.5">Complete Product Information</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Identification Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-1 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Identification</h3>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Barcode</p>
                <p className="text-sm font-mono font-semibold text-gray-900 bg-white px-3 py-2 rounded border border-gray-200 flex items-center justify-between">
                  <span>{displayProduct.barcode}</span>
                  {displayProduct.barcode_source === "store" ? (
                    <span className="text-[11px] font-sans font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Store Generated
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>

          {/* Product Information Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-1 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Product Information</h3>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Category</p>
                  <span className="inline-block text-xs font-semibold text-gray-700 bg-white px-3 py-1.5 rounded-full border border-gray-200">
                    {displayProduct.category || "—"}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Supplier</p>
                  <p className="text-sm font-medium text-gray-900">{displayProduct.supplier || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Unit</p>
                  <p className="text-sm font-medium text-gray-900">
                    {displayProduct.unit} ({displayProduct.unit_abbreviation || "—"})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Unit Type</p>
                  <p className="text-sm font-medium text-gray-900">
                    {displayProduct.unit_type || "Standard"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Quantity Type</p>
                <p className="text-sm font-medium text-gray-900">
                  {displayProduct.quantity_type === "WEIGHTED" ? "Weighted (Variable)" : "Whole Unit"}
                </p>
              </div>
            </div>
          </div>

          {/* Stock Information Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-1 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Stock Information</h3>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 font-medium mb-1">Current Stock</p>
                  <div className="flex items-baseline gap-1">
                    <p className={`text-2xl font-bold tabular-nums ${
                      displayProduct.quantity === 0 ? "text-red-600" :
                      displayProduct.quantity <= displayProduct.reorder_level ? "text-amber-600" : "text-gray-900"
                    }`}>
                      {quantityParts.number}
                    </p>
                    {quantityParts.unit && (
                      <span className="text-sm text-gray-500 font-medium">{quantityParts.unit}</span>
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 font-medium mb-1">Reorder Level</p>
                  <p className="text-2xl font-bold text-gray-700 tabular-nums">{displayProduct.reorder_level}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500 font-medium">Stock Status</p>
                {statusBadge(displayProduct.quantity, displayProduct.reorder_level)}
              </div>
            </div>
          </div>

          {/* Pricing Section (Retail Selling Price) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-1 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Pricing Information</h3>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              {displayProduct.pricing_type === "MARKET_BASED" ? (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Pricing Type</p>
                  <span className="inline-block text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                    Market-Based Pricing
                  </span>
                  <p className="text-xs text-gray-500 mt-2">
                    This product uses market-based pricing.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Retail Selling Price</p>
                    <p className="text-xl font-bold text-emerald-600 tabular-nums">
                      ₱{Number(displayProduct.selling_price || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Pricing Model</p>
                    <span className="inline-block text-xs font-semibold text-slate-700 bg-white px-2.5 py-1 rounded border border-gray-200">
                      Fixed Price
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          <Button variant="outline" onClick={onClose} className="border-gray-300">
            Close
          </Button>
          <Button
            onClick={() => { onClose(); onPrintBarcode(displayProduct); }}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            <Printer className="h-4 w-4" /> Print Barcode
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Barcode Print Modal (inline shortcut) ────────────────────────────────────

const INVENTORY_SIZE_PRESETS = [
  { id: "30x20",  label: "30 × 20 mm (Small / XP-365B)", w: 30, h: 20 },
  { id: "50x30",  label: "50 × 30 mm (Standard)",         w: 50, h: 30 },
  { id: "38x25",  label: "38 × 25 mm",                     w: 38, h: 25 },
  { id: "60x40",  label: "60 × 40 mm (Medium)",            w: 60, h: 40 },
  { id: "100x50", label: "100 × 50 mm (Large)",            w: 100, h: 50 },
  { id: "custom", label: "Custom Size",                    w: 0,  h: 0  },
] as const;

function normalizeInventoryPresetKey(key: string | null | undefined): string {
  if (!key) return "30x20";
  const cleaned = key.replace(/[\s\u00d7]/g, "x").toLowerCase();
  if (INVENTORY_SIZE_PRESETS.some((p) => p.id === cleaned)) return cleaned;
  if (cleaned === "custom") return "custom";
  return "30x20";
}

interface BarcodePrintModalProps {
  product: ProductRecord | null;
  storeSettings: StoreSettings | null;
  open: boolean;
  onClose: () => void;
}

function BarcodePrintModal({ product, storeSettings, open, onClose }: BarcodePrintModalProps) {
  const [labelCount, setLabelCount] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [presetKey, setPresetKey] = useState(() => normalizeInventoryPresetKey(localStorage.getItem("pos_barcode_label_preset")));
  const [customW, setCustomW] = useState(30);
  const [customH, setCustomH] = useState(20);

  useEffect(() => {
    if (open) {
      setLabelCount(1);
      setPresetKey(normalizeInventoryPresetKey(localStorage.getItem("pos_barcode_label_preset")));
    }
  }, [open, product?.id]);

  const handlePresetChange = (newKey: string) => {
    const validKey = normalizeInventoryPresetKey(newKey);
    setPresetKey(validKey);
    localStorage.setItem("pos_barcode_label_preset", validKey);
  };

  const storeName = storeSettings?.store_name || BARCODE_PRINTER_CONFIG.storeName || "ISRA HARDWARE TRADING";

  const activeConfig: BarcodePrinterConfig = useMemo(() => {
    if (presetKey === "custom") {
      const w = Math.max(10, customW);
      const h = Math.max(5, customH);
      return createDynamicBarcodeConfig(w, h, { storeName });
    }
    const preset = INVENTORY_SIZE_PRESETS.find((p) => p.id === presetKey);
    if (!preset || preset.w === 0) {
      return createDynamicBarcodeConfig(30, 20, { storeName });
    }
    return createDynamicBarcodeConfig(preset.w, preset.h, { storeName });
  }, [presetKey, customW, customH, storeName]);

  const svgCallbackRef = useCallback((node: SVGSVGElement | null) => {
    if (!node || !product?.barcode) return;
    try {
      JsBarcode(node, product.barcode, {
        format: activeConfig.barcodeSymbology,
        displayValue: false,
        height: activeConfig.barcodeHeightMm * 3.7795,
        width: 1,
        margin: 0,
        background: "transparent",
        lineColor: "#000",
      });
      node.setAttribute("preserveAspectRatio", "none");
    } catch { /* invalid barcode — leave blank */ }
  }, [product?.barcode, activeConfig.barcodeHeightMm, activeConfig.barcodeSymbology, open]);

  const handlePrint = async () => {
    if (!product) return;
    const clampedCount = Math.max(1, Math.min(500, labelCount));
    setPrinting(true);
    try {
      const engine = getPrinterEngine(activeConfig);
      await engine.print(
        {
          barcode:   product.barcode,
          storeName: activeConfig.storeName,
          quantity:  clampedCount,
        },
        activeConfig
      );
      toast.success(`Printed ${clampedCount} label${clampedCount !== 1 ? "s" : ""} for "${product.product_name}"`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  if (!product) return null;

  const isSmall = activeConfig.labelWidthMm <= 35 || activeConfig.labelHeightMm <= 22;
  const scale   = isSmall ? 4.2 : 3.2;
  const cardW   = activeConfig.labelWidthMm  * scale;
  const cardH   = activeConfig.labelHeightMm * scale;
  const pt      = activeConfig.marginTopMm    * scale;
  const pb      = activeConfig.marginBottomMm * scale;
  const pl      = activeConfig.marginLeftMm   * scale;
  const pr      = activeConfig.marginRightMm  * scale;

  const storeFontSize   = Math.max(9, Math.min(18, activeConfig.fontSizePt * 1.15));
  const barcodeFontSize = Math.max(8, Math.min(16, activeConfig.fontSizePt * 0.95));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600 shrink-0" />
            Print Barcode Labels
          </DialogTitle>
          <DialogDescription>
            {activeConfig.labelWidthMm} × {activeConfig.labelHeightMm} mm · {activeConfig.barcodeSymbology}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-w-full min-w-0 overflow-hidden">
          {/* Product info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 max-w-full min-w-0 overflow-hidden">
            <div className="p-2 bg-blue-100 rounded-lg shrink-0">
              <Package className="h-4 w-4 text-blue-700" />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="font-semibold text-gray-900 text-sm leading-snug break-words" title={product.product_name}>{product.product_name}</p>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">{product.barcode}</p>
            </div>
          </div>

          {/* Label size selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Label Size</label>
            <Select
              value={presetKey}
              onValueChange={handlePresetChange}
              disabled={printing}
            >
              <SelectTrigger className="h-9 w-full bg-white text-gray-900 border-gray-300">
                <SelectValue placeholder="Select Label Size">
                  {INVENTORY_SIZE_PRESETS.find((p) => p.id === presetKey)?.label || "30 × 20 mm (Small / XP-365B)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-900 border border-gray-200 shadow-lg z-[99999]">
                {INVENTORY_SIZE_PRESETS.map((p) => (
                  <SelectItem
                    key={p.id}
                    value={p.id}
                    className="text-gray-900 focus:bg-blue-50 focus:text-blue-900 cursor-pointer py-2"
                  >
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Custom size inputs */}
            {presetKey === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1.5 flex-1">
                  <label className="text-xs text-gray-500 w-10 shrink-0">Width</label>
                  <Input
                    type="number" min={10} max={300} step={0.5}
                    value={customW}
                    onChange={(e) => setCustomW(Number(e.target.value))}
                    className="h-8 text-sm"
                    disabled={printing}
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
                <span className="text-gray-300 text-sm">×</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <label className="text-xs text-gray-500 w-12 shrink-0">Height</label>
                  <Input
                    type="number" min={5} max={300} step={0.5}
                    value={customH}
                    onChange={(e) => setCustomH(Number(e.target.value))}
                    className="h-8 text-sm"
                    disabled={printing}
                  />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div className="flex flex-col items-center gap-1.5 py-2 bg-gray-50/60 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              Preview ({activeConfig.labelWidthMm} × {activeConfig.labelHeightMm} mm)
            </p>
            <div
              className="bg-white border-2 border-gray-800 flex flex-col items-center justify-between overflow-hidden shadow-md rounded-sm select-none shrink-0"
              style={{
                width: cardW,
                height: cardH,
                paddingTop: pt,
                paddingBottom: pb,
                paddingLeft: pl,
                paddingRight: pr,
                boxSizing: "border-box",
              }}
            >
              {activeConfig.showStoreName && activeConfig.storeName && (
                <p
                  className="font-extrabold uppercase text-center leading-tight truncate w-full flex-shrink-0 mb-0.5 tracking-tight text-gray-900"
                  style={{ fontFamily: activeConfig.fontFamily, fontSize: storeFontSize }}
                  title={activeConfig.storeName}
                >
                  {activeConfig.storeName}
                </p>
              )}
              <div className="w-full flex-1 flex items-center justify-center min-h-0 overflow-hidden my-0.5">
                <svg ref={svgCallbackRef} className="w-full h-full block" />
              </div>
              {activeConfig.showBarcodeText && (
                <p
                  className="font-mono text-center font-bold text-gray-900 leading-none flex-shrink-0 mt-0.5"
                  style={{
                    fontFamily: activeConfig.fontFamily,
                    fontSize: barcodeFontSize,
                    letterSpacing: isSmall ? "0.4px" : "1.2px",
                  }}
                >
                  {product.barcode}
                </p>
              )}
            </div>
          </div>

          {/* Number of labels */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Number of Labels
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold text-gray-900 bg-white border-gray-300 hover:bg-gray-100"
                onClick={() => setLabelCount((n) => Math.max(1, n - 1))}
                disabled={printing}
              >−</Button>
              <Input
                type="number" min={1} max={500}
                value={labelCount}
                onChange={(e) => setLabelCount(Math.max(1, Math.min(500, Number(e.target.value))))}
                className="h-10 w-20 text-center font-bold text-lg text-gray-900 bg-white border-gray-300"
                disabled={printing}
              />
              <Button
                variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold text-gray-900 bg-white border-gray-300 hover:bg-gray-100"
                onClick={() => setLabelCount((n) => Math.min(500, n + 1))}
                disabled={printing}
              >+</Button>
              <span className="text-xs text-gray-500 ml-1">max 500</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-3 pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onClose} disabled={printing} className="gap-2 text-gray-700 bg-white border-gray-300 hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-600" /> Cancel
          </Button>
          <Button onClick={handlePrint} disabled={printing} className="gap-2 bg-blue-600 hover:bg-blue-700">
            {printing
              ? <><span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Printing…</>
              : <><Printer className="h-4 w-4" /> Print {labelCount} Label{labelCount !== 1 ? "s" : ""}</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Movement Log Modal for Clerk ──────────────────────────────────────────────

interface ClerkMovementLogModalProps {
  product: ProductRecord | null;
  open: boolean;
  onClose: () => void;
}

function ClerkMovementLogModal({ product, open, onClose }: ClerkMovementLogModalProps) {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product || !open) return;
    setLoading(true);
    setError(null);
    getInventoryLogs({ product_id: product.id, limit: 50 })
      .then(setLogs)
      .catch(() => setError("Failed to load movement history."))
      .finally(() => setLoading(false));
  }, [product?.id, open]);

  if (!product) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-4xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
        <SheetTitle className="sr-only">Movement Log - {product.product_name}</SheetTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <History className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h2 className="text-lg font-bold text-white truncate">Movement Log — {product.product_name}</h2>
            <p className="text-xs text-blue-100 mt-0.5">Stock movement history, reference & notes</p>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading movement history…</div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-red-600">{error}</p>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center gap-2">
              <History className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">No movement history yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Type</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Action</th>
                    <th className="text-center py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Change</th>
                    <th className="text-center py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Remaining</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Reference & Notes</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const change = log.quantity_change ?? log.quantity ?? 0;
                    const isPositive = change > 0;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-4 text-xs text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-2.5 px-4 text-xs font-semibold">{log.transaction_type}</td>
                        <td className="py-2.5 px-4 text-xs text-gray-600">{log.action ?? "—"}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`text-sm font-bold tabular-nums ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                            {isPositive ? "+" : ""}{change}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center text-sm font-semibold text-gray-700 tabular-nums">
                          {log.remaining_stock ?? "—"}
                        </td>
                        <td className="py-2.5 px-4 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-gray-500 font-medium">Ref:</span>
                              <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${
                                log.reference && log.reference !== "—"
                                  ? "bg-gray-100 text-gray-800 border border-gray-200" 
                                  : "text-gray-400 font-normal italic"
                              }`}>
                                {log.reference && log.reference !== "—" ? log.reference : "N/A"}
                              </span>
                            </div>
                            <div className="flex items-start gap-1">
                              <span className="text-[11px] text-gray-500 font-medium shrink-0">Notes:</span>
                              <span className={`text-xs ${
                                log.notes && log.notes !== "—"
                                  ? "text-gray-700 italic font-medium" 
                                  : "text-gray-400 italic"
                              }`}>
                                {log.notes && log.notes !== "—" ? log.notes : "N/A"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-gray-600">{log.performed_by}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end shrink-0">
          <Button onClick={onClose} variant="outline" className="border-gray-300">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClerkInventory() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<string[]>(["all"]);
  const [suppliers, setSuppliers] = useState<string[]>(["all"]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [detailProduct, setDetailProduct] = useState<ProductRecord | null>(null);
  const [printProduct, setPrintProduct] = useState<ProductRecord | null>(null);
  const [logProduct, setLogProduct] = useState<ProductRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);

  // Real-time synchronization
  useRealtimeSync(["inventory", "products", "requests", "dashboard"], () => {
    setRefreshKey((k) => k + 1);
  });

  // Load real data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [inventoryData, categoriesData, suppliersData, settingsData] = await Promise.all([
          getProducts(),
          getCategories(),
          getSuppliers(),
          getStoreSettings().catch(() => null),
        ]);
        setProducts(inventoryData);
        setCategories(["all", ...categoriesData.map(c => c.category_name)]);
        setSuppliers(["all", ...suppliersData.map(s => s.supplier_name)]);
        if (settingsData) setStoreSettings(settingsData);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to fetch inventory:", message.replace(/[\r\n\t]/g, " "));
        toast.error("Failed to load inventory");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [refreshKey]);

  // ─── Filtering ───────────────────────────────────────────────────────────────

  const filtered = products.filter((p) => {
    const searchLower = search.toLowerCase().trim();
    const matchSearch =
      search === "" ||
      p.product_name.toLowerCase().includes(searchLower) ||
      p.barcode.toLowerCase().includes(searchLower);
    const matchCategory = categoryFilter === "all" || p.category === categoryFilter;
    const matchSupplier = supplierFilter === "all" || p.supplier === supplierFilter;
    return matchSearch && matchCategory && matchSupplier;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [search, categoryFilter, supplierFilter]);

  // ─── Barcode scan handler ───────────────────────────────────────────────────

  const handleBarcodeScan = useCallback(async () => {
    const val = barcodeInput.trim();
    if (!val) return;
    try {
      const results = await lookupProduct(val);
      const exact = results.find((r) => r.barcode.toLowerCase() === val.toLowerCase());
      if (exact) {
        const found = products.find(p => p.id === exact.id);
        if (found) {
          setDetailProduct(found);
          setDetailOpen(true);
          setBarcodeInput("");
        } else {
          toast.error("Product not found in inventory");
        }
      } else if (results.length > 0) {
        toast.error("No exact barcode match. Use the name search to find products.");
      } else {
        toast.error("Product not registered. Please contact the Administrator.", {
          duration: 4000,
        });
      }
    } catch {
      toast.error("Failed to search for product");
    }
  }, [barcodeInput, products]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBarcodeScan();
    }
  };

  // ─── Summary stats ──────────────────────────────────────────────────────────

  const inStockCount   = products.filter((p) => deriveStatus(p.quantity, p.reorder_level) === "In Stock").length;
  const lowStockCount  = products.filter((p) => deriveStatus(p.quantity, p.reorder_level) === "Low Stock").length;
  const criticalCount  = products.filter((p) => ["Critical", "Out of Stock"].includes(deriveStatus(p.quantity, p.reorder_level))).length;

  const pageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("ellipsis");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Browse and manage current stock levels
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 flex-shrink-0"
          onClick={() => setRefreshKey(k => k + 1)}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4"><Skeleton className="h-12 w-full rounded-lg" /></Card>
          ))
        ) : (
          <>
            <Card className="p-4 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{products.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Total Products</p>
                </div>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Boxes className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{inStockCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">In Stock</p>
                </div>
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-amber-600">{lowStockCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Low Stock</p>
                </div>
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-rose-600">{criticalCount}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Critical / Empty</p>
                </div>
                <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                  <XCircle className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Search & Filters */}
      <Card className="p-4 bg-white border border-slate-200/80 shadow-sm rounded-xl">
        <div className="flex flex-col lg:flex-row gap-3.5 items-start lg:items-center">
          {/* Main Search Bar */}
          <div className="flex-1 w-full lg:w-auto min-w-[300px]">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Search by product name or scan barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = search.trim();
                    if (val) {
                      const isBarcode = /^[\d\w-]+$/.test(val);
                      if (isBarcode && val.length >= 4) {
                        setBarcodeInput(val);
                        setTimeout(() => {
                          const results = products.filter(p => 
                            p.barcode.toLowerCase() === val.toLowerCase()
                          );
                          if (results.length >= 1) {
                            setDetailProduct(results[0]);
                            setDetailOpen(true);
                            setSearch("");
                          } else {
                            toast.error("Product not found. Try a different search term.");
                          }
                        }, 50);
                      }
                    }
                  }
                }}
                className="pl-10 pr-20 h-10 text-sm border border-slate-200 bg-slate-50/50 hover:bg-white focus:bg-white rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
                <ScanLine className="h-3 w-3 text-slate-500" />
                <span>Scanner</span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2.5 w-full lg:w-auto">
            <div className="flex-1 lg:w-44">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-10 bg-slate-50/50 hover:bg-white border-slate-200 w-full text-sm font-medium">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 lg:w-44">
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-10 bg-slate-50/50 hover:bg-white border-slate-200 w-full text-sm font-medium">
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s} value={s}>{s === "all" ? "All Suppliers" : s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Active filter chips */}
        {(search || categoryFilter !== "all" || supplierFilter !== "all") && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
              Active Filters:
            </span>
            {search && (
              <Badge 
                className="gap-1 cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium text-xs px-2.5 py-0.5" 
                onClick={() => setSearch("")}
              >
                <span>Query: "{search}"</span> <X className="h-3 w-3" />
              </Badge>
            )}
            {categoryFilter !== "all" && (
              <Badge 
                className="gap-1 cursor-pointer bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-medium text-xs px-2.5 py-0.5" 
                onClick={() => setCategoryFilter("all")}
              >
                <span>Category: {categoryFilter}</span> <X className="h-3 w-3" />
              </Badge>
            )}
            {supplierFilter !== "all" && (
              <Badge 
                className="gap-1 cursor-pointer bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 font-medium text-xs px-2.5 py-0.5" 
                onClick={() => setSupplierFilter("all")}
              >
                <span>Supplier: {supplierFilter}</span> <X className="h-3 w-3" />
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setCategoryFilter("all"); setSupplierFilter("all"); }}
              className="h-6 text-xs text-slate-400 hover:text-slate-700 px-2 ml-auto"
            >
              Reset all
            </Button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border border-slate-200/80 shadow-sm rounded-xl bg-white">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs text-slate-600 font-medium">
            Showing{" "}
            <span className="font-bold text-slate-900">
              {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)}
            </span>{" "}
            of <span className="font-bold text-slate-900">{filtered.length}</span> products
          </p>
          <span className="text-xs text-slate-400 hidden sm:inline">Real-time synced</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
              <tr>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-36">Barcode</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider min-w-[200px]">Product Name</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-32">Category</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-36">Supplier</th>
                <th className="text-center py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-20">Unit</th>
                <th className="text-center py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-24">Qty</th>
                <th className="text-center py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-24">Reorder Lvl</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-36">Status</th>
                <th className="text-right py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="bg-white">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4">
                        <Skeleton className="h-4 w-full rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center bg-white">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="p-3.5 bg-slate-100 rounded-full text-slate-400">
                        <Boxes className="h-7 w-7" />
                      </div>
                      <p className="font-semibold text-slate-700 text-sm">No products found</p>
                      <p className="text-xs text-slate-400 max-w-xs">
                        No items match your search or filters. Try clearing filters to see all inventory.
                      </p>
                      {(search || categoryFilter !== "all" || supplierFilter !== "all") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSearch(""); setCategoryFilter("all"); setSupplierFilter("all"); }}
                          className="mt-2 text-xs"
                        >
                          Clear all filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((product, idx) => (
                  <tr
                    key={product.id}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    }`}
                  >
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                        {product.barcode}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 text-sm leading-tight">{product.product_name}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium text-slate-700 bg-slate-100/90 border border-slate-200 px-2.5 py-0.5 rounded-full inline-block">
                        {product.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-[140px]">
                      <span className="truncate block font-medium">{product.supplier || "—"}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs font-medium text-slate-600">{product.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {(() => {
                        const parts = formatQuantityParts(product.quantity, product.unit_abbreviation, product.quantity_type);
                        const isCritical = product.quantity === 0 || product.quantity <= product.reorder_level * 0.5;
                        const isLow = product.quantity <= product.reorder_level;
                        return (
                          <div className="flex items-center justify-center gap-0.5">
                            <span
                              className={`font-bold text-sm tabular-nums ${
                                product.quantity === 0
                                  ? "text-slate-400"
                                  : isCritical
                                  ? "text-rose-600 font-extrabold"
                                  : isLow
                                  ? "text-amber-600"
                                  : "text-slate-900"
                              }`}
                            >
                              {parts.number}
                            </span>
                            {parts.unit && <span className="text-[11px] text-slate-400 ml-0.5">{parts.unit}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-500 font-semibold tabular-nums">
                      {product.reorder_level}
                    </td>
                    <td className="py-3 px-4">
                      {statusBadge(product.quantity, product.reorder_level)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                          title="View Product Details"
                          onClick={() => { setDetailProduct(product); setDetailOpen(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-200"
                          title="View Movement Log"
                          onClick={() => { setLogProduct(product); setLogOpen(true); }}
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-transparent hover:border-emerald-200"
                          title="Print Barcode Sticker"
                          onClick={() => { setPrintProduct(product); setPrintOpen(true); }}
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/40">
            <div className="flex items-center justify-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 text-xs font-medium border-slate-200"
              >
                Previous
              </Button>
              {pageNumbers().map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`ell-${i}`} className="px-2 text-slate-400 text-xs">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                    className={`h-8 w-8 p-0 text-xs font-semibold ${
                      p === page
                        ? "bg-blue-600 text-white shadow-sm"
                        : "border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 text-xs font-medium border-slate-200"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      <ProductDetailModal
        product={detailProduct}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onPrintBarcode={(p) => { setPrintProduct(p); setPrintOpen(true); }}
      />
      <ClerkMovementLogModal
        product={logProduct}
        open={logOpen}
        onClose={() => setLogOpen(false)}
      />
      <BarcodePrintModal
        product={printProduct}
        storeSettings={storeSettings}
        open={printOpen}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
