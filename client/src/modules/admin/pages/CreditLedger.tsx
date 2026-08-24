import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  getCustomer,
  getCustomerLedger,
  recordAdjustment,
  recordCreditPayment,
  type CreditLedgerEntry,
  type Customer,
} from "@/shared/api/customersApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { printCreditPaymentReceipt } from "@/modules/cashier/utils/receipt";
import { useAuth } from "@/shared/contexts/AuthContext";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Scale,
  Sliders,
  User,
  X,
} from "lucide-react";
import PesoSign from "@/shared/components/PesoSign";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

const fmt = (n: number) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreditLedgerPage() {
  const [, params] = useRoute("/customers/:id/ledger");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const customerId = params?.id ? Number(params.id) : null;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);

  // Adjustment form
  const [adjType, setAdjType] = useState<"DECREASE" | "INCREASE">("DECREASE");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNotes, setAdjNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!customerId) return;
    try {
      const [c, entries, settings] = await Promise.all([
        getCustomer(customerId),
        getCustomerLedger(customerId),
        getSettings().catch(() => null),
      ]);
      setCustomer(c);
      setLedger(Array.isArray(entries) ? entries : []);
      if (settings) setStoreSettings(settings);
    } catch (err) {
      console.error("Failed to load customer ledger:", err);
      toast.error("Failed to load customer ledger.");
      setLedger([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time zero-refresh sync: auto-refreshes ledger when customer payments, credit sales, or adjustments occur
  useRealtimeSync(["credit_ledger", "customers", "sales"], (event) => {
    if (!event.customerId || !customerId || event.customerId === customerId) {
      loadData();
    }
  });

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ── Safe ledger array ───────────────────────────────────────────────────────
  const safeLedger = useMemo(() => (Array.isArray(ledger) ? ledger : []), [ledger]);

  // ── Calculated totals ───────────────────────────────────────────────────────
  const totalCharged = useMemo(
    () => safeLedger.filter((e) => e.entry_type === "CREDIT_SALE").reduce((acc, e) => acc + (Number(e.amount) || 0), 0),
    [safeLedger]
  );
  const totalPaid = useMemo(
    () => safeLedger.filter((e) => e.entry_type === "PAYMENT").reduce((acc, e) => acc + Math.abs(Number(e.amount) || 0), 0),
    [safeLedger]
  );

  // ── Record Payment ──────────────────────────────────────────────────────────
  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      toast.warning("Enter a valid payment amount greater than ₱0.");
      return;
    }
    if (amount > customer.current_balance) {
      toast.warning(`Amount cannot exceed current balance of ${fmt(customer.current_balance)}.`);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await recordCreditPayment(customer.id, {
        amount,
        notes: paymentNotes.trim() || undefined,
      });

      toast.success(`Payment of ${fmt(amount)} recorded. Ref: ${res.reference}`);

      if (autoPrintReceipt && storeSettings) {
        try {
          printCreditPaymentReceipt({
            receiptNumber: res.reference,
            customerName: customer.full_name,
            customerCode: customer.customer_code,
            amountPaidCents: Math.round(amount * 100),
            newBalanceCents: Math.round(res.new_balance * 100),
            cashierName: user?.full_name || user?.username || "Admin",
            notes: paymentNotes || undefined,
            settings: storeSettings,
          });
        } catch (printErr) {
          console.error("Print receipt error:", printErr);
        }
      }

      setShowPaymentModal(false);
      setPaymentAmount("");
      setPaymentNotes("");
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to record payment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Record Adjustment ───────────────────────────────────────────────────────
  async function handleRecordAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    const rawAmount = Number(adjAmount);
    if (!rawAmount || rawAmount <= 0) {
      toast.warning("Enter a valid adjustment amount greater than ₱0.");
      return;
    }
    if (!adjNotes.trim()) {
      toast.warning("Reason / Notes are required for balance adjustments.");
      return;
    }
    // DECREASE = negative adjustment (-amount), INCREASE = positive adjustment (+amount)
    const effectiveAmount = adjType === "DECREASE" ? -rawAmount : rawAmount;
    setIsSubmitting(true);
    try {
      await recordAdjustment(customer.id, effectiveAmount, adjNotes.trim());
      toast.success(
        `Balance adjustment of ${fmt(rawAmount)} (${adjType.toLowerCase()}) recorded.`
      );
      setShowAdjustmentModal(false);
      setAdjAmount("");
      setAdjNotes("");
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to record adjustment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // ── Print / Download Statement of Account (Direct PDF Download for Kiosk) ───
  async function handlePrintStatement() {
    if (!customer) return;
    setIsExportingPDF(true);
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 12;
      let y = margin;

      // Store Title Header
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42); // #0f172a
      doc.text(storeSettings?.store_name || "ISRA HARDWARE TRADING", pageWidth / 2, y, { align: "center" });
      y += 4.5;

      // Store Subheader Details
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const storeSubText = `${storeSettings?.address || "General Santos City"} | Contact: ${storeSettings?.contact_number || "—"} | TIN: ${storeSettings?.tin || "—"}`;
      doc.text(storeSubText, pageWidth / 2, y, { align: "center" });
      y += 5;

      // Divider Line
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      // Document Title & Generation Timestamp
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text("STATEMENT OF ACCOUNT / CREDIT LEDGER", margin, y);

      const genDateStr = new Date().toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated: ${genDateStr}`, pageWidth - margin, y, { align: "right" });
      y += 5;

      // Customer Info Box (light gray background)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, "FD");

      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(`Customer: ${customer.full_name}`, margin + 4, y + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Customer Code: ${customer.customer_code}`, margin + 4, y + 10.5);
      doc.text(`Contact: ${customer.contact_number || "—"}`, margin + 4, y + 15.5);

      doc.text(`Address: ${customer.address || "—"}`, pageWidth / 2, y + 5.5);
      doc.text(`TIN: ${customer.tin || "—"}`, pageWidth / 2, y + 10.5);
      doc.text(`Status: ${customer.status} | Credit ${customer.is_credit_enabled ? "Enabled" : "Disabled"}`, pageWidth / 2, y + 15.5);
      y += 26;

      // Account Summary KPI Cards (4 columns)
      const kpiW = (pageWidth - margin * 2 - 9) / 4;
      const kpiH = 14;

      const kpis = [
        { label: "OUTSTANDING BALANCE", val: `PHP ${Number(customer.current_balance).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, color: [225, 29, 72] },
        { label: "CREDIT LIMIT", val: `PHP ${Number(customer.credit_limit).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, color: [15, 23, 42] },
        { label: "TOTAL CHARGED", val: `PHP ${Number(totalCharged).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, color: [30, 41, 59] },
        { label: "TOTAL PAID", val: `PHP ${Number(totalPaid).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, color: [5, 150, 105] },
      ];

      kpis.forEach((kpi, idx) => {
        const kX = margin + idx * (kpiW + 3);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(kX, y, kpiW, kpiH, 1.5, 1.5, "FD");

        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, kX + 2.5, y + 4.5);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.text(kpi.val, kX + 2.5, y + 10.5);
      });

      y += kpiH + 5;

      // Ledger Table Rows
      const tableHeaders = ["Date & Time", "Type", "Reference", "Charge (+)", "Payment (-)", "Notes"];
      const tableData = ledger.map((entry) => {
        const dateFormatted = new Date(entry.created_at).toLocaleString("en-PH", {
          dateStyle: "short",
          timeStyle: "short",
        });
        const isIncrease = entry.amount > 0;
        const debit = isIncrease ? `PHP ${Number(entry.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—";
        const credit = !isIncrease ? `PHP ${Number(Math.abs(entry.amount)).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—";

        return [
          dateFormatted,
          entry.entry_type,
          entry.reference || "—",
          debit,
          credit,
          entry.notes || "—",
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [tableHeaders],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8,
          cellPadding: 2.5,
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          textColor: [30, 41, 59],
        },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 28, fontStyle: "bold" },
          2: { cellWidth: 26 },
          3: { cellWidth: 28, halign: "right", fontStyle: "bold" },
          4: { cellWidth: 28, halign: "right", fontStyle: "bold" },
          5: { cellWidth: "auto" },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: margin, right: margin, bottom: 14 },
        didDrawPage: (data: any) => {
          // Footer
          const pageCount = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : 1;
          const pageNumber = data.pageNumber;
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Statement of Account — ${customer.full_name} (${customer.customer_code}) · Page ${pageNumber} of ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 6,
            { align: "center" }
          );
        },
      });

      const cleanCode = (customer.customer_code || "CUSTOMER").replace(/[^a-zA-Z0-9_-]/g, "_");
      const dateTag = new Date().toISOString().slice(0, 10);
      const filename = `Statement_of_Account_${cleanCode}_${dateTag}.pdf`;

      // Direct download without preview/popup window
      doc.save(filename);
      toast.success(`Statement of Account downloaded: ${filename}`);
    } catch (err: any) {
      console.error("[handlePrintStatement PDF export error]", err);
      toast.error("Failed to generate PDF statement.");
    } finally {
      setIsExportingPDF(false);
    }
  }

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading customer ledger…</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="py-20 text-center space-y-3">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
        <p className="text-base font-bold text-slate-800">Customer not found</p>
        <Button onClick={() => navigate("/customers")} variant="outline">
          Back to Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/customers")}
            className="h-9 px-2.5 bg-white text-slate-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Customers
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {customer.full_name}
              </h1>
              <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                {customer.customer_code}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Statement of Account · Transaction Ledger · Payment History
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-9 bg-white text-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handlePrintStatement}
            disabled={isExportingPDF}
            className="h-9 bg-white text-slate-700 font-medium"
            title="Download Statement of Account PDF"
          >
            {isExportingPDF ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-blue-600" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
            )}
            {isExportingPDF ? "Generating PDF…" : "Print Statement"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAdjustmentModal(true)}
            className="h-9 text-slate-700 bg-white border-slate-300"
          >
            <Scale className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
            Adjustment
          </Button>
          <Button
            onClick={() => {
              setPaymentAmount(String(customer.current_balance));
              setShowPaymentModal(true);
            }}
            disabled={customer.current_balance <= 0}
            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
          >
            <PesoSign className="mr-1 text-sm font-bold" />
            Receive Payment
          </Button>
        </div>
      </div>

      {/* ── Summary & Customer Info Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Balance (Utang)</p>
          <p className={`text-2xl font-bold mt-1 ${customer.current_balance > 0 ? "text-rose-600" : "text-slate-900"}`}>
            {fmt(customer.current_balance)}
          </p>
          {customer.is_credit_enabled && customer.credit_limit > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Available: {fmt(Math.max(0, customer.credit_limit - customer.current_balance))}
            </p>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Credit Limit</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {customer.is_credit_enabled ? fmt(customer.credit_limit) : "Disabled"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {customer.is_credit_enabled ? "Credit Active" : "No credit permissions"}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sales on Credit</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(totalCharged)}</p>
          <p className="text-xs text-slate-400 mt-1">Lifetime charged</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Payments Received</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(totalPaid)}</p>
          <p className="text-xs text-slate-400 mt-1">Lifetime paid</p>
        </div>
      </div>

      {/* Customer profile strip */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 text-xs flex flex-wrap items-center justify-between gap-4 text-slate-600">
        <div><strong>Contact:</strong> {customer.contact_number || "—"}</div>
        <div><strong>Address:</strong> {customer.address || "—"}</div>
        <div><strong>TIN:</strong> {customer.tin || "—"}</div>
        <div><strong>Business Style:</strong> {customer.business_style || "—"}</div>
        <div><strong>Status:</strong> <span className="font-semibold text-slate-800">{customer.status}</span></div>
      </div>

      {/* ── Ledger Table ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-blue-600" />
            Transaction History & FIFO Allocation
          </h2>
          <span className="text-xs font-bold text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200">{ledger.length} entries</span>
        </div>

        {ledger.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No ledger entries yet</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Transactions, payments, and adjustments will appear here in chronological order.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Reference</th>
                  <th className="py-3.5 px-4 text-right">Debit (+)</th>
                  <th className="py-3.5 px-4 text-right">Credit (-)</th>
                  <th className="py-3.5 px-4 text-right">Invoice Status</th>
                  <th className="py-3.5 px-4">Recorded By</th>
                  <th className="py-3.5 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((entry) => {
                  const isCharge = entry.amount > 0;
                  const dateFormatted = new Date(entry.created_at).toLocaleString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                        {dateFormatted}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {entry.entry_type === "CREDIT_SALE" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <ArrowUpRight className="h-3 w-3" />
                            Credit Sale
                          </span>
                        )}
                        {entry.entry_type === "PAYMENT" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ArrowDownLeft className="h-3 w-3" />
                            Payment
                          </span>
                        )}
                        {entry.entry_type === "VOID_REVERSAL" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <RotateCcw className="h-3 w-3" />
                            Void Reversal
                          </span>
                        )}
                        {entry.entry_type === "ADJUSTMENT" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Scale className="h-3 w-3" />
                            Adjustment
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-700">
                        {entry.reference ? entry.reference.replace(/^INV-?/i, "") : (entry.invoice_number ? entry.invoice_number.replace(/^INV-?/i, "") : "—")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium tabular-nums text-slate-900">
                        {isCharge ? fmt(entry.amount) : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold tabular-nums text-emerald-600">
                        {!isCharge ? fmt(Math.abs(entry.amount)) : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {entry.entry_type === "CREDIT_SALE" && entry.amount_remaining !== null ? (
                          entry.amount_remaining === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> Settled
                            </span>
                          ) : entry.amount_remaining < entry.amount ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Unpaid: {fmt(entry.amount_remaining)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Unpaid: {fmt(entry.amount_remaining)}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div>{entry.recorded_by_name}</div>
                        {entry.authorized_by_name && (
                          <span className="text-[10px] text-slate-400">Auth: {entry.authorized_by_name}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 max-w-xs truncate">
                        {entry.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Record Payment ────────────────────────────────────────────── */}
      <Dialog open={showPaymentModal} onOpenChange={(o) => { if (!o && !isSubmitting) setShowPaymentModal(false); }}>
        <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden border-0 shadow-2xl rounded-2xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Receive Payment</DialogTitle>
          <div className="px-6 py-4 bg-emerald-600 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <PesoSign className="text-xl" />
              <h3 className="font-bold text-base">Receive Payment — {customer.full_name}</h3>
            </div>
            <button
              onClick={() => setShowPaymentModal(false)}
              disabled={isSubmitting}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Customer</span>
                <span className="font-bold text-slate-900">{customer.full_name}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-950 pt-1 border-t border-emerald-200">
                <span>Outstanding Balance</span>
                <span className="text-rose-700 text-sm">{fmt(customer.current_balance)}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-700">Amount to Pay (₱)</label>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(customer.current_balance))}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800"
                >
                  Pay Full Balance
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₱</span>
                <Input
                  type="number"
                  min="0.01"
                  max={customer.current_balance}
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="pl-8 h-12 text-lg font-bold text-slate-900"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes / Payment Reference (optional)
              </label>
              <Input
                placeholder="e.g. Cash payment / Check #98765"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="print-receipt-chk-ledger"
                checked={autoPrintReceipt}
                onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="print-receipt-chk-ledger" className="text-xs text-slate-700 font-medium flex items-center gap-1 cursor-pointer">
                <Printer className="h-3.5 w-3.5 text-slate-500" />
                Print Collection Receipt upon confirmation
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !Number(paymentAmount) || Number(paymentAmount) <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm & Receive {Number(paymentAmount) > 0 ? fmt(Number(paymentAmount)) : ""}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Manual Adjustment ─────────────────────────────────────────── */}
      <Dialog open={showAdjustmentModal} onOpenChange={(o) => { if (!o && !isSubmitting) setShowAdjustmentModal(false); }}>
        <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden border-0 shadow-2xl rounded-2xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Authorized Balance Adjustment</DialogTitle>
          <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-amber-400" />
              <h3 className="font-bold text-base">Authorized Balance Adjustment</h3>
            </div>
            <button
              onClick={() => setShowAdjustmentModal(false)}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleRecordAdjustment} className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs space-y-1">
              <p className="font-bold text-amber-900">Admin Authorization Required</p>
              <p className="text-amber-800">
                This action will directly modify the customer's balance and create an immutable audit record.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Adjustment Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjType("DECREASE")}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                    adjType === "DECREASE"
                      ? "bg-emerald-50 border-emerald-400 text-emerald-800 ring-2 ring-emerald-100"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Decrease Balance (Credit / Write-off)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjType("INCREASE")}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                    adjType === "INCREASE"
                      ? "bg-rose-50 border-rose-400 text-rose-800 ring-2 ring-rose-100"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Increase Balance (Debit / Correction)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Amount (₱)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₱</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  className="pl-8 h-10 text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason & Audit Explanation <span className="text-red-500">*</span>
              </label>
              <Input
                required
                placeholder="e.g. Correction of billing discrepancy / approved settlement discount"
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAdjustmentModal(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !Number(adjAmount) || !adjNotes.trim()}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm Adjustment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
