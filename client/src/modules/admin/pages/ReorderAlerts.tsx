import { useState, useEffect, useCallback, useRef } from "react";
import {
  BellRing, Search, RefreshCw, AlertCircle, X, Package,
  AlertTriangle, TrendingDown, Phone, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCategories, type Category } from "@/shared/api/productsApi";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReorderAlert {
  id: number;
  barcode: string;
  product_name: string;
  category: string;
  supplier: string;
  supplier_contact: string | null;
  unit: string;
  unit_abbreviation: string;
  quantity: number;
  reorder_level: number;
  cost_price: number;
  urgency: "Out of Stock" | "Critical" | "Low Stock";
  units_needed: number;
}

interface AlertSummary {
  total_alerts: number;
  out_of_stock: number;
  critical: number;
  low_stock: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAlerts(filters: { category_id?: string }): Promise<ReorderAlert[]> {
  const params: Record<string, string> = {};
  if (filters.category_id) params.category_id = filters.category_id;
  const res = await axios.get<ReorderAlert[]>("/api/reorder-alerts", {
    headers: authHeaders(), params,
  });
  return res.data;
}

async function fetchSummary(): Promise<AlertSummary> {
  const res = await axios.get<AlertSummary>("/api/reorder-alerts/summary", {
    headers: authHeaders(),
  });
  return res.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

function urgencyBadge(urgency: ReorderAlert["urgency"]) {
  const s =
    urgency === "Out of Stock" ? "bg-red-100 text-red-700 border border-red-200"       :
    urgency === "Critical"     ? "bg-orange-100 text-orange-700 border border-orange-200" :
                                 "bg-amber-100 text-amber-700 border border-amber-200";
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s}`}>{urgency}</span>;
}

function urgencyIcon(urgency: ReorderAlert["urgency"]) {
  if (urgency === "Out of Stock") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (urgency === "Critical")     return <AlertTriangle className="h-4 w-4 text-orange-500" />;
  return <TrendingDown className="h-4 w-4 text-amber-500" />;
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary, loading }: { summary: AlertSummary | null; loading: boolean }) {
  const cards = [
    { label: "Total Alerts",   value: summary?.total_alerts ?? 0, color: "text-blue-600",    bg: "bg-blue-50",    icon: BellRing      },
    { label: "Out of Stock",   value: summary?.out_of_stock ?? 0, color: "text-red-600",     bg: "bg-red-50",     icon: AlertCircle   },
    { label: "Critical",       value: summary?.critical     ?? 0, color: "text-orange-600",  bg: "bg-orange-50",  icon: AlertTriangle },
    { label: "Low Stock",      value: summary?.low_stock    ?? 0, color: "text-amber-600",   bg: "bg-amber-50",   icon: TrendingDown  },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{c.label}</p>
              {loading
                ? <div className="h-6 w-8 bg-gray-100 rounded animate-pulse mt-1" />
                : <p className={`text-2xl font-bold ${c.color} tabular-nums leading-tight`}>{c.value}</p>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReorderAlerts() {
  const [alerts,      setAlerts]      = useState<ReorderAlert[]>([]);
  const [summary,     setSummary]     = useState<AlertSummary | null>(null);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [sumLoading,  setSumLoading]  = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  const [search,      setSearch]      = useState("");
  const [filterCat,   setFilterCat]   = useState("");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const loadSummary = () => {
    setSumLoading(true);
    fetchSummary().then(setSummary).catch(() => {}).finally(() => setSumLoading(false));
  };

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAlerts({ category_id: filterCat || undefined });
      setAlerts(data);
    } catch (err) {
      setLoadError(axios.isAxiosError(err) ? (err.response?.data?.message ?? "Failed to load alerts.") : "Failed to load alerts.");
    } finally {
      setIsLoading(false);
    }
  }, [filterCat]);

  useEffect(() => { loadSummary(); }, []);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const handleRefresh = () => { loadSummary(); loadAlerts(); };

  // Client-side search + urgency filter
  const filtered = alerts.filter((a) => {
    const matchSearch = !search
      || a.product_name.toLowerCase().includes(search.toLowerCase())
      || a.barcode.toLowerCase().includes(search.toLowerCase())
      || a.supplier.toLowerCase().includes(search.toLowerCase());
    const matchUrgency = filterUrgency === "all" || a.urgency === filterUrgency;
    return matchSearch && matchUrgency;
  });

  const hasFilters = search || filterCat || filterUrgency !== "all";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Reorder Alerts</h1>
            {!sumLoading && summary && summary.total_alerts > 0 && (
              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">
                {summary.total_alerts}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Products that need restocking right now</p>
        </div>
        <Button
          variant="outline" size="sm"
          className="h-9 w-9 p-0 border-gray-300 text-gray-600 hover:bg-gray-100"
          onClick={handleRefresh} disabled={isLoading} title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Summary cards */}
      <SummaryCards summary={summary} loading={sumLoading} />

      {/* No alerts — all good banner */}
      {!isLoading && !loadError && alerts.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Package className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-800">All products are sufficiently stocked</p>
            <p className="text-sm text-emerald-600 mt-0.5">No products are at or below their reorder level. Great job keeping inventory full!</p>
          </div>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{loadError}</p>
          <button onClick={handleRefresh} className="text-red-600 text-sm font-semibold hover:underline">Retry</button>
        </div>
      )}

      {/* Filters — only show if there are alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-48 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, barcode, supplier…"
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400 text-gray-800"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={filterCat || "all"} onValueChange={(v) => setFilterCat(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44 bg-gray-50 border-gray-200 text-gray-700 h-10">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.category_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterUrgency} onValueChange={setFilterUrgency}>
              <SelectTrigger className="w-44 bg-gray-50 border-gray-200 text-gray-700 h-10">
                <SelectValue placeholder="All Urgencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgencies</SelectItem>
                <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="Low Stock">Low Stock</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Filter className="h-3.5 w-3.5" />
                <span>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
                <button
                  onClick={() => { setSearch(""); setFilterCat(""); setFilterUrgency("all"); }}
                  className="text-blue-600 font-semibold hover:underline"
                >Clear</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerts table */}
      {(isLoading || alerts.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Urgency</th>
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Category</th>
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Supplier</th>
                  <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Current Stock</th>
                  <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Reorder At</th>
                  <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Need to Buy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={7} className="py-20 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Spinner className="text-blue-500" /><span className="text-sm">Checking stock levels…</span>
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center">
                    <p className="text-sm text-gray-500">No alerts match your filters.</p>
                    <button onClick={() => { setSearch(""); setFilterCat(""); setFilterUrgency("all"); }}
                      className="text-blue-600 text-xs font-semibold hover:underline mt-1">Clear filters</button>
                  </td></tr>
                ) : (
                  filtered.map((alert) => (
                    <tr key={alert.id}
                      className={`hover:bg-gray-50/60 transition-colors ${
                        alert.urgency === "Out of Stock" ? "bg-red-50/30"     :
                        alert.urgency === "Critical"     ? "bg-orange-50/30"  : ""
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          {urgencyIcon(alert.urgency)}
                          {urgencyBadge(alert.urgency)}
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-gray-900">{alert.product_name}</p>
                        <span className="font-mono text-xs text-gray-400">{alert.barcode}</span>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="text-xs font-medium text-gray-600 bg-slate-100 px-2 py-1 rounded-full">
                          {alert.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="text-sm text-gray-700">{alert.supplier}</p>
                        {alert.supplier_contact && (
                          <a href={`tel:${alert.supplier_contact}`}
                            className="flex items-center gap-1 text-xs text-blue-500 hover:underline mt-0.5">
                            <Phone className="h-3 w-3" />{alert.supplier_contact}
                          </a>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span className={`text-xl font-bold tabular-nums ${
                          alert.quantity === 0 ? "text-red-600" : "text-orange-600"
                        }`}>{alert.quantity}</span>
                        <span className="text-xs text-gray-400 ml-1">{alert.unit_abbreviation}</span>
                      </td>
                      <td className="py-3.5 px-5 text-center text-sm text-gray-500 tabular-nums">
                        {alert.reorder_level} {alert.unit_abbreviation}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-sm tabular-nums">
                          +{alert.units_needed} {alert.unit_abbreviation}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">
                {filtered.length} product{filtered.length !== 1 ? "s" : ""} need restocking
              </p>
              <p className="text-xs text-gray-400">Sorted by urgency</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
