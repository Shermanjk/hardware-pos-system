import httpClient from "@/shared/api/httpClient";

export interface ZReadingRecord {
  id: number;
  z_counter_no: number;
  z_counter_formatted: string;
  reset_counter_no: number;
  reading_date: string;
  opened_at: string;
  closed_at: string;
  generated_by: number;
  generated_by_name?: string;
  generated_by_username?: string;
  beg_invoice_no: string | null;
  end_invoice_no: string | null;
  beg_void_no: string | null;
  end_void_no: string | null;
  beg_return_no: string | null;
  end_return_no: string | null;
  old_grand_total: number;
  daily_gross_sales: number;
  new_grand_total: number;
  vatable_sales: number;
  vat_amount: number;
  vat_exempt_sales: number;
  zero_rated_sales: number;
  non_vat_sales: number;
  sc_discount: number;
  pwd_discount: number;
  regular_discount: number;
  total_discounts: number;
  total_returns: number;
  total_voids: number;
  net_sales: number;
  cash_sales: number;
  credit_sales: number;
  transaction_count: number;
  void_count: number;
  return_count: number;
  created_at: string;
}

export interface ZReadingPreviewData {
  z_counter_no: number;
  z_counter_formatted: string;
  reset_counter_no: number;
  opened_at: string;
  closed_at: string;
  reading_date: string;
  beg_invoice_no: string | null;
  end_invoice_no: string | null;
  beg_return_no: string | null;
  end_return_no: string | null;
  beg_void_no: string | null;
  end_void_no: string | null;
  old_grand_total: number;
  daily_gross_sales: number;
  new_grand_total: number;
  vatable_sales: number;
  vat_amount: number;
  vat_exempt_sales: number;
  zero_rated_sales: number;
  non_vat_sales: number;
  sc_discount: number;
  pwd_discount: number;
  regular_discount: number;
  total_discounts: number;
  total_returns: number;
  total_voids: number;
  net_sales: number;
  cash_sales: number;
  credit_sales: number;
  transaction_count: number;
  void_count: number;
  return_count: number;
}

export interface XReadingData {
  session_id: number;
  shift_label: string;
  cashier_name: string;
  cashier_username: string;
  opened_at: string;
  closed_at: string | null;
  session_status: string;
  beg_invoice_no: string | null;
  end_invoice_no: string | null;
  transaction_count: number;
  shift_gross: number;
  shift_discounts: number;
  shift_refunds: number;
  shift_net: number;
  opening_cash: number;
  cash_sales: number;
  credit_collections: number;
  cash_refunds: number;
  expected_cash: number;
  actual_cash: number | null;
  variance: number | null;
  status: string;
}

export async function getZReadingPreview(): Promise<ZReadingPreviewData | null> {
  try {
    const res = await httpClient.get<{ preview: ZReadingPreviewData }>("/api/bir/z-reading/preview");
    return res.data?.preview || null;
  } catch (err) {
    console.error("getZReadingPreview error:", err);
    return null;
  }
}

export async function createZReading(): Promise<{
  id: number;
  z_counter_no: number;
  z_counter_formatted: string;
  reset_counter_no: number;
  old_grand_total: number;
  daily_gross_sales: number;
  new_grand_total: number;
}> {
  const res = await httpClient.post("/api/bir/z-reading");
  return res.data;
}

export async function getZReadings(params?: {
  date_from?: string;
  date_to?: string;
  limit?: number;
}): Promise<ZReadingRecord[]> {
  try {
    const res = await httpClient.get<{ data: ZReadingRecord[] }>("/api/bir/z-readings", { params });
    if (Array.isArray(res.data?.data)) return res.data.data;
    if (Array.isArray(res.data)) return res.data;
    return [];
  } catch (err) {
    console.error("getZReadings error:", err);
    return [];
  }
}

export async function getZReading(id: number): Promise<ZReadingRecord> {
  const res = await httpClient.get<ZReadingRecord>(`/api/bir/z-reading/${id}`);
  return res.data;
}

export async function getXReading(sessionId: number): Promise<XReadingData> {
  const res = await httpClient.get<{ x_reading: XReadingData }>(`/api/bir/x-reading/${sessionId}`);
  return res.data.x_reading;
}

export async function downloadESalesCsv(month: number, year: number): Promise<void> {
  const res = await httpClient.get(`/api/bir/esales/export`, {
    params: { month, year },
    responseType: "blob",
  });
  
  // Extract filename from Content-Disposition header if available
  let filename = `POS_SALES_${String(month).padStart(2, "0")}${year}.csv`;
  const disposition = (res as any)?.headers?.["content-disposition"] || (res as any)?.headers?.["Content-Disposition"];
  if (disposition && typeof disposition === "string") {
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if (match && match[1]) filename = match[1];
  }

  const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Backward-compatible alias
export const downloadESalesDat = downloadESalesCsv;
