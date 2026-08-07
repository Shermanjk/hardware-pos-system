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
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

// Date formatter for date + time: August 7, 2026 2:35 PM
export function formatDateTimeLong(dateString: string): string {
  const date = new Date(dateString);
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
  return date.toISOString().split('T')[0];
}

// Generate filename
export function generateFilename(title: string, dateFrom: string, dateTo: string, extension: string): string {
  const sanitizedTitle = title.replace(/\s+/g, '_');
  return `${sanitizedTitle}_${dateFrom}_to_${dateTo}.${extension}`;
}

// Generate filter summary
export function generateFilterSummary(filters: Record<string, any>): string[] {
  const summary: string[] = [];
  
  if (filters.dateFrom && filters.dateTo) {
    summary.push(`Date Range: ${formatDateLong(filters.dateFrom)} - ${formatDateLong(filters.dateTo)}`);
  }
  
  if (filters.cashierId) {
    summary.push(`Cashier ID: ${filters.cashierId}`);
  }
  
  if (filters.status && filters.status !== 'all') {
    summary.push(`Status: ${filters.status}`);
  }
  
  if (filters.categoryId) {
    summary.push(`Category ID: ${filters.categoryId}`);
  }
  
  if (filters.supplierId) {
    summary.push(`Supplier ID: ${filters.supplierId}`);
  }
  
  if (filters.productId) {
    summary.push(`Product ID: ${filters.productId}`);
  }
  
  if (filters.resolution && filters.resolution !== 'all') {
    summary.push(`Resolution: ${filters.resolution}`);
  }
  
  if (filters.approvedBy) {
    summary.push(`Approved By: ${filters.approvedBy}`);
  }
  
  if (filters.authorizationType && filters.authorizationType !== 'all') {
    summary.push(`Authorization Type: ${filters.authorizationType}`);
  }
  
  if (filters.actionType && filters.actionType !== 'all') {
    summary.push(`Action Type: ${filters.actionType}`);
  }
  
  if (filters.search) {
    summary.push(`Search: ${filters.search}`);
  }
  
  return summary;
}

// CSV Export - Raw data only (headers + filtered records)
export function exportToCSV(exportData: ExportData, reportInfo: ReportInfo) {
  const { data, columns } = exportData;
  
  if (data.length === 0) {
    console.warn('No data to export to CSV');
    return;
  }

  const csvRows: string[] = [];
  
  // Column Headers only
  const headers = columns.map(c => c.label);
  csvRows.push(headers.join(','));
  
  // Data Rows
  const keys = columns.map(c => c.key);
  for (const row of data) {
    const values = keys.map(key => {
      const value = row[key];
      if (value === null || value === undefined) return '';
      
      // Format currency values
      if (typeof value === 'number' && 
          (columns.find(c => c.key === key)?.align === 'right' || 
           key.toLowerCase().includes('amount') || 
           key.toLowerCase().includes('price') || 
           key.toLowerCase().includes('total') ||
           key.toLowerCase().includes('sales'))) {
        return formatCurrency(value);
      }
      
      // Format date/time values
      if (typeof value === 'string' && 
          (key.toLowerCase().includes('date') || 
           key.toLowerCase().includes('time') ||
           key.toLowerCase().includes('created_at') ||
           key.toLowerCase().includes('submitted_at') ||
           key.toLowerCase().includes('resolved_at'))) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return formatDateTimeLong(value);
          }
        } catch (e) {
          // Keep original value if date parsing fails
        }
      }
      
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(','));
  }
  
  const csvContent = csvRows.join('\n');
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

// Excel Export with professional formatting
export async function exportToExcel(exportData: ExportData, reportInfo: ReportInfo) {
  const { data, columns, summaryRows } = exportData;
  
  if (data.length === 0) {
    console.warn('No data to export to Excel');
    return;
  }

  // Dynamic import to reduce bundle size
  const ExcelJS = (await import('exceljs')).default;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  
  // Store Information Header
  worksheet.mergeCells('A1:E1');
  const storeCell = worksheet.getCell('A1');
  storeCell.value = reportInfo.storeSettings.store_name || 'ISRA HARDWARE TRADING';
  storeCell.font = { bold: true, size: 18, color: { argb: 'FF000000' } };
  storeCell.alignment = { horizontal: 'center' };
  
  worksheet.getCell('A2').value = `Address: ${reportInfo.storeSettings.address || '—'}`;
  worksheet.getCell('A3').value = `Contact: ${reportInfo.storeSettings.contact_number || '—'}`;
  worksheet.getCell('A4').value = `TIN: ${reportInfo.storeSettings.tin || '—'}`;
  worksheet.getCell('A5').value = `Business Style: ${reportInfo.storeSettings.business_license || '—'}`;
  worksheet.getCell('A6').value = `VAT Status: ${reportInfo.storeSettings.vat_registered ? 'VAT Registered' : 'Non-VAT'}`;
  
  worksheet.addRow([]);
  
  // Report Metadata
  worksheet.mergeCells('A8:E8');
  const titleCell = worksheet.getCell('A8');
  titleCell.value = reportInfo.title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };
  
  worksheet.getCell('A9').value = `Date Generated: ${formatDateLong(new Date().toISOString())}`;
  worksheet.getCell('A10').value = `Generated By: ${reportInfo.generatedBy}`;
  
  worksheet.addRow([]);
  
  // Filters
  const filterSummary = generateFilterSummary(reportInfo.filters);
  if (filterSummary.length > 0) {
    worksheet.getCell('A12').value = 'Applied Filters:';
    worksheet.getCell('A12').font = { bold: true };
    filterSummary.forEach((f, i) => {
      worksheet.getCell(`A${13 + i}`).value = f;
    });
    worksheet.addRow([]);
  }
  
  const startRow = filterSummary.length > 0 ? 13 + filterSummary.length + 2 : 14;
  
  worksheet.getCell(`A${startRow}`).value = `Total Records: ${data.length}`;
  worksheet.getCell(`A${startRow}`).font = { bold: true };
  worksheet.addRow([]);
  
  // Column Headers
  const headerRow = worksheet.addRow(columns.map(c => c.label));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 25;
  
  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // Data Rows with date formatting
  const keys = columns.map(c => c.key);
  data.forEach(row => {
    const values = keys.map(key => {
      const value = row[key];
      if (value === null || value === undefined) return '';
      
      // Format currency values
      if (typeof value === 'number' && 
          (columns.find(c => c.key === key)?.align === 'right' || 
           key.toLowerCase().includes('amount') || 
           key.toLowerCase().includes('price') || 
           key.toLowerCase().includes('total') ||
           key.toLowerCase().includes('sales'))) {
        return value;
      }
      
      // Format date/time values
      if (typeof value === 'string' && 
          (key.toLowerCase().includes('date') || 
           key.toLowerCase().includes('time') ||
           key.toLowerCase().includes('created_at') ||
           key.toLowerCase().includes('submitted_at') ||
           key.toLowerCase().includes('resolved_at'))) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return formatDateTimeLong(value);
          }
        } catch (e) {
          // Keep original value if date parsing fails
        }
      }
      
      return value;
    });
    const dataRow = worksheet.addRow(values);
    
    // Add borders to data cells
    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });
  
  // Summary Rows
  if (summaryRows && summaryRows.length > 0) {
    worksheet.addRow([]);
    summaryRows.forEach(summary => {
      const values = columns.map(c => {
        const val = summary.values[c.key];
        if (val === undefined || val === '') return '';
        return val;
      });
      const row = worksheet.addRow([summary.label, ...values.slice(1)]);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      row.alignment = { horizontal: 'right' };
      
      // Add borders to summary cells
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
  }
  
  // Prepared By Section
  const preparedByRow = worksheet.addRow([]);
  const preparedByLabel = worksheet.addRow(['Prepared By:', '', '', '', '']);
  preparedByLabel.font = { bold: true };
  const signatureRow = worksheet.addRow(['____________________', '', '', '', '']);
  const nameRow = worksheet.addRow(['Name & Signature', '', '', '', '']);
  nameRow.font = { italic: true, size: 9 };
  
  // Auto-size columns
  worksheet.columns.forEach(column => {
    if (!column) return;
    let maxLength = 0;
    column.eachCell?.({ includeEmpty: true }, cell => {
      const value = cell.value ? String(cell.value) : '';
      maxLength = Math.max(maxLength, value.length);
    });
    column.width = Math.min(maxLength + 4, 60);
  });
  
  // Currency formatting
  keys.forEach((key, index) => {
    if (columns[index].align === 'right' || 
        key.toLowerCase().includes('amount') || 
        key.toLowerCase().includes('price') || 
        key.toLowerCase().includes('total') ||
        key.toLowerCase().includes('sales')) {
      const column = worksheet.getColumn(index + 1);
      column.numFmt = '₱#,##0.00';
    }
  });
  
  // Generate file
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

// PDF Export with professional formatting
export async function exportToPDF(exportData: ExportData, reportInfo: ReportInfo) {
  const { data, columns, summaryRows } = exportData;
  
  if (data.length === 0) {
    console.warn('No data to export to PDF');
    return;
  }

  // Dynamic imports to reduce bundle size
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  const doc = new jsPDF({
    orientation: columns.length > 8 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  
  let yPosition = margin;
  
  // Store Name
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(reportInfo.storeSettings.store_name || 'ISRA HARDWARE TRADING', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 10;
  
  // Store Details
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Address: ${reportInfo.storeSettings.address || '—'}`, margin, yPosition);
  yPosition += 5;
  doc.text(`Contact: ${reportInfo.storeSettings.contact_number || '—'}`, margin, yPosition);
  yPosition += 5;
  doc.text(`TIN: ${reportInfo.storeSettings.tin || '—'}`, margin, yPosition);
  yPosition += 5;
  doc.text(`Business Style: ${reportInfo.storeSettings.business_license || '—'}`, margin, yPosition);
  yPosition += 5;
  doc.text(`VAT Status: ${reportInfo.storeSettings.vat_registered ? 'VAT Registered' : 'Non-VAT'}`, margin, yPosition);
  yPosition += 12;
  
  // Report Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(reportInfo.title, margin, yPosition);
  yPosition += 8;
  
  // Report Metadata
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date Generated: ${formatDateLong(new Date().toISOString())}`, margin, yPosition);
  yPosition += 5;
  doc.text(`Generated By: ${reportInfo.generatedBy}`, margin, yPosition);
  yPosition += 8;
  
  // Filters
  const filterSummary = generateFilterSummary(reportInfo.filters);
  if (filterSummary.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Applied Filters:', margin, yPosition);
    yPosition += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    filterSummary.forEach(f => {
      doc.text(f, margin + 5, yPosition);
      yPosition += 4;
    });
    yPosition += 5;
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Total Records: ${data.length}`, margin, yPosition);
  yPosition += 10;
  
  // Table Headers
  const tableHeaders = columns.map(c => c.label);
  const tableData = data.map(row => {
    return columns.map(c => {
      const value = row[c.key];
      if (value === null || value === undefined) return '';
      
      // Format currency values
      if (typeof value === 'number' && 
          (c.align === 'right' || 
           c.key.toLowerCase().includes('amount') || 
           c.key.toLowerCase().includes('price') || 
           c.key.toLowerCase().includes('total') ||
           c.key.toLowerCase().includes('sales'))) {
        return formatCurrency(value);
      }
      
      // Format date/time values
      if (typeof value === 'string' && 
          (c.key.toLowerCase().includes('date') || 
           c.key.toLowerCase().includes('time') ||
           c.key.toLowerCase().includes('created_at') ||
           c.key.toLowerCase().includes('submitted_at') ||
           c.key.toLowerCase().includes('resolved_at'))) {
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
    });
  });
  
  // Summary for table
  const summaryData = summaryRows ? summaryRows.map(s => {
    return columns.map(c => {
      const val = s.values[c.key];
      if (val === undefined || val === '') return '';
      if (typeof val === 'number') return formatCurrency(val);
      return String(val);
    });
  }) : [];
  
  // Generate table
  autoTable(doc, {
    head: [tableHeaders],
    body: tableData,
    foot: summaryData.length > 0 ? [summaryData[summaryData.length - 1]] : undefined,
    startY: yPosition,
    margin: { top: margin, right: margin, bottom: 30, left: margin },
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [68, 114, 196],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 10,
    },
    footStyles: {
      fillColor: [68, 114, 196],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.align === 'right') {
        acc[i] = { halign: 'right' };
      } else if (c.align === 'center') {
        acc[i] = { halign: 'center' };
      }
      return acc;
    }, {} as any),
    didDrawPage: (data) => {
      // Page number
      const pageNumber = data.pageNumber;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${pageNumber}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
      
      // Prepared By Section at bottom of each page
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Prepared By:', margin, pageHeight - 25);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('____________________', margin, pageHeight - 20);
      doc.text('Name & Signature', margin, pageHeight - 16);
    },
  });
  
  // Save file
  doc.save(generateFilename(reportInfo.title, reportInfo.dateFrom, reportInfo.dateTo, 'pdf'));
}

// Print Export - simple wrapper (components handle template rendering)
export function printReport() {
  window.print();
}
