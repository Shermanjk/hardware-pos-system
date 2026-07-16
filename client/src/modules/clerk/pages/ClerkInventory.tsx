import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Search,
  ScanLine,
  Eye,
  Printer,
  Package,
  X,
  Boxes,
  Tag,
  Truck,
  Hash,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { mockProducts, mockCategories, mockSuppliers } from "@/modules/clerk/mockData";
import type { Product } from "@/modules/clerk/types";

const PAGE_SIZE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: Product["status"]) {
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
  product: Product | null;
  open: boolean;
  onClose: () => void;
  onPrintBarcode: (product: Product) => void;
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
              { icon: Boxes,  label: "Product Name",    value: product.name,     span: true  },
              { icon: Tag,    label: "Category",         value: product.category, span: false },
              { icon: Truck,  label: "Supplier",         value: product.supplier, span: false },
              { icon: Layers, label: "Unit",             value: product.unit,     span: false },
              { icon: Hash,   label: "Current Quantity", value: product.quantity, span: false },
              { icon: AlertTriangle, label: "Reorder Level", value: product.reorderLevel, span: false },
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
              {statusBadge(product.status)}
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
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

function BarcodePrintModal({ product, open, onClose }: BarcodePrintModalProps) {
  const [labelCount, setLabelCount] = useState(1);

  const handlePrint = () => {
    window.print();
    toast.success(`Printed ${labelCount} label(s) for "${product?.name}"`);
    onClose();
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
          {/* Barcode display */}
          <div className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-lg text-center print:border-solid">
            <p className="text-xs text-gray-500 mb-2">{product.name}</p>
            {/* Visual barcode bars */}
            <div className="flex items-end justify-center gap-px h-12 mb-2">
              {product.barcode.split("").map((char, i) => (
                <div
                  key={i}
                  className="bg-gray-900"
                  style={{
                    width: `${(char.charCodeAt(0) % 2 === 0) ? 2 : 1}px`,
                    height: `${40 + (char.charCodeAt(0) % 20)}%`,
                  }}
                />
              ))}
            </div>
            <p className="font-mono text-sm font-bold tracking-widest text-gray-900">
              {product.barcode}
            </p>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClerkInventory() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [printProduct, setPrintProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);

  // Simulate loading
  useEffect(() => {
    const t = setTimeout(() => {
      setProducts(mockProducts);
      setLoading(false);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = products.filter((p) => {
    const matchSearch =
      search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || p.category === categoryFilter;
    const matchSupplier = supplierFilter === "all" || p.supplier === supplierFilter;
    return matchSearch && matchCategory && matchSupplier;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [search, categoryFilter, supplierFilter]);

  // ── Barcode scan handler ───────────────────────────────────────────────────

  const handleBarcodeScan = useCallback(() => {
    const val = barcodeInput.trim();
    if (!val) return;
    const found = products.find(
      (p) => p.barcode.toLowerCase() === val.toLowerCase()
    );
    if (found) {
      setDetailProduct(found);
      setDetailOpen(true);
      setBarcodeInput("");
    } else {
      toast.error("Product not registered. Please contact the Administrator.", {
        duration: 4000,
      });
    }
  }, [barcodeInput, products]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBarcodeScan();
    }
  };

  // ── Summary stats ──────────────────────────────────────────────────────────

  const inStockCount   = products.filter((p) => p.status === "In Stock").length;
  const lowStockCount  = products.filter((p) => p.status === "Low Stock").length;
  const criticalCount  = products.filter((p) => p.status === "Critical" || p.status === "Out of Stock").length;

  // ── Pagination helper ──────────────────────────────────────────────────────

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
          onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 500); }}
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

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Text search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-gray-50"
            />
          </div>

          {/* Barcode scan input */}
          <div className="relative">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
            <Input
              ref={barcodeRef}
              placeholder="Scan barcode / Enter code…"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              className="pl-9 pr-20 h-10 bg-gray-50 font-mono"
            />
            <Button
              size="sm"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 text-xs text-blue-600"
              onClick={handleBarcodeScan}
            >
              Lookup
            </Button>
          </div>

          {/* Category filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-10 bg-gray-50 w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {mockCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Supplier filter */}
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="h-10 bg-gray-50 w-full">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {mockSuppliers.map((s) => (
                <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Active filter chips */}
        {(search || categoryFilter !== "all" || supplierFilter !== "all") && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500 font-medium self-center">Active filters:</span>
            {search && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setSearch("")}>
                Search: {search} <X className="h-3 w-3" />
              </Badge>
            )}
            {categoryFilter !== "all" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setCategoryFilter("all")}>
                {categoryFilter} <X className="h-3 w-3" />
              </Badge>
            )}
            {supplierFilter !== "all" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setSupplierFilter("all")}>
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
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Barcode", "Product Name", "Category", "Supplier", "Unit", "Qty", "Reorder Lvl", "Status", "Actions"].map(
                  (h) => (
                    <th key={h} className="text-left py-3.5 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Boxes className="h-12 w-12 opacity-30" />
                      <p className="font-medium text-gray-600">No products found</p>
                      <p className="text-sm">Try adjusting your search or filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((product, idx) => (
                  <tr
                    key={product.id}
                    className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors ${
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {product.barcode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-gray-900 max-w-[180px]">
                      <span className="truncate block">{product.name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 text-xs">{product.category}</td>
                    <td className="py-3.5 px-4 text-gray-600 text-xs max-w-[140px]">
                      <span className="truncate block">{product.supplier}</span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 text-xs">{product.unit}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-bold text-base ${
                          product.quantity === 0
                            ? "text-gray-400"
                            : product.quantity <= product.reorderLevel * 0.5
                            ? "text-red-600"
                            : product.quantity <= product.reorderLevel
                            ? "text-amber-600"
                            : "text-gray-900"
                        }`}
                      >
                        {product.quantity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 text-sm">{product.reorderLevel}</td>
                    <td className="py-3.5 px-4">{statusBadge(product.status)}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                          title="View Details"
                          onClick={() => { setDetailProduct(product); setDetailOpen(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
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
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                    className={page === 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                  />
                </PaginationItem>

                {pageNumbers().map((p, i) =>
                  p === "ellipsis" ? (
                    <PaginationItem key={`ell-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === page}
                        onClick={(e) => { e.preventDefault(); setPage(p as number); }}
                        className="cursor-pointer"
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}

                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                    className={page === totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
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
      <BarcodePrintModal
        product={printProduct}
        open={printOpen}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
