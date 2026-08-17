import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    getAuthorizationDetail,
    getAuthorizationHistory,
    getAuthorizationReport,
    type AuthHistoryRow,
    type AuthType,
    type FinalDecision,
    type ReportSummary,
} from "@/shared/api/authorizationHistoryApi";
import axios from "axios";
import {
    AlertCircle,
    Ban,
    Calendar,
    CheckCircle2,
    ChevronDown, ChevronUp,
    Clock,
    Eye, FileBarChart2,
    Package,
    Percent,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    ShoppingCart,
    X,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? "An error occurred.";
  return "An unexpected error occurred.";
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />
  );
}

// ─── Type Badge ───────────────────────────────────────────────────────────────

const TYPE_META: Record<AuthType, { label: string; icon: React.ReactNode; color: string }> = {
  DISCOUNT:              { label: "Discount",        icon: <Percent    className="h-3 w-3" />, color: "bg-amber-100 text-amber-700"   },
  VOID:                  { label: "Void",            icon: <Ban        className="h-3 w-3" />, color: "bg-red-100 text-red-700"       },
  RETURN:                { label: "Return",          icon: <RotateCcw  className="h-3 w-3" />, color: "bg-teal-100 text-teal-700"     },
  STOCK_COUNT_STANDARD:  { label: "Stock (Std)",     icon: <Package    className="h-3 w-3" />, color: "bg-blue-100 text-blue-700"     },
  STOCK_COUNT_MARKET:    { label: "Stock (Mkt)",     icon: <Package    className="h-3 w-3" />, color: "bg-orange-100 text-orange-700" },
  COMMODITY_PURCHASE:    { label: "Purchase",        icon: <ShoppingCart className="h-3 w-3" />, color: "bg-purple-100 text-purple-700" },
};

function TypeBadge({ type }: { type: AuthType }) {
  const meta = TYPE_META[type] ?? { label: type, icon: null, color: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
      {meta.icon}{meta.label}
    </span>
  );
}

// ─── Decision Badge ───────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: FinalDecision | string }) {
  const d = (decision || "").toUpperCase();
  if (d === "APPROVED")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3" />Approved</span>;
  if (d === "REJECTED")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700"><XCircle className="h-3 w-3" />Rejected</span>;
  if (d === "CANCELLED")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600"><X className="h-3 w-3" />Cancelled</span>;
  if (d === "COMPLETED")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700"><CheckCircle2 className="h-3 w-3" />Completed</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700"><Clock className="h-3 w-3" />Pending</span>;
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ row, onClose }: { row: AuthHistoryRow | null; onClose: () => void }) {
  const [detail, setDetail]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!row) { setDetail(null); return; }
    setLoading(true); setError(null);
    getAuthorizationDetail(row.auth_type, row.source_id)
      .then(setDetail)
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [row]);

  const meta = row ? (TYPE_META[row.auth_type] ?? { label: row.auth_type, color: "bg-slate-500" }) : null;

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col gap-0 overflow-hidden max-h-[90vh]">
        <DialogTitle className="sr-only">Authorization Detail</DialogTitle>
        <div className="flex items-center gap-3 px-6 py-4 bg-slate-600 rounded-t-lg shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white">{meta?.label ?? "Authorization"} Detail</h2>
              {row && <DecisionBadge decision={row.final_decision} />}
            </div>
            <p className="text-xs text-slate-300 mt-0.5 font-mono">{row?.reference ?? "…"}</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {loading && (
            <div className="py-10 flex items-center justify-center gap-2 text-gray-400">
              <Spinner className="text-blue-500" /> Loading details…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {detail && !loading && (
            <>
              {/* Core fields */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Authorization Summary</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div><span className="text-gray-500">Type:</span> <span className="ml-1">{row && <TypeBadge type={row.auth_type} />}</span></div>
                  <div><span className="text-gray-500">Reference:</span> <span className="font-mono font-semibold text-gray-900 ml-1">{row?.reference}</span></div>
                  <div><span className="text-gray-500">Requested By:</span> <span className="font-medium text-gray-800 ml-1">{row?.requester_name}</span></div>
                  <div><span className="text-gray-500">Admin:</span> <span className="font-medium text-gray-800 ml-1">{row?.admin_name ?? "—"}</span></div>
                  <div><span className="text-gray-500">Customer:</span> <span className="font-medium text-gray-800 ml-1">{row?.customer_name ?? "—"}</span></div>
                  <div><span className="text-gray-500">Decision:</span> <span className="ml-1">{row && <DecisionBadge decision={row.final_decision} />}</span></div>
                  <div><span className="text-gray-500">Requested:</span> <span className="text-gray-700 ml-1">{fmtDate(row?.created_at)}</span></div>
                  <div><span className="text-gray-500">Resolved:</span> <span className="text-gray-700 ml-1">{fmtDate(row?.resolved_at)}</span></div>
                </div>
              </section>

              {/* Requested Action */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Requested Action</p>
                <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-200">{row?.requested_action}</p>
              </section>

              {/* Reason */}
              {row?.reason && (
                <section>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Reason</p>
                  <p className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 border border-gray-200">{row.reason}</p>
                </section>
              )}

              {/* Rejection Reason */}
              {row?.rejection_reason && (
                <section>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 border border-red-200">{row.rejection_reason}</p>
                </section>
              )}

              {/* Return items if applicable */}
              {row?.auth_type === "RETURN" && detail.items && detail.items.length > 0 && (
                <section>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Returned Items</p>
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left py-2 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Product</th>
                          <th className="text-center py-2 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Qty</th>
                          <th className="text-right py-2 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">Unit Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detail.items.map((item: any) => (
                          <tr key={item.id}>
                            <td className="py-2 px-4 font-medium text-gray-900">{item.product_name}</td>
                            <td className="py-2 px-4 text-center text-gray-700">{item.quantity_returned}</td>
                            <td className="py-2 px-4 text-right text-gray-700">₱{Number(item.unit_price).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({
  open, dateFrom, dateTo, onClose,
}: { open: boolean; dateFrom: string; dateTo: string; onClose: () => void }) {
  const [report,  setReport]  = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setReport(null); return; }
    setLoading(true); setError(null);
    getAuthorizationReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined })
      .then(setReport)
      .catch((e) => setError(extractError(e)))
      .finally(() => setLoading(false));
  }, [open, dateFrom, dateTo]);

  const TYPE_ORDER: AuthType[] = [
    "DISCOUNT", "VOID", "RETURN",
    "STOCK_COUNT_STANDARD", "STOCK_COUNT_MARKET", "COMMODITY_PURCHASE",
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col gap-0 overflow-hidden max-h-[90vh]">
        <DialogTitle className="sr-only">Authorization Report</DialogTitle>
        <div className="flex items-center gap-3 px-6 py-4 bg-indigo-600 rounded-t-lg shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <FileBarChart2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Authorization PASS/FAIL Report</h2>
            <p className="text-xs text-indigo-200 mt-0.5">
              {dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : dateFrom ? `From ${dateFrom}` : dateTo ? `Up to ${dateTo}` : "All time"}
            </p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading && <div className="py-10 flex items-center justify-center gap-2 text-gray-400"><Spinner className="text-indigo-500" /> Generating report…</div>}
          {error   && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg"><AlertCircle className="h-4 w-4 text-red-500 shrink-0" /><p className="text-sm text-red-700">{error}</p></div>}

          {report && !loading && (
            <div className="space-y-5">
              {/* By-type table */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b-2 border-gray-200">
                      {["Authorization Type", "Total", "Approved", "Rejected", "Pending", "Pass Rate"].map((h) => (
                        <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {TYPE_ORDER.map((t) => {
                      const s = report.by_type[t];
                      if (!s) return null;
                      const passNum = parseInt(s.pass_rate, 10);
                      const passColor = isNaN(passNum) ? "text-gray-400"
                        : passNum >= 80 ? "text-green-600"
                        : passNum >= 50 ? "text-amber-600"
                        : "text-red-600";
                      return (
                        <tr key={t} className="hover:bg-gray-50">
                          <td className="py-3 px-4"><TypeBadge type={t} /></td>
                          <td className="py-3 px-4 font-bold text-gray-900">{s.total}</td>
                          <td className="py-3 px-4 text-green-700 font-semibold">{s.APPROVED}</td>
                          <td className="py-3 px-4 text-red-700 font-semibold">{s.REJECTED}</td>
                          <td className="py-3 px-4 text-amber-700">{s.PENDING + s.CANCELLED}</td>
                          <td className={`py-3 px-4 font-bold tabular-nums ${passColor}`}>{s.pass_rate}</td>
                        </tr>
                      );
                    })}
                    {/* Grand total */}
                    <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                      <td className="py-3 px-4 text-gray-900">TOTAL</td>
                      <td className="py-3 px-4 text-gray-900">{report.grand_total.total}</td>
                      <td className="py-3 px-4 text-green-700">{report.grand_total.APPROVED}</td>
                      <td className="py-3 px-4 text-red-700">{report.grand_total.REJECTED}</td>
                      <td className="py-3 px-4 text-amber-700">{report.grand_total.PENDING + report.grand_total.CANCELLED}</td>
                      <td className="py-3 px-4 text-indigo-700">{report.grand_total.pass_rate}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-400 text-right">
                Generated: {fmtDate(report.generated_at)}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AuthorizationHistory() {
  // Filter state
  const [typeFilter,   setTypeFilter]   = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom,     setDateFrom]     = useState(() => new Date().toISOString().split("T")[0]);
  const [dateTo,       setDateTo]       = useState(() => new Date().toISOString().split("T")[0]);
  const [search,       setSearch]       = useState("");
  const [showFilters,  setShowFilters]  = useState(true);

  // Pagination
  const [page,     setPage]     = useState(0);
  const [total,    setTotal]    = useState(0);

  // Data
  const [rows,     setRows]     = useState<AuthHistoryRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Modals
  const [detailRow,     setDetailRow]     = useState<AuthHistoryRow | null>(null);
  const [showReport,    setShowReport]    = useState(false);

  // Sort
  const [sortCol,  setSortCol]  = useState<keyof AuthHistoryRow | null>(null);
  const [sortDir,  setSortDir]  = useState<"asc" | "desc">("desc");

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError(null);
    try {
      const data = await getAuthorizationHistory({
        type:      typeFilter !== "ALL" ? typeFilter : undefined,
        status:    statusFilter !== "all" ? statusFilter : undefined,
        date_from: dateFrom  || undefined,
        date_to:   dateTo    || undefined,
        search:    search.trim() || undefined,
        limit:     PAGE_SIZE,
        offset:    p * PAGE_SIZE,
      });
      setRows(data.rows);
      setTotal(data.total);
      setPage(p);
      setSearched(true);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, dateFrom, dateTo, search]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(0); };

  const handleClear = () => {
    setTypeFilter("ALL"); setStatusFilter("all");
    const today = new Date().toISOString().split("T")[0];
    setDateFrom(today); setDateTo(today);
    setSearch(""); setRows([]); setTotal(0);
    setSearched(false); setError(null); setPage(0);
  };

  // Load today on mount
  useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort client-side
  const sorted = [...rows].sort((a, b) => {
    if (!sortCol) return 0;
    const av = String(a[sortCol] ?? ""), bv = String(b[sortCol] ?? "");
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const toggleSort = (col: keyof AuthHistoryRow) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: keyof AuthHistoryRow }) =>
    sortCol === col
      ? sortDir === "asc"
        ? <ChevronUp className="h-3 w-3 inline ml-0.5" />
        : <ChevronDown className="h-3 w-3 inline ml-0.5" />
      : null;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // KPI cards
  const approved  = rows.filter((r) => r.final_decision === "APPROVED" || r.final_decision === "COMPLETED").length;
  const rejected  = rows.filter((r) => r.final_decision === "REJECTED").length;
  const pending   = rows.filter((r) => r.final_decision === "PENDING").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Authorization History</h1>
          <p className="text-sm text-gray-500 mt-0.5">Complete audit log of every admin-authorized action</p>
        </div>
        <Button
          onClick={() => setShowReport(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
        >
          <FileBarChart2 className="h-4 w-4" /> PASS/FAIL Report
        </Button>
      </div>

      {/* KPI cards */}
      {searched && !loading && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Records",  value: total,    color: "text-gray-700",    bg: "bg-gray-50",    icon: <ShieldCheck className="h-5 w-5 text-gray-500" /> },
            { label: "Approved",       value: approved, color: "text-green-700",   bg: "bg-green-50",   icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> },
            { label: "Rejected",       value: rejected, color: "text-red-700",     bg: "bg-red-50",     icon: <XCircle     className="h-5 w-5 text-red-500"   /> },
            { label: "Pending",        value: pending,  color: "text-amber-700",   bg: "bg-amber-50",   icon: <Clock       className="h-5 w-5 text-amber-500" /> },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>{c.icon}</div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{c.label}</p>
                <p className={`text-xl font-bold ${c.color} tabular-nums leading-tight`}>{c.value.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter panel */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 transition-colors border-b border-slate-200"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Search className="h-4 w-4" />
            </div>
            <span>Search & Filter Authorization Logs</span>
            {(search || typeFilter !== "ALL" || statusFilter !== "all" || dateFrom || dateTo) && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white font-medium">
                Filtered
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span>{showFilters ? "Hide Filters" : "Show Filters"}</span>
            {showFilters ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </div>
        </button>

        {showFilters && (
          <form onSubmit={handleSearch} className="p-5 space-y-4 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="lg:col-span-2">
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block uppercase tracking-wide">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Reference, name, product…"
                    className="h-9.5 text-sm pl-8"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block uppercase tracking-wide">Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-9.5 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="DISCOUNT">Discount</SelectItem>
                    <SelectItem value="VOID">Void</SelectItem>
                    <SelectItem value="RETURN">Return</SelectItem>
                    <SelectItem value="STOCK_COUNT_STANDARD">Stock (Standard)</SelectItem>
                    <SelectItem value="STOCK_COUNT_MARKET">Stock (Market)</SelectItem>
                    <SelectItem value="COMMODITY_PURCHASE">Commodity Purchase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block uppercase tracking-wide">Decision</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9.5 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Decisions</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block uppercase tracking-wide">Date From</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9.5 text-sm pl-8" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block uppercase tracking-wide">Date To</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9.5 text-sm pl-8" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white h-9.5 px-5 text-sm font-semibold gap-2 shadow-xs cursor-pointer">
                {loading ? <Spinner className="text-white" /> : <Search className="h-4 w-4" />}
                {loading ? "Searching…" : "Apply Filters"}
              </Button>
              {searched && (
                <Button type="button" variant="outline" onClick={handleClear} className="h-9.5 px-4 text-sm font-medium text-slate-600 border-slate-300 hover:bg-slate-100 hover:text-slate-900 gap-1.5 cursor-pointer">
                  <X className="h-3.5 w-3.5" /> Reset
                </Button>
              )}
              <button
                type="button"
                onClick={() => load(page)}
                disabled={loading}
                className="h-9.5 w-9.5 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50 shadow-xs cursor-pointer ml-auto"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Results table */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {(
                  [
                    ["auth_type",       "Type"],
                    ["reference",       "Reference"],
                    ["extra_ref",       "Related Record"],
                    ["requester_name",  "Requested By"],
                    ["admin_name",      "Admin"],
                    ["customer_name",   "Customer"],
                    ["final_decision",  "Decision"],
                    ["created_at",      "Date & Time"],
                  ] as [keyof AuthHistoryRow, string][]
                ).map(([col, label]) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className="py-3.5 px-4 font-bold text-slate-700 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-blue-600 transition-colors"
                  >
                    {label}<SortIcon col={col} />
                  </th>
                ))}
                <th className="py-3.5 px-4 text-xs font-bold text-slate-700 uppercase tracking-wide text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Spinner className="text-blue-600" /><span className="text-sm font-medium">Loading authorization logs…</span>
                    </div>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <ShieldCheck className="h-7 w-7 text-slate-400" />
                      </div>
                      <p className="font-bold text-slate-700">{searched ? "No authorization records found" : "Use filters above to search"}</p>
                      <p className="text-xs text-slate-400">{searched ? "Try adjusting your search criteria" : "Search by type, decision, date range, or keyword"}</p>
                    </div>
                  </td>
                </tr>
              ) : sorted.map((row, idx) => (
                <tr
                  key={`${row.auth_type}-${row.source_id}`}
                  className={`hover:bg-blue-50/50 transition-colors ${idx % 2 === 1 ? "bg-slate-50/40" : ""}`}
                >
                  <td className="py-3.5 px-4"><TypeBadge type={row.auth_type} /></td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">{row.reference}</span>
                  </td>
                  <td className="py-3.5 px-4 text-sm text-slate-700 max-w-[140px] truncate font-medium" title={row.extra_ref}>{row.extra_ref}</td>
                  <td className="py-3.5 px-4 text-sm font-bold text-slate-900">{row.requester_name}</td>
                  <td className="py-3.5 px-4 text-sm text-slate-600 font-medium">{row.admin_name}</td>
                  <td className="py-3.5 px-4 text-sm text-slate-600 max-w-[120px] truncate" title={row.customer_name}>{row.customer_name}</td>
                  <td className="py-3.5 px-4"><DecisionBadge decision={row.final_decision} /></td>
                  <td className="py-3.5 px-4 text-xs text-slate-500">{fmtDate(row.created_at)}</td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => setDetailRow(row)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors mx-auto cursor-pointer"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer with pagination */}
        {!loading && sorted.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-slate-600 font-bold">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} records
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0 || loading}
                  onClick={() => load(page - 1)}
                  className="h-7 px-3 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >← Prev</button>
                <span className="text-xs text-gray-500 px-2">Page {page + 1} / {totalPages}</span>
                <button
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => load(page + 1)}
                  className="h-7 px-3 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                >Next →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <DetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      <ReportModal open={showReport} dateFrom={dateFrom} dateTo={dateTo} onClose={() => setShowReport(false)} />
    </div>
  );
}
