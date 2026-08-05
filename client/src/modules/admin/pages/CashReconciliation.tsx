

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    getCashiers,
    getSessionDetail,
    listSessions,
    reviewSession,
    type CashierOption,
    type CashSession,
    type SessionListParams,
} from "@/shared/api/cashReconciliationApi";
import {
    AlertCircle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Eye,
    RefreshCw,
    Search,
    TrendingDown,
    TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "₱—";
  return (
    "₱" +
    Number(n).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type ReconcStatus = "Balanced" | "Short" | "Over";

function StatusBadge({ status }: { status: ReconcStatus | null }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>;
  if (status === "Balanced")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-semibold border border-green-300">
        <CheckCircle2 className="h-3 w-3" /> Balanced
      </span>
    );
  if (status === "Short")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-semibold border border-red-300">
        <TrendingDown className="h-3 w-3" /> Short
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300">
      <TrendingUp className="h-3 w-3" /> Over
    </span>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  sessionId,
  onClose,
  onReviewed,
}: {
  sessionId: number | null;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [session, setSession] = useState<CashSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"summary" | "sales" | "refunds">("summary");

  useEffect(() => {
    if (!sessionId) { setSession(null); return; }
    setLoading(true);
    setTab("summary");
    getSessionDetail(sessionId)
      .then((s) => { setSession(s); setNotes(s.review_notes ?? ""); })
      .catch(() => toast.error("Failed to load session details."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleSaveReview = async () => {
    if (!session) return;
    setSaving(true);
    try {
      await reviewSession(session.id, notes);
      toast.success("Review notes saved.");
      onReviewed();
      onClose();
    } catch {
      toast.error("Failed to save review notes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!sessionId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">Session Detail</DialogTitle>

        {/* Header */}
        <div className="px-6 py-4 bg-slate-800 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">Reconciliation Detail</h2>
              {session && (
                <p className="text-xs text-slate-300 mt-0.5">
                  {session.cashier_name} · {fmtDate(session.shift_date)} · {session.shift_label}
                </p>
              )}
            </div>
            {session?.status && <StatusBadge status={session.status} />}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white shrink-0">
          {(["summary", "sales", "refunds"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {t === "sales" ? `Sales (${session?.sales?.length ?? "…"})` :
               t === "refunds" ? `Refunds (${session?.refunds?.length ?? "…"})` :
               "Summary"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
              <Spinner /> Loading…
            </div>
          )}
          {!loading && session && tab === "summary" && (
            <SummaryTab session={session} notes={notes} setNotes={setNotes} />
          )}
          {!loading && session && tab === "sales" && (
            <SalesTab sales={session.sales ?? []} />
          )}
          {!loading && session && tab === "refunds" && (
            <RefundsTab refunds={session.refunds ?? []} />
          )}
        </div>

        {/* Footer */}
        {!loading && session && tab === "summary" && (
          <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-gray-50 flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSaveReview}
              disabled={saving}
            >
              {saving ? <><Spinner className="mr-2" />Saving…</> : "Save Review Notes"}
            </Button>
          </div>
        )}
        {(loading || tab !== "summary") && (
          <div className="shrink-0 px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary tab ──────────────────────────────────────────────────────────────

function SummaryTab({
  session,
  notes,
  setNotes,
}: {
  session: CashSession;
  notes: string;
  setNotes: (v: string) => void;
}) {
  const variance = session.variance ?? 0;
  const varianceColor =
    Math.abs(variance) < 0.01
      ? "text-green-700"
      : variance < 0
      ? "text-red-600"
      : "text-amber-600";

  return (
    <div className="space-y-5">
      {/* Cashier info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <InfoItem label="Cashier" value={session.cashier_name} />
        <InfoItem label="Employee ID" value={session.cashier_employee_id ?? "—"} />
        <InfoItem label="Shift Date" value={fmtDate(session.shift_date)} />
        <InfoItem label="Shift" value={session.shift_label} />
        <InfoItem label="Opened At" value={fmtDateTime(session.opened_at)} />
        <InfoItem label="Closed At" value={fmtDateTime(session.closed_at)} />
      </div>

      {/* Breakdown */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            <TRow label="Opening Cash Float" value={fmt(session.opening_cash)} />
            <TRow label="+ Cash Sales"        value={fmt(session.cash_sales)} cls="text-green-700" />
            <TRow label="− Cash Refunds"      value={fmt(session.cash_refunds)} cls="text-red-600" />
            <TRow label="− Cash Paid-Out"     value={fmt(session.cash_paid_out)} cls="text-red-600" />
            <TRowDivider />
            <TRow label="Expected Cash"       value={fmt(session.expected_cash)} bold />
            <TRow label="Actual Cash (Counted)" value={fmt(session.actual_cash)} bold />
            <TRowDivider />
            <TRow
              label="Variance"
              value={(variance > 0 ? "+" : "") + fmt(variance)}
              bold
              cls={varianceColor}
            />
          </tbody>
        </table>
      </div>

      {/* Review info */}
      {session.reviewed_at && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
          Reviewed by <strong>{session.reviewer_name}</strong> on {fmtDateTime(session.reviewed_at)}
        </div>
      )}

      {/* Review notes */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Admin Review Notes
        </Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add review notes, findings, or follow-up actions…"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
        />
      </div>
    </div>
  );
}

// ─── Sales tab ────────────────────────────────────────────────────────────────

function SalesTab({ sales }: { sales: CashSession["sales"] }) {
  if (!sales || sales.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2 text-sm">
        <AlertCircle className="h-8 w-8 opacity-30" />
        No sales recorded in this session.
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
            <th className="px-3 py-2.5 text-left">Invoice #</th>
            <th className="px-3 py-2.5 text-left">Customer</th>
            <th className="px-3 py-2.5 text-right">Amount</th>
            <th className="px-3 py-2.5 text-left">Time</th>
            <th className="px-3 py-2.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sales.map((s) => (
            <tr key={s.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-blue-700">{s.invoice_number}</td>
              <td className="px-3 py-2 text-gray-800 truncate max-w-[140px]">{s.customer_name}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(s.total_amount)}</td>
              <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                {new Date(s.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-3 py-2">
                {s.void_status === "voided" ? (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-semibold">Voided</span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 font-semibold">Completed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Refunds tab ──────────────────────────────────────────────────────────────

function RefundsTab({ refunds }: { refunds: CashSession["refunds"] }) {
  if (!refunds || refunds.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2 text-sm">
        <AlertCircle className="h-8 w-8 opacity-30" />
        No refunds recorded in this session.
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
            <th className="px-3 py-2.5 text-left">Return #</th>
            <th className="px-3 py-2.5 text-left">Invoice #</th>
            <th className="px-3 py-2.5 text-right">Refund Amount</th>
            <th className="px-3 py-2.5 text-left">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {refunds.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-purple-700">{r.return_number}</td>
              <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.invoice_number}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-600">{fmt(r.refund_amount)}</td>
              <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                {new Date(r.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tiny reusable pieces ─────────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function TRow({ label, value, bold = false, cls = "" }: { label: string; value: string; bold?: boolean; cls?: string }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className={`px-4 py-2.5 text-gray-600 ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums ${bold ? "font-bold" : "font-medium"} ${cls}`}>{value}</td>
    </tr>
  );
}

function TRowDivider() {
  return <tr><td colSpan={2}><div className="h-px bg-gray-200" /></td></tr>;
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 15;

export default function CashReconciliation() {
  const [sessions, setSessions]   = useState<CashSession[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [cashiers, setCashiers]           = useState<CashierOption[]>([]);
  const [filterCashier, setFilterCashier] = useState("__all__");
  const today = new Date().toISOString().split("T")[0];
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo]     = useState(today);
  const [filterShift, setFilterShift]       = useState("__all__");
  const [filterStatus, setFilterStatus]     = useState("__all__");

  // ── Load cashiers for dropdown ────────────────────────────────────────────
  useEffect(() => {
    getCashiers().then(setCashiers).catch(() => {});
  }, []);

  // ── Fetch sessions ────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async (pg = page) => {
    setLoading(true);
    const params: SessionListParams = {
      page: pg,
      limit: PAGE_LIMIT,
    };
    if (filterCashier && filterCashier !== "__all__") params.cashier_id = Number(filterCashier);
    if (filterDateFrom) params.date_from = filterDateFrom;
    if (filterDateTo)   params.date_to   = filterDateTo;
    if (filterShift   && filterShift   !== "__all__") params.shift_label = filterShift;
    if (filterStatus  && filterStatus  !== "__all__") params.status = filterStatus as any;

    try {
      const res = await listSessions(params);
      setSessions(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Failed to load reconciliation records.");
    } finally {
      setLoading(false);
    }
  }, [page, filterCashier, filterDateFrom, filterDateTo, filterShift, filterStatus]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleSearch = () => { setPage(1); fetchSessions(1); };
  const handleReset = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    setFilterCashier("__all__");
    setFilterDateFrom(todayStr);
    setFilterDateTo(todayStr);
    setFilterShift("__all__");
    setFilterStatus("__all__");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const balanced = sessions.filter((s) => s.status === "Balanced").length;
  const short    = sessions.filter((s) => s.status === "Short").length;
  const over     = sessions.filter((s) => s.status === "Over").length;

  const todayStr   = new Date().toISOString().split("T")[0];
  const isToday    = filterDateFrom === todayStr && filterDateTo === todayStr;
  const statSuffix = isToday ? "today" : "this page";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review end-of-shift cash counts submitted by cashiers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchSessions()}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Balanced" count={balanced} suffix={statSuffix} color="green" icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label="Short"    count={short}    suffix={statSuffix} color="red"   icon={<TrendingDown className="h-5 w-5" />} />
        <StatCard label="Over"     count={over}     suffix={statSuffix} color="amber" icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600 uppercase">Cashier</Label>
            <Select value={filterCashier} onValueChange={setFilterCashier}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All cashiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All cashiers</SelectItem>
                {cashiers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600 uppercase">Date From</Label>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600 uppercase">Date To</Label>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600 uppercase">Shift</Label>
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All shifts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All shifts</SelectItem>
                <SelectItem value="Morning Shift">Morning Shift</SelectItem>
                <SelectItem value="Day Shift">Day Shift</SelectItem>
                <SelectItem value="Afternoon Shift">Afternoon Shift</SelectItem>
                <SelectItem value="Night Shift">Night Shift</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600 uppercase">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="Balanced">Balanced</SelectItem>
                <SelectItem value="Short">Short</SelectItem>
                <SelectItem value="Over">Over</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 mt-3 justify-end">
          <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5" /> Search
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">
            {total > 0 ? `${total} record${total !== 1 ? "s" : ""}` : "No records found"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-sm">
            <Spinner /> Loading…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2 text-sm">
            <AlertCircle className="h-8 w-8 opacity-30" />
            No reconciliation records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold border-b border-gray-200">
                  <th className="px-4 py-3 text-left">Cashier</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Shift</th>
                  <th className="px-4 py-3 text-right">Expected</th>
                  <th className="px-4 py-3 text-right">Actual</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Review</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((s) => {
                  const variance = s.variance ?? 0;
                  const varColor =
                    Math.abs(variance) < 0.01
                      ? "text-green-600"
                      : variance < 0
                      ? "text-red-600 font-semibold"
                      : "text-amber-600 font-semibold";
                  return (
                    <tr key={s.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{s.cashier_name}</p>
                        {s.cashier_employee_id && (
                          <p className="text-xs text-gray-400 font-mono">{s.cashier_employee_id}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(s.shift_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{s.shift_label}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(s.expected_cash)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(s.actual_cash)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${varColor}`}>
                        {variance > 0 ? "+" : ""}{fmt(variance)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.reviewed_at ? (
                          <span className="text-xs text-green-600 font-medium">Reviewed</span>
                        ) : (
                          <span className="text-xs text-gray-400">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 gap-1 text-xs"
                          onClick={() => setSelectedId(s.id)}
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{((page - 1) * PAGE_LIMIT) + 1}–{Math.min(page * PAGE_LIMIT, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="px-2 font-medium">{page} / {totalPages}</span>
            <Button
              variant="outline" size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <DetailModal
        sessionId={selectedId}
        onClose={() => setSelectedId(null)}
        onReviewed={() => fetchSessions()}
      />
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  count,
  suffix = "this page",
  color,
  icon,
}: {
  label: string;
  count: number;
  suffix?: string;
  color: "green" | "red" | "amber";
  icon: React.ReactNode;
}) {
  const colors = {
    green: "bg-green-50 border-green-200 text-green-800",
    red:   "bg-red-50 border-red-200 text-red-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
  };
  const iconColors = {
    green: "text-green-600",
    red:   "text-red-600",
    amber: "text-amber-600",
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${colors[color]}`}>
      <div className={iconColors[color]}>{icon}</div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{count}</p>
        <p className="text-xs font-semibold opacity-80">{label} {suffix}</p>
      </div>
    </div>
  );
}
