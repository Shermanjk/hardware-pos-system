import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters } from "@/components/reports/GlobalReportFilter";
import ReportHeader from "@/components/reports/ReportHeader";
import ReportTable, { type Column, type SummaryRow, type ReportTableRef } from "@/components/reports/ReportTable";
import ReportTemplate from "@/components/reports/ReportTemplate";
import { Download, FileText, Table2, CreditCard } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV, exportToExcel, exportToPDF, type ReportInfo, type ExportData } from "@/shared/utils/reportExport";
import { getSettings } from "@/shared/api/settingsApi";

interface CustomerReceivableData {
  customer_code: string;
  full_name: string;
  contact_number: string;
  credit_limit: number;
  current_balance: number;
  current_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  last_credit_sale_date: string;
  last_payment_date: string;
}

interface CreditReceivablesReportResponse {
  period: { date_from: string; date_to: string };
  summary: {
    total_receivables: number;
    total_customers: number;
    customers_with_balance: number;
    credit_enabled_customers: number;
    period_credit_sales: number;
    period_payments: number;
    period_void_reversals: number;
    period_adjustments: number;
    aging_summary: {
      current_30: number;
      days_31_60: number;
      days_61_90: number;
      over_90: number;
    };
  };
  customers: Array<{
    id: number;
    customer_code: string;
    full_name: string;
    contact_number: string | null;
    credit_limit: number;
    current_balance: number;
    is_credit_enabled: boolean;
    status: string;
    created_at: string;
    last_credit_sale_date: string | null;
    last_payment_date: string | null;
    aging: {
      current_30: number;
      days_31_60: number;
      days_61_90: number;
      over_90: number;
    };
  }>;
  generated_at: string;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d || d === "—") return "—";
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function CreditReceivablesReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: monthStart,
    dateTo: today,
    quickDateFilter: "this_month",
    cashierId: "",
    status: "with_balance",
    categoryId: "",
    supplierId: "",
    productId: "",
    movementType: "all",
    resolution: "all",
    approvedBy: "",
    authorizationType: "all",
    actionType: "all",
    search: "",
  });

  const [data, setData] = useState<CustomerReceivableData[]>([]);
  const [summary, setSummary] = useState<CreditReceivablesReportResponse["summary"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | "csv" | "print" | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ full_name: string } | null>(null);
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const tableRef = useRef<ReportTableRef>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
      };
      if (filters.status && filters.status !== "all") params.status = filters.status;

      const res = await axios.get<CreditReceivablesReportResponse>("/api/reports/credit-receivables", {
        headers: authHeaders(),
        params,
      });

      const flattened: CustomerReceivableData[] = res.data.customers.map((c) => ({
        customer_code: c.customer_code,
        full_name: c.full_name,
        contact_number: c.contact_number || "—",
        credit_limit: c.is_credit_enabled ? c.credit_limit : 0,
        current_balance: c.current_balance,
        current_30: c.aging.current_30,
        days_31_60: c.aging.days_31_60,
        days_61_90: c.aging.days_61_90,
        over_90: c.aging.over_90,
        last_credit_sale_date: c.last_credit_sale_date ? c.last_credit_sale_date : "—",
        last_payment_date: c.last_payment_date ? c.last_payment_date : "—",
      }));

      setData(flattened);
      setSummary(res.data.summary);
    } catch (error) {
      console.error("Failed to load credit receivables report:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReport();
    const token = loadToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUser({ full_name: payload.full_name || 'Admin' });
      } catch (e) {
        setCurrentUser({ full_name: 'Admin' });
      }
    }
    getSettings().then(setStoreSettings).catch(() => {});
  }, [loadReport]);

  const columns: Column[] = [
    { key: "customer_code", label: "Customer Code", sortable: true, align: "left" },
    { key: "full_name", label: "Customer Name", sortable: true, align: "left" },
    { key: "contact_number", label: "Contact", sortable: true, align: "left" },
    { key: "credit_limit", label: "Credit Limit", sortable: true, align: "right", format: fmt },
    { key: "current_balance", label: "Outstanding Balance", sortable: true, align: "right", format: fmt },
    { key: "current_30", label: "0-30 Days", sortable: true, align: "right", format: fmt },
    { key: "days_31_60", label: "31-60 Days", sortable: true, align: "right", format: fmt },
    { key: "days_61_90", label: "61-90 Days", sortable: true, align: "right", format: fmt },
    { key: "over_90", label: ">90 Days (Past Due)", sortable: true, align: "right", format: fmt },
    { key: "last_credit_sale_date", label: "Last Sale", sortable: true, align: "left", format: fmtDate },
    { key: "last_payment_date", label: "Last Payment", sortable: true, align: "left", format: fmtDate },
  ];

  const summaryRows: SummaryRow[] = [
    {
      label: "TOTAL RECEIVABLES",
      values: {
        customer_code: "",
        full_name: "",
        contact_number: "",
        credit_limit: data.reduce((sum, r) => sum + Number(r.credit_limit), 0),
        current_balance: data.reduce((sum, r) => sum + Number(r.current_balance), 0),
        current_30: data.reduce((sum, r) => sum + Number(r.current_30), 0),
        days_31_60: data.reduce((sum, r) => sum + Number(r.days_31_60), 0),
        days_61_90: data.reduce((sum, r) => sum + Number(r.days_61_90), 0),
        over_90: data.reduce((sum, r) => sum + Number(r.over_90), 0),
        last_credit_sale_date: "",
        last_payment_date: "",
      },
    },
  ];

  const handleExport = async (type: "pdf" | "excel" | "csv" | "print") => {
    if (data.length === 0) {
      alert("No data available for export with current filters");
      return;
    }

    setExporting(type);
    try {
      const exportData: ExportData = {
        data: tableRef.current?.getExportData() || data,
        columns: tableRef.current?.getExportColumns() || columns,
        summaryRows: tableRef.current?.getSummaryData() || summaryRows,
      };

      const settings = await getSettings();
      const reportInfo: ReportInfo = {
        title: "Accounts Receivable & Utang Report",
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        filters: { ...filters },
        generatedBy: currentUser?.full_name || 'Admin',
        storeSettings: settings,
      };

      switch (type) {
        case "csv":
          exportToCSV(exportData, reportInfo);
          break;
        case "excel":
          await exportToExcel(exportData, reportInfo);
          break;
        case "pdf":
          exportToPDF(exportData, reportInfo);
          break;
        case "print":
          setPrintMode(true);
          setTimeout(() => {
            window.print();
            setTimeout(() => setPrintMode(false), 1000);
          }, 100);
          break;
      }
    } catch (error) {
      console.error(`Export failed for ${type}:`, error);
      alert(`Failed to export as ${type}. Please try again.`);
    } finally {
      if (type !== "print") {
        setExporting(null);
      }
    }
  };

  return (
    <>
      {printMode ? (
        <ReportTemplate
          title="Accounts Receivable & Utang Report"
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          filters={filters}
          generatedBy={currentUser?.full_name || 'Admin'}
          storeSettings={storeSettings || { store_name: '', address: '', contact_number: '', tin: '', business_license: '', vat_registered: false }}
          columns={columns}
          data={tableRef.current?.getExportData() || data}
          summaryRows={summaryRows}
        />
      ) : (
        <div className="space-y-5 report-container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-blue-600" />
                Accounts Receivable & Utang Report
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Customer credit balances, aging analysis, and payment collection tracking
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2 h-9 text-sm border-gray-300" onClick={() => handleExport("csv")} disabled={!!exporting || data.length === 0}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" className="gap-2 h-9 text-sm border-gray-300" onClick={() => handleExport("print")} disabled={!!exporting || data.length === 0}>
                <Download className="h-4 w-4" /> Print
              </Button>
              <Button variant="outline" className="gap-2 h-9 text-sm text-emerald-700 border-gray-300 hover:bg-emerald-50" onClick={() => handleExport("excel")} disabled={!!exporting || data.length === 0}>
                <Table2 className="h-4 w-4" /> Excel
              </Button>
              <Button className="gap-2 h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleExport("pdf")} disabled={!!exporting || data.length === 0}>
                <FileText className="h-4 w-4" /> PDF
              </Button>
            </div>
          </div>

          <GlobalReportFilter
            filters={filters}
            onFiltersChange={setFilters}
            onGenerate={loadReport}
            isLoading={isLoading}
            showStatusFilter
            statusOptions={[
              { value: "with_balance", label: "With Outstanding Balance" },
              { value: "all", label: "All Accounts" },
              { value: "active", label: "Active Customers" },
            ]}
          />

          {/* ── Summary & Aging Breakdown Cards ─────────────────────────────── */}
          {summary && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Total Accounts Receivable</p>
                  <p className="text-2xl font-bold text-rose-600 mt-1">{fmt(summary.total_receivables)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{summary.customers_with_balance} customer(s) with balance</p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Period Credit Sales</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{fmt(summary.period_credit_sales)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Charged during selected dates</p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Period Collections</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(summary.period_payments)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Payments received in period</p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Credit Customer Base</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{summary.credit_enabled_customers}</p>
                  <p className="text-xs text-slate-400 mt-0.5">of {summary.total_customers} total accounts</p>
                </div>
              </div>

              {/* Aging breakdown strip */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Accounts Receivable Aging Breakdown
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">Current (0-30 Days)</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(summary.aging_summary.current_30)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">31-60 Days</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{fmt(summary.aging_summary.days_31_60)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                    <p className="text-[11px] font-semibold text-amber-800">61-90 Days</p>
                    <p className="text-lg font-bold text-amber-700 mt-0.5">{fmt(summary.aging_summary.days_61_90)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-rose-200 bg-rose-50/50">
                    <p className="text-[11px] font-semibold text-rose-800">&gt;90 Days (Past Due)</p>
                    <p className="text-lg font-bold text-rose-700 mt-0.5">{fmt(summary.aging_summary.over_90)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <ReportHeader
            title="Accounts Receivable & Utang Report"
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            filters={filters}
            generatedBy={currentUser?.full_name || 'Admin'}
            totalRecords={data.length}
          />

          <ReportTable
            ref={tableRef}
            columns={columns}
            data={data}
            loading={isLoading}
            emptyMessage="No customer receivable records found"
            summaryRows={summaryRows}
            pageSize={50}
          />
        </div>
      )}
    </>
  );
}
