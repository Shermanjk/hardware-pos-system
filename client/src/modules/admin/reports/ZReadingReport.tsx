import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  createZReading,
  downloadESalesCsv,
  getZReadingPreview,
  getZReadings,
  type ZReadingPreviewData,
  type ZReadingRecord,
} from "@/shared/api/birApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { formatZReadingText, printThermalMonospace } from "@/shared/utils/birReceiptFormatter";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  History,
  PlayCircle,
  Printer,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function fmt(n: number | string | null | undefined) {
  return "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(d: string) {
  if (!d) return "N/A";
  return new Date(d).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ZReadingReport() {
  const [preview, setPreview] = useState<ZReadingPreviewData | null>(null);
  const [history, setHistory] = useState<ZReadingRecord[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showESalesModal, setShowESalesModal] = useState(false);

  const [esalesMonth, setEsalesMonth] = useState(new Date().getMonth() + 1);
  const [esalesYear, setEsalesYear] = useState(new Date().getFullYear());
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [prevData, histData, settingsData] = await Promise.all([
        getZReadingPreview().catch(() => null),
        getZReadings().catch(() => []),
        getSettings().catch(() => null),
      ]);
      setPreview(prevData || null);
      setHistory(Array.isArray(histData) ? histData : []);
      setStoreSettings(settingsData || null);
    } catch (err) {
      console.error("Load Z-Reading error:", err);
      toast.error("Failed to load Z-Reading data.");
      setHistory([]);
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateZReading = async () => {
    setIsGenerating(true);
    try {
      const res = await createZReading();
      toast.success(`Z-Reading #${res.z_counter_formatted} successfully committed!`);
      setShowConfirmModal(false);

      // Auto-fetch latest and print
      await loadData();

      // Print thermal receipt
      if (preview && storeSettings) {
        const printText = formatZReadingText({
          zCounterNo: res.z_counter_no,
          resetCounterNo: res.reset_counter_no,
          readingDate: preview.reading_date,
          openedAt: preview.opened_at,
          closedAt: new Date(),
          generatedByName: "Authorized Admin",
          begInvoiceNo: preview.beg_invoice_no,
          endInvoiceNo: preview.end_invoice_no,
          begVoidNo: preview.beg_void_no,
          endVoidNo: preview.end_void_no,
          begReturnNo: preview.beg_return_no,
          endReturnNo: preview.end_return_no,
          oldGrandTotal: res.old_grand_total,
          dailyGrossSales: res.daily_gross_sales,
          newGrandTotal: res.new_grand_total,
          vatableSales: preview.vatable_sales,
          vatAmount: preview.vat_amount,
          vatExemptSales: preview.vat_exempt_sales,
          zeroRatedSales: preview.zero_rated_sales,
          nonVatSales: preview.non_vat_sales,
          scDiscount: preview.sc_discount,
          pwdDiscount: preview.pwd_discount,
          regularDiscount: preview.regular_discount,
          totalDiscounts: preview.total_discounts,
          totalReturns: preview.total_returns,
          totalVoids: preview.total_voids,
          netSales: preview.net_sales,
          cashSales: preview.cash_sales,
          creditSales: preview.credit_sales,
          transactionCount: preview.transaction_count,
          voidCount: preview.void_count,
          returnCount: preview.return_count,
          settings: storeSettings,
        });
        printThermalMonospace(printText);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to commit Z-Reading.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReprint = (z: ZReadingRecord) => {
    if (!storeSettings) return;
    try {
      const printText = formatZReadingText({
        zCounterNo: z.z_counter_no,
        resetCounterNo: z.reset_counter_no,
        readingDate: z.reading_date,
        openedAt: z.opened_at,
        closedAt: z.closed_at,
        generatedByName: z.generated_by_name || z.generated_by_username || "Admin",
        begInvoiceNo: z.beg_invoice_no,
        endInvoiceNo: z.end_invoice_no,
        begVoidNo: z.beg_void_no,
        endVoidNo: z.end_void_no,
        begReturnNo: z.beg_return_no,
        endReturnNo: z.end_return_no,
        oldGrandTotal: Number(z.old_grand_total),
        dailyGrossSales: Number(z.daily_gross_sales),
        newGrandTotal: Number(z.new_grand_total),
        vatableSales: Number(z.vatable_sales),
        vatAmount: Number(z.vat_amount),
        vatExemptSales: Number(z.vat_exempt_sales),
        zeroRatedSales: Number(z.zero_rated_sales),
        nonVatSales: Number(z.non_vat_sales),
        scDiscount: Number(z.sc_discount),
        pwdDiscount: Number(z.pwd_discount),
        regularDiscount: Number(z.regular_discount),
        totalDiscounts: Number(z.total_discounts),
        totalReturns: Number(z.total_returns),
        totalVoids: Number(z.total_voids),
        netSales: Number(z.net_sales),
        cashSales: Number(z.cash_sales),
        creditSales: Number(z.credit_sales),
        transactionCount: Number(z.transaction_count),
        voidCount: Number(z.void_count),
        returnCount: Number(z.return_count),
        settings: storeSettings,
      });
      printThermalMonospace(printText);
      toast.success(`Z-Reading #${z.z_counter_formatted} sent to printer.`);
    } catch (err) {
      toast.error("Failed to reprint Z-Reading.");
    }
  };

  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      await downloadESalesCsv(esalesMonth, esalesYear);
      toast.success(`eSales CSV for ${esalesMonth}/${esalesYear} exported!`);
      setShowESalesModal(false);
    } catch (err) {
      toast.error("Failed to export eSales CSV file.");
    } finally {
      setIsExportingCsv(false);
    }
  };

  return (
    <div className="space-y-6 report-container">
      {/* ── Top Actions Banner ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 p-4 bg-slate-900 text-white rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              BIR EOPT Compliance Portal
              <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-400/30">
                RR 7-2024
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              MIN: {storeSettings?.pos_min || "UNREGISTERED"} | S/N: {storeSettings?.pos_serial || "N/A"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowESalesModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            Export eSales CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setShowConfirmModal(true)}
            disabled={isLoading || isGenerating}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-1.5 shadow-md"
          >
            <PlayCircle className="h-4 w-4" />
            Generate Z-Reading
          </Button>
        </div>
      </div>

      {/* ── Real-Time Unread Accumulator Card ───────────────────────────────── */}
      {preview && (
        <div className="mb-8 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-900">Current Reading Window (Uncommitted Sales)</h3>
            </div>
            <div className="text-xs text-slate-500">
              Cutoff From: <span className="font-semibold text-slate-700">{fmtDateTime(preview.opened_at)}</span>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Box 1 */}
            <div className="p-4 rounded-lg bg-blue-50/60 border border-blue-100">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Next Z-Counter</span>
              <p className="text-2xl font-black text-blue-950 font-mono mt-1">#{preview.z_counter_formatted}</p>
              <p className="text-[11px] text-blue-600 mt-1">Reset Counter: {preview.reset_counter_no}</p>
            </div>

            {/* Box 2 */}
            <div className="p-4 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Unread Gross Sales</span>
              <p className="text-2xl font-black text-emerald-950 mt-1">{fmt(preview.daily_gross_sales)}</p>
              <p className="text-[11px] text-emerald-600 mt-1">{preview.transaction_count} transactions recorded</p>
            </div>

            {/* Box 3 */}
            <div className="p-4 rounded-lg bg-purple-50/60 border border-purple-100">
              <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Previous Grand Total</span>
              <p className="text-2xl font-black text-purple-950 mt-1">{fmt(preview.old_grand_total)}</p>
              <p className="text-[11px] text-purple-600 mt-1">Non-resettable base</p>
            </div>

            {/* Box 4 */}
            <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-100">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Projected New Grand Total</span>
              <p className="text-2xl font-black text-amber-950 mt-1">{fmt(preview.new_grand_total)}</p>
              <p className="text-[11px] text-amber-700 mt-1 font-semibold">Strict cumulative sum</p>
            </div>
          </div>

          {/* Tax Breakdown Grid */}
          <div className="px-5 pb-5 pt-1 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
              <span className="text-slate-500 block">VATable Sales (Net)</span>
              <span className="font-bold text-slate-800 text-sm">{fmt(preview.vatable_sales)}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
              <span className="text-slate-500 block">12% Output VAT</span>
              <span className="font-bold text-slate-800 text-sm">{fmt(preview.vat_amount)}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
              <span className="text-slate-500 block">VAT-Exempt (SC/PWD)</span>
              <span className="font-bold text-slate-800 text-sm">{fmt(preview.vat_exempt_sales)}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
              <span className="text-slate-500 block">Total Deductions</span>
              <span className="font-bold text-red-600 text-sm">
                - {fmt(preview.total_discounts + preview.total_returns + preview.total_voids)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Historical Z-Readings Table ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-900">Historical Z-Reading Audit Trail</h3>
          </div>
          <span className="text-xs text-slate-500">{(history || []).length} records found</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                <th className="py-3 px-3">Z-No.</th>
                <th className="py-3 px-3">Reset</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Invoices (Beg - End)</th>
                <th className="py-3 px-3 text-right">Gross Sales</th>
                <th className="py-3 px-3 text-right">Old Grand Total</th>
                <th className="py-3 px-3 text-right font-bold text-blue-900">New Grand Total</th>
                <th className="py-3 px-3 text-right">VATable</th>
                <th className="py-3 px-3 text-right">12% VAT</th>
                <th className="py-3 px-3 text-right">Net Sales</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(history || []).length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    No Z-Readings generated yet. Click "Generate Z-Reading" above to create the first record.
                  </td>
                </tr>
              ) : (
                (history || []).map((z) => (
                  <tr key={z.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-blue-700">#{z.z_counter_formatted}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{z.reset_counter_no}</td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      {new Date(z.reading_date).toLocaleDateString("en-PH", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                      {z.beg_invoice_no && z.end_invoice_no
                        ? `${z.beg_invoice_no} → ${z.end_invoice_no}`
                        : "No Invoices"}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-900">{fmt(z.daily_gross_sales)}</td>
                    <td className="py-3 px-3 text-right text-slate-600 font-mono">{fmt(z.old_grand_total)}</td>
                    <td className="py-3 px-3 text-right font-bold text-blue-900 font-mono bg-blue-50/40">
                      {fmt(z.new_grand_total)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">{fmt(z.vatable_sales)}</td>
                    <td className="py-3 px-3 text-right text-slate-700">{fmt(z.vat_amount)}</td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-700">{fmt(z.net_sales)}</td>
                    <td className="py-3 px-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReprint(z)}
                        className="h-7 px-2 text-[11px] gap-1 border-slate-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Reprint 80mm
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confirmation Modal for Generating Z-Reading ─────────────────────── */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirm Z-Reading Generation
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm text-slate-600">
            <p>
              Generating a <strong>Z-Reading</strong> creates an immutable, non-resettable BIR audit record.
            </p>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs space-y-1">
              <p className="font-bold">Important Audit Rules:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                <li>Increments Z-Counter to #{preview?.z_counter_formatted}</li>
                <li>Appends {fmt(preview?.daily_gross_sales)} to the Grand Total</li>
                <li>Closes the current reading window permanently</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirmModal(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              onClick={handleGenerateZReading}
              disabled={isGenerating}
            >
              {isGenerating ? "Committing Z-Reading…" : "Confirm & Commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export eSales CSV Modal ────────────────────────────────────────── */}
      <Dialog open={showESalesModal} onOpenChange={setShowESalesModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Export BIR eSales CSV File
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-600">
              Select the reporting period to generate the official BIR eSales Monthly Sales Report (.CSV) for machine MIN:{" "}
              <strong className="text-slate-900">{storeSettings?.pos_min || "000000000000"}</strong>.
            </p>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1 text-slate-600">
              <p className="font-semibold text-slate-800">BIR eSales Format Specifications:</p>
              <p className="font-mono text-[11px] text-slate-700">TIN, Branch, Month, Year, MIN, End Invoice, Gross Sales</p>
              <p className="text-slate-500 italic">Strictly no header row, formatted for direct portal upload.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Month</label>
                <select
                  value={esalesMonth}
                  onChange={(e) => setEsalesMonth(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Year</label>
                <select
                  value={esalesYear}
                  onChange={(e) => setEsalesYear(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-slate-300 px-3 text-sm"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowESalesModal(false)} disabled={isExportingCsv}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
              onClick={handleExportCsv}
              disabled={isExportingCsv}
            >
              <Download className="h-4 w-4" />
              {isExportingCsv ? "Exporting…" : "Download .CSV File"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
