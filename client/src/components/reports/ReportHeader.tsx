import { useEffect, useState } from 'react';
import { StoreSettings, getSettings } from '@/shared/api/settingsApi';
import { formatDateLong, formatDateTimeLong } from '@/shared/utils/reportExport';
import { Building2, Calendar, FileText, UserCheck, Filter, Hash } from 'lucide-react';

interface ReportHeaderProps {
  title: string;
  dateFrom: string;
  dateTo: string;
  filters?: Record<string, any>;
  generatedBy?: string;
  totalRecords?: number;
}

export default function ReportHeader({
  title,
  dateFrom,
  dateTo,
  filters = {},
  generatedBy = 'Admin',
  totalRecords = 0,
}: ReportHeaderProps) {
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        setStoreSettings(settings);
      } catch (error) {
        console.error('Failed to load store settings:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
        <div className="h-6 bg-gray-200 animate-pulse rounded w-1/3 mb-2" />
        <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2" />
      </div>
    );
  }

  const storeName = storeSettings?.store_name || 'ISRA HARDWARE TRADING';
  const address = storeSettings?.address || 'General Santos City, Philippines';
  const contact = storeSettings?.contact_number || '—';
  const tin = storeSettings?.tin || '—';
  const vatStatus = storeSettings?.vat_registered ? 'VAT Registered' : 'Non-VAT';

  // Generate filter summary items
  const filterSummary: string[] = [];
  if (filters.dateFrom && filters.dateTo) {
    filterSummary.push(`Period: ${formatDateLong(filters.dateFrom)} - ${formatDateLong(filters.dateTo)}`);
  }
  if (filters.cashierId) filterSummary.push(`Cashier ID: ${filters.cashierId}`);
  if (filters.status && filters.status !== 'all') filterSummary.push(`Status: ${filters.status}`);
  if (filters.categoryId) filterSummary.push(`Category: ${filters.categoryId}`);
  if (filters.supplierId) filterSummary.push(`Supplier: ${filters.supplierId}`);
  if (filters.productId) filterSummary.push(`Product: ${filters.productId}`);
  if (filters.resolution && filters.resolution !== 'all') filterSummary.push(`Resolution: ${filters.resolution}`);
  if (filters.approvedBy) filterSummary.push(`Approved By: ${filters.approvedBy}`);
  if (filters.authorizationType && filters.authorizationType !== 'all') filterSummary.push(`Auth Type: ${filters.authorizationType}`);
  if (filters.actionType && filters.actionType !== 'all') filterSummary.push(`Action: ${filters.actionType}`);
  if (filters.movementType && filters.movementType !== 'all') filterSummary.push(`Movement: ${filters.movementType}`);
  if (filters.search) filterSummary.push(`Search: "${filters.search}"`);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
      {/* Top Store Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-100 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 text-white rounded-lg">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{storeName}</h1>
            <p className="text-xs text-slate-500">{address} • Contact: {contact} • TIN: {tin} • {vatStatus}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-800 text-xs font-semibold rounded-full border border-slate-200">
            <Hash className="h-3.5 w-3.5 text-slate-500" />
            {totalRecords} Total Records
          </span>
        </div>
      </div>

      {/* Report Title & Metadata Grid */}
      <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2 text-slate-700 font-semibold">
          <FileText className="h-4 w-4 text-blue-600" />
          <span>Report:</span>
          <span className="text-slate-900 font-bold">{title}</span>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span>Generated:</span>
          <span className="text-slate-800 font-medium">{formatDateTimeLong(new Date().toISOString())}</span>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <UserCheck className="h-4 w-4 text-slate-400" />
          <span>Prepared By:</span>
          <span className="text-slate-800 font-medium">{generatedBy}</span>
        </div>
      </div>

      {/* Applied Filters Badges */}
      {filterSummary.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap text-xs">
          <span className="flex items-center gap-1 font-semibold text-slate-600">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            Filters:
          </span>
          {filterSummary.map((filter, index) => (
            <span key={index} className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md font-medium">
              {filter}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

