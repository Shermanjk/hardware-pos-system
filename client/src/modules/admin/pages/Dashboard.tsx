import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, AlertCircle, Package, Truck,
  ShoppingCart, RefreshCw, RotateCcw,
  AlertTriangle, TrendingDown, CheckCircle, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { getPendingCounts } from "@/shared/api/dashboardApi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  kpis: {
    today_transactions: number;
    today_revenue:      number;
    monthly_revenue:    number;
    total_products:     number;
    out_of_stock:       number;
    critical:           number;
    low_stock:          number;
    total_suppliers:    number;
    pending_returns:    number;
  };
  weekly_sales:    { sale_date: string; transactions: number; revenue: number }[];
  monthly_sales:   { month: string; revenue: number }[];
  top_products:    { name: string; units_sold: number; revenue: number }[];
  recent_sales:    { invoice_number: string; customer_name: string; total_amount: number; cashier_name: string; created_at: string }[];
  low_stock_items: { product_name: string; barcode: string; quantity: number; reorder_level: number; urgency: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number) {
  if (n >= 1_000_000) return "₱" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return "₱" + (n / 1_000).toFixed(1) + "K";
  return fmt(n);
}

function fmtTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

function PesoIcon({ className = "" }: { className?: string }) {
  return <span className={`text-lg font-bold ${className}`}>₱</span>;
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color, bg, loading, href }: {
  icon: React.ElementType; label: string; value: string;
  sub?: string; color: string; bg: string;
  loading: boolean; href?: string;
}) {
  const inner = (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start gap-4 ${href ? "hover:border-blue-300 hover:shadow-md transition-all cursor-pointer" : ""}`}>
      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        {loading
          ? <Skeleton className="h-7 w-24 mt-1.5" />
          : <p className={`text-2xl font-bold ${color} leading-tight mt-0.5 tabular-nums`}>{value}</p>
        }
        {sub && !loading && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}><a>{inner}</a></Link> : inner;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  
  // Pending counts for "Requires Attention" section
  const [pendingCounts, setPendingCounts] = useState({
    pending_commodity_approvals: 0,
    pending_returns: 0,
    pending_voids: 0,
  });
  const [pendingLoading, setPendingLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<DashboardData>("/api/dashboard", { headers: authHeaders() });
      setData(res.data);
      
      // Also load pending counts
      try {
        const counts = await getPendingCounts();
        setPendingCounts(counts);
      } catch { /* silent */ }
      setPendingLoading(false);
    } catch (err) {
      setError(axios.isAxiosError(err) ? (err.response?.data?.message ?? "Failed to load dashboard.") : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const kpis = data?.kpis;

  // Build weekly chart — fill missing days with 0
  const weeklyChart = (() => {
    const map = new Map((data?.weekly_sales ?? []).map((r) => [r.sale_date, r]));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key  = d.toISOString().slice(0, 10);
      const day  = d.toLocaleDateString("en-PH", { weekday: "short" });
      const row  = map.get(key);
      return { day, revenue: row ? Number(row.revenue) : 0, transactions: row ? Number(row.transactions) : 0 };
    });
  })();

  const monthlyChart = (data?.monthly_sales ?? []).map((r) => ({
    month: r.month.slice(5) + "/" + r.month.slice(2, 4),
    revenue: Number(r.revenue),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-gray-300 text-gray-600 hover:bg-gray-100"
          onClick={load} disabled={loading} title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-red-600 font-semibold hover:underline">Retry</button>
        </div>
      )}

      {/* KPI cards — row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={PesoIcon}     label="Today's Revenue"   value={fmtShort(kpis?.today_revenue ?? 0)}
          sub={`${kpis?.today_transactions ?? 0} transaction${(kpis?.today_transactions ?? 0) !== 1 ? "s" : ""}`}
          color="text-blue-600" bg="bg-blue-50" loading={loading} />
        <KpiCard icon={TrendingUp}   label="Monthly Revenue"   value={fmtShort(kpis?.monthly_revenue ?? 0)}
          color="text-emerald-600" bg="bg-emerald-50" loading={loading} />
        <KpiCard icon={Package}      label="Total Products"    value={(kpis?.total_products ?? 0).toLocaleString()}
          color="text-purple-600" bg="bg-purple-50" loading={loading} href="/products" />
        <KpiCard icon={Truck}        label="Active Suppliers"  value={(kpis?.total_suppliers ?? 0).toString()}
          color="text-cyan-600" bg="bg-cyan-50" loading={loading} href="/suppliers" />
      </div>

      {/* KPI cards — row 2: alert cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={AlertCircle}  label="Out of Stock"      value={(kpis?.out_of_stock ?? 0).toString()}
          sub="Need immediate restock" color="text-red-600" bg="bg-red-50" loading={loading} href="/inventory" />
        <KpiCard icon={AlertTriangle} label="Critical Stock"    value={(kpis?.critical ?? 0).toString()}
          sub="Below 50% reorder level" color="text-orange-600" bg="bg-orange-50" loading={loading} href="/inventory" />
        <KpiCard icon={TrendingDown} label="Low Stock"         value={(kpis?.low_stock ?? 0).toString()}
          sub="At or below reorder level" color="text-amber-600" bg="bg-amber-50" loading={loading} href="/inventory" />
        <KpiCard icon={RotateCcw}    label="Pending Returns"   value={(kpis?.pending_returns ?? 0).toString()}
          sub="Awaiting admin review" color="text-orange-600" bg="bg-orange-50" loading={loading} href="/returns" />
      </div>

      {/* Requires Attention Section - Database-backed pending items */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h2 className="text-base font-bold text-gray-900">Requires Attention</h2>
          <span className="ml-auto text-xs text-gray-500">Persistence-backed ·survives restart</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Commodity Approvals */}
          <Link href="/commodity-prices">
            <a className="flex items-center gap-3 p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-400 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium">Pending Commodity Approvals</p>
                {pendingLoading ? <Spinner className="text-amber-500 mt-1" /> : (
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {pendingCounts.pending_commodity_approvals}
                  </p>
                )}
              </div>
              {pendingCounts.pending_commodity_approvals > 0 && (
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </a>
          </Link>
          
          {/* Returns */}
          <Link href="/returns">
            <a className="flex items-center gap-3 p-3 bg-white rounded-lg border border-orange-200 hover:border-orange-400 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium">Return Requests</p>
                {pendingLoading ? <Spinner className="text-orange-500 mt-1" /> : (
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {pendingCounts.pending_returns}
                  </p>
                )}
              </div>
              {pendingCounts.pending_returns > 0 && (
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              )}
            </a>
          </Link>
          
          {/* Void Requests */}
          <Link href="/void-requests">
            <a className="flex items-center gap-3 p-3 bg-white rounded-lg border border-red-200 hover:border-red-400 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium">Void Requests</p>
                {pendingLoading ? <Spinner className="text-red-500 mt-1" /> : (
                  <p className="text-xl font-bold text-gray-900 tabular-nums">
                    {pendingCounts.pending_voids}
                  </p>
                )}
              </div>
              {pendingCounts.pending_voids > 0 && (
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </a>
          </Link>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          These counts are loaded from the database and persist across system restarts.
        </p>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Weekly revenue bar chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-gray-900">Weekly Revenue</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 7 days</p>
          </div>
          {loading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyChart} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtShort(v)} />
                <Tooltip
                  formatter={(value: number) => [fmt(value), "Revenue"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {weeklyChart.map((_, i) => (
                    <Cell key={i} fill={i === weeklyChart.length - 1 ? "#2563eb" : "#bfdbfe"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Low stock alert widget */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Reorder Alerts</h2>
              <p className="text-xs text-gray-500 mt-0.5">Top urgent items</p>
            </div>
            {!loading && (kpis?.low_stock ?? 0) + (kpis?.out_of_stock ?? 0) > 0 && (
              <Link href="/inventory">
                <a className="text-xs text-blue-600 font-semibold hover:underline">View all</a>
              </Link>
            )}
          </div>
          <div className="flex-1 space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : data?.low_stock_items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
                  <Package className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-emerald-700">All stocked up!</p>
                <p className="text-xs text-gray-400 mt-0.5">No products need restocking</p>
              </div>
            ) : (
              data?.low_stock_items.map((item, i) => (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                  item.urgency === "Out of Stock" ? "bg-red-50 border-red-200"     :
                  item.urgency === "Critical"     ? "bg-orange-50 border-orange-200" :
                                                    "bg-amber-50 border-amber-200"
                }`}>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${
                    item.urgency === "Out of Stock" ? "bg-red-500"    :
                    item.urgency === "Critical"     ? "bg-orange-500" : "bg-amber-400"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900 truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-500">{item.urgency} · {item.quantity} left</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly trend line chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-gray-900">Revenue Trend</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 6 months</p>
          </div>
          {loading ? <Skeleton className="h-44 w-full" /> : monthlyChart.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-sm text-gray-400">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtShort(v)} />
                <Tooltip
                  formatter={(value: number) => [fmt(value), "Revenue"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2.5}
                  dot={{ fill: "#2563eb", r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent sales */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Recent Sales</h2>
              <p className="text-xs text-gray-500 mt-0.5">Latest transactions</p>
            </div>
            <Link href="/sales">
              <a className="text-xs text-blue-600 font-semibold hover:underline">View all</a>
            </Link>
          </div>
          <div className="flex-1 divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full my-1" />)
            ) : (data?.recent_sales.length ?? 0) === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No sales yet today</div>
            ) : (
              data?.recent_sales.slice(0, 6).map((sale, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{sale.customer_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{sale.invoice_number} · {fmtTime(sale.created_at)}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 tabular-nums ml-3 shrink-0">
                    {fmt(sale.total_amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top products */}
      {!loading && (data?.top_products.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-gray-900">Top Selling Products</h2>
            <p className="text-xs text-gray-500 mt-0.5">All time, by units sold</p>
          </div>
          <div className="space-y-3">
            {data?.top_products.map((p, i) => {
              const maxUnits = data.top_products[0].units_sold;
              const pct = Math.round((p.units_sold / maxUnits) * 100);
              return (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-gray-400 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      <span className="text-xs text-gray-500 ml-2 shrink-0">{p.units_sold} units · {fmt(p.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
