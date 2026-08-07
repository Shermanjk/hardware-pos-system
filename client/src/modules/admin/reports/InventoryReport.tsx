import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters } from "@/components/reports/GlobalReportFilter";
import ReportTable, { type Column, type SummaryRow } from "@/components/reports/ReportTable";
import { Download, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV } from "@/shared/utils/csvExport";

interface InventoryData {
  id: number;
  barcode: string;
  product_name: string;
  category: string;
  supplier: string;
  beginning_stock: number;
  stock_in: number;
  stock_out: number;
  ending_stock: number;
}

interface InventoryReportResponse {
  period: { date_from: string; date_to: string };
  data: InventoryData[];
  filters: {
    categories: Array<{ id: number; category_name: string }>;
    suppliers: Array<{ id: number; supplier_name: string }>;
    products: Array<{ id: number; product_name: string }>;
  };
  generated_at: string;
}

function fmt(n: number) {
  return Number(n).toLocaleString("en-PH");
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function InventoryReport() {
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

  const [data, setData] = useState<InventoryData[]>([]);
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: number; category_name: string }>>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<Array<{ id: number; supplier_name: string }>>([]);
  const [availableProducts, setAvailableProducts] = useState<Array<{ id: number; product_name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | "csv" | "print" | null>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
      };
      if (filters.categoryId) params.category_id = filters.categoryId;
      if (filters.supplierId) params.supplier_id = filters.supplierId;
      if (filters.productId) params.product_id = filters.productId;

      const res = await axios.get<InventoryReportResponse>("/api/reports/inventory", {
        headers: authHeaders(),
        params,
      });
      setData(res.data.data);
      setAvailableCategories(res.data.filters.categories);
      setAvailableSuppliers(res.data.filters.suppliers);
      setAvailableProducts(res.data.filters.products);
    } catch (error) {
      console.error("Failed to load inventory report:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReport();
  }, []);

  const columns: Column[] = [
    { key: "barcode", label: "Barcode", sortable: true, align: "left" },
    { key: "product_name", label: "Product", sortable: true, align: "left" },
    { key: "category", label: "Category", sortable: true, align: "left" },
    { key: "supplier", label: "Supplier", sortable: true, align: "left" },
    { key: "beginning_stock", label: "Beginning Stock", sortable: true, align: "right", format: fmt },
    { key: "stock_in", label: "Stock In", sortable: true, align: "right", format: fmt },
    { key: "stock_out", label: "Stock Out", sortable: true, align: "right", format: fmt },
    { key: "ending_stock", label: "Ending Stock", sortable: true, align: "right", format: fmt },
  ];

  const summaryRows: SummaryRow[] = [
    {
      label: "TOTAL",
      values: {
        barcode: "",
        product_name: "",
        category: "",
        supplier: "",
        beginning_stock: data.reduce((sum, r) => sum + Number(r.beginning_stock), 0),
        stock_in: data.reduce((sum, r) => sum + Number(r.stock_in), 0),
        stock_out: data.reduce((sum, r) => sum + Number(r.stock_out), 0),
        ending_stock: data.reduce((sum, r) => sum + Number(r.ending_stock), 0),
      },
    },
  ];

  const handleExport = async (type: "pdf" | "excel" | "csv" | "print") => {
    setExporting(type);
    try {
      if (type === "csv") {
        exportToCSV(
          data,
          `Inventory_Report_${filters.dateFrom}_to_${filters.dateTo}`,
          columns.map(c => ({ key: c.key as keyof InventoryData, label: c.label }))
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock movement and inventory levels</p>
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

      {/* Filters */}
      <GlobalReportFilter
        filters={filters}
        onFiltersChange={setFilters}
        onGenerate={loadReport}
        isLoading={isLoading}
        availableCategories={availableCategories}
        availableSuppliers={availableSuppliers}
        availableProducts={availableProducts}
        showCategoryFilter
        showSupplierFilter
        showProductFilter
      />

      {/* Report Table */}
      <ReportTable
        columns={columns}
        data={data}
        loading={isLoading}
        emptyMessage="No inventory data found for the selected filters"
        summaryRows={summaryRows}
        pageSize={50}
      />
    </div>
  );
}
