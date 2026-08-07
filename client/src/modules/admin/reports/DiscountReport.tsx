import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters } from "@/components/reports/GlobalReportFilter";
import ReportTable, { type Column, type SummaryRow } from "@/components/reports/ReportTable";
import { Download, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV } from "@/shared/utils/csvExport";

interface DiscountData {
  receipt_number: string;
  discount_name: string;
  discount_type: string;
  discount_amount: number;
  cashier: string;
  approved_by: string;
  created_at: string;
}

interface DiscountResponse {
  period: { date_from: string; date_to: string };
  data: DiscountData[];
  filters: {
    cashiers: Array<{ id: number; full_name: string }>;
    admins: Array<{ id: number; full_name: string }>;
  };
  generated_at: string;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPercent(n: number) {
  return Number(n).toLocaleString("en-PH") + "%";
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

export default function DiscountReport() {
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

  const [data, setData] = useState<DiscountData[]>([]);
  const [availableCashiers, setAvailableCashiers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [availableAdmins, setAvailableAdmins] = useState<Array<{ id: number; full_name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | "csv" | "print" | null>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
      };
      if (filters.cashierId) params.cashier_id = filters.cashierId;
      if (filters.approvedBy) params.approved_by = filters.approvedBy;

      const res = await axios.get<DiscountResponse>("/api/reports/discounts", {
        headers: authHeaders(),
        params,
      });
      setData(res.data.data);
      setAvailableCashiers(res.data.filters.cashiers);
      setAvailableAdmins(res.data.filters.admins);
    } catch (error) {
      console.error("Failed to load discount report:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReport();
  }, []);

  const columns: Column[] = [
    { key: "receipt_number", label: "Receipt #", sortable: true, align: "left" },
    { key: "discount_name", label: "Discount Name", sortable: true, align: "left" },
    { key: "discount_type", label: "Type", sortable: true, align: "left" },
    { key: "discount_amount", label: "Discount Amount", sortable: true, align: "right", format: fmt },
    { key: "cashier", label: "Cashier", sortable: true, align: "left" },
    { key: "approved_by", label: "Approved By", sortable: true, align: "left" },
    { key: "created_at", label: "Date & Time", sortable: true, align: "left", format: fmtDateTime },
  ];

  const summaryRows: SummaryRow[] = [
    {
      label: "TOTAL",
      values: {
        receipt_number: "",
        discount_name: "",
        discount_type: "",
        discount_amount: data.reduce((sum, r) => sum + Number(r.discount_amount), 0),
        cashier: "",
        approved_by: "",
        created_at: "",
      },
    },
  ];

  const handleExport = async (type: "pdf" | "excel" | "csv" | "print") => {
    setExporting(type);
    try {
      if (type === "csv") {
        exportToCSV(
          data,
          `Discount_Report_${filters.dateFrom}_to_${filters.dateTo}`,
          columns.map(c => ({ key: c.key as keyof DiscountData, label: c.label }))
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
          <h1 className="text-2xl font-bold text-gray-900">Discount Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Discount applications and approvals</p>
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
        availableCashiers={availableCashiers}
        showCashierFilter
        showApprovedByFilter
      />

      <ReportTable
        columns={columns}
        data={data}
        loading={isLoading}
        emptyMessage="No discount data found"
        summaryRows={summaryRows}
        pageSize={50}
      />
    </div>
  );
}
