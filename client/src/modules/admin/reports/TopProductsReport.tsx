import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters } from "@/components/reports/GlobalReportFilter";
import ReportTable, { type Column, type SummaryRow, type ReportTableRef } from "@/components/reports/ReportTable";
import ReportHeader from "@/components/reports/ReportHeader";
import { Download, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV, exportToExcel, exportToPDF, printReport, type ReportInfo, type ExportData } from "@/shared/utils/reportExport";
import { getSettings } from "@/shared/api/settingsApi";
import "@/styles/print.css";

interface TopProductsData {
  product_name: string;
  category: string;
  quantity_sold: number;
  revenue: number;
  ranking: number;
}

interface TopProductsResponse {
  period: { date_from: string; date_to: string };
  data: TopProductsData[];
  filters: {
    categories: Array<{ id: number; category_name: string }>;
  };
  generated_at: string;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number) {
  return Number(n).toLocaleString("en-PH");
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function TopProductsReport() {
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

  const [data, setData] = useState<TopProductsData[]>([]);
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: number; category_name: string }>>([]);
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
      if (filters.categoryId) params.category_id = filters.categoryId;

      const res = await axios.get<TopProductsResponse>("/api/reports/top-products", {
        headers: authHeaders(),
        params,
      });
      setData(res.data.data);
      setAvailableCategories(res.data.filters.categories);
    } catch (error) {
      console.error("Failed to load top products report:", error);
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
  }, []);

  const columns: Column[] = [
    { key: "ranking", label: "#", sortable: true, align: "center" },
    { key: "product_name", label: "Product", sortable: true, align: "left" },
    { key: "category", label: "Category", sortable: true, align: "left" },
    { key: "quantity_sold", label: "Quantity Sold", sortable: true, align: "right", format: fmtQty },
    { key: "revenue", label: "Revenue", sortable: true, align: "right", format: fmt },
  ];

  const summaryRows: SummaryRow[] = [
    {
      label: "TOTAL",
      values: {
        ranking: "",
        product_name: "",
        category: "",
        quantity_sold: data.reduce((sum, r) => sum + Number(r.quantity_sold), 0),
        revenue: data.reduce((sum, r) => sum + Number(r.revenue), 0),
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
        title: "Top Selling Products Report",
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Top Selling Products Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Best performing products by sales volume</p>
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
        availableCategories={availableCategories}
        showCategoryFilter
      />

      <ReportHeader
        title="Top Selling Products Report"
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
        emptyMessage="No top products data found"
        summaryRows={summaryRows}
        pageSize={50}
      />
    </div>
  );
}
