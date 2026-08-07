import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters, type QuickDateFilter } from "@/components/reports/GlobalReportFilter";
import ReportTable, { type Column, type SummaryRow, type ReportTableRef } from "@/components/reports/ReportTable";
import ReportHeader from "@/components/reports/ReportHeader";
import { Download, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV, exportToExcel, exportToPDF, printReport, type ReportInfo, type ExportData } from "@/shared/utils/reportExport";
import { getSettings } from "@/shared/api/settingsApi";
import "@/styles/print.css";

interface SalesData {
  receipt_number: string;
  date_time: string;
  customer_name: string;
  cashier: string;
  gross_sales: number;
  discounts: number;
  returns: number;
  voids: number;
  net_sales: number;
}

interface SalesReportResponse {
  period: { date_from: string; date_to: string };
  data: SalesData[];
  filters: { cashiers: Array<{ id: number; full_name: string }> };
  generated_at: string;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SalesReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: monthStart,
    dateTo: today,
    quickDateFilter: "this_month",
    cashierId: "",
    status: "all",
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

  const [data, setData] = useState<SalesData[]>([]);
  const [availableCashiers, setAvailableCashiers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | "csv" | "print" | null>(null);
  const [currentUser, setCurrentUser] = useState<{ full_name: string } | null>(null);
  const tableRef = useRef<ReportTableRef>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
      };
      if (filters.cashierId) params.cashier_id = filters.cashierId;
      if (filters.status !== "all") params.status = filters.status;
      if (filters.search) params.search = filters.search;

      const res = await axios.get<SalesReportResponse>("/api/reports/sales", {
        headers: authHeaders(),
        params,
      });
      setData(res.data.data);
      setAvailableCashiers(res.data.filters.cashiers);
    } catch (error) {
      console.error("Failed to load sales report:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReport();
    // Load current user info
    const token = loadToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUser({ full_name: payload.full_name || 'Admin' });
      } catch (e) {
        setCurrentUser({ full_name: 'Admin' });
      }
    }
  }, []);

  const columns: Column[] = [
    { key: "receipt_number", label: "Receipt #", sortable: true, align: "left" },
    { key: "date_time", label: "Date & Time", sortable: true, align: "left", format: fmtDateTime },
    { key: "customer_name", label: "Customer", sortable: true, align: "left" },
    { key: "cashier", label: "Cashier", sortable: true, align: "left" },
    { key: "gross_sales", label: "Gross Sales", sortable: true, align: "right", format: fmt },
    { key: "discounts", label: "Discounts", sortable: true, align: "right", format: fmt },
    { key: "returns", label: "Returns", sortable: true, align: "right", format: fmt },
    { key: "voids", label: "Voids", sortable: true, align: "right", format: fmt },
    { key: "net_sales", label: "Net Sales", sortable: true, align: "right", format: fmt },
  ];

  const summaryRows: SummaryRow[] = [
    {
      label: "TOTAL",
      values: {
        receipt_number: "",
        date_time: "",
        customer_name: "",
        cashier: "",
        gross_sales: data.reduce((sum, r) => sum + Number(r.gross_sales), 0),
        discounts: data.reduce((sum, r) => sum + Number(r.discounts), 0),
        returns: data.reduce((sum, r) => sum + Number(r.returns), 0),
        voids: data.reduce((sum, r) => sum + Number(r.voids), 0),
        net_sales: data.reduce((sum, r) => sum + Number(r.net_sales), 0),
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

      const storeSettings = await getSettings();
      const reportInfo: ReportInfo = {
        title: "Sales Report",
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        filters: { ...filters },
        generatedBy: currentUser?.full_name || 'Admin',
        storeSettings,
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
          printReport();
          break;
      }
    } catch (error) {
      console.error(`Export failed for ${type}:`, error);
      alert(`Failed to export as ${type}. Please try again.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5 report-container">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Detailed sales transaction report</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 h-9 text-sm border-gray-300"
            onClick={() => handleExport("csv")}
            disabled={!!exporting || data.length === 0}
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            className="gap-2 h-9 text-sm border-gray-300"
            onClick={() => handleExport("print")}
            disabled={!!exporting || data.length === 0}
          >
            <Download className="h-4 w-4" />
            Print
          </Button>
          <Button
            variant="outline"
            className="gap-2 h-9 text-sm text-emerald-700 border-gray-300 hover:bg-emerald-50"
            onClick={() => handleExport("excel")}
            disabled={!!exporting || data.length === 0}
          >
            <Table2 className="h-4 w-4" />
            Excel
          </Button>
          <Button
            className="gap-2 h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => handleExport("pdf")}
            disabled={!!exporting || data.length === 0}
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <GlobalReportFilter
        filters={filters}
        onFiltersChange={setFilters}
        onGenerate={loadReport}
        isLoading={isLoading}
        availableCashiers={availableCashiers}
        showCashierFilter
        showStatusFilter
        showSearchFilter
        searchPlaceholder="Search receipt or customer..."
      />

      {/* Report Header */}
      <ReportHeader
        title="Sales Report"
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        filters={filters}
        generatedBy={currentUser?.full_name || 'Admin'}
        totalRecords={data.length}
      />

      {/* Report Table */}
      <ReportTable
        ref={tableRef}
        columns={columns}
        data={data}
        loading={isLoading}
        emptyMessage="No sales data found for the selected filters"
        summaryRows={summaryRows}
        pageSize={50}
      />
    </div>
  );
}
