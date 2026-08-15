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
import {
    BARCODE_PRINTER_CONFIG,
    getPrinterEngine,
    type BarcodePrinterConfig,
} from "@/shared/services/barcodePrinter";
import JsBarcode from "jsbarcode";
import {
    Barcode, Layers, Package,
    Printer, ScanLine, Tag, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
      // Stretch bars horizontally to fill the label width seamlessly (e.g. 0004 or long EANs)
      node.setAttribute("preserveAspectRatio", "none");
    } catch { /* leave empty for invalid code */ }
  }, [code, heightMm, symbology]);

  return <svg ref={svgCallbackRef} className="w-full h-full block" />;
}

// ─── To-scale label preview card ─────────────────────────────────────────────

function LabelCard({ product, config }: { product: ProductRecord; config: BarcodePrinterConfig }) {
  const scale = 3.2; // px per mm for on-screen preview
  const w     = config.labelWidthMm  * scale;
  const h     = config.labelHeightMm * scale;
  const fs    = config.fontSizePt * 1.1;
  const pt    = config.marginTopMm    * scale;
  const pb    = config.marginBottomMm * scale;
  const pl    = config.marginLeftMm   * scale;
  const pr    = config.marginRightMm  * scale;

  return (
    <div
      className="bg-white border-2 border-gray-800 flex flex-col items-center justify-between overflow-hidden shadow-sm rounded-sm"
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
          className="font-bold text-center leading-tight truncate w-full flex-shrink-0 mb-0.5"
          style={{ fontFamily: config.fontFamily, fontSize: fs }}
        >
          {config.storeName}
        </p>
      )}
      <div className="w-full flex-1 flex items-center justify-center min-h-0 overflow-hidden my-0.5">
        <BarcodePreview
          code={product.barcode}
          heightMm={config.barcodeHeightMm}
          symbology={config.barcodeSymbology}
        />
      </div>
      {config.showBarcodeText && (
        <p
          className="font-mono text-center tracking-widest leading-none flex-shrink-0 mt-0.5 font-semibold"
          style={{ fontFamily: config.fontFamily, fontSize: fs * 0.85 }}
        >
          {product.barcode}
        </p>
      )}
    </div>
  );
}

// ─── Label size presets ───────────────────────────────────────────────────────

const SIZE_PRESETS = [
  { label: "50 × 30 mm (Standard)", w: 50, h: 30 },
  { label: "30 × 20 mm (Small)",    w: 30, h: 20 },
  { label: "38 × 25 mm",            w: 38, h: 25 },
  { label: "60 × 40 mm (Medium)",   w: 60, h: 40 },
  { label: "100 × 50 mm (Large)",   w: 100, h: 50 },
  { label: "Custom",                w: 0,  h: 0  },
] as const;

// ─── Print Modal ──────────────────────────────────────────────────────────────

interface PrintModalProps {
  product:   ProductRecord | null;
  open:      boolean;
  onClose:   () => void;
  onPrinted: (product: ProductRecord, count: number) => void;
}

function PrintModal({ product, open, onClose, onPrinted }: PrintModalProps) {
  const [quantity,   setQuantity]   = useState(1);
  const [printing,   setPrinting]   = useState(false);
  const [presetKey,  setPresetKey]  = useState("50×30");
  const [customW,    setCustomW]    = useState(BARCODE_PRINTER_CONFIG.labelWidthMm);
  const [customH,    setCustomH]    = useState(BARCODE_PRINTER_CONFIG.labelHeightMm);

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setPresetKey("50×30");
      setCustomW(BARCODE_PRINTER_CONFIG.labelWidthMm);
      setCustomH(BARCODE_PRINTER_CONFIG.labelHeightMm);
    }
  }, [open, product?.id]);

  // Build the active config, merging the selected physical dimensions directly
  const activeConfig: BarcodePrinterConfig = (() => {
    if (presetKey === "custom") {
      const w = Math.max(10, customW);
      const h = Math.max(5, customH);
      return {
        ...BARCODE_PRINTER_CONFIG,
        labelWidthMm:     w,
        labelHeightMm:    h,
        barcodeHeightMm:  Math.min(
          BARCODE_PRINTER_CONFIG.barcodeHeightMm,
          Math.max(5, h - BARCODE_PRINTER_CONFIG.marginTopMm - BARCODE_PRINTER_CONFIG.marginBottomMm - 6)
        ),
      };
    }
    const preset = SIZE_PRESETS.find((p) => `${p.w}×${p.h}` === presetKey);
    if (!preset || preset.w === 0) return BARCODE_PRINTER_CONFIG;
    return {
      ...BARCODE_PRINTER_CONFIG,
      labelWidthMm:     preset.w,
      labelHeightMm:    preset.h,
      barcodeHeightMm:  Math.min(
        BARCODE_PRINTER_CONFIG.barcodeHeightMm,
        Math.max(5, preset.h - BARCODE_PRINTER_CONFIG.marginTopMm - BARCODE_PRINTER_CONFIG.marginBottomMm - 6)
      ),
    };
  })();

  const clampedQty = Math.max(1, Math.min(500, quantity));

  const handlePrint = async () => {
    if (!product) return;
    setPrinting(true);
    try {
      const engine = getPrinterEngine(activeConfig);
      await engine.print(
        {
          barcode:   product.barcode,
          storeName: activeConfig.storeName,
          quantity:  clampedQty,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600" />
            Print Barcode Labels
          </DialogTitle>
          <DialogDescription>
            {activeConfig.labelWidthMm} × {activeConfig.labelHeightMm} mm · {activeConfig.barcodeSymbology}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="p-2 bg-blue-100 rounded-lg shrink-0">
              <Package className="h-4 w-4 text-blue-700" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{product.product_name}</p>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">{product.barcode}</p>
            </div>
          </div>

          {/* Label size */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Label Size</label>
            <Select
              value={presetKey}
              onValueChange={setPresetKey}
              disabled={printing}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZE_PRESETS.map((p) => (
                  <SelectItem
                    key={p.w === 0 ? "custom" : `${p.w}×${p.h}`}
                    value={p.w === 0 ? "custom" : `${p.w}×${p.h}`}
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
                variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold"
                onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                disabled={printing}
              >−</Button>
              <Input
                type="number" min={1} max={500}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="h-10 w-20 text-center font-bold text-lg"
                disabled={printing}
              />
              <Button
                variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold"
                onClick={() => setQuantity((n) => Math.min(500, n + 1))}
                disabled={printing}
              >+</Button>
              <span className="text-xs text-gray-400 ml-1">max 500</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-3 pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onClose} disabled={printing} className="gap-2">
            <X className="h-4 w-4" /> Cancel
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
  const [search,          setSearch]          = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [modalOpen,       setModalOpen]       = useState(false);
  const [activeTab,       setActiveTab]       = useState<PrintTabType>("products");
  const [lookupError,     setLookupError]     = useState("");
  const [printHistory,    setPrintHistory]    = useState<{
    product: ProductRecord; count: number; time: Date;
  }[]>([]);

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .catch(() => toast.error("Failed to load products"))
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

  const handleSearch = () => {
    setLookupError("");
    const val = search.trim();
    if (!val) return;
    const exact = products.find((p) => p.barcode.toLowerCase() === val.toLowerCase());
    if (exact) {
      setSelectedProduct(exact);
      setModalOpen(true);
      setSearch("");
      return;
    }
    if (filtered.length === 0) {
      setLookupError("No products found. Try scanning a barcode or searching by name.");
    }
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
      <div className="bg-white border-2 border-gray-300 rounded-xl p-4 shadow-sm">
        <div className="relative">
          <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 pointer-events-none" />
          <Input
            placeholder="Scan barcode or search by product name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLookupError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
            className="pl-12 h-12 text-base border-2 border-gray-300 bg-white font-medium rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Scan a barcode to print instantly, or type a product name to filter
        </p>
        {lookupError && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <Barcode className="h-4 w-4 shrink-0" /> {lookupError}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center border-b border-gray-200 bg-gray-50">
          {(["products", "history"] as PrintTabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all capitalize ${
                activeTab === tab
                  ? "border-blue-500 text-blue-800 bg-white"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {tab === "products" ? (
                <>
                  <Package className={`h-4 w-4 ${activeTab === tab ? "text-blue-600" : "text-gray-400"}`} />
                  Products
                  {filtered.length > 0 && (
                    <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-600">{filtered.length}</span>
                  )}
                </>
              ) : (
                <>
                  <Printer className={`h-4 w-4 ${activeTab === tab ? "text-blue-600" : "text-gray-400"}`} />
                  Print History
                  {printHistory.length > 0 && (
                    <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-600">{printHistory.length}</span>
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
                  <Card key={i} className="p-4"><Skeleton className="h-28 w-full" /></Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Barcode className="h-12 w-12 opacity-30 mx-auto mb-3" />
                <p className="font-medium text-gray-600">No products found</p>
                <p className="text-sm">Try a different search term</p>
              </div>
            ) : (
              <>
                <p className="px-4 pt-4 pb-2 text-sm text-gray-500">
                  <span className="font-semibold text-gray-900">{filtered.length}</span> product{filtered.length !== 1 ? "s" : ""} — click a card to print
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                  {filtered.map((product) => (
                    <Card
                      key={product.id}
                      className="p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
                      onClick={() => openModal(product)}
                    >
                      <div className="flex justify-center mb-3 p-2 bg-gray-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                        <div className="w-full max-w-[130px]">
                          <BarcodePreview
                            code={product.barcode}
                            heightMm={BARCODE_PRINTER_CONFIG.barcodeHeightMm * 0.7}
                            symbology={BARCODE_PRINTER_CONFIG.barcodeSymbology}
                          />
                        </div>
                      </div>
                      <p className="font-mono text-xs font-bold tracking-widest text-gray-600 text-center mb-2">
                        {product.barcode}
                      </p>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
                          {product.product_name}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Tag className="h-3 w-3" /><span>{product.category}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Layers className="h-3 w-3" /><span>{product.unit}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full mt-3 gap-1.5 bg-blue-600 hover:bg-blue-700 text-xs h-8 opacity-0 group-hover:opacity-100 transition-opacity"
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
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Product", "Labels", "Time"].map((h) => (
                    <th key={h} className="text-left py-3 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-gray-400 text-sm">
                      No labels printed this session
                    </td>
                  </tr>
                ) : (
                  printHistory.map((entry, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="py-3 px-5">
                        <p className="text-sm font-semibold text-gray-900">{entry.product.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{entry.product.barcode}</p>
                      </td>
                      <td className="py-3 px-5 text-sm font-medium text-gray-700">
                        {entry.count} label{entry.count !== 1 ? "s" : ""}
                      </td>
                      <td className="py-3 px-5 text-xs text-gray-500 whitespace-nowrap">
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
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedProduct(null); }}
        onPrinted={(p, count) => setPrintHistory((h) => [{ product: p, count, time: new Date() }, ...h])}
      />
    </div>
  );
}
