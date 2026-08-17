import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
    getInventory,
    getInventoryLogs,
    getInventorySummary,
    type InventoryItem,
    type InventoryLog,
    type InventorySummary,
    type StockStatusFilter,
} from "@/shared/api/inventoryApi";
import { deriveStatus, getCategories, type Category } from "@/shared/api/productsApi";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";
import axios from "axios";
import {
    AlertCircle,
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Eye,
    History,
    Package,
    RefreshCw,
    Search,
    TrendingDown,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  items,
  loading,
  error,
  onRetry,
  onViewDetails,
  onViewLogs,
}: {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onViewDetails: (item: InventoryItem) => void;
  onViewLogs: (item: InventoryItem) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
      {error && (
        <div className="flex items-center gap-3 px-5 py-3.5 bg-red-50 border-b border-red-200">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium flex-1">{error}</p>
          <button onClick={onRetry} className="text-red-600 text-sm font-bold hover:underline cursor-pointer">Retry</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Barcode</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Product Name</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Category</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Stock Level</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Reorder Min</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Damaged</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Status</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Last Updated</th>
              <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-12" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-12" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-12" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                  <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                      <Package className="h-7 w-7 text-slate-400" />
                    </div>
                    <p className="font-bold text-slate-700">No inventory products found</p>
                    <p className="text-xs text-slate-400">Try adjusting your filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const st = deriveStatus(item.quantity, item.reorder_level);
                return (
                  <tr key={item.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="py-3.5 px-5">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                        {item.barcode}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="font-bold text-slate-900 text-sm">{item.product_name}</p>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{item.supplier || "—"}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-md">
                        {item.category || "—"}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      {(() => {
                        const parts = formatQuantityParts(item.quantity, item.unit_abbreviation, item.quantity_type, item.unit_allow_decimal);
                        return (
                          <div className="flex items-center justify-center gap-0.5 font-mono">
                            <span className={`text-base font-bold tabular-nums ${
                              item.quantity === 0 ? "text-red-600" :
                              item.quantity <= item.reorder_level ? "text-amber-600" : "text-slate-900"
                            }`}>{parts.number}</span>
                            {parts.unit && <span className="text-xs text-slate-500 font-sans font-medium">{parts.unit}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-5 text-center text-sm font-mono text-slate-500">{item.reorder_level}</td>
                    <td className="py-3.5 px-5 text-center">
                      <span className={`text-sm font-semibold font-mono tabular-nums ${item.damaged_stock > 0 ? "text-red-500 font-bold" : "text-slate-300"}`}>
                        {item.damaged_stock}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">{statusBadge(st)}</td>
                    <td className="py-3.5 px-5 text-xs text-slate-500">{fmtRelative(item.updated_at)}</td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onViewDetails(item)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="View product details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onViewLogs(item)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="View movement log"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && items.length > 0 && (
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-600 font-bold">{items.length} product{items.length !== 1 ? "s" : ""} tracked</p>
          <p className="text-xs text-slate-400 font-medium">Sorted by urgency</p>
        </div>
      )}
    </div>
  );
}

// ─── Product Details Modal ────────────────────────────────────────────────────

function ProductDetailsModal({ item, onClose }: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  const status = deriveStatus(item.quantity, item.reorder_level);
  const quantityParts = formatQuantityParts(item.quantity, item.unit_abbreviation, item.quantity_type, item.unit_allow_decimal);

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Product Details - {item.product_name}</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-t-lg shrink-0">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white truncate">{item.product_name}</h2>
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
                <p className="text-sm font-mono font-semibold text-gray-900 bg-white px-3 py-2 rounded border border-gray-200">
                  {item.barcode}
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
                    {item.category}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Supplier</p>
                  <p className="text-sm font-medium text-gray-900">{item.supplier || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Unit</p>
                  <p className="text-sm font-medium text-gray-900">
                    {item.unit} ({item.unit_abbreviation})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Unit Type</p>
                  <p className="text-sm font-medium text-gray-900">
                    {item.unit_type || "Other"}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-1">Quantity Type</p>
                <p className="text-sm font-medium text-gray-900">
                  {item.quantity_type === "WEIGHTED" ? "Weighted (Variable)" : "Whole Unit"}
                </p>
              </div>
            </div>
          </div>

          {/* Pricing & Classification Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-1 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Pricing Information</h3>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              {item.pricing_type === "MARKET_BASED" ? (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Pricing Type</p>
                  <span className="inline-block text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                    Market-Based Pricing
                  </span>
                  <p className="text-xs text-gray-500 mt-3">
                    This product uses market-based pricing. Prices are managed separately in the Commodity Prices module.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Cost Price</p>
                    <p className="text-base font-bold text-gray-900 tabular-nums">
                      ₱{Number(item.cost_price).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Selling Price</p>
                    <p className="text-base font-bold text-emerald-600 tabular-nums">
                      ₱{Number(item.selling_price).toFixed(2)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 font-medium mb-1">Markup</p>
                    <p className="text-sm font-semibold text-blue-600 tabular-nums">
                      {Number(item.cost_price) > 0
                        ? `${(((Number(item.selling_price) - Number(item.cost_price)) / Number(item.cost_price)) * 100).toFixed(2)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stock Information Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-1 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Stock Information</h3>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 font-medium mb-1">Current Stock</p>
                  <div className="flex items-baseline gap-1">
                    <p className={`text-2xl font-bold tabular-nums ${
                      item.quantity === 0 ? "text-red-600" :
                      item.quantity <= item.reorder_level ? "text-amber-600" : "text-gray-900"
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
                  <p className="text-2xl font-bold text-gray-700 tabular-nums">{item.reorder_level}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 font-medium mb-1">Damaged Stock</p>
                  <p className={`text-2xl font-bold tabular-nums ${
                    item.damaged_stock > 0 ? "text-red-600" : "text-gray-300"
                  }`}>
                    {item.damaged_stock}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-500 font-medium">Stock Status</p>
                {statusBadge(status)}
              </div>
            </div>
          </div>

          {/* Value Information */}
          {item.pricing_type !== "MARKET_BASED" && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 bg-blue-600 rounded-full" />
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Inventory Value</h3>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Total Cost Value</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">
                    ₱{(item.quantity * Number(item.cost_price)).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Total Retail Value</p>
                  <p className="text-lg font-bold text-emerald-600 tabular-nums">
                    ₱{(item.quantity * Number(item.selling_price)).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Timestamps Section */}
          {item.updated_at && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 bg-blue-600 rounded-full" />
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Last Updated</h3>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-700">{fmtDate(item.updated_at)}</p>
                <p className="text-xs text-gray-500 mt-1">{fmtRelative(item.updated_at)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <Button onClick={onClose} variant="outline" className="border-gray-300">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Movement Log Modal ───────────────────────────────────────────────────────

function MovementLogModal({ item, onClose }: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  const [activeItem, setActiveItem] = useState<InventoryItem | null>(null);
  const [logs,    setLogs]    = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Keep track of the last non-null item to avoid unmounting content while exit animations are playing
  useEffect(() => {
    if (item) {
      setActiveItem(item);
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    setError(null);
    getInventoryLogs({ product_id: item.id, limit: 50 })
      .then(setLogs)
      .catch(() => setError("Failed to load movement logs."))
      .finally(() => setLoading(false));
  }, [item?.id]);

  const displayItem = item || activeItem;
  if (!displayItem) return null;

  return (
    <Sheet open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-4xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
        <SheetTitle className="sr-only">Movement Log - {displayItem.product_name}</SheetTitle>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <History className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h2 className="text-lg font-bold text-white truncate">Movement Log — {displayItem.product_name}</h2>
            <p className="text-xs text-blue-100 mt-0.5">Live stock levels and transaction history</p>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center flex items-center justify-center gap-2 text-gray-400">
              <LoadingSpinner size={16} className="text-blue-500" />
              <span className="text-sm">Loading movement log…</span>
            </div>
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

  const [detailsItem, setDetailsItem] = useState<InventoryItem | null>(null);
  const [logItem,     setLogItem]     = useState<InventoryItem | null>(null);

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

  // Real-time zero-refresh sync: instant stock and summary refresh when sales, returns, or adjustments occur
  useRealtimeSync(["inventory", "products", "sales", "returns"], () => {
    loadSummary();
    loadItems(search);
  });

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadItems(val), 350);
  };

  const handleRefresh = () => {
    loadSummary();
    loadItems(search);
  };

  const handleViewDetails = (item: InventoryItem) => {
    setDetailsItem(item);
  };

  const handleViewLogs = (item: InventoryItem) => {
    setLogItem(item);
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
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-4.5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-xs">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search product or barcode…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400 text-slate-800 font-medium"
            />
            {search && (
              <button onClick={() => handleSearchChange("")} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={filterCat || "all"} onValueChange={(v) => setFilterCat(v === "all" ? "" : v)}>
            <SelectTrigger className="bg-white border-slate-300 hover:border-slate-400 text-slate-800 h-10 shadow-xs">
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
            <SelectTrigger className="bg-white border-slate-300 hover:border-slate-400 text-slate-800 h-10 shadow-xs">
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
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">{items.length} result{items.length !== 1 ? "s" : ""}</span>
            <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer">
              Clear all filters
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
        onViewDetails={handleViewDetails}
        onViewLogs={handleViewLogs}
      />

      {/* Product details modal */}
      <ProductDetailsModal
        item={detailsItem}
        onClose={() => setDetailsItem(null)}
      />

      {/* Movement log modal */}
      <MovementLogModal
        item={logItem}
        onClose={() => setLogItem(null)}
      />
    </div>
  );
}
