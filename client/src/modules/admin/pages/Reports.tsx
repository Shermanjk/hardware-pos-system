import { useState, useCallback, useEffect } from "react";
import { FileText, Download, RefreshCw, AlertCircle, Calendar, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { formatQuantity, formatQuantityForTable, type QuantityType } from "@/shared/utils/quantityFormat";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryRow {
  barcode: string; product_name: string; category: string;
  supplier: string; unit: string; quantity: number;
  quantity_type?: QuantityType;
  reorder_level: number; damaged_stock: number;
  cost_price: number; selling_price: number; stock_status: string;
}

interface FilterOption {
  id: number;
  full_name?: string;
  category_name?: string;
}

interface ReportData {
  period:      { date_from: string; date_to: string };
  summary: {
    total_transactions: number; total_revenue: number;
    total_vat: number; total_subtotal: number;
    avg_order_value: number; largest_sale: number; smallest_sale: number;
  };
  daily_sales:  { sale_date: string; transactions: number; subtotal: number; vat: number; total: number }[];
  top_products: { barcode: string; product_name: string; category: string; units_sold: number; revenue: number; unit_price: number }[];
  by_cashier:   { cashier: string; cashier_id: number; transactions: number; revenue: number }[];
  inventory:    InventoryRow[];
  low_stock:    InventoryRow[];
  filters: {
    cashiers: FilterOption[];
    categories: FilterOption[];
  };
  generated_at: string;
}

type ReportType = "full" | "sales" | "inventory" | "low_stock";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | string) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urgencyColor(s: string) {
  return s === "Out of Stock" ? "text-red-600" : s === "Critical" ? "text-orange-600" : s === "Low Stock" ? "text-amber-600" : "text-emerald-600";
}

function urgencyBadge(s: string) {
  const c =
    s === "Out of Stock" ? "bg-red-100 text-red-700 border-red-200" :
    s === "Critical"     ? "bg-orange-100 text-orange-700 border-orange-200" :
    s === "Low Stock"    ? "bg-amber-100 text-amber-700 border-amber-200" :
                           "bg-emerald-100 text-emerald-700 border-emerald-200";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${c}`}>{s}</span>;
}

// ─── Excel Generator ──────────────────────────────────────────────────────────

function generateExcel(data: ReportData, store: StoreSettings) {
  const storeName = store.store_name || "Isra Hardware";
  const wb = XLSX.utils.book_new();
  const add = (name: string, headers: string[], rows: (string | number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add("Summary", ["Metric","Value"], [
    ["Store", storeName],
    ["Report Period", `${data.period.date_from} to ${data.period.date_to}`],
    ["Generated", new Date(data.generated_at).toLocaleString("en-PH")], [""],
    ["Total Transactions", data.summary.total_transactions],
    ["Total Revenue", Number(data.summary.total_revenue)],
    ["Total VAT (12%)", Number(data.summary.total_vat)],
    ["Net Subtotal", Number(data.summary.total_subtotal)],
    ["Avg Order Value", Number(data.summary.avg_order_value)],
    ["Largest Sale", Number(data.summary.largest_sale)],
    ["Smallest Sale", Number(data.summary.smallest_sale)],
  ]);
  add("Daily Sales", ["Date","Transactions","Subtotal (₱)","VAT (₱)","Total (₱)"], [
    ...data.daily_sales.map((r) => [fmtDate(r.sale_date), r.transactions, Number(r.subtotal), Number(r.vat), Number(r.total)]),
    ["TOTAL", data.summary.total_transactions, Number(data.summary.total_subtotal), Number(data.summary.total_vat), Number(data.summary.total_revenue)],
  ]);
  add("Top Products", ["#","Barcode","Product","Category","Unit Price (₱)","Units Sold","Revenue (₱)"],
    data.top_products.map((r, i) => [i+1, r.barcode, r.product_name, r.category, Number(r.unit_price), r.units_sold, Number(r.revenue)]));
  add("By Cashier", ["Cashier","Transactions","Revenue (₱)"],
    data.by_cashier.map((r) => [r.cashier, r.transactions, Number(r.revenue)]));
  add("Inventory", ["Barcode","Product","Category","Supplier","Unit","Stock","Reorder","Damaged","Cost (₱)","Selling (₱)","Status"],
    data.inventory.map((r) => [r.barcode, r.product_name, r.category, r.supplier, r.unit, formatQuantityForTable(r.quantity, r.unit, r.quantity_type), r.reorder_level, r.damaged_stock, Number(r.cost_price), Number(r.selling_price), r.stock_status]));
  add("Low Stock", ["Barcode","Product","Category","Stock","Reorder Level","Units Needed","Status"],
    data.low_stock.length > 0
      ? data.low_stock.map((r) => [r.barcode, r.product_name, r.category, formatQuantityForTable(r.quantity, r.unit, r.quantity_type), r.reorder_level, Math.max(0, r.reorder_level - r.quantity), r.stock_status])
      : [["All products are sufficiently stocked"]]);
  XLSX.writeFile(wb, `${storeName.replace(/\s+/g, "_")}_Report_${data.period.date_from}_to_${data.period.date_to}.xlsx`);
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

function generatePDF(data: ReportData, store: StoreSettings) {
  const storeName = store.store_name || "ISRA HARDWARE";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = 14;

  const check = (n = 30) => {
    if (y + n > PH - 14) {
      doc.addPage();
      y = 14;
      // Add page header on new pages
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, PW, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(`${storeName} — BUSINESS PERFORMANCE REPORT`, M, 7);
      doc.setTextColor(0, 0, 0);
      y += 4;
    }
  };

  const sec = (t: string) => {
    check(16);
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, PW - M * 2, 7, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 64, 175);
    doc.text(t.toUpperCase(), M + 2, y + 5);
    doc.setTextColor(0, 0, 0);
    y += 10;
  };

  const tbl = (head: string[][], body: string[][], foot?: string[][], col?: Record<string, unknown>) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head,
      body,
      foot,
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      footStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      ...(col ?? {}),
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  };

  // ── Cover / Header ──
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PW, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`${storeName}`, M, 10);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("BUSINESS PERFORMANCE REPORT", M, 16);
  doc.setFontSize(7);
  doc.text(`Period: ${fmtDate(data.period.date_from)} to ${fmtDate(data.period.date_to)}`, M, 21);

  doc.setTextColor(0, 0, 0);
  y = 30;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated: ${new Date(data.generated_at).toLocaleString("en-PH")}`, M, y);
  doc.setTextColor(0, 0, 0);
  y += 10;

  // ── 1. Revenue Summary ──
  sec("1. Revenue Summary");
  tbl(
    [["Metric", "Value"]],
    [
      ["Total Transactions", String(data.summary.total_transactions)],
      ["Total Revenue", fmt(data.summary.total_revenue)],
      ["Total VAT (12%)", fmt(data.summary.total_vat)],
      ["Net Subtotal", fmt(data.summary.total_subtotal)],
      ["Avg Order Value", fmt(data.summary.avg_order_value)],
      ["Largest Sale", fmt(data.summary.largest_sale)],
      ["Smallest Sale", fmt(data.summary.smallest_sale)],
    ],
    undefined,
    {
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 70 },
        1: { halign: "right" },
      },
    }
  );

  // ── 2. Daily Sales Breakdown ──
  if (data.daily_sales.length > 0) {
    check(40);
    sec("2. Daily Sales Breakdown");
    tbl(
      [["Date", "Transactions", "Subtotal", "VAT", "Total"]],
      data.daily_sales.map((r) => [
        fmtDate(r.sale_date),
        String(r.transactions),
        fmt(r.subtotal),
        fmt(r.vat),
        fmt(r.total),
      ]),
      [
        [
          "TOTAL",
          String(data.summary.total_transactions),
          fmt(data.summary.total_subtotal),
          fmt(data.summary.total_vat),
          fmt(data.summary.total_revenue),
        ],
      ],
      {
        columnStyles: {
          0: { cellWidth: 50 },
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
        },
      }
    );
  }

  // ── 3. Top Selling Products ──
  if (data.top_products.length > 0) {
    check(40);
    sec("3. Top Selling Products");
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["#", "Barcode", "Product", "Category", "Unit Price", "Units Sold", "Revenue"]],
      body: data.top_products.map((r, i) => [
        String(i + 1),
        r.barcode,
        r.product_name,
        r.category,
        fmt(r.unit_price),
        String(r.units_sold),
        fmt(r.revenue),
      ]),
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 6 },
      bodyStyles: { fontSize: 6 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { cellWidth: 22 },
        4: { halign: "right" },
        5: { halign: "center" },
        6: { halign: "right" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── 4. Sales by Cashier ──
  if (data.by_cashier.length > 0) {
    check(40);
    sec("4. Sales by Cashier");
    tbl(
      [["Cashier", "Transactions", "Revenue"]],
      data.by_cashier.map((r) => [r.cashier, String(r.transactions), fmt(r.revenue)]),
      undefined,
      { columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } } }
    );
  }

  // ── 5. Inventory Report ──
  if (data.inventory.length > 0) {
    check(40);
    sec("5. Inventory Report");
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Barcode", "Product", "Category", "Stock", "Cost", "Selling", "Status"]],
      body: data.inventory.map((r) => [
        r.barcode,
        r.product_name,
        r.category,
        formatQuantityForTable(r.quantity, r.unit, r.quantity_type),
        fmt(r.cost_price),
        fmt(r.selling_price),
        r.stock_status,
      ]),
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 6 },
      bodyStyles: { fontSize: 6 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        3: { halign: "center" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "center" },
      },
      didParseCell: (h) => {
        if (h.column.index === 6 && h.section === "body") {
          const v = h.cell.raw as string;
          if (v === "Out of Stock") h.cell.styles.textColor = [220, 38, 38];
          else if (v === "Critical") h.cell.styles.textColor = [234, 88, 12];
          else if (v === "Low Stock") h.cell.styles.textColor = [217, 119, 6];
          else h.cell.styles.textColor = [22, 163, 74];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── 6. Low Stock / Reorder Report ──
  check(40);
  sec("6. Reorder / Low Stock Report");
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Barcode", "Product", "Category", "Stock", "Reorder", "Need", "Status"]],
    body:
      data.low_stock.length > 0
        ? data.low_stock.map((r) => [
            r.barcode,
            r.product_name,
            r.category,
            formatQuantityForTable(r.quantity, r.unit, r.quantity_type),
            String(r.reorder_level),
            String(Math.max(0, r.reorder_level - r.quantity)),
            r.stock_status,
          ])
        : [["—", "All products are sufficiently stocked", "", "", "", "", "In Stock"]],
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
    },
    didParseCell: (h) => {
      if (h.column.index === 6 && h.section === "body") {
        const v = h.cell.raw as string;
        if (v === "Out of Stock") h.cell.styles.textColor = [220, 38, 38];
        else if (v === "Critical") h.cell.styles.textColor = [234, 88, 12];
        else if (v === "Low Stock") h.cell.styles.textColor = [217, 119, 6];
        else h.cell.styles.textColor = [22, 163, 74];
      }
    },
  });

  // ── Page numbers ──
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`${storeName} POS — Confidential`, M, PH - 6);
    doc.text(`Page ${i} of ${pages}`, PW - M, PH - 6, { align: "right" });
  }

  doc.save(`${storeName.replace(/\s+/g, "_")}_Report_${data.period.date_from}_to_${data.period.date_to}.pdf`);
}

// ─── Print Helper ─────────────────────────────────────────────────────────────

function printReport(data: ReportData, store: StoreSettings) {
  const storeName = store.store_name || "ISRA HARDWARE";
  const css = `
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:20px}
    h1{font-size:16px;margin:0 0 2px;color:#1e3a8a}
    h2{font-size:12px;background:#1e3a8a;color:#fff;padding:5px 10px;margin:16px 0 8px;border-radius:3px}
    p.m{font-size:10px;color:#555;margin:0 0 14px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}
    th{background:#2563eb;color:#fff;font-size:9px;font-weight:bold;padding:5px 7px;text-align:left}
    td{padding:4px 7px;font-size:9px;border-bottom:1px solid #e5e7eb}
    tr:nth-child(even) td{background:#f8fafc}
    tfoot td{background:#1e3a8a;color:#fff;font-weight:bold}
    .r{text-align:right}
    .c{text-align:center}
    .red{color:#dc2626;font-weight:bold}
    .ora{color:#ea580c;font-weight:bold}
    .amb{color:#d97706;font-weight:bold}
    .grn{color:#16a34a;font-weight:bold}
    .header-bar{background:#2563eb;color:#fff;padding:12px 16px;border-radius:4px;margin-bottom:12px}
    .header-bar h1{margin:0;color:#fff;font-size:18px}
    .header-bar p{margin:4px 0 0;color:#dbeafe;font-size:10px}
    @media print{@page{margin:12mm}}
  `;
  const tr = (cells: string[], cls: string[] = []) =>
    `<tr>${cells.map((c, i) => `<td class="${cls[i] ?? ""}">${c}</td>`).join("")}</tr>`;
  const th = (cols: string[]) =>
    `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
  const sc = (s: string) =>
    s === "Out of Stock" ? "red" : s === "Critical" ? "ora" : s === "Low Stock" ? "amb" : "grn";

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${storeName} Report</title><style>${css}</style></head><body>
    <div class="header-bar">
      <h1>${storeName}</h1>
      <p>BUSINESS PERFORMANCE REPORT &mdash; Period: ${fmtDate(data.period.date_from)} – ${fmtDate(data.period.date_to)} | Generated: ${new Date(data.generated_at).toLocaleString("en-PH")}</p>
    </div>

    <h2>1. REVENUE SUMMARY</h2>
    <table>${th(["Metric", "Value"])}<tbody>
      ${[
        ["Total Transactions", String(data.summary.total_transactions)],
        ["Total Revenue", fmt(data.summary.total_revenue)],
        ["Total VAT (12%)", fmt(data.summary.total_vat)],
        ["Net Subtotal", fmt(data.summary.total_subtotal)],
        ["Avg Order Value", fmt(data.summary.avg_order_value)],
        ["Largest Sale", fmt(data.summary.largest_sale)],
        ["Smallest Sale", fmt(data.summary.smallest_sale)],
      ]
        .map((r) => tr(r, ["", "r"]))
        .join("")}</tbody></table>

    <h2>2. DAILY SALES BREAKDOWN</h2>
    <table>${th(["Date", "Transactions", "Subtotal", "VAT", "Total"])}<tbody>
      ${data.daily_sales
        .map((r) =>
          tr(
            [fmtDate(r.sale_date), String(r.transactions), fmt(r.subtotal), fmt(r.vat), fmt(r.total)],
            ["", "c", "r", "r", "r"]
          )
        )
        .join("")}
      </tbody><tfoot>${tr(
        ["TOTAL", String(data.summary.total_transactions), fmt(data.summary.total_subtotal), fmt(data.summary.total_vat), fmt(data.summary.total_revenue)],
        ["", "c", "r", "r", "r"]
      )}</tfoot></table>

    <h2>3. TOP SELLING PRODUCTS</h2>
    <table>${th(["#", "Barcode", "Product", "Category", "Unit Price", "Units Sold", "Revenue"])}<tbody>
      ${data.top_products
        .map((r, i) =>
          tr(
            [String(i + 1), r.barcode, r.product_name, r.category, fmt(r.unit_price), String(r.units_sold), fmt(r.revenue)],
            ["c", "", "", "", "r", "c", "r"]
          )
        )
        .join("")}</tbody></table>

    <h2>4. SALES BY CASHIER</h2>
    <table>${th(["Cashier", "Transactions", "Revenue"])}<tbody>
      ${data.by_cashier
        .map((r) => tr([r.cashier, String(r.transactions), fmt(r.revenue)], ["", "c", "r"]))
        .join("")}</tbody></table>

    <h2>5. INVENTORY REPORT</h2>
    <table>${th(["Barcode", "Product", "Category", "Stock", "Cost", "Selling", "Status"])}<tbody>
      ${data.inventory
        .map((r) =>
          tr(
            [r.barcode, r.product_name, r.category, formatQuantityForTable(r.quantity, r.unit, r.quantity_type), fmt(r.cost_price), fmt(r.selling_price), r.stock_status],
            ["", "", "", "c", "r", "r", sc(r.stock_status)]
          )
        )
        .join("")}</tbody></table>

    <h2>6. REORDER / LOW STOCK REPORT</h2>
    <table>${th(["Barcode", "Product", "Category", "Stock", "Reorder", "Need to Buy", "Status"])}<tbody>
      ${
        data.low_stock.length === 0
          ? `<tr><td colspan="7" class="grn" style="text-align:center;font-weight:bold;padding:12px">✓ All products are sufficiently stocked</td></tr>`
          : data.low_stock
              .map((r) =>
                tr(
                  [r.barcode, r.product_name, r.category, formatQuantityForTable(r.quantity, r.unit, r.quantity_type), String(r.reorder_level), String(Math.max(0, r.reorder_level - r.quantity)), r.stock_status],
                  ["", "", "", "c", "c", "c", sc(r.stock_status)]
                )
              )
              .join("")
      }
      </tbody></table>

    <p style="text-align:center;color:#999;font-size:8px;margin-top:20px">${storeName} POS — Confidential</p>
    <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}

// ─── Main Reports Page ────────────────────────────────────────────────────────

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today.slice(0, 7) + "-01");
  const [dateTo, setDateTo] = useState(today);
  const [reportType, setReportType] = useState<ReportType>("full");
  const [categoryId, setCategoryId] = useState<string>("");
  const [cashierId, setCashierId] = useState<string>("");
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "excel" | "print" | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    store_name: "", store_fb: "", store_phone: "", store_address: "",
    currency: "PHP", tax_rate: 0, business_license: "",
    registered_taxpayer_name: "", tin: "", document_type: "SALES INVOICE",
    vat_registered: false, pos_min: undefined, pos_serial: undefined,
  });

  useEffect(() => {
    getSettings().then(setStoreSettings).catch(() => { /* use defaults */ });
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string> = {
        date_from: dateFrom,
        date_to: dateTo,
        report_type: reportType,
      };
      if (categoryId) params.category_id = categoryId;
      if (cashierId) params.cashier_id = cashierId;

      const res = await axios.get<ReportData>("/api/reports", {
        headers: authHeaders(),
        params,
      });
      setData(res.data);
    } catch (err) {
      setLoadError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message ?? "Failed to load report.")
          : "Failed."
      );
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, reportType, categoryId, cashierId]);

  const handleExport = (type: "pdf" | "excel" | "print") => {
    if (!data) return;
    setExporting(type);
    try {
      if (type === "pdf") generatePDF(data, storeSettings);
      if (type === "excel") generateExcel(data, storeSettings);
      if (type === "print") printReport(data, storeSettings);
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    setCategoryId("");
    setCashierId("");
  };

  const hasActiveFilters = categoryId !== "" || cashierId !== "";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Generate and export business performance reports</p>
        </div>
        {data && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2 h-9 text-sm border-gray-300"
              onClick={() => handleExport("print")}
              disabled={!!exporting}
            >
              <Download className="h-4 w-4" />
              {exporting === "print" ? "Preparing…" : "Print"}
            </Button>
            <Button
              variant="outline"
              className="gap-2 h-9 text-sm text-emerald-700 border-gray-300 hover:bg-emerald-50"
              onClick={() => handleExport("excel")}
              disabled={!!exporting}
            >
              <Table2 className="h-4 w-4" />
              {exporting === "excel" ? "Generating…" : "Excel"}
            </Button>
            <Button
              className="gap-2 h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleExport("pdf")}
              disabled={!!exporting}
            >
              {exporting === "pdf" && <Spinner className="text-white" />}
              <FileText className="h-4 w-4" />
              {exporting === "pdf" ? "Generating…" : "PDF"}
            </Button>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date From */}
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Date From
            </Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-sm pl-8 w-44"
              />
            </div>
          </div>

          {/* Date To */}
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Date To
            </Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-sm pl-8 w-44"
              />
            </div>
          </div>

          {/* Report Type */}
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Report Type
            </Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Report</SelectItem>
                <SelectItem value="sales">Sales Summary</SelectItem>
                <SelectItem value="inventory">Inventory Report</SelectItem>
                <SelectItem value="low_stock">Low Stock Report</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category Filter */}
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Category
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {data?.filters?.categories?.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {cat.category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cashier Filter */}
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Cashier
            </Label>
            <Select value={cashierId} onValueChange={setCashierId}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="All Cashiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cashiers</SelectItem>
                {data?.filters?.cashiers?.map((cashier) => (
                  <SelectItem key={cashier.id} value={String(cashier.id)}>
                    {cashier.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={load}
              disabled={isLoading}
              className="h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              {isLoading ? <Spinner className="text-white" /> : <RefreshCw className="h-4 w-4" />}
              {isLoading ? "Generating…" : "Generate Report"}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="h-9 gap-1 text-sm border-gray-300"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {data && (
          <p className="text-xs text-gray-400 mt-3">
            Generated: {new Date(data.generated_at).toLocaleString("en-PH")} · Period:{" "}
            {fmtDate(data.period.date_from)} – {fmtDate(data.period.date_to)}
            {hasActiveFilters && " · Filters applied"}
          </p>
        )}
      </div>

      {/* Error */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{loadError}</p>
          <button onClick={load} className="text-red-600 font-semibold text-sm hover:underline">
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!data && !isLoading && !loadError && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
              <FileText className="h-7 w-7 text-blue-400" />
            </div>
            <p className="font-semibold text-gray-700">No report generated yet</p>
            <p className="text-xs text-gray-400">
              Select filters and click Generate Report
            </p>
          </div>
        </div>
      )}

      {/* Report Data */}
      {data && (
        <>
          {/* 1. Revenue Summary - always show */}
          <section>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
              1. Revenue Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { l: "Total Transactions", v: data.summary.total_transactions.toLocaleString(), c: "text-blue-600" },
                { l: "Total Revenue", v: fmt(data.summary.total_revenue), c: "text-emerald-600" },
                { l: "Total VAT (12%)", v: fmt(data.summary.total_vat), c: "text-purple-600" },
                { l: "Avg Order Value", v: fmt(data.summary.avg_order_value), c: "text-amber-600" },
              ].map((c) => (
                <div
                  key={c.l}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
                >
                  <p className="text-xs text-gray-500 font-medium">{c.l}</p>
                  <p className={`text-xl font-bold ${c.c} tabular-nums mt-1`}>{c.v}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Daily Sales Breakdown */}
          {data.daily_sales.length > 0 && (reportType === "full" || reportType === "sales") && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                2. Daily Sales Breakdown
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b-2 border-gray-200">
                      {["Date", "Transactions", "Subtotal", "VAT", "Total"].map((h, i) => (
                        <th
                          key={h}
                          className={`py-3 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide ${
                            i === 0 ? "text-left" : "text-right"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.daily_sales.map((r) => (
                      <tr key={r.sale_date} className="hover:bg-gray-50">
                        <td className="py-3 px-5 font-medium text-gray-800">
                          {fmtDate(r.sale_date)}
                        </td>
                        <td className="py-3 px-5 text-right text-gray-700 tabular-nums">
                          {r.transactions}
                        </td>
                        <td className="py-3 px-5 text-right text-gray-700 tabular-nums">
                          {fmt(r.subtotal)}
                        </td>
                        <td className="py-3 px-5 text-right text-gray-700 tabular-nums">
                          {fmt(r.vat)}
                        </td>
                        <td className="py-3 px-5 text-right font-bold text-gray-900 tabular-nums">
                          {fmt(r.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-600 text-white">
                      <td className="py-3 px-5 font-bold">TOTAL</td>
                      <td className="py-3 px-5 text-right font-bold tabular-nums">
                        {data.summary.total_transactions}
                      </td>
                      <td className="py-3 px-5 text-right font-bold tabular-nums">
                        {fmt(data.summary.total_subtotal)}
                      </td>
                      <td className="py-3 px-5 text-right font-bold tabular-nums">
                        {fmt(data.summary.total_vat)}
                      </td>
                      <td className="py-3 px-5 text-right font-bold tabular-nums">
                        {fmt(data.summary.total_revenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* 3. Top Selling Products */}
          {data.top_products.length > 0 && (reportType === "full" || reportType === "sales") && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                3. Top Selling Products
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b-2 border-gray-200">
                      {["#", "Barcode", "Product", "Category", "Unit Price", "Units Sold", "Revenue"].map(
                        (h, i) => (
                          <th
                            key={h}
                            className={`py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide ${
                              i <= 3 ? "text-left" : "text-right"
                            }`}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.top_products.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-3 px-4 text-center font-bold text-gray-400">{i + 1}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {r.barcode}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900">{r.product_name}</td>
                        <td className="py-3 px-4">
                          <span className="text-xs bg-slate-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {r.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-700 tabular-nums">
                          {fmt(r.unit_price)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900 tabular-nums">
                          {r.units_sold}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700 tabular-nums">
                          {fmt(r.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 4. Sales by Cashier */}
          {data.by_cashier.length > 0 && (reportType === "full" || reportType === "sales") && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                4. Sales by Cashier
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b-2 border-gray-200">
                      <th className="text-left py-3 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                        Cashier
                      </th>
                      <th className="text-right py-3 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                        Transactions
                      </th>
                      <th className="text-right py-3 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                        Revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.by_cashier.map((r) => (
                      <tr key={r.cashier} className="hover:bg-gray-50">
                        <td className="py-3 px-5 font-semibold text-gray-900">{r.cashier}</td>
                        <td className="py-3 px-5 text-right text-gray-700 tabular-nums">
                          {r.transactions}
                        </td>
                        <td className="py-3 px-5 text-right font-bold text-emerald-700 tabular-nums">
                          {fmt(r.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 5. Inventory Report */}
          {(reportType === "full" || reportType === "inventory") && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                5. Inventory Report
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {data.inventory.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-gray-500 font-semibold">No inventory data available</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          {["Barcode", "Product", "Category", "Stock", "Cost", "Selling", "Status"].map(
                            (h, i) => (
                              <th
                                key={h}
                                className={`py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide ${
                                  i < 3 ? "text-left" : "text-center"
                                }`}
                              >
                                {h}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.inventory.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-3 px-4 font-mono text-xs text-gray-600">{r.barcode}</td>
                            <td className="py-3 px-4 font-semibold text-gray-900">{r.product_name}</td>
                            <td className="py-3 px-4">
                              <span className="text-xs bg-slate-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {r.category}
                              </span>
                            </td>
                            <td className={`py-3 px-4 text-center font-bold tabular-nums ${urgencyColor(r.stock_status)}`}>
                              {formatQuantity(r.quantity, r.unit, r.quantity_type)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-700 tabular-nums">
                              {fmt(r.cost_price)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-700 tabular-nums">
                              {fmt(r.selling_price)}
                            </td>
                            <td className="py-3 px-4 text-center">{urgencyBadge(r.stock_status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 6. Low Stock / Reorder Report */}
          {(reportType === "full" || reportType === "low_stock" || reportType === "inventory") && (
            <section>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                6. Reorder / Low Stock Report
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {data.low_stock.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-emerald-600 font-semibold">✓ All products are sufficiently stocked</p>
                    <p className="text-xs text-gray-400 mt-1">
                      No products are at or below their reorder level
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        {["Barcode", "Product", "Category", "Stock", "Reorder", "Need to Buy", "Status"].map(
                          (h, i) => (
                            <th
                              key={h}
                              className={`py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide ${
                                i < 3 ? "text-left" : "text-center"
                              }`}
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.low_stock.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-mono text-xs text-gray-600">{r.barcode}</td>
                          <td className="py-3 px-4 font-semibold text-gray-900">{r.product_name}</td>
                          <td className="py-3 px-4">
                            <span className="text-xs bg-slate-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {r.category}
                            </span>
                          </td>
                          <td className={`py-3 px-4 text-center font-bold tabular-nums ${urgencyColor(r.stock_status)}`}>
                            {formatQuantity(r.quantity, r.unit, r.quantity_type)}
                          </td>
                          <td className="py-3 px-4 text-center text-gray-500 tabular-nums">
                            {r.reorder_level}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs tabular-nums">
                              +{Math.max(0, r.reorder_level - r.quantity)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">{urgencyBadge(r.stock_status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}