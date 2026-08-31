/**
 * Clerk Barcode Printing Page
 *
 * Uses the hardcoded BARCODE_PRINTER_CONFIG (50×30 mm, Xprinter XP-365B).
 * All print jobs are delegated to the BarcodePrinterEngine — this page never
 * speaks directly to any specific printer model.
 *
 * Safety: read-only product access. No inventory, stock, or sales data is
 * modified during barcode printing.
 */

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getProducts, type ProductRecord } from "@/shared/api/productsApi";
import { getStoreSettings, type StoreSettings } from "@/shared/api/settingsApi";
import {
    BARCODE_PRINTER_CONFIG,
    createDynamicBarcodeConfig,
    getPrinterEngine,
    type BarcodePrinterConfig,
} from "@/shared/services/barcodePrinter";
import JsBarcode from "jsbarcode";
import {
    Barcode, Layers, Package,
    Printer, ScanLine, Tag, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBarcodeScanner } from "@/shared/hooks/useBarcodeScanner";
import { toast } from "sonner";

// ─── Barcode SVG preview (real JsBarcode — fully scannable) ──────────────────

function BarcodePreview({ code, heightMm, symbology }: {
  code: string;
  heightMm: number;
  symbology: string;
}) {
  // Callback ref fires the instant the node is attached — avoids timing issues
  // with React's useEffect firing before the SVG element is in the DOM.
  const svgCallbackRef = useCallback((node: SVGSVGElement | null) => {
    if (!node || !code) return;
    try {
      JsBarcode(node, code, {
        format:       symbology,
        displayValue: false,
        height:       heightMm * 3.7795,
        width:        1,
        margin:       0,
        background:   "transparent",
        lineColor:    "#000",
      });
      // Stretch bars horizontally to fill the label width seamlessly
      node.setAttribute("preserveAspectRatio", "none");
    } catch { /* leave empty for invalid code */ }
  }, [code, heightMm, symbology]);

  return <svg ref={svgCallbackRef} className="w-full h-full block" />;
}

// ─── To-scale dynamic label preview card ─────────────────────────────────────

function LabelCard({ product, config }: { product: ProductRecord; config: BarcodePrinterConfig }) {
  const isSmall  = config.labelWidthMm <= 35 || config.labelHeightMm <= 22;
  const isMedium = !isSmall && (config.labelWidthMm <= 55 || config.labelHeightMm <= 35);
  const scale    = isSmall ? 4.2 : 3.2; // px per mm for crisp on-screen preview
  const w        = config.labelWidthMm  * scale;
  const h        = config.labelHeightMm * scale;
  const pt       = config.marginTopMm    * scale;
  const pb       = config.marginBottomMm * scale;
  const pl       = config.marginLeftMm   * scale;
  const pr       = config.marginRightMm  * scale;

  const nameLen = (product.product_name || "").trim().length;
  const isVeryLong = nameLen > 60;
  const isLong     = nameLen > 25;

  let storeFontSize: number;
  let productFontSize: number;
  let barcodeFontSize: number;
  let barcodeHeightMm: number;
  let productLineClamp: number;
  let letterSpacingPx: string;
  let gapPx: number;

  if (isSmall) {
    storeFontSize    = 8.5;
    productFontSize  = isLong ? 7.2 : 8.5; // Equal size
    barcodeFontSize  = 8.0;
    barcodeHeightMm  = isLong ? 7.0 : 8.5;
    productLineClamp = isLong ? 2 : 1;
    letterSpacingPx  = "0.4px";
    gapPx            = 3;
  } else if (isMedium) {
    const is25mm = config.labelHeightMm <= 26;
    if (is25mm) {
      storeFontSize    = 9.5;
      productFontSize  = isVeryLong ? 7.5 : isLong ? 8.5 : 9.5; // Equal size
      barcodeFontSize  = 9.0;
      barcodeHeightMm  = isVeryLong ? 9.0 : isLong ? 10.5 : 12.0;
      productLineClamp = isVeryLong ? 3 : isLong ? 2 : 1;
      letterSpacingPx  = "0.6px";
      gapPx            = 3.5;
    } else {
      storeFontSize    = 11.0;
      productFontSize  = isVeryLong ? 8.5 : isLong ? 9.8 : 11.0; // Equal size
      barcodeFontSize  = 10.5;
      barcodeHeightMm  = isVeryLong ? 11.0 : isLong ? 12.8 : 14.8;
      productLineClamp = isVeryLong ? 3 : isLong ? 2 : 1;
      letterSpacingPx  = "0.8px";
      gapPx            = 4;
    }
  } else {
    storeFontSize    = config.labelHeightMm >= 45 ? 14.0 : 12.5;
    productFontSize  = config.labelHeightMm >= 45 ? 14.0 : 12.5;
    barcodeFontSize  = config.labelHeightMm >= 45 ? 13.0 : 11.5;
    barcodeHeightMm  = config.labelHeightMm >= 45 ? 24.0 : 18.5;
    productLineClamp = 3;
    letterSpacingPx  = "1.2px";
    gapPx            = 6;
  }

  return (
    <div
      className="bg-white border-2 border-gray-800 flex flex-col items-center justify-between overflow-hidden shadow-md rounded-sm select-none shrink-0"
      style={{
        width: w,
        height: h,
        paddingTop: pt,
        paddingBottom: pb,
        paddingLeft: pl,
        paddingRight: pr,
        boxSizing: "border-box",
      }}
    >
      {config.showStoreName && config.storeName && (
        <p
          className="font-extrabold uppercase text-center leading-tight truncate w-full flex-shrink-0 mb-0.5 tracking-tight text-gray-900"
          style={{ fontFamily: config.fontFamily, fontSize: storeFontSize }}
          title={config.storeName}
        >
          {config.storeName}
        </p>
      )}
      {product.product_name && (
        <p
          className="font-bold text-left w-full max-w-full min-w-0 flex-shrink-0 text-gray-800 leading-tight"
          style={{
            fontSize: productFontSize,
            marginTop: `${gapPx}px`,
            display: "-webkit-box",
            WebkitLineClamp: productLineClamp,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "normal",
            overflowWrap: "break-word",
          }}
          title={product.product_name}
        >
          {product.product_name}
        </p>
      )}
      <div className="w-full flex-1 flex items-center justify-center min-h-0 overflow-hidden my-0.5">
        <BarcodePreview
          code={product.barcode}
          heightMm={barcodeHeightMm}
          symbology={config.barcodeSymbology}
        />
      </div>
      {config.showBarcodeText && (
        <p
          className="font-mono text-center font-bold text-gray-900 leading-none flex-shrink-0 mt-0.5"
          style={{
            fontFamily: config.fontFamily,
            fontSize: barcodeFontSize,
            letterSpacing: letterSpacingPx,
          }}
        >
          {product.barcode}
        </p>
      )}
    </div>
  );
}

// ─── Label size presets ───────────────────────────────────────────────────────

const SIZE_PRESETS = [
  { id: "30x20",  label: "30 × 20 mm (Small / XP-365B)", w: 30, h: 20 },
  { id: "50x30",  label: "50 × 30 mm (Standard)",         w: 50, h: 30 },
  { id: "38x25",  label: "38 × 25 mm",                     w: 38, h: 25 },
  { id: "60x40",  label: "60 × 40 mm (Medium)",            w: 60, h: 40 },
  { id: "100x50", label: "100 × 50 mm (Large)",            w: 100, h: 50 },
  { id: "custom", label: "Custom Size",                    w: 0,  h: 0  },
] as const;

function normalizePresetKey(key: string | null | undefined): string {
  if (!key) return "30x20";
  const cleaned = key.replace(/[\s\u00d7]/g, "x").toLowerCase();
  if (SIZE_PRESETS.some((p) => p.id === cleaned)) return cleaned;
  if (cleaned === "custom") return "custom";
  return "30x20";
}

// ─── Print Modal ──────────────────────────────────────────────────────────────

interface PrintModalProps {
  product:       ProductRecord | null;
  storeSettings: StoreSettings | null;
  open:          boolean;
  onClose:       () => void;
  onPrinted:     (product: ProductRecord, count: number) => void;
}

function PrintModal({ product, storeSettings, open, onClose, onPrinted }: PrintModalProps) {
  const [quantity,   setQuantity]   = useState(1);
  const [printing,   setPrinting]   = useState(false);
  const [presetKey,  setPresetKey]  = useState(() => normalizePresetKey(localStorage.getItem("pos_barcode_label_preset")));
  const [customW,    setCustomW]    = useState(30);
  const [customH,    setCustomH]    = useState(20);

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setPresetKey(normalizePresetKey(localStorage.getItem("pos_barcode_label_preset")));
    }
  }, [open, product?.id]);

  const handlePresetChange = (newKey: string) => {
    const validKey = normalizePresetKey(newKey);
    setPresetKey(validKey);
    localStorage.setItem("pos_barcode_label_preset", validKey);
  };

  const storeName = storeSettings?.store_name || BARCODE_PRINTER_CONFIG.storeName || "ISRA HARDWARE TRADING";

  // Build the active config dynamically based on chosen dimensions
  const activeConfig: BarcodePrinterConfig = useMemo(() => {
    if (presetKey === "custom") {
      const w = Math.max(10, customW);
      const h = Math.max(5, customH);
      return createDynamicBarcodeConfig(w, h, { storeName });
    }
    const preset = SIZE_PRESETS.find((p) => p.id === presetKey);
    if (!preset || preset.w === 0) {
      return createDynamicBarcodeConfig(30, 20, { storeName });
    }
    return createDynamicBarcodeConfig(preset.w, preset.h, { storeName });
  }, [presetKey, customW, customH, storeName]);

  const clampedQty = Math.max(1, Math.min(500, quantity));

  const handlePrint = async () => {
    if (!product) return;
    setPrinting(true);
    try {
      const engine = getPrinterEngine(activeConfig);
      await engine.print(
        {
          barcode:     product.barcode,
          storeName:   activeConfig.storeName,
          productName: product.product_name,
          quantity:    clampedQty,
        },
        activeConfig
      );
      toast.success(`Printing ${clampedQty} label${clampedQty !== 1 ? "s" : ""} for "${product.product_name}"`);
      onPrinted(product, clampedQty);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  if (!product) return null;

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

          {/* Label size */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Label Size</label>
            <Select
              value={presetKey}
              onValueChange={handlePresetChange}
              disabled={printing}
            >
              <SelectTrigger className="h-9 w-full bg-white text-gray-900 border-gray-300">
                <SelectValue placeholder="Select Label Size">
                  {SIZE_PRESETS.find((p) => p.id === presetKey)?.label || "30 × 20 mm (Small / XP-365B)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-900 border border-gray-200 shadow-lg z-[99999]">
                {SIZE_PRESETS.map((p) => (
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

            {/* Custom size fields */}
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

          {/* Live label preview */}
          <div className="flex flex-col items-center gap-1.5 py-1 bg-gray-50/60 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              Preview ({activeConfig.labelWidthMm} × {activeConfig.labelHeightMm} mm)
            </p>
            <LabelCard product={product} config={activeConfig} />
          </div>

          {/* Print Checklist Notice */}
          <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
            <p className="font-semibold flex items-center gap-1">
              <span>💡</span> Browser Print Settings Checklist:
            </p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-blue-700 pl-4">
              <p>• <b>Margins:</b> None</p>
              <p>• <b>Headers & footers:</b> Unchecked</p>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Number of Labels</label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold text-gray-900 bg-white border-gray-300 hover:bg-gray-100"
                onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                disabled={printing}
              >−</Button>
              <Input
                type="number" min={1} max={500}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-10 w-20 text-center font-bold text-lg text-gray-900 bg-white border-gray-300"
                disabled={printing}
              />
              <Button
                variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold text-gray-900 bg-white border-gray-300 hover:bg-gray-100"
                onClick={() => setQuantity((n) => Math.min(500, n + 1))}
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
          <Button
            onClick={handlePrint}
            disabled={printing}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            {printing
              ? <><span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Printing…</>
              : <><Printer className="h-4 w-4" /> Print {clampedQty} Label{clampedQty !== 1 ? "s" : ""}</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PrintTabType = "products" | "history";

export default function ClerkBarcodePrinting() {
  const [loading,         setLoading]         = useState(true);
  const [products,        setProducts]        = useState<ProductRecord[]>([]);
  const [storeSettings,   setStoreSettings]   = useState<StoreSettings | null>(null);
  const [search,          setSearch]          = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [modalOpen,       setModalOpen]       = useState(false);
  const [activeTab,       setActiveTab]       = useState<PrintTabType>("products");
  const [lookupError,     setLookupError]     = useState("");
  const [printHistory,    setPrintHistory]    = useState<{
    product: ProductRecord; count: number; time: Date;
  }[]>([]);

  useEffect(() => {
    Promise.all([
      getProducts().then(setProducts),
      getStoreSettings().then(setStoreSettings).catch(() => null),
    ])
      .catch(() => toast.error("Failed to load products or store settings"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    products.filter((p) =>
      search === "" ||
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    ),
    [products, search]
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleBarcodeScan = useCallback((scannedVal: string) => {
    setLookupError("");
    const val = scannedVal.trim();
    if (!val) return;
    const exact = products.find((p) => p.barcode.toLowerCase() === val.toLowerCase());
    if (exact) {
      setSelectedProduct(exact);
      setModalOpen(true);
      setSearch("");
      return;
    }
    setSearch(val);
    const hasMatch = products.some((p) =>
      p.product_name.toLowerCase().includes(val.toLowerCase()) ||
      p.barcode.toLowerCase().includes(val.toLowerCase()) ||
      p.category.toLowerCase().includes(val.toLowerCase())
    );
    if (!hasMatch) {
      setLookupError("No products found. Try scanning a barcode or searching by name.");
    }
  }, [products]);

  const { handleKeyDown: handleSearchKeyDown, handleFocus: handleSearchFocus } = useBarcodeScanner({
    setValue: (val) => { setSearch(val); setLookupError(""); },
    onScan: handleBarcodeScan,
    inputRef: searchInputRef,
    enableGlobalScan: !modalOpen,
  });

  const handleSearch = () => {
    handleBarcodeScan(search);
  };

  const openModal = (product: ProductRecord) => {
    setSelectedProduct(product);
    setModalOpen(true);
    setLookupError("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Barcode Printing</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Print {BARCODE_PRINTER_CONFIG.labelWidthMm} × {BARCODE_PRINTER_CONFIG.labelHeightMm} mm labels for registered products.
        </p>
      </div>

      {/* Search / scan bar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm">
        <div className="relative">
          <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="Scan barcode with scanner or search by product name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLookupError(""); }}
            onKeyDown={handleSearchKeyDown}
            onFocus={handleSearchFocus}
            className="pl-12 h-11 text-base border-slate-200 bg-white font-medium rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">
          Scan a barcode to open print preview instantly, or type a product name to filter below
        </p>
        {lookupError && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
            <Barcode className="h-4 w-4 shrink-0" /> {lookupError}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex items-center border-b border-slate-200 bg-slate-50/70 px-2">
          {(["products", "history"] as PrintTabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all capitalize ${
                activeTab === tab
                  ? "border-blue-600 text-blue-700 bg-white rounded-t-lg"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
              }`}
            >
              {tab === "products" ? (
                <>
                  <Package className={`h-4 w-4 ${activeTab === tab ? "text-blue-600" : "text-slate-400"}`} />
                  Products
                  {filtered.length > 0 && (
                    <span className="text-[11px] bg-slate-200/80 px-2 py-0.5 rounded-full text-slate-700 font-bold">{filtered.length}</span>
                  )}
                </>
              ) : (
                <>
                  <Printer className={`h-4 w-4 ${activeTab === tab ? "text-blue-600" : "text-slate-400"}`} />
                  Print History
                  {printHistory.length > 0 && (
                    <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{printHistory.length}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {/* Products tab */}
        {activeTab === "products" && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="p-4 border-slate-200"><Skeleton className="h-28 w-full rounded-lg" /></Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Barcode className="h-10 w-10 opacity-30 mx-auto mb-2 text-slate-400" />
                <p className="font-semibold text-slate-700 text-sm">No products found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try searching with a different name or barcode</p>
              </div>
            ) : (
              <>
                <p className="px-5 pt-4 pb-2 text-xs text-slate-500 font-medium">
                  Showing <span className="font-bold text-slate-900">{filtered.length}</span> registered product{filtered.length !== 1 ? "s" : ""} — click any card to configure and print
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                  {filtered.map((product) => (
                    <Card
                      key={product.id}
                      className="p-4 cursor-pointer hover:shadow-md hover:border-blue-300 border-slate-200/80 transition-all group rounded-xl bg-white flex flex-col justify-between"
                      onClick={() => openModal(product)}
                    >
                      <div>
                        <div className="flex justify-center mb-3 p-2.5 bg-slate-50 border border-slate-100 rounded-lg group-hover:bg-blue-50/50 transition-colors">
                          <div className="w-full max-w-[130px]">
                            <BarcodePreview
                              code={product.barcode}
                              heightMm={BARCODE_PRINTER_CONFIG.barcodeHeightMm * 0.7}
                              symbology={BARCODE_PRINTER_CONFIG.barcodeSymbology}
                            />
                          </div>
                        </div>
                        <p className="font-mono text-xs font-bold tracking-widest text-slate-700 text-center mb-2">
                          {product.barcode}
                        </p>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">
                            {product.product_name}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Tag className="h-3 w-3 text-slate-400" /><span>{product.category}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Layers className="h-3 w-3 text-slate-400" /><span>{product.unit}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full mt-3.5 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 shadow-sm transition-all"
                        onClick={(e) => { e.stopPropagation(); openModal(product); }}
                      >
                        <Printer className="h-3.5 w-3.5" /> Print Label
                      </Button>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* History tab */}
        {activeTab === "history" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200">
                  <th className="text-left py-3 px-5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Product</th>
                  <th className="text-center py-3 px-5 font-semibold text-slate-600 text-xs uppercase tracking-wider w-36">Labels Printed</th>
                  <th className="text-right py-3 px-5 font-semibold text-slate-600 text-xs uppercase tracking-wider w-40">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {printHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-14 text-center text-slate-400 text-xs">
                      No labels printed in this session yet.
                    </td>
                  </tr>
                ) : (
                  printHistory.map((entry, i) => (
                    <tr key={i} className={`transition-colors hover:bg-slate-50/80 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                      <td className="py-3 px-5">
                        <p className="text-sm font-semibold text-slate-900">{entry.product.product_name}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{entry.product.barcode}</p>
                      </td>
                      <td className="py-3 px-5 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold tabular-nums">
                          {entry.count} label{entry.count !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-xs text-slate-500 whitespace-nowrap text-right font-medium">
                        {entry.time.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrintModal
        product={selectedProduct}
        storeSettings={storeSettings}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedProduct(null); }}
        onPrinted={(p, count) => setPrintHistory((h) => [{ product: p, count, time: new Date() }, ...h])}
      />
    </div>
  );
}
