import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters } from "@/components/reports/GlobalReportFilter";
import ReportTable, { type Column } from "@/components/reports/ReportTable";
import { Download, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV } from "@/shared/utils/csvExport";

interface AuthorizationData {
  authorization_id: number;
  authorization_type: string;
  cashier: string;
  admin: string;
  decision: string;
  reference_number: string;
  reason: string;
  date_time: string;
}

interface AuthorizationResponse {
  period: { date_from: string; date_to: string };
  data: AuthorizationData[];
  filters: {
    cashiers: Array<{ id: number; full_name: string }>;
    admins: Array<{ id: number; full_name: string }>;
  };
  generated_at: string;
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

export default function AuthorizationHistoryReport() {
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

  const [data, setData] = useState<AuthorizationData[]>([]);
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
      if (filters.authorizationType !== "all") params.authorization_type = filters.authorizationType;
      if (filters.cashierId) params.cashier_id = filters.cashierId;
      if (filters.approvedBy) params.approved_by = filters.approvedBy;

      const res = await axios.get<AuthorizationResponse>("/api/reports/authorization-history", {
        headers: authHeaders(),
        params,
      });
      setData(res.data.data);
      setAvailableCashiers(res.data.filters.cashiers);
      setAvailableAdmins(res.data.filters.admins);
    } catch (error) {
      console.error("Failed to load authorization history report:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReport();
  }, []);

  const columns: Column[] = [
    { key: "authorization_id", label: "Auth ID", sortable: true, align: "left" },
    { key: "authorization_type", label: "Authorization Type", sortable: true, align: "left" },
    { key: "cashier", label: "Cashier", sortable: true, align: "left" },
    { key: "admin", label: "Admin", sortable: true, align: "left" },
    { key: "decision", label: "Decision", sortable: true, align: "left" },
    { key: "reference_number", label: "Reference #", sortable: true, align: "left" },
    { key: "reason", label: "Reason", sortable: true, align: "left" },
    { key: "date_time", label: "Date & Time", sortable: true, align: "left", format: fmtDateTime },
  ];

  const handleExport = async (type: "pdf" | "excel" | "csv" | "print") => {
    setExporting(type);
    try {
      if (type === "csv") {
        exportToCSV(
          data,
          `Authorization_History_Report_${filters.dateFrom}_to_${filters.dateTo}`,
          columns.map(c => ({ key: c.key as keyof AuthorizationData, label: c.label }))
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
          <h1 className="text-2xl font-bold text-gray-900">Authorization History Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Admin authorization requests and decisions</p>
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
        showAuthorizationTypeFilter
        showApprovedByFilter
      />

      <ReportTable
        columns={columns}
        data={data}
        loading={isLoading}
        emptyMessage="No authorization history data found"
        pageSize={50}
      />
    </div>
  );
}
