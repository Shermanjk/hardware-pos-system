import { useState, useEffect } from "react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, AlertCircle, Package, Truck,
  ShoppingCart, RefreshCw, RotateCcw,
  AlertTriangle, TrendingDown, CheckCircle, XCircle, Clock, Upload,
  CreditCard, Users, ArrowUpRight, BarChart3, Activity, Layers,
  Receipt, ShieldCheck, Sparkles, CheckCircle2, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { getPendingCounts } from "@/shared/api/dashboardApi";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

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
    total_receivables?: number;
    customers_with_balance?: number;
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

function PesoIcon({ className = "" }: { className?: string }) {
  return <span className={`text-base font-extrabold ${className}`}>₱</span>;
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const TOP_PRODUCT_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6"];

// ─── Custom Dark Tooltip for Charts ───────────────────────────────────────────

function ChartCustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    const value = payload[0].value;
    return (
      <div className="bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700/80 backdrop-blur-md text-xs">
        <p className="text-slate-400 font-semibold mb-1 uppercase tracking-wider text-[10px]">
          {label || item.day || item.month}
        </p>
        <p className="text-base font-black text-blue-400 font-mono tracking-tight">
          {fmt(Number(value))}
        </p>
        {item.transactions !== undefined && (
          <p className="text-[11px] text-slate-300 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            {item.transactions} transaction{item.transactions !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    );
  }
  return null;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-slate-100 rounded-xl animate-pulse ${className}`} />;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bg,
  borderColor,
  badgeText,
  badgeColor,
  loading,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
  borderColor?: string;
  badgeText?: string;
  badgeColor?: string;
  loading: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`relative overflow-hidden bg-white rounded-2xl border ${borderColor ?? "border-slate-200/90"} shadow-xs p-4.5 flex flex-col justify-between transition-all duration-200 ${
        href ? "hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 cursor-pointer group" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 shadow-xs`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        {badgeText && (
          <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${badgeColor ?? "bg-slate-100 text-slate-600"}`}>
            {badgeText}
          </span>
        )}
        {href && !badgeText && (
          <div className="w-6 h-6 rounded-full bg-slate-50 group-hover:bg-blue-50 text-slate-400 group-hover:text-blue-600 flex items-center justify-center transition-colors">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-28 mt-1.5" />
        ) : (
          <p className={`text-2xl font-black ${color} leading-tight mt-1 tabular-nums tracking-tight`}>
            {value}
          </p>
        )}
        {sub && !loading && (
          <p className="text-xs text-slate-400 font-medium mt-1 truncate">{sub}</p>
        )}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  
  // Pending counts for "Requires Attention" section
  const [pendingCounts, setPendingCounts] = useState({
    pending_commodity_approvals: 0,
    pending_requests: 0,
    approved_today: 0,
    rejected_today: 0,
  });
  const [pendingLoading, setPendingLoading] = useState(true);

  // Backup status
  const [backupStatus, setBackupStatus] = useState<{
    exists: boolean;
    lastBackup?: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<DashboardData>("/api/dashboard", { headers: authHeaders() });
      setData(res.data);
      
      // Also load pending counts
      try {
        const counts = await getPendingCounts();
        setPendingCounts({
          pending_commodity_approvals: counts.pending_commodity_approvals ?? 0,
          pending_requests: 0,
          approved_today: 0,
          rejected_today: 0,
        });
        
        // Fetch unified requests KPI
        const reqRes = await axios.get<{ pending_requests: number; approved_today: number; rejected_today: number }>(
          "/api/requests/kpi",
          { headers: authHeaders() }
        );
        setPendingCounts(prev => ({
          ...prev,
          pending_requests: reqRes.data.pending_requests ?? 0,
          approved_today: reqRes.data.approved_today ?? 0,
          rejected_today: reqRes.data.rejected_today ?? 0,
        }));
      } catch { /* silent */ }
      setPendingLoading(false);

      // Load backup status
      try {
        const backupRes = await axios.get("/api/backup/today-status", { headers: authHeaders() });
        setBackupStatus(backupRes.data);
      } catch { /* silent */ }
    } catch (err) {
      setError(axios.isAxiosError(err) ? (err.response?.data?.message ?? "Failed to load dashboard.") : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Real-time zero-refresh sync
  useRealtimeSync(["dashboard", "sales", "requests", "customers", "inventory", "commodity"], () => {
    load();
  });

  // Fallback auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const kpis = data?.kpis;

  // Build weekly chart — fill missing days with 0
  const weeklyChart = (() => {
    const map = new Map(
      (data?.weekly_sales ?? []).map((r) => [String(r.sale_date).slice(0, 10), r])
    );
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const y   = d.getFullYear();
      const m   = String(d.getMonth() + 1).padStart(2, "0");
      const day2 = String(d.getDate()).padStart(2, "0");
      const localKey = `${y}-${m}-${day2}`;
      const day  = d.toLocaleDateString("en-PH", { weekday: "short" });
      
      const utcKey = d.toISOString().slice(0, 10);
      const row  = map.get(localKey) || map.get(utcKey);
      
      return {
        day,
        revenue: row ? Number(row.revenue) : 0,
        transactions: row ? Number(row.transactions) : 0,
      };
    });
  })();

  const weeklyTotalRevenue = weeklyChart.reduce((acc, curr) => acc + curr.revenue, 0);
  const weeklyTotalTx = weeklyChart.reduce((acc, curr) => acc + curr.transactions, 0);
  const weeklyAvgDaily = weeklyTotalRevenue / (weeklyChart.length || 1);
  const maxWeeklyDay = weeklyChart.reduce((max, curr) => (curr.revenue > max.revenue ? curr : max), weeklyChart[0] || { revenue: 0, day: "-" });

  const monthlyChart = (data?.monthly_sales ?? []).map((r) => ({
    month: r.month.slice(5) + "/" + r.month.slice(2, 4),
    revenue: Number(r.revenue),
  }));

  const monthlyTotal = monthlyChart.reduce((acc, curr) => acc + curr.revenue, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Executive Dashboard</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · System Overview
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9.5 px-3.5 border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs gap-2 cursor-pointer"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            Refresh Metrics
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4.5 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 shadow-xs">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span className="font-medium">{error}</span>
          <button onClick={load} className="ml-auto text-red-600 font-bold hover:underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards — Row 1 (Financial & Core Operations) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={PesoIcon}
          label="Today's Revenue"
          value={fmtShort(kpis?.today_revenue ?? 0)}
          sub={`${kpis?.today_transactions ?? 0} transaction${(kpis?.today_transactions ?? 0) !== 1 ? "s" : ""}`}
          color="text-blue-700"
          bg="bg-blue-50 text-blue-700"
          borderColor="border-blue-200/80"
          badgeText="Today"
          badgeColor="bg-blue-50 text-blue-700 border border-blue-200"
          loading={loading}
        />
        <KpiCard
          icon={TrendingUp}
          label="Monthly Revenue"
          value={fmtShort(kpis?.monthly_revenue ?? 0)}
          sub="Current month sales"
          color="text-emerald-700"
          bg="bg-emerald-50 text-emerald-700"
          borderColor="border-emerald-200/80"
          badgeText="Month"
          badgeColor="bg-emerald-50 text-emerald-700 border border-emerald-200"
          loading={loading}
        />
        <KpiCard
          icon={CreditCard}
          label="Accounts Receivable"
          value={fmtShort(kpis?.total_receivables ?? 0)}
          sub={`${kpis?.customers_with_balance ?? 0} customer${(kpis?.customers_with_balance ?? 0) !== 1 ? "s" : ""} with balance`}
          color="text-rose-700"
          bg="bg-rose-50 text-rose-700"
          borderColor="border-rose-200/80"
          badgeText="Credit"
          badgeColor="bg-rose-50 text-rose-700 border border-rose-200"
          loading={loading}
          href="/customers"
        />
        <KpiCard
          icon={Package}
          label="Total Catalog"
          value={(kpis?.total_products ?? 0).toLocaleString()}
          sub="Active products"
          color="text-indigo-700"
          bg="bg-indigo-50 text-indigo-700"
          borderColor="border-indigo-200/80"
          loading={loading}
          href="/products"
        />
        <KpiCard
          icon={Truck}
          label="Active Suppliers"
          value={(kpis?.total_suppliers ?? 0).toString()}
          sub="Registered vendors"
          color="text-cyan-700"
          bg="bg-cyan-50 text-cyan-700"
          borderColor="border-cyan-200/80"
          loading={loading}
          href="/suppliers"
        />
      </div>

      {/* KPI Cards — Row 2 (Inventory Health & Alerts) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={AlertCircle}
          label="Out of Stock"
          value={(kpis?.out_of_stock ?? 0).toString()}
          sub="Zero quantity remaining"
          color="text-red-600"
          bg="bg-red-50 text-red-600"
          borderColor="border-red-200/80"
          badgeText={(kpis?.out_of_stock ?? 0) > 0 ? "Urgent" : "Good"}
          badgeColor={(kpis?.out_of_stock ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}
          loading={loading}
          href="/inventory"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Critical Stock"
          value={(kpis?.critical ?? 0).toString()}
          sub="Below 50% reorder limit"
          color="text-orange-600"
          bg="bg-orange-50 text-orange-600"
          borderColor="border-orange-200/80"
          badgeText="Attention"
          badgeColor="bg-orange-100 text-orange-700"
          loading={loading}
          href="/inventory"
        />
        <KpiCard
          icon={TrendingDown}
          label="Low Stock Warning"
          value={(kpis?.low_stock ?? 0).toString()}
          sub="At or near reorder level"
          color="text-amber-600"
          bg="bg-amber-50 text-amber-600"
          borderColor="border-amber-200/80"
          badgeText="Reorder"
          badgeColor="bg-amber-100 text-amber-800"
          loading={loading}
          href="/inventory"
        />
        <KpiCard
          icon={RotateCcw}
          label="Pending Returns"
          value={(kpis?.pending_returns ?? 0).toString()}
          sub="Awaiting admin action"
          color="text-purple-600"
          bg="bg-purple-50 text-purple-600"
          borderColor="border-purple-200/80"
          badgeText="Review"
          badgeColor="bg-purple-100 text-purple-700"
          loading={loading}
          href="/requests"
        />
      </div>

      {/* Operational Control Panels: Requires Attention & Backup Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Requires Attention (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Operational Approval Queue</h2>
                  <p className="text-xs text-slate-500">Live supervisor approval & decision counts</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-slate-400 font-mono">DB-Backed</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              {/* Unified Requests */}
              <Link
                href="/requests"
                className="group flex flex-col justify-between p-3.5 bg-slate-50 hover:bg-blue-50/50 rounded-xl border border-slate-200/90 hover:border-blue-300 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 group-hover:text-blue-700">Pending Requests</span>
                  {pendingCounts.pending_requests > 0 && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                  )}
                </div>
                <div className="flex items-baseline justify-between">
                  {pendingLoading ? (
                    <LoadingSpinner size={16} className="text-blue-500 mt-1" />
                  ) : (
                    <span className="text-2xl font-black text-slate-900 group-hover:text-blue-700 tabular-nums">
                      {pendingCounts.pending_requests}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-blue-600 flex items-center group-hover:translate-x-0.5 transition-transform">
                    Review <ChevronRight className="h-3 w-3 ml-0.5" />
                  </span>
                </div>
              </Link>

              {/* Commodity Purchases */}
              <Link
                href="/commodity-prices"
                className="group flex flex-col justify-between p-3.5 bg-slate-50 hover:bg-amber-50/50 rounded-xl border border-slate-200/90 hover:border-amber-300 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 group-hover:text-amber-700">Commodity Purchases</span>
                  {pendingCounts.pending_commodity_approvals > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  )}
                </div>
                <div className="flex items-baseline justify-between">
                  {pendingLoading ? (
                    <LoadingSpinner size={16} className="text-amber-500 mt-1" />
                  ) : (
                    <span className="text-2xl font-black text-slate-900 group-hover:text-amber-700 tabular-nums">
                      {pendingCounts.pending_commodity_approvals}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-amber-600 flex items-center group-hover:translate-x-0.5 transition-transform">
                    Review <ChevronRight className="h-3 w-3 ml-0.5" />
                  </span>
                </div>
              </Link>

              {/* Approved Today */}
              <div className="flex flex-col justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600">Approved Today</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex items-baseline">
                  {pendingLoading ? (
                    <LoadingSpinner size={16} className="text-emerald-500 mt-1" />
                  ) : (
                    <span className="text-2xl font-black text-emerald-600 tabular-nums">
                      {pendingCounts.approved_today}
                    </span>
                  )}
                </div>
              </div>

              {/* Rejected Today */}
              <div className="flex flex-col justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600">Rejected Today</span>
                  <XCircle className="h-4 w-4 text-red-500" />
                </div>
                <div className="flex items-baseline">
                  {pendingLoading ? (
                    <LoadingSpinner size={16} className="text-red-500 mt-1" />
                  ) : (
                    <span className="text-2xl font-black text-red-600 tabular-nums">
                      {pendingCounts.rejected_today}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Database Backup Status (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Upload className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Daily Backup Status</h2>
                <p className="text-xs text-slate-500">Database security verification</p>
              </div>
            </div>
            <Link href="/settings" className="text-xs text-blue-600 font-bold hover:underline">
              Settings
            </Link>
          </div>

          <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200/90">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                backupStatus?.exists ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {backupStatus?.exists ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 font-medium">Today's Snapshot</p>
              {backupStatus === null ? (
                <LoadingSpinner size={16} className="text-blue-500 mt-1" />
              ) : (
                <p className={`text-base font-bold ${backupStatus?.exists ? "text-emerald-700" : "text-amber-700"}`}>
                  {backupStatus?.exists ? "Backup Secured" : "Pending Today"}
                </p>
              )}
            </div>
            {backupStatus?.lastBackup && (
              <div className="text-right">
                <p className="text-[11px] text-slate-400 font-medium">Logged at</p>
                <p className="text-xs font-mono font-bold text-slate-700">
                  {new Date(backupStatus.lastBackup).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Weekly Revenue Bar Chart (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5.5 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Weekly Revenue</h2>
                <p className="text-xs text-slate-500">Daily gross revenue across the last 7 days</p>
              </div>
            </div>

            {/* Quick Summary Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1 bg-blue-50/80 border border-blue-200/70 rounded-lg text-xs">
                <span className="text-slate-500 font-medium">7-Day Total: </span>
                <span className="font-bold text-blue-700 font-mono">{fmt(weeklyTotalRevenue)}</span>
              </div>
              <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <span className="text-slate-500 font-medium">Avg/Day: </span>
                <span className="font-bold text-slate-700 font-mono">{fmt(weeklyAvgDaily)}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <div className="w-full h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChart} barSize={34} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="primaryBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id="peakBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="softBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.65} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#cbd5e1"
                    tick={{ fill: "#64748b", fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#cbd5e1"
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    tickFormatter={(v) => fmtShort(v)}
                  />
                  <Tooltip content={<ChartCustomTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {weeklyChart.map((entry, i) => {
                      const isToday = i === weeklyChart.length - 1;
                      const isPeak = entry.revenue === maxWeeklyDay.revenue && entry.revenue > 0;
                      return (
                        <Cell
                          key={i}
                          fill={isPeak ? "url(#peakBarGradient)" : isToday ? "url(#primaryBarGradient)" : "url(#softBarGradient)"}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Reorder Alerts Widget (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5.5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Stock Reorder Alerts</h2>
                <p className="text-xs text-slate-500">Urgent low-inventory items</p>
              </div>
            </div>
            {!loading && (kpis?.low_stock ?? 0) + (kpis?.out_of_stock ?? 0) > 0 && (
              <Link href="/inventory" className="text-xs text-blue-600 font-bold hover:underline">
                View All
              </Link>
            )}
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-60 pr-1">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : data?.low_stock_items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 shadow-xs">
                  <Package className="h-6 w-6" />
                </div>
                <p className="text-sm font-bold text-slate-800">Inventory Healthy</p>
                <p className="text-xs text-slate-400 mt-0.5">All tracked items are well-stocked</p>
              </div>
            ) : (
              data?.low_stock_items.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    item.urgency === "Out of Stock"
                      ? "bg-red-50/60 border-red-200"
                      : item.urgency === "Critical"
                      ? "bg-orange-50/60 border-orange-200"
                      : "bg-amber-50/60 border-amber-200"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      item.urgency === "Out of Stock"
                        ? "bg-red-500"
                        : item.urgency === "Critical"
                        ? "bg-orange-500"
                        : "bg-amber-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 truncate">{item.product_name}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      <span className="font-semibold text-slate-700">{item.urgency}</span> · {item.quantity} remaining (Min: {item.reorder_level})
                    </p>
                  </div>
                  <Link
                    href="/inventory"
                    className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 bg-white rounded-lg border border-slate-200 shadow-2xs hover:bg-blue-50"
                  >
                    Restock
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: 6-Month Area Chart + Recent Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly Trend Area Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5.5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Revenue Trend</h2>
                <p className="text-xs text-slate-500">6-Month financial trajectory</p>
              </div>
            </div>
            <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-700">
              Total: {fmt(monthlyTotal)}
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : monthlyChart.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">
              No historical data available
            </div>
          ) : (
            <div className="w-full h-52 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke="#cbd5e1"
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#cbd5e1"
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    tickFormatter={(v) => fmtShort(v)}
                  />
                  <Tooltip content={<ChartCustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#revenueAreaGradient)"
                    dot={{ fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2, r: 4 }}
                    activeDot={{ fill: "#1d4ed8", stroke: "#ffffff", strokeWidth: 3, r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Recent Sales Transactions */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5.5 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Recent Sales Activity</h2>
                <p className="text-xs text-slate-500">Live transaction stream</p>
              </div>
            </div>
            <Link href="/sales" className="text-xs text-blue-600 font-bold hover:underline">
              View All
            </Link>
          </div>

          <div className="flex-1 divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full my-1.5" />)
            ) : (data?.recent_sales.length ?? 0) === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">No transactions recorded today</div>
            ) : (
              data?.recent_sales.slice(0, 6).map((sale, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 hover:bg-slate-50/70 px-2 rounded-lg transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 font-bold text-xs font-mono">
                      #{i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {sale.customer_name || "Walk-in Customer"}
                      </p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {sale.invoice_number} · <span className="text-slate-600">{sale.cashier_name}</span> · {fmtTime(sale.created_at)}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-emerald-600 font-mono tabular-nums ml-3 shrink-0">
                    {fmt(sale.total_amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top Selling Products Progress Tracks */}
      {!loading && (data?.top_products.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5.5">
          <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Top Performing Products</h2>
                <p className="text-xs text-slate-500">Ranked by total units sold</p>
              </div>
            </div>
            <Link href="/products" className="text-xs text-blue-600 font-bold hover:underline">
              Inventory Catalog
            </Link>
          </div>

          <div className="space-y-4">
            {data?.top_products.map((p, i) => {
              const maxUnits = data.top_products[0].units_sold || 1;
              const pct = Math.round((p.units_sold / maxUnits) * 100);
              const color = TOP_PRODUCT_COLORS[i % TOP_PRODUCT_COLORS.length];
              return (
                <div key={i} className="flex items-center gap-4">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : i === 1
                        ? "bg-slate-200 text-slate-800"
                        : i === 2
                        ? "bg-orange-100 text-orange-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-bold text-slate-900 truncate">{p.name}</p>
                      <span className="text-xs font-medium text-slate-500 ml-2 shrink-0 font-mono">
                        <span className="font-bold text-slate-800">{p.units_sold.toLocaleString()}</span> units · {fmt(p.revenue)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
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
