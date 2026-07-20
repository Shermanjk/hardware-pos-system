import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  getReturns,
  getReturnById,
  approveReturn,
  rejectReturn,
  resolveReturn,
  createReturn,
} from "@/shared/api/returnsApi";
import type { Return, ReturnItem } from "@/shared/api/returnsApi";
import { searchSales, getSaleByInvoice } from "@/shared/api/salesApi";
import type { SaleSummary, Sale } from "@/shared/api/salesApi";
import { printReturnReceipt } from "@/shared/utils/returnReceiptPrinter";
import { toast } from "sonner";
import { useAuth } from "@/shared/contexts/AuthContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TabKey = "Pending" | "All Returns" | "Search Sale (No Receipt)";

function StatusBadge({ ret }: { ret: Return }) {
  if (ret.resolution !== null)
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Resolved</span>;
  if (ret.status === "pending")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Pending</span>;
  if (ret.status === "approved")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Approved</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Rejected</span>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function fmtPeso(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// ─── Reject Dialog ────────────────────────────────────────────────────────────

interface RejectDialogProps {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function RejectDialog({ open, onConfirm, onCancel, loading }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reject Return</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label className="font-semibold">Reason for rejection</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason…"
            disabled={loading}
          />
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="destructive" disabled={loading || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {loading ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Resolution Dialog ────────────────────────────────────────────────────────

interface ResolutionDialogProps {
  open: boolean;
  returnId: number;
  onClose: () => void;
  onResolved: () => void;
  returnData: Return | null;
}

function ResolutionDialog({ open, returnId, onClose, onResolved, returnData }: ResolutionDialogProps) {
  const { user } = useAuth();
  const [resolution, setResolution] = useState<"refund" | "replacement">("refund");
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const resolved = await resolveReturn(returnId, { resolution, item_condition: condition });
      if (returnData) {
        printReturnReceipt({
          return_number: returnData.return_number,
          invoice_number: returnData.invoice_number,
          customer_name: returnData.customer_name,
          processed_by_name: user?.full_name ?? returnData.cashier_name,
          resolution,
          item_condition: condition,
          refund_amount: resolved.refund_amount,
          items: returnData.items,
          resolved_at: resolved.resolved_at ?? undefined,
        });
      }
      toast.success("Return resolved.");
      onResolved();
      onClose();
    } catch {
      toast.error("Failed to resolve return.");
    } finally {
      setLoading(false);
    }
  };

  const radioCard = (selected: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
        selected ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Process Resolution</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Resolution Type</p>
            <div className="flex gap-2">
              {radioCard(resolution === "refund", () => setResolution("refund"), "💰 Cash Refund")}
              {radioCard(resolution === "replacement", () => setResolution("replacement"), "🔄 Replace Same Product")}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Item Condition</p>
            <div className="flex gap-2">
              {radioCard(condition === "good", () => setCondition("good"), "✅ Good Condition")}
              {radioCard(condition === "damaged", () => setCondition("damaged"), "⚠️ Damaged")}
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Processing…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Return Detail Dialog ─────────────────────────────────────────────────────

interface ReturnDetailDialogProps {
  id: number | null;
  onClose: () => void;
  onRefresh: () => void;
}

function ReturnDetailDialog({ id, onClose, onRefresh }: ReturnDetailDialogProps) {
  const [ret, setRet] = useState<Return | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);

  useEffect(() => {
    if (id == null) { setRet(null); return; }
    setLoading(true);
    getReturnById(id).then(setRet).catch(() => toast.error("Failed to load return.")).finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    if (!ret) return;
    setActionLoading(true);
    try {
      await approveReturn(ret.id);
      toast.success("Return approved.");
      const updated = await getReturnById(ret.id);
      setRet(updated);
      onRefresh();
    } catch { toast.error("Failed to approve."); }
    finally { setActionLoading(false); }
  };

  const handleReject = async (reason: string) => {
    if (!ret) return;
    setActionLoading(true);
    try {
      await rejectReturn(ret.id, reason);
      toast.success("Return rejected.");
      const updated = await getReturnById(ret.id);
      setRet(updated);
      setRejectOpen(false);
      onRefresh();
    } catch { toast.error("Failed to reject."); }
    finally { setActionLoading(false); }
  };

  return (
    <>
      <Dialog open={id != null} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Return Details</DialogTitle></DialogHeader>
          {loading ? (
            <div className="py-10 text-center text-gray-500">Loading…</div>
          ) : ret ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-gray-500">Return #:</span> <span className="font-semibold">{ret.return_number}</span></div>
                <div><span className="text-gray-500">Invoice #:</span> <span className="font-semibold">{ret.invoice_number}</span></div>
                <div><span className="text-gray-500">Customer:</span> {ret.customer_name}</div>
                <div><span className="text-gray-500">Submitted:</span> {fmtDate(ret.created_at)}</div>
                <div><span className="text-gray-500">Status:</span> <StatusBadge ret={ret} /></div>
                <div><span className="text-gray-500">Submitted by:</span> {ret.cashier_name}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded text-sm">
                <span className="text-gray-500">Reason: </span>{ret.return_reason}
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Product</th>
                    <th className="text-center py-2 px-3 font-semibold text-gray-700">Qty</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Unit Price</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ret.items.map((item: ReturnItem) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 px-3">{item.product_name}</td>
                      <td className="py-2 px-3 text-center">{item.quantity_returned}</td>
                      <td className="py-2 px-3 text-right">{fmtPeso(item.unit_price)}</td>
                      <td className="py-2 px-3 text-right">{fmtPeso(item.unit_price * item.quantity_returned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ret.resolution !== null && (
                <div className="p-3 bg-blue-50 rounded text-sm flex gap-4">
                  <div><span className="text-gray-500">Resolution:</span> <span className="font-semibold capitalize">{ret.resolution}</span></div>
                  {ret.resolution === "refund" && ret.refund_amount != null
                    ? <div><span className="text-gray-500">Refund:</span> <span className="font-semibold">{fmtPeso(ret.refund_amount)}</span></div>
                    : <div><span className="font-semibold text-blue-700">REPLACEMENT</span></div>}
                </div>
              )}
              <DialogFooter className="gap-2 flex-wrap">
                {ret.status === "pending" && ret.resolution === null && (
                  <>
                    <Button variant="outline" className="text-red-600 border-red-300" onClick={() => setRejectOpen(true)} disabled={actionLoading}>Reject</Button>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={actionLoading}>Approve</Button>
                  </>
                )}
                {ret.status === "approved" && ret.resolution === null && (
                  <Button onClick={() => setResolutionOpen(true)} disabled={actionLoading}>Process Resolution</Button>
                )}
                <Button variant="outline" onClick={onClose}>Close</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <RejectDialog open={rejectOpen} onConfirm={handleReject} onCancel={() => setRejectOpen(false)} loading={actionLoading} />
      {ret && (
        <ResolutionDialog
          open={resolutionOpen}
          returnId={ret.id}
          onClose={() => setResolutionOpen(false)}
          onResolved={() => { setResolutionOpen(false); getReturnById(ret.id).then(setRet); onRefresh(); }}
          returnData={ret}
        />
      )}
    </>
  );
}


// ─── Returns List ─────────────────────────────────────────────────────────────

interface ReturnsListProps {
  tab: "Pending" | "All Returns";
}

function ReturnsList({ tab }: ReturnsListProps) {
  const [rows, setRows] = useState<Return[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReturns(tab === "Pending" ? { status: "pending" } : undefined);
      setRows(data);
    } catch { toast.error("Failed to load returns."); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try { await approveReturn(id); toast.success("Return approved."); load(); }
    catch { toast.error("Failed to approve."); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    setActionLoading(rejectTarget);
    try {
      await rejectReturn(rejectTarget, reason);
      toast.success("Return rejected.");
      setRejectTarget(null);
      load();
    } catch { toast.error("Failed to reject."); }
    finally { setActionLoading(null); }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Return #", "Invoice #", "Customer", "Submitted By", "Date", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 font-semibold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /> Loading…
                  </div>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-500">No returns found.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50`}>
                  <td className="py-3 px-4 font-mono font-medium text-gray-900">{r.return_number}</td>
                  <td className="py-3 px-4 font-mono text-gray-700">{r.invoice_number}</td>
                  <td className="py-3 px-4 text-gray-700">{r.customer_name}</td>
                  <td className="py-3 px-4 text-gray-600">{r.cashier_name}</td>
                  <td className="py-3 px-4 text-gray-600 text-xs">{fmtDate(r.created_at)}</td>
                  <td className="py-3 px-4"><StatusBadge ret={r} /></td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => setDetailId(r.id)}>View</Button>
                      {r.status === "pending" && r.resolution === null && (
                        <>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs"
                            disabled={actionLoading === r.id} onClick={() => handleApprove(r.id)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 border-red-300 h-7 px-2 text-xs"
                            disabled={actionLoading === r.id} onClick={() => setRejectTarget(r.id)}>
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ReturnDetailDialog id={detailId} onClose={() => setDetailId(null)} onRefresh={load} />
      <RejectDialog open={rejectTarget != null} onConfirm={handleReject} onCancel={() => setRejectTarget(null)} loading={actionLoading === rejectTarget} />
    </>
  );
}


// ─── Initiate Return Dialog ───────────────────────────────────────────────────

interface InitiateReturnDialogProps {
  sale: Sale | null;
  onClose: () => void;
}

function InitiateReturnDialog({ sale, onClose }: InitiateReturnDialogProps) {
  const [reason, setReason] = useState("");
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sale) { setReason(""); setQtys({}); return; }
    const init: Record<number, number> = {};
    sale.items.filter(i => i.is_returnable && i.quantity - i.quantity_returned > 0).forEach(i => { init[i.id] = 0; });
    setQtys(init);
  }, [sale]);

  const handleSubmit = async () => {
    if (!sale) return;
    const selectedItems = sale.items.filter(i => (qtys[i.id] ?? 0) > 0);
    if (selectedItems.length === 0) { toast.error("Select at least one item to return."); return; }
    if (!reason.trim()) { toast.error("Please enter a return reason."); return; }
    setLoading(true);
    try {
      await createReturn({
        sale_id: sale.id,
        return_reason: reason.trim(),
        items: selectedItems.map(i => ({
          sale_item_id: i.id,
          product_id: i.product_id,
          quantity_returned: qtys[i.id],
          unit_price: i.unit_price,
        })),
      });
      toast.success("Return request submitted.");
      onClose();
    } catch { toast.error("Failed to submit return."); }
    finally { setLoading(false); }
  };

  const returnableItems = sale?.items.filter(i => i.is_returnable && i.quantity - i.quantity_returned > 0) ?? [];

  return (
    <Dialog open={sale != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Initiate Return — {sale?.invoice_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left py-2 px-2 font-semibold text-gray-700">Product</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700">Available</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700">Return Qty</th>
              </tr>
            </thead>
            <tbody>
              {returnableItems.length === 0
                ? <tr><td colSpan={3} className="py-4 text-center text-gray-500">No returnable items.</td></tr>
                : returnableItems.map(item => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 px-2">{item.product_name}</td>
                    <td className="py-2 px-2 text-center">{item.quantity - item.quantity_returned}</td>
                    <td className="py-2 px-2 text-center">
                      <Input type="number" min={0} max={item.quantity - item.quantity_returned}
                        value={qtys[item.id] ?? 0}
                        onChange={e => setQtys(q => ({ ...q, [item.id]: Math.min(Number(e.target.value), item.quantity - item.quantity_returned) }))}
                        className="w-16 text-center h-7 px-1 mx-auto" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div>
            <Label className="font-semibold mb-1.5 block">Return Reason</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe the reason…" disabled={loading} />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || returnableItems.length === 0}>
            {loading ? "Submitting…" : "Submit Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Sales Search Panel ───────────────────────────────────────────────────────

function SalesSearchPanel() {
  const [invoiceNum, setInvoiceNum] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<SaleSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loadingSale, setLoadingSale] = useState<number | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    try {
      const data = await searchSales({
        invoice_number: invoiceNum.trim() || undefined,
        customer_name: customerName.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setResults(data);
    } catch { toast.error("Failed to search sales."); }
    finally { setSearching(false); }
  };

  const handleInitiate = async (summary: SaleSummary) => {
    setLoadingSale(summary.id);
    try {
      const sale = await getSaleByInvoice(summary.invoice_number);
      setSelectedSale(sale);
    } catch { toast.error("Failed to load sale."); }
    finally { setLoadingSale(null); }
  };

  return (
    <>
      <Card className="p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs font-semibold mb-1 block">Invoice #</Label>
            <Input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="INV-000001" className="w-40" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Customer Name</Label>
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer…" className="w-40" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Date From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Date To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
          </div>
          <Button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</Button>
        </form>
      </Card>
      {results.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Invoice #", "Customer", "Cashier", "Date", "Total", "Action"].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-semibold text-gray-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((s, i) => (
                  <tr key={s.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50`}>
                    <td className="py-3 px-4 font-mono text-gray-900">{s.invoice_number}</td>
                    <td className="py-3 px-4 text-gray-700">{s.customer_name}</td>
                    <td className="py-3 px-4 text-gray-600">{s.cashier_name}</td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{fmtDate(s.created_at)}</td>
                    <td className="py-3 px-4 text-gray-700">{fmtPeso(s.total_amount)}</td>
                    <td className="py-3 px-4">
                      <Button size="sm" variant="outline" disabled={loadingSale === s.id} onClick={() => handleInitiate(s)}>
                        {loadingSale === s.id ? "Loading…" : "Initiate Return"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <InitiateReturnDialog sale={selectedSale} onClose={() => setSelectedSale(null)} />
    </>
  );
}


// ─── Main Returns Page ────────────────────────────────────────────────────────

const TABS: TabKey[] = ["Pending", "All Returns", "Search Sale (No Receipt)"];

export default function Returns() {
  const [activeTab, setActiveTab] = useState<TabKey>("Pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Returns Management</h1>
        <p className="text-gray-600 mt-1">Review and process customer return requests</p>
      </div>

      {/* Tab row */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "Pending" && <ReturnsList tab="Pending" />}
      {activeTab === "All Returns" && <ReturnsList tab="All Returns" />}
      {activeTab === "Search Sale (No Receipt)" && <SalesSearchPanel />}
    </div>
  );
}
