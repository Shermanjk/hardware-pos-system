import { Button } from "@/components/ui/button";
import GlobalReportFilter, { type ReportFilters } from "@/components/reports/GlobalReportFilter";
import ReportTable, { type Column, type ReportTableRef } from "@/components/reports/ReportTable";
import ReportHeader from "@/components/reports/ReportHeader";
import ReportTemplate from "@/components/reports/ReportTemplate";
import { Download, FileText, Table2 } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { exportToCSV, exportToExcel, exportToPDF, printReport, type ReportInfo, type ExportData } from "@/shared/utils/reportExport";
import { getSettings } from "@/shared/api/settingsApi";

interface AuditLogData {
  action_type: string;
  user: string;
  details: string;
  date_time: string;
}

interface AuditLogResponse {
  period: { date_from: string; date_to: string };
  data: AuditLogData[];
  filters: {
    users: Array<{ id: number; full_name: string }>;
    action_types: Array<{ value: string; label: string }>;
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

export default function AuditLogReport() {
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

  const [data, setData] = useState<AuditLogData[]>([]);
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [availableActionTypes, setAvailableActionTypes] = useState<Array<{ value: string; label: string }>>([]);
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
      if (filters.cashierId) params.user_id = filters.cashierId;
      if (filters.actionType !== "all") params.action_type = filters.actionType;

      const res = await axios.get<AuditLogResponse>("/api/reports/audit-logs", {
        headers: authHeaders(),
        params,
      });
      setData(res.data.data);
      setAvailableUsers(res.data.filters.users);
      setAvailableActionTypes(res.data.filters.action_types);
    } catch (error) {
      console.error("Failed to load audit log report:", error);
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
    // Load store settings
    getSettings().then(settings => {
      setStoreSettings(settings);
    }).catch(err => {
      console.error('Failed to load store settings:', err);
    });
  }, []);

  const columns: Column[] = [
    { key: "action_type", label: "Action Type", sortable: true, align: "left" },
    { key: "user", label: "User", sortable: true, align: "left" },
    { key: "details", label: "Details", sortable: true, align: "left" },
    { key: "date_time", label: "Date & Time", sortable: true, align: "left", format: fmtDateTime },
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
        summaryRows: [],
      };

      const storeSettings = await getSettings();
      const reportInfo: ReportInfo = {
        title: "Audit Log Report",
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
          title="Audit Log Report"
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          filters={filters}
          generatedBy={currentUser?.full_name || 'Admin'}
          storeSettings={storeSettings || { store_name: '', address: '', contact_number: '', tin: '', business_license: '', vat_registered: false }}
          columns={columns}
          data={tableRef.current?.getExportData() || data}
          summaryRows={[]}
        />
      ) : (
        <div className="space-y-5 report-container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Audit Log Report</h1>
              <p className="text-sm text-gray-500 mt-0.5">System activity and audit trail</p>
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
            availableCashiers={availableUsers}
            showCashierFilter
            showActionTypeFilter
            actionTypeOptions={availableActionTypes}
          />

          <ReportHeader
            title="Audit Log Report"
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
            emptyMessage="No audit log data found"
            pageSize={50}
          />
        </div>
      )}
    </>
  );
}
