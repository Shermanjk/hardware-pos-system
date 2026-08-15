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
import { BARCODE_PRINTER_CONFIG, getPrinterEngine } from "@/shared/services/barcodePrinter";
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
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const PAGE_SIZE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(quantity: number, reorder_level: number) {
  const status = deriveStatus(quantity, reorder_level);
  switch (status) {
    case "In Stock":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle2 className="h-3 w-3" /> In Stock
        </span>
      );
    case "Low Stock":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          <AlertTriangle className="h-3 w-3" /> Low Stock
        </span>
      );
    case "Critical":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertTriangle className="h-3 w-3" /> Critical
        </span>
      );
    case "Out of Stock":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <XCircle className="h-3 w-3" /> Out of Stock
        </span>
      );
  }
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────

interface ProductDetailModalProps {
  product: ProductRecord | null;
  open: boolean;
  onClose: () => void;
  onPrintBarcode: (product: ProductRecord) => void;
}

function ProductDetailModal({ product, open, onClose, onPrintBarcode }: ProductDetailModalProps) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Product Details
          </DialogTitle>
          <DialogDescription>
            Read-only view of the registered product information.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barcode badge */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Barcode</span>
            </div>
            <span className="font-mono font-bold text-blue-900 text-lg">{product.barcode}</span>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Boxes,  label: "Product Name",    value: product.product_name, span: true  },
              { icon: Tag,    label: "Category",         value: product.category, span: false },
              { icon: Truck,  label: "Supplier",         value: product.supplier, span: false },
              { icon: Layers, label: "Unit",             value: product.unit, span: false },
              { icon: Hash,   label: "Current Quantity", value: product.quantity, span: false },
              { icon: AlertTriangle, label: "Reorder Level", value: product.reorder_level, span: false },
            ].map(({ icon: Icon, label, value, span }) => (
              <div
                key={label}
                className={`p-3 bg-gray-50 rounded-lg ${span ? "col-span-2" : ""}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-500 font-medium">{label}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">{value}</p>
              </div>
            ))}

            {/* Status */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 font-medium block mb-1.5">Status</span>
              {statusBadge(product.quantity, product.reorder_level)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" /> Close
          </Button>
          <Button
            onClick={() => { onClose(); onPrintBarcode(product); }}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Printer className="h-4 w-4" /> Print Barcode
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Barcode Print Modal (inline shortcut) ────────────────────────────────────

interface BarcodePrintModalProps {
  product: ProductRecord | null;
  open: boolean;
  onClose: () => void;
}

function BarcodePrintModal({ product, open, onClose }: BarcodePrintModalProps) {
  const [labelCount, setLabelCount] = useState(1);

  // Callback ref: fires the instant the <svg> node is attached to the DOM,
  // bypassing Dialog animation timing that breaks useRef + useEffect.
  const svgCallbackRef = useCallback((node: SVGSVGElement | null) => {
    if (!node || !product?.barcode) return;
    try {
      JsBarcode(node, product.barcode, {
        format: "CODE128",
        displayValue: false,
        height: 52,
        width: 1.5,
        margin: 4,
        background: "transparent",
        lineColor: "#000",
      });
    } catch { /* invalid barcode — leave blank */ }
  }, [product?.barcode, open]); // re-run when product or open state changes

  const handlePrint = async () => {
    if (!product) return;
    const clampedCount = Math.max(1, Math.min(100, labelCount));
    try {
      const engine = getPrinterEngine(BARCODE_PRINTER_CONFIG);
      await engine.print(
        {
          barcode: product.barcode,
          storeName: BARCODE_PRINTER_CONFIG.storeName,
          quantity: clampedCount,
        },
        BARCODE_PRINTER_CONFIG
      );
      toast.success(`Printed ${clampedCount} label${clampedCount !== 1 ? "s" : ""} for "${product.product_name}"`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Print failed");
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600" />
            Print Barcode Label
          </DialogTitle>
          <DialogDescription>
            Print labels using the registered barcode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barcode preview */}
          <div className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center gap-1">
            <p className="text-xs font-bold text-gray-700 tracking-wide uppercase">
              {BARCODE_PRINTER_CONFIG.storeName}
            </p>
            <svg ref={svgCallbackRef} className="w-full h-auto" />
            <p className="font-mono text-sm font-bold tracking-widest text-gray-900">
              {product.barcode}
            </p>
            <p className="text-xs text-gray-400">{product.product_name}</p>
          </div>

          {/* Number of labels */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Number of Labels
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={labelCount}
              onChange={(e) => setLabelCount(Math.max(1, Math.min(100, Number(e.target.value))))}
              className="h-10"
            />
            <p className="text-xs text-gray-400 mt-1">Maximum 100 labels per print job</p>
          </div>
        </div>

        <div className="flex justify-between gap-3 pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePrint} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Printer className="h-4 w-4" /> Print {labelCount} Label{labelCount !== 1 ? "s" : ""}
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

  // Load real data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [inventoryData, categoriesData, suppliersData] = await Promise.all([
          getProducts(),
          getCategories(),
          getSuppliers(),
        ]);
        setProducts(inventoryData);
        setCategories(["all", ...categoriesData.map(c => c.category_name)]);
        setSuppliers(["all", ...suppliersData.map(s => s.supplier_name)]);
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
          ))
        ) : (
          <>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{products.length}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">Total Products</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{inStockCount}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">In Stock</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{lowStockCount}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">Low Stock</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">Critical / Empty</p>
            </Card>
          </>
        )}
      </div>

      {/* Search & Filters */}
      <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          {/* Main Search Bar */}
          <div className="flex-1 w-full lg:w-auto min-w-[300px]">
            <label className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2 block">
              <ScanLine className="h-3.5 w-3.5 inline mr-1" />
              Search Products
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 pointer-events-none" />
              <Input
                placeholder="Search by product name OR scan barcode…"
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
                          if (results.length === 1) {
                            setDetailProduct(results[0]);
                            setDetailOpen(true);
                            setSearch("");
                          } else if (results.length === 0) {
                            toast.error("Product not found. Try a different search term.");
                          } else {
                            setDetailProduct(results[0]);
                            setDetailOpen(true);
                            setSearch("");
                          }
                        }, 50);
                      }
                    }
                  }
                }}
                className="pl-12 h-11 text-base border-2 border-blue-300 bg-white rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-sm"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full font-medium">
                <ScanLine className="h-3 w-3" />
                <span>Scan</span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 w-full lg:w-auto">
            <div className="flex-1 lg:flex-none">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block lg:hidden">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-11 bg-white border-2 border-gray-200 hover:border-gray-300 w-full font-medium">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 lg:flex-none">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block lg:hidden">Supplier</label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-11 bg-white border-2 border-gray-200 hover:border-gray-300 w-full font-medium">
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
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-blue-200">
            <span className="text-xs text-blue-700 font-bold self-center flex items-center gap-1">
              <Search className="h-3 w-3" /> Active:
            </span>
            {search && (
              <Badge 
                className="gap-1 cursor-pointer bg-blue-600 text-white hover:bg-blue-700 font-medium" 
                onClick={() => setSearch("")}
              >
                <ScanLine className="h-3 w-3" /> {search} <X className="h-3 w-3" />
              </Badge>
            )}
            {categoryFilter !== "all" && (
              <Badge 
                className="gap-1 cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700 font-medium" 
                onClick={() => setCategoryFilter("all")}
              >
                {categoryFilter} <X className="h-3 w-3" />
              </Badge>
            )}
            {supplierFilter !== "all" && (
              <Badge 
                className="gap-1 cursor-pointer bg-purple-600 text-white hover:bg-purple-700 font-medium" 
                onClick={() => setSupplierFilter("all")}
              >
                {supplierFilter} <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <p className="text-sm text-gray-600">
            Showing{" "}
            <span className="font-semibold text-gray-900">
              {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)}
            </span>{" "}
            of <span className="font-semibold text-gray-900">{filtered.length}</span> products
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-y border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-36">Barcode</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[180px]">Product Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">Category</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-36">Supplier</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-20">Unit</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-20">Qty</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-24">Reorder Lvl</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">Status</th>
                <th className="py-3 px-4 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-100 rounded-full">
                        <Boxes className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="font-semibold text-gray-600">No products found</p>
                      <p className="text-xs text-gray-400">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((product, idx) => (
                  <tr
                    key={product.id}
                    className={`transition-colors hover:bg-blue-50 ${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                        {product.barcode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{product.product_name}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">{product.category}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600 max-w-[140px]">
                      <span className="truncate block">{product.supplier}</span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-xs font-medium text-gray-600">{product.unit}</span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {(() => {
                        const parts = formatQuantityParts(product.quantity, product.unit_abbreviation, product.quantity_type);
                        return (
                          <div className="flex items-center justify-center gap-0.5">
                            <span
                              className={`font-bold text-base tabular-nums ${
                                product.quantity === 0
                                  ? "text-gray-400"
                                  : product.quantity <= product.reorder_level * 0.5
                                  ? "text-red-600"
                                  : product.quantity <= product.reorder_level
                                  ? "text-amber-600"
                                  : "text-gray-900"
                              }`}
                            >
                              {parts.number}
                            </span>
                            {parts.unit && <span className="text-xs text-gray-500">{parts.unit}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4 text-center text-sm text-gray-500 tabular-nums">{product.reorder_level}</td>
                    <td className="py-3.5 px-4">{statusBadge(product.quantity, product.reorder_level)}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title="View Details"
                          onClick={() => { setDetailProduct(product); setDetailOpen(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title="View Movement Log"
                          onClick={() => { setLogProduct(product); setLogOpen(true); }}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title="Print Barcode"
                          onClick={() => { setPrintProduct(product); setPrintOpen(true); }}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
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
          <div className="px-6 py-4 border-t border-gray-100">
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              {pageNumbers().map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`ell-${i}`} className="px-2 text-gray-400">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPage(p)}
                    className="h-8 w-8 p-0"
                  >
                    {p}
                  </Button>
                )
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
        open={printOpen}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
