import { Column, SummaryRow } from '@/components/reports/ReportTable';
import { StoreSettings } from '@/shared/api/settingsApi';

export interface ReportInfo {
  title: string;
  dateFrom: string;
  dateTo: string;
  filters: Record<string, any>;
  generatedBy: string;
  storeSettings: StoreSettings;
}

export interface ExportData {
  data: any[];
  columns: Column[];
  summaryRows?: SummaryRow[];
}

// Currency formatter: ₱1,234.56
export function formatCurrency(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return '₱0.00';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value).replace('PHP', '₱');
}

// Date formatter for report headers: August 7, 2026
export function formatDateLong(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

// Date formatter for date + time: August 7, 2026 2:35 PM
export function formatDateTimeLong(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

// Date formatter for tables: YYYY-MM-DD
export function formatDateShort(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toISOString().split('T')[0];
}

// Helper to convert 1-based column index to Excel column letter (1 -> A, 27 -> AA)
function getColLetter(colIndex: number): string {
  let temp = 0;
  let letter = '';
  let index = colIndex;
  while (index > 0) {
    temp = (index - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    index = Math.floor((index - temp - 1) / 26);
  }
  return letter || 'A';
}

// Generate filename
export function generateFilename(title: string, dateFrom: string, dateTo: string, extension: string): string {
  const sanitizedTitle = title.replace(/\s+/g, '_');
  const from = dateFrom ? dateFrom.replace(/\//g, '-') : 'ALL';
  const to = dateTo ? dateTo.replace(/\//g, '-') : 'ALL';
  return `${sanitizedTitle}_${from}_to_${to}.${extension}`;
}

// Generate filter summary items
export function generateFilterSummary(filters: Record<string, any>): string[] {
  const summary: string[] = [];
  
  if (filters.dateFrom && filters.dateTo) {
    summary.push(`Date Range: ${formatDateLong(filters.dateFrom)} - ${formatDateLong(filters.dateTo)}`);
  }
  if (filters.cashierId) summary.push(`Cashier ID: ${filters.cashierId}`);
  if (filters.status && filters.status !== 'all') summary.push(`Status: ${filters.status}`);
  if (filters.categoryId) summary.push(`Category ID: ${filters.categoryId}`);
  if (filters.supplierId) summary.push(`Supplier ID: ${filters.supplierId}`);
  if (filters.productId) summary.push(`Product ID: ${filters.productId}`);
  if (filters.resolution && filters.resolution !== 'all') summary.push(`Resolution: ${filters.resolution}`);
  if (filters.approvedBy) summary.push(`Approved By: ${filters.approvedBy}`);
  if (filters.authorizationType && filters.authorizationType !== 'all') summary.push(`Authorization Type: ${filters.authorizationType}`);
  if (filters.actionType && filters.actionType !== 'all') summary.push(`Action Type: ${filters.actionType}`);
  if (filters.movementType && filters.movementType !== 'all') summary.push(`Movement Type: ${filters.movementType}`);
  if (filters.search) summary.push(`Search: "${filters.search}"`);
  
  return summary;
}

// Format single cell value for export
function formatValueForExport(value: any, key: string, column?: Column): string {
  if (value === null || value === undefined || value === '') return '';
  
  if (column?.format && typeof column.format === 'function') {
    const formatted = column.format(value);
    if (typeof formatted === 'string' || typeof formatted === 'number') {
      return String(formatted);
    }
  }

  const keyLower = key.toLowerCase();
  const isCurrencyKey = column?.align === 'right' || 
    keyLower.includes('amount') || 
    keyLower.includes('price') || 
    keyLower.includes('total') || 
    keyLower.includes('sales') ||
    keyLower.includes('cost') ||
    keyLower.includes('variance') ||
    keyLower.includes('cash');

  if (typeof value === 'number' && isCurrencyKey) {
    return formatCurrency(value);
  }

  const isDateKey = keyLower.includes('date') || 
    keyLower.includes('time') ||
    keyLower.includes('created_at') ||
    keyLower.includes('submitted_at') ||
    keyLower.includes('resolved_at');

  if (typeof value === 'string' && isDateKey) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return formatDateTimeLong(value);
      }
    } catch (e) {
      // Keep original string if parsing fails
    }
  }

  return String(value);
}

// Format single cell value for PDF export specifically (replaces ₱ with P to prevent garbled Helvetica font characters)
function formatValueForExportPDF(value: any, key: string, column?: Column): string {
  const formatted = formatValueForExport(value, key, column);
  return formatted.replace(/₱/g, 'P');
}

// Format single cell value for CSV export specifically (outputs numeric decimals so Excel parses them as numbers)
function formatValueForCSV(value: any, key: string, column?: Column): string {
  if (value === null || value === undefined || value === '') return '';

  const keyLower = key.toLowerCase();
  const isCurrencyKey = column?.align === 'right' || 
    keyLower.includes('amount') || 
    keyLower.includes('price') || 
    keyLower.includes('total') || 
    keyLower.includes('sales') ||
    keyLower.includes('cost') ||
    keyLower.includes('variance') ||
    keyLower.includes('cash');

  if (typeof value === 'number' && isCurrencyKey) {
    return value.toFixed(2);
  }

  const isDateKey = keyLower.includes('date') || 
    keyLower.includes('time') ||
    keyLower.includes('created_at') ||
    keyLower.includes('submitted_at') ||
    keyLower.includes('resolved_at');

  if (typeof value === 'string' && isDateKey) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return formatDateTimeLong(value);
      }
    } catch (e) {}
  }

  if (column?.format && typeof column.format === 'function') {
    const formatted = column.format(value);
    if (typeof formatted === 'string' || typeof formatted === 'number') {
      return String(formatted).replace(/₱/g, '').trim();
    }
  }

  return String(value);
}

// CSV Export - Clean executive structured document export
export function exportToCSV(exportData: ExportData, reportInfo: ReportInfo) {
  const { data, columns, summaryRows } = exportData;
  
  if (data.length === 0) {
    console.warn('No data to export to CSV');
    return;
  }

  const csvRows: string[] = [];

  // Helper to escape CSV fields safely
  const escapeCsv = (val: any) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Header metadata rows
  csvRows.push(escapeCsv(reportInfo.storeSettings.store_name || 'ISRA HARDWARE TRADING'));
  csvRows.push(escapeCsv(reportInfo.storeSettings.address || 'General Santos City, South Cotabato'));
  csvRows.push(escapeCsv(`Contact: ${reportInfo.storeSettings.contact_number || '—'} | TIN: ${reportInfo.storeSettings.tin || '—'} | VAT: ${reportInfo.storeSettings.vat_registered ? 'VAT Registered' : 'Non-VAT'}`));
  csvRows.push('');
  csvRows.push(escapeCsv(`REPORT TITLE: ${reportInfo.title}`));
  csvRows.push(escapeCsv(`Date Generated: ${formatDateTimeLong(new Date().toISOString())}`));
  csvRows.push(escapeCsv(`Generated By: ${reportInfo.generatedBy}`));
  
  if (reportInfo.dateFrom && reportInfo.dateTo) {
    csvRows.push(escapeCsv(`Report Period: ${formatDateLong(reportInfo.dateFrom)} to ${formatDateLong(reportInfo.dateTo)}`));
  }
  
  const filterSummary = generateFilterSummary(reportInfo.filters);
  if (filterSummary.length > 0) {
    csvRows.push(escapeCsv(`Applied Filters: ${filterSummary.join(' | ')}`));
  }
  csvRows.push(escapeCsv(`Total Records: ${data.length}`));
  csvRows.push('');

  // Column Headers
  const headers = columns.map(c => escapeCsv(c.label));
  csvRows.push(headers.join(','));

  // Data Rows
  for (const row of data) {
    const values = columns.map(col => escapeCsv(formatValueForCSV(row[col.key], col.key, col)));
    csvRows.push(values.join(','));
  }

  // Summary Rows
  if (summaryRows && summaryRows.length > 0) {
    csvRows.push('');
    for (const summary of summaryRows) {
      const summaryValues = columns.map((col, idx) => {
        if (idx === 0) return escapeCsv(summary.label);
        const val = summary.values[col.key];
        return escapeCsv(val !== undefined ? formatValueForCSV(val, col.key, col) : '');
      });
      csvRows.push(summaryValues.join(','));
    }
  }

  // Dual Signatures
  csvRows.push('');
  csvRows.push(escapeCsv(`Prepared By: ${reportInfo.generatedBy}`));
  csvRows.push(escapeCsv('Approved By: Store Management'));

  const csvContent = '\uFEFF' + csvRows.join('\n'); // Add UTF-8 BOM for Excel compatibility
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', generateFilename(reportInfo.title, reportInfo.dateFrom, reportInfo.dateTo, 'csv'));
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Excel Export with executive formatting using ExcelJS
export async function exportToExcel(exportData: ExportData, reportInfo: ReportInfo) {
  const { data, columns, summaryRows } = exportData;
  
  if (data.length === 0) {
    console.warn('No data to export to Excel');
    return;
  }

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');

  const colCount = Math.max(columns.length, 5);
  const maxColLetter = getColLetter(colCount);

  // Store Header Title
  worksheet.mergeCells(`A1:${maxColLetter}1`);
  const storeCell = worksheet.getCell('A1');
  storeCell.value = reportInfo.storeSettings.store_name || 'ISRA HARDWARE TRADING';
  storeCell.font = { name: 'Arial', bold: true, size: 16, color: { argb: 'FF0F172A' } };
  storeCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Store Sub-header Details
  worksheet.mergeCells(`A2:${maxColLetter}2`);
  const detailCell = worksheet.getCell('A2');
  detailCell.value = `${reportInfo.storeSettings.address || 'General Santos City'} | Contact: ${reportInfo.storeSettings.contact_number || '—'} | TIN: ${reportInfo.storeSettings.tin || '—'} | ${reportInfo.storeSettings.vat_registered ? 'VAT Registered' : 'Non-VAT'}`;
  detailCell.font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
  detailCell.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.addRow([]); // Row 3 blank

  // Report Title
  worksheet.mergeCells(`A4:${maxColLetter}4`);
  const titleCell = worksheet.getCell('A4');
  titleCell.value = reportInfo.title.toUpperCase();
  titleCell.font = { name: 'Arial', bold: true, size: 13, color: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Metadata Grid
  const metaStart = 5;
  worksheet.getCell(`A${metaStart}`).value = `Date Generated: ${formatDateTimeLong(new Date().toISOString())}`;
  worksheet.getCell(`A${metaStart}`).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };

  worksheet.getCell(`C${metaStart}`).value = `Generated By: ${reportInfo.generatedBy}`;
  worksheet.getCell(`C${metaStart}`).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };

  if (reportInfo.dateFrom && reportInfo.dateTo) {
    worksheet.getCell(`A${metaStart + 1}`).value = `Report Period: ${formatDateLong(reportInfo.dateFrom)} to ${formatDateLong(reportInfo.dateTo)}`;
    worksheet.getCell(`A${metaStart + 1}`).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
  }

  const filterSummary = generateFilterSummary(reportInfo.filters);
  if (filterSummary.length > 0) {
    worksheet.getCell(`A${metaStart + 2}`).value = `Applied Filters: ${filterSummary.join(' | ')}`;
    worksheet.getCell(`A${metaStart + 2}`).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF475569' } };
  }

  worksheet.getCell(`A${metaStart + 3}`).value = `Total Records: ${data.length}`;
  worksheet.getCell(`A${metaStart + 3}`).font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FF0F172A' } };

  worksheet.addRow([]); // Blank row before table

  // Column Headers
  const headerRow = worksheet.addRow(columns.map(c => c.label));
  headerRow.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 26;

  headerRow.eachCell(cell => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF0F172A' } }
    };
  });

  // Data Rows
  const keys = columns.map(c => c.key);
  data.forEach((row, rowIndex) => {
    const rowValues = columns.map(col => {
      const val = row[col.key];
      if (val === null || val === undefined) return '';

      const keyLower = col.key.toLowerCase();
      const isCurrencyKey = col.align === 'right' || 
        keyLower.includes('amount') || 
        keyLower.includes('price') || 
        keyLower.includes('total') || 
        keyLower.includes('sales') ||
        keyLower.includes('cost') ||
        keyLower.includes('variance') ||
        keyLower.includes('cash');

      if (typeof val === 'number' && isCurrencyKey) {
        return val; // Keep numeric for Excel currency format
      }

      if (col.format && typeof col.format === 'function') {
        const formatted = col.format(val);
        if (typeof formatted === 'string' || typeof formatted === 'number') {
          return formatted;
        }
      }

      const isDateKey = keyLower.includes('date') || 
        keyLower.includes('time') ||
        keyLower.includes('created_at') ||
        keyLower.includes('submitted_at') ||
        keyLower.includes('resolved_at');

      if (typeof val === 'string' && isDateKey) {
        try {
          const date = new Date(val);
          if (!isNaN(date.getTime())) {
            return formatDateTimeLong(val);
          }
        } catch (e) {}
      }

      return val;
    });

    const dataRow = worksheet.addRow(rowValues);
    dataRow.height = 20;

    const bgArgb = rowIndex % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

    dataRow.eachCell((cell, colIndex) => {
      const colDef = columns[colIndex - 1];
      const keyLower = keys[colIndex - 1].toLowerCase();
      const isCurrencyKey = colDef?.align === 'right' || 
        keyLower.includes('amount') || 
        keyLower.includes('price') || 
        keyLower.includes('total') || 
        keyLower.includes('sales') ||
        keyLower.includes('cost') ||
        keyLower.includes('variance') ||
        keyLower.includes('cash');

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgArgb }
      };

      cell.font = { name: 'Arial', size: 9, color: { argb: 'FF1E293B' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      if (colDef?.align === 'right') {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colDef?.align === 'center') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }

      if (typeof cell.value === 'number' && isCurrencyKey) {
        cell.numFmt = '"₱"#,##0.00;("₱"#,##0.00);"-"';
      }
    });
  });

  // Summary Rows
  if (summaryRows && summaryRows.length > 0) {
    summaryRows.forEach(summary => {
      const rowValues = columns.map((col, idx) => {
        if (idx === 0) return summary.label;
        const val = summary.values[col.key];
        return val !== undefined ? val : '';
      });

      const sRow = worksheet.addRow(rowValues);
      sRow.height = 24;

      sRow.eachCell((cell, colIndex) => {
        const colDef = columns[colIndex - 1];
        cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF334155' }
        };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FF1E293B' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          right: { style: 'thin', color: { argb: 'FF1E293B' } }
        };

        if (colDef?.align === 'right') {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if (colDef?.align === 'center') {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        if (typeof cell.value === 'number') {
          cell.numFmt = '"₱"#,##0.00;("₱"#,##0.00);"-"';
        }
      });
    });
  }

  // Dual Signature Block
  worksheet.addRow([]);
  worksheet.addRow([]);

  const sigRow1 = worksheet.addRow(['PREPARED BY:', '', '', 'APPROVED / VERIFIED BY:']);
  sigRow1.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FF334155' } };

  worksheet.addRow([]);
  const sigRow2 = worksheet.addRow(['____________________', '', '', '____________________']);
  sigRow2.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FF0F172A' } };

  const sigRow3 = worksheet.addRow([reportInfo.generatedBy, '', '', 'Store Management']);
  sigRow3.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FF0F172A' } };

  const sigRow4 = worksheet.addRow(['Authorized Staff / Cashier', '', '', 'Manager / Auditor']);
  sigRow4.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF64748B' } };

  // Auto-size columns based ONLY on table header and table data/summary rows (ignoring top metadata rows)
  columns.forEach((col, colIdx) => {
    let maxLen = col.label ? col.label.length : 10;

    data.forEach(row => {
      const val = row[col.key];
      if (val !== null && val !== undefined) {
        let str = String(val);
        if (typeof val === 'number') {
          str = formatCurrency(val);
        } else if (col.format && typeof col.format === 'function') {
          const formatted = col.format(val);
          if (typeof formatted === 'string') str = formatted;
        }
        if (str.length > maxLen) maxLen = str.length;
      }
    });

    if (summaryRows) {
      summaryRows.forEach(s => {
        const sVal = s.values[col.key];
        if (sVal !== undefined && sVal !== null) {
          const str = String(sVal);
          if (str.length > maxLen) maxLen = str.length;
        }
      });
    }

    const excelCol = worksheet.getColumn(colIdx + 1);
    excelCol.width = Math.min(Math.max(maxLen + 4, 12), 45);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', generateFilename(reportInfo.title, reportInfo.dateFrom, reportInfo.dateTo, 'xlsx'));
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// PDF Export with professional formatting using jsPDF & jspdf-autotable
export async function exportToPDF(exportData: ExportData, reportInfo: ReportInfo) {
  const { data, columns, summaryRows } = exportData;
  
  if (data.length === 0) {
    console.warn('No data to export to PDF');
    return;
  }

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  const isLandscape = columns.length >= 6;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  let yPosition = margin;

  // Store Title Header
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text(reportInfo.storeSettings.store_name || 'ISRA HARDWARE TRADING', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 5;

  // Store Subheader Details
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // #475569
  const storeSubText = `${reportInfo.storeSettings.address || 'General Santos City'} | Contact: ${reportInfo.storeSettings.contact_number || '—'} | TIN: ${reportInfo.storeSettings.tin || '—'} | ${reportInfo.storeSettings.vat_registered ? 'VAT Registered' : 'Non-VAT'}`;
  doc.text(storeSubText, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 6;

  // Divider Line
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 6;

  // Report Title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(reportInfo.title.toUpperCase(), margin, yPosition);

  // Record Count Badge
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(`Total Records: ${data.length}`, pageWidth - margin, yPosition, { align: 'right' });
  yPosition += 5;

  // Report Metadata Grid
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Date Generated: ${formatDateTimeLong(new Date().toISOString())}`, margin, yPosition);
  doc.text(`Generated By: ${reportInfo.generatedBy}`, pageWidth / 2, yPosition);
  yPosition += 4;

  if (reportInfo.dateFrom && reportInfo.dateTo) {
    doc.text(`Report Period: ${formatDateLong(reportInfo.dateFrom)} to ${formatDateLong(reportInfo.dateTo)}`, margin, yPosition);
    yPosition += 4;
  }

  const filterSummary = generateFilterSummary(reportInfo.filters);
  if (filterSummary.length > 0) {
    doc.setFont('helvetica', 'italic');
    doc.text(`Applied Filters: ${filterSummary.join(' | ')}`, margin, yPosition);
    yPosition += 5;
  } else {
    yPosition += 2;
  }

  // Format Table Headers
  const tableHeaders = columns.map(c => c.label);

  // Format Table Data Rows with PDF specific currency replacement (₱ -> P)
  const tableData = data.map(row => {
    return columns.map(c => formatValueForExportPDF(row[c.key], c.key, c));
  });

  // Format Table Summary Footer Rows
  const summaryData = summaryRows ? summaryRows.map(s => {
    return columns.map((c, idx) => {
      if (idx === 0) return s.label;
      const val = s.values[c.key];
      return val !== undefined ? formatValueForExportPDF(val, c.key, c) : '';
    });
  }) : [];

  // Generate Table via autoTable
  autoTable(doc, {
    head: [tableHeaders],
    body: tableData,
    foot: summaryData.length > 0 ? summaryData : undefined,
    startY: yPosition,
    margin: { top: margin, right: margin, bottom: 16, left: margin },
    styles: {
      fontSize: isLandscape ? 7.5 : 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: isLandscape ? 8 : 8.5,
    },
    footStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: isLandscape ? 8 : 8.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: columns.reduce((acc, c, i) => {
      acc[i] = {
        halign: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left',
      };
      return acc;
    }, {} as any),
    didDrawPage: (data) => {
      // Footer page numbers on every page
      const totalPages = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : (data as any).pageCount || 1;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${totalPages} • ISRA Hardware POS System`,
        pageWidth / 2,
        pageHeight - 6,
        { align: 'center' }
      );
    },
  });

  // Position for Signatures after table completion
  let finalY = (doc as any).lastAutoTable?.finalY || yPosition + 40;
  
  if (finalY + 30 > pageHeight - 12) {
    doc.addPage();
    finalY = margin + 10;
  } else {
    finalY += 12;
  }

  // Dual Signature Block on final page
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('PREPARED BY:', margin, finalY);
  doc.text('APPROVED / VERIFIED BY:', pageWidth / 2 + 10, finalY);

  finalY += 12;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(margin, finalY, margin + 55, finalY);
  doc.line(pageWidth / 2 + 10, finalY, pageWidth / 2 + 65, finalY);

  finalY += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(reportInfo.generatedBy, margin, finalY);
  doc.text('Store Management', pageWidth / 2 + 10, finalY);

  finalY += 4;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Authorized Staff / Cashier', margin, finalY);
  doc.text('Manager / Auditor', pageWidth / 2 + 10, finalY);

  // Save file
  doc.save(generateFilename(reportInfo.title, reportInfo.dateFrom, reportInfo.dateTo, 'pdf'));
}

// Print Export wrapper
export function printReport() {
  window.print();
}
