import { useState, useEffect, useMemo } from "react";
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

type SortField = "shortage" | "productName" | "quantity" | "reorderLevel";
type SortDir   = "asc" | "desc";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ quantity, reorderLevel }: { quantity: number; reorderLevel: number }) {
  const status = deriveStatus(quantity, reorderLevel);
  switch (status) {
    case "Critical":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <Flame className="h-3 w-3" /> Critical
        </span>
      );
    case "Low Stock":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          <AlertTriangle className="h-3 w-3" /> Low Stock
        </span>
      );
    case "Out of Stock":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <XCircle className="h-3 w-3" /> Out of Stock
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
        console.error("Failed to fetch inventory:", err);
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
            onClick={() => window.location.href = "/clerk/stock-in"}
          >
            <PackagePlus className="h-4 w-4" /> New Stock In
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5"><Skeleton className="h-14 w-full" /></Card>
          ))
        ) : (
          <>
            <Card className="p-5 bg-red-50 border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-red-600 font-semibold uppercase tracking-wide">Critical / Out of Stock</p>
                  <p className="text-3xl font-bold text-red-700 mt-1">{criticalCount}</p>
                  <p className="text-xs text-red-500 mt-1">Immediate action needed</p>
                </div>
                <div className="p-3 bg-red-100 rounded-xl">
                  <Flame className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </Card>
            <Card className="p-5 bg-amber-50 border-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Low Stock</p>
                  <p className="text-3xl font-bold text-amber-700 mt-1">{lowCount}</p>
                  <p className="text-xs text-amber-500 mt-1">Order soon</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-xl">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </Card>
            <Card className="p-5 bg-orange-50 border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Total Units Short</p>
                  <p className="text-3xl font-bold text-orange-700 mt-1">{totalShortage.toLocaleString()}</p>
                  <p className="text-xs text-orange-500 mt-1">Units needed to reach reorder level</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-xl">
                  <TrendingDown className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by name or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-gray-50"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-10 bg-gray-50 w-full">
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
      <Card className="overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{sorted.length}</span> product{sorted.length !== 1 ? "s" : ""} need attention
          </p>
          <p className="text-xs text-gray-400">Click column headers to sort</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Barcode</th>
                <SortHeader label="Product Name" field="productName" current={sortField} dir={sortDir} onClick={handleSort} />
                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Category</th>
                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Supplier</th>
                <SortHeader label="Current Qty" field="quantity" current={sortField} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Reorder Level" field="reorderLevel" current={sortField} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Shortage" field="shortage" current={sortField} dir={sortDir} onClick={handleSort} />
                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left py-3.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <AlertTriangle className="h-10 w-10 opacity-30" />
                      {search || categoryFilter !== "all" ? (
                        <>
                          <p className="font-medium text-gray-600">No products match your filters</p>
                          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCategoryFilter("all"); }}>
                            Clear filters
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-green-600">All products are sufficiently stocked!</p>
                          <p className="text-sm">No products are at or below their reorder level.</p>
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
                  const urgencyColor = isCritical ? "bg-red-50/40" : "bg-amber-50/20";

                  return (
                    <tr
                      key={product.id}
                      className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${
                        idx % 2 === 0 ? urgencyColor : "bg-white"
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {product.barcode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-900 max-w-[180px]">
                        <span className="truncate block">{product.product_name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-500 text-xs">{product.category}</td>
                      <td className="py-3.5 px-4 text-gray-500 text-xs max-w-[140px]">
                        <span className="truncate block">{product.supplier}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`font-bold text-lg ${
                          product.quantity === 0 ? "text-gray-400" :
                          isCritical ? "text-red-600" : "text-amber-600"
                        }`}>
                          {product.quantity}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{product.unit}</span>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 text-sm font-medium">{product.reorder_level}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm ${isCritical ? "text-red-600" : "text-amber-600"}`}>
                            -{shortage}
                          </span>
                          {/* Mini shortage bar */}
                          <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isCritical ? "bg-red-500" : "bg-amber-400"}`}
                              style={{ width: `${Math.min(100, (shortage / product.reorder_level) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge quantity={product.quantity} reorderLevel={product.reorder_level} />
                      </td>
                      <td className="py-3.5 px-4">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                          onClick={() => window.location.href = "/clerk/stock-in"}
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
        <Card className="p-5 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
              <PackagePlus className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">Recommended Action</p>
              <p className="text-xs text-blue-700 mt-1">
                {sorted.length} product{sorted.length !== 1 ? "s" : ""} need restocking.
                Total units short: <strong>{totalShortage}</strong>.
                Contact your suppliers to arrange deliveries, then use
                <strong> New Stock In</strong> to record received goods.
              </p>
              <Button
                size="sm"
                className="mt-3 gap-2 bg-blue-600 hover:bg-blue-700 h-8 text-xs"
                onClick={() => window.location.href = "/clerk/stock-in"}
              >
                <PackagePlus className="h-3.5 w-3.5" /> Open Stock In
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
