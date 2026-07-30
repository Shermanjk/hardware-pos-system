import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, RefreshCw, AlertCircle, X, Package,
  Boxes, AlertTriangle, TrendingDown, CheckCircle2, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getInventory, getInventorySummary, getInventoryLogs,
  type InventoryItem, type InventorySummary, type InventoryLog, type StockStatusFilter,
} from "@/shared/api/inventoryApi";
import { getCategories, type Category, deriveStatus } from "@/shared/api/productsApi";
import axios from "axios";
import { formatQuantity, formatQuantityParts } from "@/shared/utils/quantityFormat";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

function statusBadge(status: ReturnType<typeof deriveStatus>) {
  const s =
    status === "In Stock"  ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
    status === "Low Stock" ? "bg-amber-100 text-amber-700 border border-amber-200"       :
    status === "Critical"  ? "bg-orange-100 text-orange-700 border border-orange-200"   :
                             "bg-red-100 text-red-700 border border-red-200";
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s}`}>{status}</span>;
}

function txBadge(type: string | null) {
  const t = (type ?? "").toLowerCase();
  const s =
    t.includes("stock in")    ? "bg-blue-100 text-blue-700"     :
    t.includes("sale")        ? "bg-purple-100 text-purple-700" :
    t.includes("return")      ? "bg-amber-100 text-amber-700"   :
    t.includes("adjustment")  ? "bg-gray-100 text-gray-700"     :
                                "bg-gray-100 text-gray-500";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s}`}>{type ?? "—"}</span>;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(d: string | null) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary, loading }: { summary: InventorySummary | null; loading: boolean }) {
  const cards = [
    { label: "Total Products", value: summary?.total_products ?? 0, icon: Boxes,        color: "text-blue-600",    bg: "bg-blue-50"   },
    { label: "In Stock",       value: summary?.in_stock      ?? 0, icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50"},
    { label: "Low Stock",      value: summary?.low_stock     ?? 0, icon: TrendingDown,  color: "text-amber-600",   bg: "bg-amber-50"  },
    { label: "Critical",       value: summary?.critical      ?? 0, icon: AlertTriangle, color: "text-orange-600",  bg: "bg-orange-50" },
    { label: "Out of Stock",   value: summary?.out_of_stock  ?? 0, icon: AlertCircle,   color: "text-red-600",     bg: "bg-red-50"    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium truncate">{c.label}</p>
              {loading
                ? <div className="h-6 w-10 bg-gray-100 rounded animate-pulse mt-1" />
                : <p className={`text-2xl font-bold ${c.color} leading-tight tabular-nums`}>{c.value.toLocaleString()}</p>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stock Table ──────────────────────────────────────────────────────────────

function StockTable({
  items, loading, error, onRetry, onSelectProduct, selectedProductId,
}: {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectProduct: (id: number | null) => void;
  selectedProductId: number | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {error && (
        <div className="flex items-center gap-3 px-5 py-3 bg-red-50 border-b border-red-200">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={onRetry} className="text-red-600 text-sm font-semibold hover:underline">Retry</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Barcode</th>
              <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>
              <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Category</th>
              <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Stock</th>
              <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Reorder</th>
              <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Damaged</th>
              <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
              <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Last Updated</th>
              <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Logs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="py-20 text-center">
                <div className="flex items-center justify-center gap-2 text-gray-400">
                  <Spinner className="text-blue-500" /><span className="text-sm">Loading inventory…</span>
                </div>
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="py-20 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                    <Package className="h-7 w-7 text-gray-400" />
                  </div>
                  <p className="font-semibold text-gray-700">No products found</p>
                  <p className="text-xs text-gray-400">Try adjusting your filters</p>
                </div>
              </td></tr>
            ) : items.map((item) => {
              const st = deriveStatus(item.quantity, item.reorder_level);
              const isSelected = selectedProductId === item.id;
              return (
                <tr key={item.id}
                  className={`hover:bg-blue-50/40 transition-colors ${isSelected ? "bg-blue-50" : ""}`}>
                  <td className="py-3.5 px-5">
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                      {item.barcode}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    <p className="font-semibold text-gray-900 text-sm">{item.product_name}</p>
                    <p className="text-xs text-gray-400">{item.supplier}</p>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="text-xs font-medium text-gray-600 bg-slate-100 px-2 py-1 rounded-full">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    {(() => {
                      const parts = formatQuantityParts(item.quantity, item.unit_abbreviation, item.quantity_type, item.unit_allow_decimal);
                      return (
                        <div className="flex items-center justify-center gap-0.5">
                          <span className={`text-base font-bold tabular-nums ${
                            item.quantity === 0 ? "text-red-600" :
                            item.quantity <= item.reorder_level ? "text-amber-600" : "text-gray-900"
                          }`}>{parts.number}</span>
                          {parts.unit && <span className="text-xs text-gray-500">{parts.unit}</span>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3.5 px-5 text-center text-sm text-gray-500">{item.reorder_level}</td>
                  <td className="py-3.5 px-5 text-center">
                    <span className={`text-sm font-semibold tabular-nums ${item.damaged_stock > 0 ? "text-red-500" : "text-gray-300"}`}>
                      {item.damaged_stock}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center">{statusBadge(st)}</td>
                  <td className="py-3.5 px-5 text-xs text-gray-400">{fmtRelative(item.updated_at)}</td>
                  <td className="py-3.5 px-5 text-center">
                    <button
                      onClick={() => onSelectProduct(isSelected ? null : item.id)}
                      className={`h-7 w-7 rounded-lg flex items-center justify-center mx-auto transition-colors ${
                        isSelected ? "bg-blue-600 text-white" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      }`}
                      title="View movement logs"
                    >
                      <History className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && items.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500 font-medium">{items.length} product{items.length !== 1 ? "s" : ""}</p>
          <p className="text-xs text-gray-400">Sorted by urgency</p>
        </div>
      )}
    </div>
  );
}

// ─── Movement Log Panel ───────────────────────────────────────────────────────

function MovementLog({ productId, productName, onClose }: {
  productId: number | null;
  productName?: string;
  onClose: () => void;
}) {
  const [logs,    setLogs]    = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (productId === null) { setLogs([]); return; }
    setLoading(true);
    setError(null);
    getInventoryLogs({ product_id: productId, limit: 50 })
      .then(setLogs)
      .catch(() => setError("Failed to load movement logs."))
      .finally(() => setLoading(false));
  }, [productId]);

  if (productId === null) return null;

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-blue-50">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-blue-600" />
          <p className="text-sm font-semibold text-gray-900">
            Movement Log{productName ? ` — ${productName}` : ""}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        {loading ? (
          <div className="py-10 text-center flex items-center justify-center gap-2 text-gray-400">
            <Spinner className="text-blue-500" /><span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-600">{error}</p>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No movement history yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date</th>
                <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Type</th>
                <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Action</th>
                <th className="text-center py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Change</th>
                <th className="text-center py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Remaining</th>
                <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Reference</th>
                <th className="text-left py-2.5 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => {
                const change = log.quantity_change ?? log.quantity ?? 0;
                const isPositive = change > 0;
                return (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-4 text-xs text-gray-500 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                    <td className="py-2.5 px-4">{txBadge(log.transaction_type)}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-600">{log.action ?? "—"}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`text-sm font-bold tabular-nums ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                        {isPositive ? "+" : ""}{change}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center text-sm font-semibold text-gray-700 tabular-nums">
                      {log.remaining_stock ?? "—"}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono text-gray-500">{log.reference ?? "—"}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-600">{log.performed_by}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Inventory() {
  const [summary,    setSummary]    = useState<InventorySummary | null>(null);
  const [items,      setItems]      = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [itemsLoading,   setItemsLoading]   = useState(true);
  const [loadError,      setLoadError]      = useState<string | null>(null);

  const [search,       setSearch]       = useState("");
  const [filterCat,    setFilterCat]    = useState("");
  const [filterStatus, setFilterStatus] = useState<StockStatusFilter>("all");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedProductId,   setSelectedProductId]   = useState<number | null>(null);
  const [selectedProductName, setSelectedProductName] = useState<string | undefined>();

  // Load categories for filter dropdown
  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  // Load summary
  const loadSummary = () => {
    setSummaryLoading(true);
    getInventorySummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  };

  // Load inventory items
  const loadItems = useCallback(async (searchVal: string) => {
    setItemsLoading(true);
    setLoadError(null);
    try {
      const data = await getInventory({
        search:      searchVal || undefined,
        category_id: filterCat || undefined,
        status:      filterStatus,
      });
      setItems(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setLoadError(err.response?.data?.message ?? "Failed to load inventory.");
      } else {
        setLoadError("Failed to load inventory.");
      }
    } finally {
      setItemsLoading(false);
    }
  }, [filterCat, filterStatus]);

  useEffect(() => { loadSummary(); }, []);
  useEffect(() => { loadItems(search); }, [filterCat, filterStatus, loadItems]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadItems(val), 350);
  };

  const handleRefresh = () => {
    loadSummary();
    loadItems(search);
  };

  const handleSelectProduct = (id: number | null) => {
    setSelectedProductId(id);
    if (id !== null) {
      const p = items.find((i) => i.id === id);
      setSelectedProductName(p?.product_name);
    }
  };

  const clearFilters = () => {
    setSearch(""); setFilterCat(""); setFilterStatus("all");
  };
  const hasFilters = search || filterCat || filterStatus !== "all";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live stock levels and movement history</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0 border-gray-300 text-gray-600 hover:bg-gray-100"
          onClick={handleRefresh}
          disabled={itemsLoading || summaryLoading}
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${(itemsLoading || summaryLoading) ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary cards */}
      <SummaryCards summary={summary} loading={summaryLoading} />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search product or barcode…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400 text-gray-800"
            />
            {search && (
              <button onClick={() => handleSearchChange("")} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={filterCat || "all"} onValueChange={(v) => setFilterCat(v === "all" ? "" : v)}>
            <SelectTrigger className="bg-gray-50 border-gray-200 text-gray-700 h-10">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.category_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StockStatusFilter)}>
            <SelectTrigger className="bg-gray-50 border-gray-200 text-gray-700 h-10">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="In Stock">In Stock</SelectItem>
              <SelectItem value="Low Stock">Low Stock</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="Out of Stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium">{items.length} result{items.length !== 1 ? "s" : ""}</span>
            <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Stock table */}
      <StockTable
        items={items}
        loading={itemsLoading}
        error={loadError}
        onRetry={() => loadItems(search)}
        onSelectProduct={handleSelectProduct}
        selectedProductId={selectedProductId}
      />

      {/* Movement log (shown when a product row is selected) */}
      <MovementLog
        productId={selectedProductId}
        productName={selectedProductName}
        onClose={() => setSelectedProductId(null)}
      />
    </div>
  );
}
