import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, Search, PackagePlus, RefreshCw,
  TrendingDown, ArrowUpDown, ChevronUp, ChevronDown,
  XCircle, Flame,
} from "lucide-react";
import { toast } from "sonner";
import { getInventory, type InventoryItem } from "@/shared/api/inventoryApi";
import { getCategories, deriveStatus } from "@/shared/api/productsApi";
import type { Category } from "@/shared/api/productsApi";
import { formatQuantity, formatQuantityParts } from "@/shared/utils/quantityFormat";

type SortField = "shortage" | "productName" | "quantity" | "reorderLevel";
type SortDir   = "asc" | "desc";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ quantity, reorderLevel }: { quantity: number; reorderLevel: number }) {
  const status = deriveStatus(quantity, reorderLevel);
  switch (status) {
    case "Critical":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <Flame className="h-3 w-3 text-rose-600 animate-pulse" /> Critical
        </span>
      );
    case "Low Stock":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3 text-amber-600" /> Low Stock
        </span>
      );
    case "Out of Stock":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          <XCircle className="h-3 w-3 text-slate-500" /> Out of Stock
        </span>
      );
    default:
      return null;
  }
}

// ─── Sortable column header ───────────────────────────────────────────────────
function SortHeader({
  label, field, current, dir, onClick,
}: {
  label: string; field: SortField; current: SortField; dir: SortDir; onClick: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th
      className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-gray-900 transition-colors"
      onClick={() => onClick(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3.5 w-3.5 text-blue-600" /> : <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-gray-300" />
        )}
      </div>
    </th>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClerkLowStock() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>(["all"]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("shortage");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [inventoryData, categoriesData] = await Promise.all([
          getInventory(),
          getCategories(),
        ]);
        setAllProducts(inventoryData);
        setCategories(["all", ...categoriesData.map(c => c.category_name)]);
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

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    toast.info("Low stock list refreshed");
  };

  // ── Filter: only products at or below reorder level ────────────────────────
  const lowStockProducts = useMemo(
    () => allProducts.filter((p) => p.quantity <= p.reorder_level),
    [allProducts]
  );

  // ── Search + category filter ───────────────────────────────────────────────
  const filtered = useMemo(() =>
    lowStockProducts.filter((p) => {
      const matchSearch =
        search === "" ||
        p.product_name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "all" || p.category === categoryFilter;
      return matchSearch && matchCategory;
    }),
    [lowStockProducts, search, categoryFilter]
  );

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (sortField) {
        case "shortage":
          aVal = a.reorder_level - a.quantity;
          bVal = b.reorder_level - b.quantity;
          break;
        case "productName":
          aVal = a.product_name;
          bVal = b.product_name;
          break;
        case "quantity":
          aVal = a.quantity;
          bVal = b.quantity;
          break;
        case "reorderLevel":
          aVal = a.reorder_level;
          bVal = b.reorder_level;
          break;
      }
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortDir((d) => d === "asc" ? "desc" : "asc"); }
    else { setSortField(field); setSortDir("desc"); }
  };

  // ── Summary stats ──────────────────────────────────────────────────────────
  const criticalCount = lowStockProducts.filter((p) =>
    ["Critical", "Out of Stock"].includes(deriveStatus(p.quantity, p.reorder_level))
  ).length;
  const lowCount = lowStockProducts.filter((p) =>
    deriveStatus(p.quantity, p.reorder_level) === "Low Stock"
  ).length;
  const totalShortage = lowStockProducts.reduce((s, p) =>
    s + Math.max(0, p.reorder_level - p.quantity), 0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Low Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Products at or below their reorder level — action required
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={() => navigate("/clerk/stock-in")}
          >
            <PackagePlus className="h-4 w-4" /> New Stock In
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-14 w-full rounded-lg" /></Card>
          ))
        ) : (
          <>
            <Card className="p-5 bg-white border border-rose-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-rose-600 font-bold uppercase tracking-wider">Critical / Out of Stock</p>
                  <p className="text-3xl font-extrabold text-rose-700 mt-1">{criticalCount}</p>
                  <p className="text-xs text-slate-500 mt-1">Immediate action needed</p>
                </div>
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                  <Flame className="h-6 w-6" />
                </div>
              </div>
            </Card>
            <Card className="p-5 bg-white border border-amber-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">Low Stock</p>
                  <p className="text-3xl font-extrabold text-amber-700 mt-1">{lowCount}</p>
                  <p className="text-xs text-slate-500 mt-1">Order soon</p>
                </div>
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                  <AlertTriangle className="h-6 w-6" />
                </div>
              </div>
            </Card>
            <Card className="p-5 bg-white border border-orange-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-600 font-bold uppercase tracking-wider">Total Units Short</p>
                  <p className="text-3xl font-extrabold text-orange-700 mt-1">{totalShortage.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-1">Units needed to reach reorder level</p>
                </div>
                <div className="p-3 bg-orange-50 text-orange-600 rounded-xl border border-orange-100">
                  <TrendingDown className="h-6 w-6" />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="p-4 bg-white border border-slate-200/80 shadow-sm rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search by name or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-lg text-sm transition-all"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-10 bg-slate-50/50 hover:bg-white border-slate-200 w-full text-sm font-medium">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border border-slate-200/80 shadow-sm rounded-xl bg-white">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <p className="text-xs text-slate-600 font-medium">
            <span className="font-bold text-slate-900">{sorted.length}</span> product{sorted.length !== 1 ? "s" : ""} need attention
          </p>
          <p className="text-xs text-slate-400">Click column headers to sort</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
              <tr>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Barcode</th>
                <SortHeader label="Product Name" field="productName" current={sortField} dir={sortDir} onClick={handleSort} />
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Category</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Supplier</th>
                <SortHeader label="Current Qty" field="quantity" current={sortField} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Reorder Level" field="reorderLevel" current={sortField} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Shortage" field="shortage" current={sortField} dir={sortDir} onClick={handleSort} />
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                <th className="text-right py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="bg-white">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4"><Skeleton className="h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center bg-white">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-full">
                        <AlertTriangle className="h-7 w-7" />
                      </div>
                      {search || categoryFilter !== "all" ? (
                        <>
                          <p className="font-semibold text-slate-700 text-sm">No products match your filters</p>
                          <Button variant="outline" size="sm" onClick={() => { setSearch(""); setCategoryFilter("all"); }} className="mt-1 text-xs">
                            Clear filters
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="font-bold text-emerald-700 text-base">All products are sufficiently stocked!</p>
                          <p className="text-xs text-slate-500">No products are currently at or below their reorder level.</p>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map((product, idx) => {
                  const shortage = Math.max(0, product.reorder_level - product.quantity);
                  const status = deriveStatus(product.quantity, product.reorder_level);
                  const isCritical = ["Critical", "Out of Stock"].includes(status);

                  return (
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
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-[200px]">
                        <span className="truncate block">{product.product_name}</span>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full inline-block">
                          {product.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs max-w-[140px]">
                        <span className="truncate block font-medium">{product.supplier || "—"}</span>
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const parts = formatQuantityParts(product.quantity, product.unit_abbreviation, product.quantity_type);
                          return (
                            <div className="flex items-center gap-0.5">
                              <span className={`font-bold text-sm tabular-nums ${
                                product.quantity === 0 ? "text-slate-400" :
                                isCritical ? "text-rose-600 font-extrabold" : "text-amber-600 font-bold"
                              }`}>
                                {parts.number}
                              </span>
                              {parts.unit && <span className="text-[11px] text-slate-400 ml-0.5">{parts.unit}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs font-semibold tabular-nums">{product.reorder_level}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-xs tabular-nums ${isCritical ? "text-rose-600" : "text-amber-600"}`}>
                            -{shortage}
                          </span>
                          {/* Mini shortage bar */}
                          <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isCritical ? "bg-rose-500" : "bg-amber-400"}`}
                              style={{ width: `${Math.min(100, Math.max(5, (shortage / (product.reorder_level || 1)) * 100))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge quantity={product.quantity} reorderLevel={product.reorder_level} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 font-semibold whitespace-nowrap shadow-sm"
                          onClick={() => navigate("/clerk/stock-in")}
                        >
                          <PackagePlus className="h-3.5 w-3.5" /> Stock In
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recommended re-order summary */}
      {!loading && sorted.length > 0 && (
        <Card className="p-5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/80 shadow-sm rounded-xl">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm shrink-0">
              <PackagePlus className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">Recommended Replenishment</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                <strong>{sorted.length}</strong> product{sorted.length !== 1 ? "s" : ""} need restocking with a total deficit of <strong>{totalShortage.toLocaleString()} units</strong>.
                Create a new delivery record in Stock In to update inventory immediately upon arrival.
              </p>
              <Button
                size="sm"
                className="mt-3 gap-2 bg-blue-600 hover:bg-blue-700 h-8 text-xs font-semibold shadow-sm"
                onClick={() => navigate("/clerk/stock-in")}
              >
                <PackagePlus className="h-3.5 w-3.5" /> Open Stock In Wizard
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
