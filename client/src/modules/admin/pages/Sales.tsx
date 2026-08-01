import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, RefreshCw, X, AlertCircle, ShoppingCart,
  Eye, Calendar, ChevronDown, ChevronUp, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { searchSales, getSaleByInvoice } from "@/shared/api/salesApi";
import type { SaleSummary, Sale } from "@/shared/api/salesApi";
import axios from "axios";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";

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

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
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
  const [sale,    setSale]    = useState<Sale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceNumber) { setSale(null); return; }
    setLoading(true);
    setError(null);
    getSaleByInvoice(invoiceNumber)
      .then(setSale)
      .catch((err) => setError(extractError(err)))
      .finally(() => setLoading(false));
  }, [invoiceNumber]);

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
        <div className="flex items-center gap-3 px-6 py-4 bg-slate-700 rounded-t-lg shrink-0">
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
              <Spinner className="text-blue-500" /> Loading sale details…
            </div>
          )}

          {error && (
            <div className="mx-6 mt-5 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {sale && !loading && (() => {
            const effectiveTaxRate = sale.total_amount > 0 && sale.vat_amount > 0
              ? Math.round((sale.vat_amount / (sale.total_amount - sale.vat_amount)) * 100)
              : 0;
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
                <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span><span className="tabular-nums">{fmt(sale.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>VAT ({effectiveTaxRate}%)</span><span className="tabular-nums">{fmt(sale.vat_amount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base text-gray-900 pt-2 border-t-2 border-gray-200">
                    <span>Total</span><span className="tabular-nums text-blue-600 text-lg">{fmt(sale.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 pt-1 border-t border-gray-100">
                    <span>Cash Tendered</span><span className="tabular-nums">{fmt(sale.cash_tendered)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Change</span><span className="tabular-nums">{fmt(sale.change_amount)}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
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

  // Filters
  const [invoice,      setInvoice]      = useState("");
  const [customer,     setCustomer]     = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [showFilters,  setShowFilters]  = useState(true);

  // Detail modal
  const [detailInvoice, setDetailInvoice] = useState<string | null>(null);

  // Summary stats (computed from loaded results)
  const totalRevenue = sales.filter((s) => s.void_status !== "voided").reduce((s, r) => s + Number(r.total_amount), 0);

  // Default date range to today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setDateFrom(today);
    setDateTo(today);
  }, []);

  const load = useCallback(async (params: {
    invoice_number?: string;
    customer_name?: string;
    date_from?: string;
    date_to?: string;
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load({
      invoice_number: invoice.trim() || undefined,
      customer_name:  customer.trim() || undefined,
      date_from:      dateFrom || undefined,
      date_to:        dateTo   || undefined,
    });
  };

  const handleClear = () => {
    setInvoice(""); setCustomer("");
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

      {/* Search filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            Search / Filter Sales
          </div>
          {showFilters ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        {showFilters && (
          <form onSubmit={handleSearch} className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Invoice No.</Label>
                <Input value={invoice} onChange={(e) => setInvoice(e.target.value)}
                  placeholder="e.g. INV-20250120-0001" className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Customer Name</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Search by customer…" className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Date From</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 text-sm pl-8" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Date To</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 text-sm pl-8" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 text-sm gap-2">
                {isLoading ? <Spinner className="text-white" /> : <Search className="h-4 w-4" />}
                {isLoading ? "Searching…" : "Search"}
              </Button>
              {hasSearched && (
                <Button type="button" variant="outline" onClick={handleClear}
                  className="h-9 px-4 text-sm text-gray-600 border-gray-300 hover:bg-gray-100 gap-1.5">
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Invoice No.</th>
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Customer</th>
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Cashier</th>
                  <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Date & Time</th>
                  <th className="text-right py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Total</th>
                  <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={6} className="py-20 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Spinner className="text-blue-500" /><span className="text-sm">Loading sales…</span>
                    </div>
                  </td></tr>
                ) : sales.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                        <ShoppingCart className="h-6 w-6 text-gray-400" />
                      </div>
                      <p className="font-semibold text-gray-700">No sales found</p>
                      <p className="text-xs text-gray-400">Try adjusting your search filters</p>
                    </div>
                  </td></tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          {sale.invoice_number}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 font-medium text-gray-900">{sale.customer_name}</td>
                      <td className="py-3.5 px-5 text-gray-600 text-sm">{sale.cashier_name}</td>
                      <td className="py-3.5 px-5 text-sm text-gray-500">{fmtDate(sale.created_at)}</td>
                      <td className="py-3.5 px-5 text-right font-bold text-gray-900 tabular-nums">
                        <span className={sale.void_status === "voided" ? "line-through text-gray-400" : ""}>{fmt(sale.total_amount)}</span>
                        {sale.void_status === "voided" && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-600">VOID</span>
                        )}
                        {sale.void_status === "void_requested" && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">PENDING VOID</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={() => setDetailInvoice(sale.invoice_number)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors mx-auto"
                          title="View details"
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
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">
                {sales.length} transaction{sales.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs font-semibold text-emerald-600 tabular-nums">
                Total: {fmt(totalRevenue)}
              </p>
            </div>
          )}
        </div>
      )}

      <SaleDetailModal invoiceNumber={detailInvoice} onClose={() => setDetailInvoice(null)} />
    </div>
  );
}
