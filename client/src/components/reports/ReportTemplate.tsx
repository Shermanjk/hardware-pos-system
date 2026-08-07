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
}: ReportTemplateProps) {
  // Generate filter summary
  const filterSummary: string[] = [];
  if (filters.dateFrom && filters.dateTo) {
    filterSummary.push(`Date Range: ${formatDateLong(filters.dateFrom)} - ${formatDateLong(filters.dateTo)}`);
  }
  if (filters.cashierId) filterSummary.push(`Cashier: ${filters.cashierId}`);
  if (filters.status && filters.status !== 'all') filterSummary.push(`Status: ${filters.status}`);
  if (filters.categoryId) filterSummary.push(`Category: ${filters.categoryId}`);
  if (filters.supplierId) filterSummary.push(`Supplier: ${filters.supplierId}`);
  if (filters.productId) filterSummary.push(`Product: ${filters.productId}`);
  if (filters.resolution && filters.resolution !== 'all') filterSummary.push(`Resolution: ${filters.resolution}`);
  if (filters.approvedBy) filterSummary.push(`Approved By: ${filters.approvedBy}`);
  if (filters.authorizationType && filters.authorizationType !== 'all') filterSummary.push(`Authorization Type: ${filters.authorizationType}`);
  if (filters.actionType && filters.actionType !== 'all') filterSummary.push(`Action Type: ${filters.actionType}`);
  if (filters.movementType && filters.movementType !== 'all') filterSummary.push(`Movement Type: ${filters.movementType}`);
  if (filters.search) filterSummary.push(`Search: ${filters.search}`);

  // Format cell value
  const formatCellValue = (value: any, key: string) => {
    if (value === null || value === undefined || value === '') return '-';
    
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

  return createPortal(
    <div className="report-template" style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#000',
      maxWidth: '210mm',
      margin: '0 auto'
    }}>
      {/* Store Information */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: 'bold', 
          marginBottom: '12px',
          margin: 0 
        }}>
          {storeSettings.store_name || 'ISRA HARDWARE TRADING'}
        </h1>
        <p style={{ margin: '4px 0', fontSize: '11px' }}>
          {storeSettings.address || '—'}
        </p>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '20px', 
          marginTop: '8px',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '11px' }}>
            <span style={{ fontWeight: 'bold' }}>Contact:</span> {storeSettings.contact_number || '—'}
          </div>
          <div style={{ fontSize: '11px' }}>
            <span style={{ fontWeight: 'bold' }}>TIN:</span> {storeSettings.tin || '—'}
          </div>
        </div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '20px', 
          marginTop: '4px',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '11px' }}>
            <span style={{ fontWeight: 'bold' }}>Business Style:</span> {storeSettings.business_license || '—'}
          </div>
          <div style={{ fontSize: '11px' }}>
            <span style={{ fontWeight: 'bold' }}>VAT Status:</span> {storeSettings.vat_registered ? 'VAT Registered' : 'Non-VAT'}
          </div>
        </div>
      </div>

      {/* Report Title */}
      <div style={{ 
        borderBottom: '2px solid #000', 
        paddingBottom: '10px', 
        marginBottom: '15px' 
      }}>
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: 'bold', 
          margin: 0,
          textAlign: 'center'
        }}>
          {title}
        </h2>
      </div>

      {/* Report Metadata */}
      <div style={{ marginBottom: '15px', fontSize: '11px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div><strong>Date Generated:</strong> {formatDateLong(new Date().toISOString())}</div>
          <div><strong>Generated By:</strong> {generatedBy}</div>
        </div>
      </div>

      {/* Filters */}
      {filterSummary.length > 0 && (
        <div style={{ marginBottom: '15px', fontSize: '11px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Applied Filters:</div>
          <div style={{ marginLeft: '10px' }}>
            {filterSummary.map((filter, index) => (
              <div key={index} style={{ margin: '2px 0' }}>{filter}</div>
            ))}
          </div>
        </div>
      )}

      {/* Total Records */}
      <div style={{ 
        marginBottom: '15px', 
        fontSize: '11px', 
        fontWeight: 'bold' 
      }}>
        Total Records: {data.length}
      </div>

      {/* Data Table */}
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse', 
        marginBottom: '20px',
        fontSize: '11px'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#4472C4', color: '#fff' }}>
            {columns.map((column, index) => (
              <th key={index} style={{
                padding: '8px 6px',
                textAlign: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
                border: '1px solid #000',
                fontWeight: 'bold',
                fontSize: '10px'
              }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ 
              backgroundColor: rowIndex % 2 === 0 ? '#fff' : '#f9f9f9' 
            }}>
              {columns.map((column, colIndex) => (
                <td key={colIndex} style={{
                  padding: '6px',
                  textAlign: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
                  border: '1px solid #ddd'
                }}>
                  {formatCellValue(row[column.key], column.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {summaryRows.length > 0 && (
          <tfoot>
            {summaryRows.map((summary, summaryIndex) => (
              <tr key={summaryIndex} style={{ 
                backgroundColor: '#4472C4', 
                color: '#fff',
                fontWeight: 'bold'
              }}>
                {columns.map((column, colIndex) => (
                  <td key={colIndex} style={{
                    padding: '8px 6px',
                    textAlign: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
                    border: '1px solid #000'
                  }}>
                    {colIndex === 0 ? summary.label : formatCellValue(summary.values[column.key], column.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        )}
      </table>

      {/* Prepared By Section */}
      <div style={{ 
        marginTop: '40px', 
        paddingTop: '20px', 
        borderTop: '1px solid #000',
        fontSize: '11px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Prepared By:</div>
        <div style={{ 
          borderBottom: '1px solid #000', 
          width: '200px', 
          marginBottom: '5px',
          height: '30px'
        }}></div>
        <div style={{ fontStyle: 'italic', color: '#666' }}>Name & Signature</div>
      </div>
    </div>,
    document.body
  );
}
