import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getCashiers, type CashierOption } from "@/shared/api/cashReconciliationApi";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import type { Sale, SaleSummary, SaleItemSnapshot } from "@/shared/api/salesApi";
import { getSaleByInvoice, searchSales } from "@/shared/api/salesApi";
import { getSettings } from "@/shared/api/settingsApi";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";
import { printSaleReceipt, type CartItem } from "@/modules/cashier/utils/receipt";
import axios from "axios";
import { toast } from "sonner";
import {
    AlertCircle,
    Calendar, ChevronDown, ChevronUp,
    CreditCard,
    Eye,
    Filter,
    Hash,
    Percent,
    Printer,
    Receipt,
    RotateCcw,
    Search,
    ShoppingCart,
    User,
    X
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? "An error occurred.";
  return "An unexpected error occurred.";
}

// ─── Sale Detail Modal ────────────────────────────────────────────────────────

function SaleDetailModal({ invoiceNumber, onClose }: {
  invoiceNumber: string | null;
  onClose: () => void;
}) {
  const [sale,       setSale]       = useState<Sale | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (!invoiceNumber) { setSale(null); return; }
    setLoading(true);
    setError(null);
    getSaleByInvoice(invoiceNumber)
      .then(setSale)
      .catch((err) => setError(extractError(err)))
      .finally(() => setLoading(false));
  }, [invoiceNumber]);

  const handlePrintReceipt = async () => {
    if (!sale) return;
    setIsPrinting(true);
    try {
      const settings = await getSettings();
      
      const cartItems: CartItem[] = (sale.items || []).map((item) => ({
        id: item.product_id,
        name: item.product_name,
        barcode: item.barcode ?? undefined,
        unit: item.unit_abbreviation ?? undefined,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        subtotal: Number(item.subtotal),
        tax_type: "VATABLE",
      }));

      const itemSnapshots: SaleItemSnapshot[] = (sale.items || []).map((item) => {
        const sub = Number(item.subtotal);
        const vat = sub > 0 ? (sub / 1.12) * 0.12 : 0;
        return {
          product_id: item.product_id,
          tax_type: "VATABLE",
          taxable_amount: sub - vat,
          vat_amount: vat,
          line_subtotal: sub,
        };
      });

      const subtotalCents = Math.round(Number(sale.subtotal) * 100);
      const taxCents = Math.round(Number(sale.vat_amount) * 100);
      const totalCents = Math.round(Number(sale.total_amount) * 100);
      const cashCents = Math.round(Number(sale.cash_tendered ?? 0) * 100);
      const changeCents = sale.change_amount !== null && sale.change_amount !== undefined ? Math.round(Number(sale.change_amount) * 100) : null;
      const discountCents = Math.round(Number(sale.discount ?? 0) * 100);
      const vatExemptCents = Math.round(Number(sale.vat_exempt_amount ?? 0) * 100);

      printSaleReceipt({
        invoiceNumber: sale.invoice_number,
        cartItems,
        customerInfo: {
          name: sale.customer_name || "Walk-in Customer",
          address: sale.customer_address || "",
          tin: sale.customer_tin || "",
          businessStyle: "",
          scPwdType: sale.sc_pwd_type ?? "NONE",
          scPwdId: sale.sc_pwd_id ?? undefined,
        },
        subtotalCents,
        taxCents,
        totalCents,
        cashCents,
        changeCents,
        cashierName: sale.cashier_name || "—",
        settings,
        itemSnapshots,
        discountCents,
        discountName: sale.discount_name ?? undefined,
        discountPercentage: sale.discount_percentage ?? undefined,
        finalTotalCents: totalCents,
        vatExemptCents,
        scPwdType: sale.sc_pwd_type ?? "NONE",
        scPwdId: sale.sc_pwd_id ?? undefined,
        paymentType: sale.payment_type === "CREDIT" ? "CREDIT" : "CASH",
        creditBalance: sale.credit_balance !== null && sale.credit_balance !== undefined ? Math.round(Number(sale.credit_balance) * 100) : null,
        downPaymentCents: sale.payment_type === "CREDIT" ? Math.round(Number(sale.amount_paid_at_sale ?? 0) * 100) : undefined,
      });

      toast.success(`Receipt for ${sale.invoice_number} sent to printer.`);
    } catch (err) {
      console.error("Failed to reprint receipt:", err);
      toast.error("Failed to reprint receipt. Check printer connection.");
    } finally {
      setIsPrinting(false);
    }
  };

  const voidStatusPill = sale?.void_status === "voided"
    ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">VOIDED</span>
    : sale?.void_status === "void_requested"
    ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-white">VOID PENDING</span>
    : null;

  return (
    <Dialog open={!!invoiceNumber} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col gap-0 overflow-hidden max-h-[90vh]">
        <DialogTitle className="sr-only">Sale Details</DialogTitle>
        {/* Slate header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-slate-500 rounded-t-lg shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white">Sale Details</h2>
              {voidStatusPill}
            </div>
            <p className="text-xs text-slate-300 mt-0.5 font-mono">
              {invoiceNumber ?? "Loading…"}
            </p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="py-12 flex items-center justify-center gap-2 text-gray-400 px-6">
              <LoadingSpinner size={16} className="text-blue-500" /> Loading sale details…
            </div>
          )}

          {error && (
            <div className="mx-6 mt-5 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {sale && !loading && (() => {
            const discountVal   = Number(sale.discount ?? 0);
            const hasDiscount   = discountVal > 0;
            const isSenior      = sale.sc_pwd_type === "SENIOR_CITIZEN";
            const isPwd         = sale.sc_pwd_type === "PWD";
            const isScPwd       = isSenior || isPwd;
            const totalVal      = Number(sale.total_amount ?? 0);
            const grossTotal    = sale.items && sale.items.length > 0
              ? sale.items.reduce((sum, item) => sum + Number(item.subtotal), 0)
              : (hasDiscount ? totalVal + discountVal : totalVal);

            let discountTypeDisplay = "None";
            if (isSenior) {
              discountTypeDisplay = "Senior Citizen";
            } else if (isPwd) {
              discountTypeDisplay = "PWD";
            } else if (hasDiscount) {
              discountTypeDisplay = sale.discount_name || (sale.discount_is_sc_pwd ? "SC/PWD" : "Discount");
            }

            let discountRateDisplay: string | null = null;
            if (isScPwd) {
              discountRateDisplay = `${sale.discount_percentage ?? 20}%`;
            } else if (hasDiscount) {
              if (sale.discount_percentage != null) {
                discountRateDisplay = `${sale.discount_percentage}%`;
              } else if (sale.discount_type === "Fixed") {
                discountRateDisplay = "Fixed Amount";
              } else {
                discountRateDisplay = "Not recorded";
              }
            }

            const discountAmountDisplay = hasDiscount ? `-${fmt(discountVal)}` : "₱0.00";
            const idLabel = isSenior ? "SC ID:" : isPwd ? "PWD ID:" : null;
            const idValue = isScPwd ? (sale.sc_pwd_id || "Not provided") : null;

            return (
              <div className="px-6 py-5 space-y-4">
                {/* Transaction info */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transaction Info</p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div><span className="text-gray-500">Invoice No.:</span> <span className="font-bold font-mono text-gray-900 ml-1">{sale.invoice_number}</span></div>
                    <div><span className="text-gray-500">Date:</span> <span className="font-medium text-gray-800 ml-1">{fmtDate(sale.created_at)}</span></div>
                    <div><span className="text-gray-500">Customer:</span> <span className="font-medium text-gray-800 ml-1">{sale.customer_name}</span></div>
                    <div><span className="text-gray-500">Cashier:</span> <span className="font-medium text-gray-800 ml-1">{sale.cashier_name}</span></div>
                    {sale.customer_address && (
                      <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="text-gray-700 ml-1">{sale.customer_address}</span></div>
                    )}
                    {sale.customer_tin && (
                      <div><span className="text-gray-500">TIN:</span> <span className="text-gray-700 font-mono ml-1">{sale.customer_tin}</span></div>
                    )}
                  </div>
                </div>

                {/* Discount Information */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Discount Information</p>
                  <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200/80 space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                      <div>
                        <span className="text-gray-500">Discount Type:</span>
                        <span className="font-bold text-amber-900 ml-1.5">{discountTypeDisplay}</span>
                      </div>
                      {discountRateDisplay && (
                        <div>
                          <span className="text-gray-500">Discount Rate:</span>
                          <span className="font-semibold text-gray-900 ml-1.5">{discountRateDisplay}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Discount Amount:</span>
                        <span className={`font-bold ml-1.5 ${hasDiscount ? "text-amber-700" : "text-gray-900"}`}>
                          {discountAmountDisplay}
                        </span>
                      </div>
                      {idLabel && (
                        <div>
                          <span className="text-gray-500">{idLabel}</span>
                          <span className="font-mono text-gray-900 ml-1.5">{idValue}</span>
                        </div>
                      )}
                    </div>

                    {/* Approval Information */}
                    {sale.approval_info && (
                      <div className="pt-2.5 mt-2.5 border-t border-amber-200/60 grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                        <div>
                          <span className="text-gray-500">Approval:</span>
                          <span className="font-semibold text-emerald-700 ml-1.5 px-2 py-0.5 rounded bg-emerald-100/80">
                            {sale.approval_info.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Approved By:</span>
                          <span className="font-medium text-gray-900 ml-1.5">{sale.approval_info.approved_by}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Approval Method:</span>
                          <span className="font-medium text-gray-900 ml-1.5">{sale.approval_info.approval_method}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</p>
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>
                          <th className="text-center py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Qty</th>
                          <th className="text-right py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Unit Price</th>
                          <th className="text-right py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sale.items.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="py-2.5 px-4">
                              <p className="font-medium text-gray-900">{item.product_name}</p>
                              {item.barcode && <p className="font-mono text-xs text-gray-400">{item.barcode}</p>}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {(() => {
                                const parts = formatQuantityParts(item.quantity, item.unit_abbreviation, item.quantity_type, item.unit_allow_decimal);
                                return (
                                  <div className="flex items-center justify-center gap-0.5">
                                    <span className="font-semibold text-gray-800">{parts.number}</span>
                                    {parts.unit && <span className="text-xs text-gray-500">{parts.unit}</span>}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-2.5 px-4 text-right text-gray-600">{fmt(item.unit_price)}</td>
                            <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{fmt(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transaction Summary</span>
                  </div>
                  <div className="p-4 space-y-2 text-sm">

                    {/* Standard BIR Tax Breakdown */}
                    <div className="flex justify-between text-gray-600">
                      <span>VATable Sales (Net Base)</span>
                      <span className="tabular-nums">{fmt(sale.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 text-xs pl-3">
                      <span>VAT (12%)</span>
                      <span className="tabular-nums">{fmt(sale.vat_amount)}</span>
                    </div>
                    {sale.vat_exempt_amount > 0 && (
                      <div className="flex justify-between text-purple-600 text-xs pl-3">
                        <span>VAT-Exempt Sales</span>
                        <span className="tabular-nums">{fmt(sale.vat_exempt_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-700 font-medium pt-1 border-t border-gray-100">
                      <span>Gross Amount (incl. VAT)</span>
                      <span className="tabular-nums">{fmt(grossTotal)}</span>
                    </div>

                    {/* Discount line */}
                    {hasDiscount && (
                      <div className="border-t border-dashed border-gray-200 pt-2 mt-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-amber-700">
                            <Percent className="h-3.5 w-3.5" />
                            <span className="font-medium">
                              {sale.discount_name ?? "Discount"}
                              {sale.discount_percentage != null && (
                                <span className="ml-1 text-xs text-amber-600">({sale.discount_percentage}%)</span>
                              )}
                            </span>
                            {sale.discount_is_sc_pwd && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">SC/PWD</span>
                            )}
                          </div>
                          <span className="tabular-nums font-semibold text-amber-700">-{fmt(sale.discount)}</span>
                        </div>
                        {isScPwd && (
                          <p className="text-xs text-gray-400 pl-5">Applied on VAT-exclusive base per RA 9994/9442</p>
                        )}
                      </div>
                    )}

                    {/* Final total */}
                    <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t-2 border-gray-200">
                      <span>{hasDiscount ? "Total After Discount" : "Total"}</span>
                      <span className="tabular-nums text-blue-600 text-lg">{fmt(sale.total_amount)}</span>
                    </div>

                    {/* Payment Method & Cash details */}
                    <div className="flex justify-between text-gray-700 pt-1 border-t border-gray-100 font-medium">
                      <span>Payment Method</span>
                      <span className="font-semibold text-slate-900">
                        {sale.payment_type === "CREDIT" ? "Credit / Utang" : "Cash"}
                      </span>
                    </div>

                    {sale.payment_type === "CREDIT" ? (
                      <>
                        {Number(sale.amount_paid_at_sale ?? 0) > 0 && (
                          <div className="flex justify-between text-gray-600 text-xs">
                            <span>Down Payment (Cash)</span>
                            <span className="tabular-nums">{fmt(Number(sale.amount_paid_at_sale))}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-blue-700 font-semibold text-xs">
                          <span>Amount on Credit</span>
                          <span className="tabular-nums">
                            {fmt(sale.total_amount - Number(sale.amount_paid_at_sale ?? 0))}
                          </span>
                        </div>
                        {sale.credit_balance !== null && sale.credit_balance !== undefined && (
                          <div className="flex justify-between text-slate-600 text-xs bg-slate-50 p-1.5 rounded">
                            <span>Customer Total Balance:</span>
                            <span className="font-bold text-rose-600 tabular-nums">{fmt(Number(sale.credit_balance))}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-gray-600">
                          <span>Cash Tendered</span><span className="tabular-nums">{fmt(sale.cash_tendered)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Change</span><span className="tabular-nums">{fmt(sale.change_amount)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          {sale ? (
            <Button
              type="button"
              variant="outline"
              onClick={handlePrintReceipt}
              disabled={isPrinting}
              className="gap-2 text-slate-700 hover:bg-slate-100 font-semibold"
            >
              <Printer className="h-4 w-4 text-blue-600" />
              <span>{isPrinting ? "Printing…" : "Reprint Receipt"}</span>
            </Button>
          ) : (
            <div />
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Sales Page ──────────────────────────────────────────────────────────


export default function Sales() {
  const [sales,      setSales]      = useState<SaleSummary[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Cashier list for dropdown
  const [cashiers, setCashiers] = useState<CashierOption[]>([]);
  useEffect(() => { getCashiers().then(setCashiers).catch(() => {}); }, []);

  // Filters
  const [invoice,      setInvoice]      = useState("");
  const [customer,     setCustomer]     = useState("");
  const [cashierId,    setCashierId]    = useState("__all__");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [returnStatus, setReturnStatus] = useState("all");
  const [paymentType,  setPaymentType]  = useState("all");
  const [showFilters,  setShowFilters]  = useState(true);

  // Detail modal
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null);

  // Summary stats (computed from loaded results)
  const totalRevenue = sales.filter((s) => s.void_status !== "voided").reduce((s, r) => s + Number(r.total_amount) - Number(r.total_refunded || 0), 0);

  // Per-cashier totals (only meaningful when no cashier filter is active)
  const cashierTotals = sales
    .filter((s) => s.void_status !== "voided")
    .reduce<Record<string, { name: string; total: number; count: number }>>((acc, s) => {
      const key = s.cashier_name;
      if (!acc[key]) acc[key] = { name: s.cashier_name, total: 0, count: 0 };
      acc[key].total += Number(s.total_amount) - Number((s as any).total_refunded || 0);
      acc[key].count += 1;
      return acc;
    }, {});
  const cashierTotalsList = Object.values(cashierTotals).sort((a, b) => b.total - a.total);

  // Default date range to today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setDateFrom(today);
    setDateTo(today);
  }, []);

  const load = useCallback(async (params: {
    invoice_number?: string;
    customer_name?: string;
    cashier_id?: number;
    date_from?: string;
    date_to?: string;
    return_status?: string;
    payment_type?: "CASH" | "CREDIT";
  }) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await searchSales(params);
      setSales(data);
      setHasSearched(true);
    } catch (err) {
      setLoadError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    load({
      invoice_number: invoice.trim() || undefined,
      customer_name:  customer.trim() || undefined,
      cashier_id:     cashierId !== "__all__" ? Number(cashierId) : undefined,
      date_from:      dateFrom || undefined,
      date_to:        dateTo   || undefined,
      return_status:  returnStatus !== "all" ? returnStatus : undefined,
      payment_type:   paymentType !== "all" ? (paymentType as "CASH" | "CREDIT") : undefined,
    });
  };

  // Real-time zero-refresh sync: when a sale is created or voided, auto-refresh the current search view
  useRealtimeSync(["sales", "returns"], () => {
    if (hasSearched) {
      handleSearch();
    }
  });

  const handleClear = () => {
    setInvoice(""); setCustomer(""); setCashierId("__all__"); setReturnStatus("all"); setPaymentType("all");
    const today = new Date().toISOString().split("T")[0];
    setDateFrom(today); setDateTo(today);
    setSales([]); setHasSearched(false); setLoadError(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <p className="text-sm text-gray-500 mt-0.5">View and search all sales transactions</p>
        </div>
      </div>

      {/* Summary cards — show after search */}
      {hasSearched && !isLoading && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Transactions",   value: sales.length.toLocaleString(),       color: "text-blue-600",    bg: "bg-blue-50"    },
            { label: "Total Revenue",  value: fmt(totalRevenue),                   color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Avg. per Sale",  value: sales.length > 0 ? fmt(totalRevenue / sales.length) : "₱0.00",
                                                                                   color: "text-purple-600",  bg: "bg-purple-50"  },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
                <ShoppingCart className={`h-5 w-5 ${c.color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{c.label}</p>
                <p className={`text-xl font-bold ${c.color} tabular-nums leading-tight`}>{c.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Per-cashier breakdown — only when all cashiers shown and more than one cashier */}
      {hasSearched && !isLoading && cashierId === "__all__" && cashierTotalsList.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">Sales by Cashier</span>
          </div>
          <div className="divide-y divide-gray-100">
            {cashierTotalsList.map((c, i) => {
              const pct = totalRevenue > 0 ? (c.total / totalRevenue) * 100 : 0;
              return (
                <div key={c.name} className="px-5 py-3 flex items-center gap-4">
                  <span className="w-5 text-xs font-bold text-gray-400 tabular-nums">{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{fmt(c.total)}</p>
                    <p className="text-xs text-gray-400">{c.count} sale{c.count !== 1 ? "s" : ""} · {pct.toFixed(1)}%</p>
                  </div>
                  <button
                    onClick={() => { setCashierId(String(cashiers.find(x => x.full_name === c.name)?.id ?? "__all__")); }}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                    title="Filter by this cashier"
                  >
                    View only
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search filters */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 transition-colors border-b border-slate-200"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Filter className="h-4 w-4" />
            </div>
            <span>Search & Filter Sales Transactions</span>
            {(cashierId !== "__all__" || invoice.trim() || customer.trim() || paymentType !== "all" || returnStatus !== "all") && (
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
            {/* Primary Search Criteria Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {/* Cashier */}
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Cashier
                </Label>
                <Select value={cashierId} onValueChange={setCashierId}>
                  <SelectTrigger className="h-9.5 text-sm">
                    <SelectValue placeholder="All Cashiers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Cashiers</SelectItem>
                    {cashiers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.full_name}{c.employee_id ? ` (${c.employee_id})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Invoice No */}
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                  <Hash className="h-3.5 w-3.5 text-slate-400" />
                  Invoice No.
                </Label>
                <Input
                  value={invoice}
                  onChange={(e) => setInvoice(e.target.value)}
                  placeholder="e.g. INV-2026..."
                  className="h-9.5 text-sm"
                />
              </div>

              {/* Customer Name */}
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Customer Name
                </Label>
                <Input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Search customer…"
                  className="h-9.5 text-sm"
                />
              </div>

              {/* Date From */}
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Date From
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9.5 text-sm pl-8"
                  />
                </div>
              </div>

              {/* Date To */}
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Date To
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9.5 text-sm pl-8"
                  />
                </div>
              </div>
            </div>

            {/* Secondary Filters & Action Row */}
            <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-3.5">
                {/* Payment Method */}
                <div className="w-48">
                  <Label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                    <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                    Payment Method
                  </Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger className="h-9.5 text-sm">
                      <SelectValue placeholder="All Methods" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payment Methods</SelectItem>
                      <SelectItem value="CASH">Cash Only</SelectItem>
                      <SelectItem value="CREDIT">Credit / Utang Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Return Status */}
                <div className="w-44">
                  <Label className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5 uppercase tracking-wide">
                    <Receipt className="h-3.5 w-3.5 text-slate-400" />
                    Return Status
                  </Label>
                  <Select value={returnStatus} onValueChange={setReturnStatus}>
                    <SelectTrigger className="h-9.5 text-sm">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Transactions</SelectItem>
                      <SelectItem value="no_returns">No Returns</SelectItem>
                      <SelectItem value="has_returns">Has Returns</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Quick Date Presets */}
                <div>
                  <Label className="text-xs font-bold text-slate-700 mb-1.5 block uppercase tracking-wide">
                    Quick Presets
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const t = new Date().toISOString().split("T")[0];
                        setDateFrom(t);
                        setDateTo(t);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shadow-2xs"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
                        setDateFrom(y);
                        setDateTo(y);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shadow-2xs"
                    >
                      Yesterday
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
                        const todayStr = now.toISOString().split("T")[0];
                        setDateFrom(firstDay);
                        setDateTo(todayStr);
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shadow-2xs"
                    >
                      This Month
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 md:pt-0">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white h-9.5 px-5 text-sm font-semibold gap-2 shadow-xs cursor-pointer"
                >
                  {isLoading ? <LoadingSpinner size={16} className="text-white" /> : <Search className="h-4 w-4" />}
                  {isLoading ? "Filtering…" : "Apply Filters"}
                </Button>
                {hasSearched && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClear}
                    className="h-9.5 px-4 text-sm font-medium text-slate-600 border-slate-300 hover:bg-slate-100 hover:text-slate-900 gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Error */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{loadError}</p>
          <button onClick={() => setLoadError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Initial prompt */}
      {!hasSearched && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
              <ShoppingCart className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">Search for sales transactions</p>
              <p className="text-xs text-gray-400 mt-1">Use the filters above to search by date, invoice number, or customer name</p>
            </div>
            <Button onClick={() => load({ date_from: dateFrom, date_to: dateTo })}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 mt-1">
              <ShoppingCart className="h-4 w-4" /> Load Today's Sales
            </Button>
          </div>
        </div>
      )}

      {/* Results table */}
      {hasSearched && (
        <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Invoice No.</th>
                  <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Customer</th>
                  <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Cashier</th>
                  <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Date & Time</th>
                  <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-right">Total Amount</th>
                  <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                      <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-3.5 px-5"><Skeleton className="h-4 w-28" /></td>
                      <td className="py-3.5 px-5"><Skeleton className="h-4 w-16" /></td>
                      <td className="py-3.5 px-5"><Skeleton className="h-4 w-12" /></td>
                    </tr>
                  ))
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                          <ShoppingCart className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="font-bold text-slate-700">No sales transactions found</p>
                        <p className="text-xs text-slate-400">Try adjusting your search criteria or date filters</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                          {sale.invoice_number}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 font-bold text-slate-900">{sale.customer_name || "Walk-in Customer"}</td>
                      <td className="py-3.5 px-5 text-slate-600 text-sm font-medium">{sale.cashier_name}</td>
                      <td className="py-3.5 px-5 text-sm text-slate-500">{fmtDate(sale.created_at)}</td>
                      <td className="py-3.5 px-5 text-right font-bold text-slate-900 tabular-nums">
                        <span className={`font-mono text-sm ${sale.void_status === "voided" ? "line-through text-slate-400" : "text-slate-900"}`}>
                          {fmt(sale.total_amount)}
                        </span>
                        {sale.void_status === "voided" && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                            VOIDED
                          </span>
                        )}
                        {sale.void_status === "void_requested" && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            PENDING VOID
                          </span>
                        )}
                        {sale.payment_type === "CREDIT" && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            CREDIT
                          </span>
                        )}
                        {(sale.return_count ?? 0) > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            RETURN{(sale.return_count ?? 0) > 1 ? ` (${sale.return_count})` : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={() => setDetailInvoice(sale.invoice_number)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors mx-auto cursor-pointer"
                          title="View transaction receipt"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && sales.length > 0 && (
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-600 font-bold">
                {sales.length} transaction{sales.length !== 1 ? "s" : ""} recorded
              </p>
              <p className="text-xs text-slate-400 font-medium">Isra Hardware POS</p>
            </div>
          )}
        </div>
      )}

      <SaleDetailModal invoiceNumber={detailInvoice} onClose={() => setDetailInvoice(null)} />
    </div>
  );
}
