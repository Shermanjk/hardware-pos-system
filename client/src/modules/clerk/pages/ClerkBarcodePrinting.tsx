import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Barcode, Search, Printer, ScanLine, Package,
  Tag, Layers, X, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { liveProducts } from "./ClerkStockIn";
import { mockActivityLogs } from "@/modules/clerk/mockData";
import type { Product } from "@/modules/clerk/types";
import { nanoid } from "nanoid";

// ─── Label size options ───────────────────────────────────────────────────────
const LABEL_SIZES = [
  { value: "small",  label: "Small  — 38 × 25 mm",  width: "96px",  height: "64px"  },
  { value: "medium", label: "Medium — 50 × 30 mm",  width: "128px", height: "76px"  },
  { value: "large",  label: "Large  — 100 × 50 mm", width: "256px", height: "128px" },
];

// ─── CSS-only barcode renderer ────────────────────────────────────────────────
// Converts each character of the barcode string into alternating-width bars.
function VisualBarcode({ code, height = 48 }: { code: string; height?: number }) {
  const bars = code.split("").flatMap((char) => {
    const w = (char.charCodeAt(0) % 3) + 1; // 1–3 px wide bar
    const gap = 1;
    return [
      { type: "bar", width: w },
      { type: "gap", width: gap },
    ];
  });

  return (
    <div className="flex items-end justify-center gap-0" style={{ height }}>
      {bars.map((b, i) =>
        b.type === "bar" ? (
          <div
            key={i}
            className="bg-gray-900 flex-shrink-0"
            style={{
              width: b.width,
              height: `${55 + (i % 5) * 9}%`,
            }}
          />
        ) : (
          <div key={i} className="flex-shrink-0" style={{ width: b.width }} />
        )
      )}
    </div>
  );
}

// ─── Single label preview ─────────────────────────────────────────────────────
function LabelPreview({
  product,
  size,
}: {
  product: Product;
  size: typeof LABEL_SIZES[number];
}) {
  const isLarge = size.value === "large";
  const isMedium = size.value === "medium";

  return (
    <div
      className="bg-white border-2 border-gray-800 flex flex-col items-center justify-between p-1 rounded-sm"
      style={{ width: size.width, height: size.height, minWidth: size.width }}
    >
      {isLarge && (
        <p className="text-center font-bold leading-tight" style={{ fontSize: "7px", maxWidth: "100%" }}>
          {product.name.length > 28 ? product.name.slice(0, 28) + "…" : product.name}
        </p>
      )}
      {isMedium && (
        <p className="text-center font-bold leading-tight" style={{ fontSize: "6px", maxWidth: "100%" }}>
          {product.name.length > 20 ? product.name.slice(0, 20) + "…" : product.name}
        </p>
      )}
      <VisualBarcode code={product.barcode} height={isLarge ? 56 : isMedium ? 36 : 28} />
      <p
        className="font-mono font-bold tracking-widest text-center"
        style={{ fontSize: isLarge ? "8px" : "6px" }}
      >
        {product.barcode}
      </p>
    </div>
  );
}

// ─── Print Modal ──────────────────────────────────────────────────────────────
interface PrintModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

function PrintModal({ product, open, onClose }: PrintModalProps) {
  const [labelCount, setLabelCount] = useState(1);
  const [sizeValue, setSizeValue] = useState("medium");

  const size = LABEL_SIZES.find((s) => s.value === sizeValue)!;

  const handlePrint = () => {
    if (!product) return;
    // Inject print styles targeting the print-area div
    const style = document.createElement("style");
    style.id = "__barcode_print_style__";
    style.innerHTML = `
      @media print {
        body > * { display: none !important; }
        #barcode-print-area { display: flex !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => {
      document.getElementById("__barcode_print_style__")?.remove();
    }, 1000);

    mockActivityLogs.unshift({
      id: nanoid(6),
      action: "Printed Barcode",
      product: product.name,
      qtyChange: "—",
      performedBy: "Maria Santos",
      timestamp: new Date().toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      }),
    });
    toast.success(`Printing ${labelCount} label(s) for "${product.name}"`);
    onClose();
  };

  if (!product) return null;

  const clampedCount = Math.max(1, Math.min(100, labelCount));

  return (
    <>
      {/* Hidden print area — shown only during print via injected CSS */}
      <div
        id="barcode-print-area"
        className="hidden"
        style={{ flexWrap: "wrap", gap: "4px", padding: "8px" }}
      >
        {Array.from({ length: clampedCount }).map((_, i) => (
          <LabelPreview key={i} product={product} size={size} />
        ))}
      </div>

      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-blue-600" />
              Print Barcode Labels
            </DialogTitle>
            <DialogDescription>
              Labels use the barcode registered by the Administrator. No new barcode is generated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Product info strip */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <Package className="h-4 w-4 text-blue-700" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{product.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{product.category} · {product.unit}</p>
              </div>
            </div>

            {/* Barcode display */}
            <div className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center gap-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Barcode Preview</p>
              <VisualBarcode code={product.barcode} height={52} />
              <p className="font-mono font-bold tracking-[0.25em] text-gray-900 text-lg">
                {product.barcode}
              </p>
            </div>

            {/* Label size */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Label Size</label>
              <Select value={sizeValue} onValueChange={setSizeValue}>
                <SelectTrigger className="w-full h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Number of labels */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Number of Labels
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold"
                  onClick={() => setLabelCount((n) => Math.max(1, n - 1))}
                >−</Button>
                <Input
                  type="number" min={1} max={100}
                  value={labelCount}
                  onChange={(e) => setLabelCount(Number(e.target.value))}
                  className="h-10 w-20 text-center font-bold text-lg"
                />
                <Button
                  variant="outline" size="sm" className="h-10 w-10 p-0 text-lg font-bold"
                  onClick={() => setLabelCount((n) => Math.min(100, n + 1))}
                >+</Button>
                <span className="text-xs text-gray-400 ml-1">max 100</span>
              </div>
            </div>

            {/* Label preview grid */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">
                Preview ({Math.min(clampedCount, 6)} of {clampedCount} label{clampedCount !== 1 ? "s" : ""})
              </p>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 min-h-[60px]">
                {Array.from({ length: Math.min(clampedCount, 6) }).map((_, i) => (
                  <LabelPreview key={i} product={product} size={size} />
                ))}
                {clampedCount > 6 && (
                  <div
                    className="flex items-center justify-center bg-gray-200 rounded-sm text-xs text-gray-600 font-semibold"
                    style={{ width: size.width, height: size.height }}
                  >
                    +{clampedCount - 6} more
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between gap-3 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={onClose} className="gap-2">
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handlePrint} className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Printer className="h-4 w-4" />
              Print {clampedCount} Label{clampedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClerkBarcodePrinting() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => { setProducts(liveProducts); setLoading(false); }, 600);
    return () => clearTimeout(t);
  }, []);

  // Filter results
  const filtered = useMemo(() =>
    products.filter((p) =>
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    ),
    [products, search]
  );

  const handleBarcodeSearch = () => {
    setLookupError("");
    const val = barcodeInput.trim();
    if (!val) return;
    const found = products.find((p) => p.barcode.toLowerCase() === val.toLowerCase());
    if (found) {
      setSelectedProduct(found);
      setModalOpen(true);
      setBarcodeInput("");
    } else {
      setLookupError("Product not registered. Please contact the Administrator.");
    }
  };

  const openModal = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
    setLookupError("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Barcode Printing</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Print labels for registered products only. Barcodes are set by the Administrator.
        </p>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <Barcode className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p>
          Only products already registered in the system can be printed.
          The barcode displayed is the one stored in the product record — no new barcode is generated.
        </p>
      </div>

      {/* Search bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Name/category search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by product name or category…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setLookupError(""); }}
              className="pl-9 h-10 bg-gray-50"
            />
          </div>

          {/* Barcode scan / direct lookup */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
              <Input
                placeholder="Scan or type barcode (Enter)…"
                value={barcodeInput}
                onChange={(e) => { setBarcodeInput(e.target.value); setLookupError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcodeSearch(); }}}
                className="pl-9 h-10 bg-gray-50 font-mono"
              />
            </div>
            <Button variant="outline" className="h-10 px-4 flex-shrink-0" onClick={handleBarcodeSearch}>
              Lookup
            </Button>
          </div>
        </div>

        {lookupError && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <Barcode className="h-4 w-4 flex-shrink-0" /> {lookupError}
          </div>
        )}
      </Card>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="p-4"><Skeleton className="h-28 w-full" /></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Barcode className="h-12 w-12 opacity-30" />
            <p className="font-medium text-gray-600">No products found</p>
            <p className="text-sm">Try a different search term</p>
          </div>
        </Card>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{filtered.length}</span> product{filtered.length !== 1 ? "s" : ""} found
            — click any card to print its label
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((product) => (
              <Card
                key={product.id}
                className="p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
                onClick={() => openModal(product)}
              >
                {/* Barcode visual */}
                <div className="flex justify-center mb-3 p-2 bg-gray-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                  <VisualBarcode code={product.barcode} height={36} />
                </div>

                <p className="font-mono text-xs font-bold tracking-widest text-gray-600 text-center mb-2">
                  {product.barcode}
                </p>

                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
                    {product.name}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Tag className="h-3 w-3" />
                    <span>{product.category}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Layers className="h-3 w-3" />
                    <span>{product.unit}</span>
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

      {/* Recent print log */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-base font-semibold text-gray-900">Recent Print Activity</h2>
          <p className="text-xs text-gray-500 mt-0.5">Labels printed this session</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Product", "Performed By", "Time"].map((h) => (
                  <th key={h} className="text-left py-3 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockActivityLogs
                .filter((l) => l.action === "Printed Barcode")
                .slice(0, 8)
                .map((log, idx) => (
                  <tr key={log.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-50 rounded-lg">
                          <Printer className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <span className="font-medium text-gray-800 text-sm">{log.product}</span>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-gray-500 text-sm">{log.performedBy}</td>
                    <td className="py-3 px-5 text-gray-400 text-xs whitespace-nowrap">{log.timestamp}</td>
                  </tr>
                ))}
              {mockActivityLogs.filter((l) => l.action === "Printed Barcode").length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-400 text-sm">
                    No barcode labels printed yet this session
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <PrintModal
        product={selectedProduct}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedProduct(null); }}
      />
    </div>
  );
}
