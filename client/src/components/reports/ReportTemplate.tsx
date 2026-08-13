import { Column, SummaryRow } from '@/components/reports/ReportTable';
import { StoreSettings } from '@/shared/api/settingsApi';
import { formatDateLong, formatDateTimeLong, formatCurrency } from '@/shared/utils/reportExport';
import { createPortal } from 'react-dom';

interface ReportTemplateProps {
  title: string;
  dateFrom: string;
  dateTo: string;
  filters: Record<string, any>;
  generatedBy: string;
  storeSettings: StoreSettings;
  columns: Column[];
  data: any[];
  summaryRows?: SummaryRow[];
  orientation?: 'portrait' | 'landscape';
}

export default function ReportTemplate({
  title,
  dateFrom,
  dateTo,
  filters,
  generatedBy,
  storeSettings,
  columns,
  data,
  summaryRows = [],
  orientation,
}: ReportTemplateProps) {
  // Determine page orientation: default to landscape for 6+ columns
  const isLandscape = orientation ? orientation === 'landscape' : columns.length >= 6;

  // Generate filter summary items
  const filterSummary: string[] = [];
  if (filters.dateFrom && filters.dateTo) {
    filterSummary.push(`Date Range: ${formatDateLong(filters.dateFrom)} - ${formatDateLong(filters.dateTo)}`);
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

  // Format cell value cleanly
  const formatCellValue = (value: any, key: string, columnFormat?: (val: any) => any) => {
    if (value === null || value === undefined || value === '') return '—';
    if (columnFormat && typeof columnFormat === 'function') {
      const formatted = columnFormat(value);
      if (typeof formatted === 'string' || typeof formatted === 'number') return formatted;
    }
    
    // Format currency
    if (typeof value === 'number' && 
        (columns.find(c => c.key === key)?.align === 'right' || 
         key.toLowerCase().includes('amount') || 
         key.toLowerCase().includes('price') || 
         key.toLowerCase().includes('total') ||
         key.toLowerCase().includes('sales') ||
         key.toLowerCase().includes('cost') ||
         key.toLowerCase().includes('variance') ||
         key.toLowerCase().includes('cash'))) {
      return formatCurrency(value);
    }
    
    // Format date/time
    if (typeof value === 'string' && 
        (key.toLowerCase().includes('date') || 
         key.toLowerCase().includes('time') ||
         key.toLowerCase().includes('created_at') ||
         key.toLowerCase().includes('submitted_at') ||
         key.toLowerCase().includes('resolved_at') ||
         key.toLowerCase().includes('date_time'))) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return formatDateTimeLong(value);
        }
      } catch (e) {
        // Keep original value if date parsing fails
      }
    }
    
    return String(value);
  };

  const isNoWrapKey = (key: string, align?: string) => {
    const k = key.toLowerCase();
    return align === 'right' || 
      k.includes('date') || 
      k.includes('time') || 
      k.includes('receipt') || 
      k.includes('code') || 
      k.includes('barcode') ||
      k.includes('cashier') ||
      k.includes('status');
  };

  return createPortal(
    <div className="report-template" style={{ 
      padding: isLandscape ? '16px 20px' : '24px 32px', 
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: isLandscape ? '10px' : '11px',
      color: '#0f172a',
      backgroundColor: '#ffffff',
      maxWidth: isLandscape ? '297mm' : '210mm',
      margin: '0 auto',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @media print {
          @page {
            size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
            margin: 8mm 10mm;
          }
        }
      `}</style>

      {/* Official Header */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <h1 style={{ 
          fontSize: isLandscape ? '20px' : '22px', 
          fontWeight: '800', 
          letterSpacing: '0.5px',
          color: '#0f172a',
          margin: '0 0 4px 0',
          textTransform: 'uppercase'
        }}>
          {storeSettings.store_name || 'ISRA HARDWARE TRADING'}
        </h1>
        <p style={{ margin: '2px 0', fontSize: '10px', color: '#475569' }}>
          {storeSettings.address || 'General Santos City, South Cotabato, Philippines'}
        </p>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '20px', 
          marginTop: '4px',
          fontSize: '9.5px',
          color: '#475569'
        }}>
          <span><strong>Contact:</strong> {storeSettings.contact_number || '—'}</span>
          <span><strong>TIN:</strong> {storeSettings.tin || '—'}</span>
          <span><strong>Business Style:</strong> {storeSettings.business_license || 'Retail Hardware'}</span>
          <span><strong>Tax Status:</strong> {storeSettings.vat_registered ? 'VAT Registered' : 'Non-VAT Registered'}</span>
        </div>
      </div>

      {/* Double Divider */}
      <div style={{ 
        borderBottom: '3px double #0f172a', 
        marginBottom: '14px' 
      }} />

      {/* Document Information & Metadata Grid */}
      <div style={{ 
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        padding: '10px 14px',
        marginBottom: '16px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '6px',
          marginBottom: '8px'
        }}>
          <h2 style={{ 
            fontSize: '15px', 
            fontWeight: '700', 
            margin: 0,
            color: '#1e293b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {title}
          </h2>
          <span style={{ 
            fontSize: '9.5px', 
            fontWeight: '600', 
            backgroundColor: '#e2e8f0',
            color: '#334155',
            padding: '2px 8px',
            borderRadius: '4px'
          }}>
            Total Records: {data.length}
          </span>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isLandscape ? '1fr 1fr 1fr' : '1fr 1fr', 
          gap: '6px 16px',
          fontSize: '9.5px',
          color: '#334155'
        }}>
          <div><strong>Date Generated:</strong> {formatDateTimeLong(new Date().toISOString())}</div>
          <div><strong>Generated By:</strong> {generatedBy}</div>
          {filters.dateFrom && filters.dateTo && (
            <div><strong>Report Period:</strong> {formatDateLong(filters.dateFrom)} to {formatDateLong(filters.dateTo)}</div>
          )}
          {filterSummary.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <strong>Applied Filters:</strong> {filterSummary.join(' | ')}
            </div>
          )}
        </div>
      </div>

      {/* Main Data Table */}
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse', 
        marginBottom: '20px',
        fontSize: isLandscape ? '9.5px' : '10px'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#1e293b', color: '#ffffff' }}>
            {columns.map((column, index) => (
              <th key={index} style={{
                padding: isLandscape ? '6px 8px' : '8px 10px',
                textAlign: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
                border: '1px solid #0f172a',
                fontWeight: '700',
                fontSize: isLandscape ? '8.5px' : '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap'
              }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                No records found for the specified report parameters.
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ 
                backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc' 
              }}>
                {columns.map((column, colIndex) => (
                  <td key={colIndex} style={{
                    padding: isLandscape ? '5px 8px' : '6px 10px',
                    textAlign: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
                    border: '1px solid #cbd5e1',
                    color: '#1e293b',
                    whiteSpace: isNoWrapKey(column.key, column.align) ? 'nowrap' : 'normal'
                  }}>
                    {formatCellValue(row[column.key], column.key, column.format)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {summaryRows.length > 0 && (
          <tfoot>
            {summaryRows.map((summary, summaryIndex) => (
              <tr key={summaryIndex} style={{ 
                backgroundColor: '#334155', 
                color: '#ffffff',
                fontWeight: '700'
              }}>
                {columns.map((column, colIndex) => (
                  <td key={colIndex} style={{
                    padding: isLandscape ? '6px 8px' : '8px 10px',
                    textAlign: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
                    border: '1px solid #1e293b',
                    fontSize: isLandscape ? '9px' : '10px',
                    whiteSpace: 'nowrap'
                  }}>
                    {colIndex === 0 ? summary.label : formatCellValue(summary.values[column.key], column.key, column.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        )}
      </table>

      {/* Dual Signature Section */}
      <div className="report-signatures" style={{ 
        marginTop: '28px', 
        paddingTop: '14px', 
        borderTop: '1px solid #cbd5e1',
        fontSize: '9.5px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '40px'
      }}>
        <div>
          <div style={{ fontWeight: '700', color: '#334155', marginBottom: '28px' }}>PREPARED BY:</div>
          <div style={{ 
            borderBottom: '1.5px solid #0f172a', 
            width: '180px', 
            marginBottom: '4px'
          }} />
          <div style={{ fontWeight: '600', color: '#0f172a' }}>{generatedBy}</div>
          <div style={{ fontSize: '8.5px', color: '#64748b' }}>Authorized Staff / Cashier</div>
        </div>

        <div>
          <div style={{ fontWeight: '700', color: '#334155', marginBottom: '28px' }}>APPROVED / VERIFIED BY:</div>
          <div style={{ 
            borderBottom: '1.5px solid #0f172a', 
            width: '180px', 
            marginBottom: '4px'
          }} />
          <div style={{ fontWeight: '600', color: '#0f172a' }}>Store Management</div>
          <div style={{ fontSize: '8.5px', color: '#64748b' }}>Manager / Auditor</div>
        </div>
      </div>

      {/* Report Audit Notice */}
      <div style={{ 
        marginTop: '20px', 
        textAlign: 'center', 
        fontSize: '8px', 
        color: '#94a3b8',
        letterSpacing: '0.5px'
      }}>
        OFFICIAL SYSTEM GENERATED REPORT • ISRA HARDWARE POS SYSTEM • CONFIDENTIAL
      </div>
    </div>,
    document.body
  );
}


