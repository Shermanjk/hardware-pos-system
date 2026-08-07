import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters } from "@/components/reports/GlobalReportFilter";
import ReportTable, { type Column, type SummaryRow } from "@/components/reports/ReportTable";
import { Download, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV } from "@/shared/utils/csvExport";

interface SupplierPurchaseData {
  supplier_name: string;
  purchase_date: string;
  products_purchased: number;
  total_cost: number;
}

interface SupplierPurchaseResponse {
  period: { date_from: string; date_to: string };
  data: SupplierPurchaseData[];
  filters: {
    suppliers: Array<{ id: number; supplier_name: string }>;
  };
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

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SupplierPurchaseReport() {
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

  const [data, setData] = useState<SupplierPurchaseData[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<Array<{ id: number; supplier_name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | "csv" | "print" | null>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
      };
      if (filters.supplierId) params.supplier_id = filters.supplierId;

      const res = await axios.get<SupplierPurchaseResponse>("/api/reports/supplier-purchases", {
        headers: authHeaders(),
        params,
      });
      setData(res.data.data);
      setAvailableSuppliers(res.data.filters.suppliers);
    } catch (error) {
      console.error("Failed to load supplier purchase report:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReport();
  }, []);

  const columns: Column[] = [
    { key: "supplier_name", label: "Supplier", sortable: true, align: "left" },
    { key: "purchase_date", label: "Purchase Date", sortable: true, align: "left", format: fmtDate },
    { key: "products_purchased", label: "Products Purchased", sortable: true, align: "right" },
    { key: "total_cost", label: "Total Cost", sortable: true, align: "right", format: fmt },
  ];

  const summaryRows: SummaryRow[] = [
    {
      label: "TOTAL",
      values: {
        supplier_name: "",
        purchase_date: "",
        products_purchased: data.reduce((sum, r) => sum + Number(r.products_purchased), 0),
        total_cost: data.reduce((sum, r) => sum + Number(r.total_cost), 0),
      },
    },
  ];

  const handleExport = async (type: "pdf" | "excel" | "csv" | "print") => {
    setExporting(type);
    try {
      if (type === "csv") {
        exportToCSV(
          data,
          `Supplier_Purchase_Report_${filters.dateFrom}_to_${filters.dateTo}`,
          columns.map(c => ({ key: c.key as keyof SupplierPurchaseData, label: c.label }))
        );
      } else if (type === "print") {
        window.print();
      } else {
        console.log(`Exporting as ${type} - implementation pending`);
      }
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplier Purchase Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Purchases from suppliers</p>
        </div>
        {data.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2 h-9 text-sm border-gray-300" onClick={() => handleExport("csv")} disabled={!!exporting}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" className="gap-2 h-9 text-sm border-gray-300" onClick={() => handleExport("print")} disabled={!!exporting}>
              <Download className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" className="gap-2 h-9 text-sm text-emerald-700 border-gray-300 hover:bg-emerald-50" onClick={() => handleExport("excel")} disabled={!!exporting}>
              <Table2 className="h-4 w-4" /> Excel
            </Button>
            <Button className="gap-2 h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleExport("pdf")} disabled={!!exporting}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        )}
      </div>

      <GlobalReportFilter
        filters={filters}
        onFiltersChange={setFilters}
        onGenerate={loadReport}
        isLoading={isLoading}
        availableSuppliers={availableSuppliers}
        showSupplierFilter
      />

      <ReportTable
        columns={columns}
        data={data}
        loading={isLoading}
        emptyMessage="No supplier purchase data found"
        summaryRows={summaryRows}
        pageSize={50}
      />
    </div>
  );
}
