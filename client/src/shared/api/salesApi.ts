import httpClient from "@/shared/api/httpClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  product_name: string;
  barcode: string | null;
  is_returnable: number;
  quantity: number;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  unit_abbreviation?: string;
  unit_allow_decimal?: boolean;
  unit_price: number;
  subtotal: number;
  quantity_returned: number;
}

export interface Sale {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_address: string | null;
  customer_tin: string | null;
  cashier_id: number;
  cashier_name: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  cash_tendered: number;
  change_amount: number;
  void_status: "active" | "void_requested" | "voided";
  payment_status: "pending" | "completed" | "failed";
  receipt_printed: number | boolean;
  created_at: string;
  items: SaleItem[];
}

export interface SaleSummary {
  id: number;
  invoice_number: string;
  customer_name: string;
  cashier_name: string;
  total_amount: number;
  void_status: "active" | "void_requested" | "voided";
  payment_status: "pending" | "completed" | "failed";
  receipt_printed: number | boolean;
  created_at: string;
}

export interface CreateSalePayload {
  customer_name: string;
  customer_address?: string;
  customer_tin?: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  cash_tendered: number;
  change_amount: number;
  client_transaction_id?: string;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    tax_type?: "VATABLE" | "VAT_EXEMPT" | "ZERO_RATED" | "NON_TAXABLE";
  }>;
}

export interface SaleItemSnapshot {
  product_id:     number;
  tax_type:       "VATABLE" | "VAT_EXEMPT" | "ZERO_RATED" | "NON_TAXABLE";
  taxable_amount: number;
  vat_amount:     number;
  line_subtotal:  number;
}

export interface CreateSaleResult {
  invoice_number:  string;
  id:              number;
  subtotal:        number;
  vat_amount:      number;
  total_amount:    number;
  change_amount:   number;
  payment_status:  "pending" | "completed" | "failed";
  receipt_printed: boolean;
  items:           SaleItemSnapshot[];
  _idempotent?:    boolean;
}

export interface RecoveryStatus {
  pending_payment:      SaleSummary[];
  completed_unprinted:  SaleSummary[];
}

// ─── ID generation ────────────────────────────────────────────────────────────
export function generateClientTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `TXN-${timestamp}-${random}`;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function requestVoidSale(
  saleId: number,
  reason: string
): Promise<{ message: string; void_id: number }> {
  const response = await httpClient.post<{ message: string; void_id: number }>(
    `/api/sales/${saleId}/void-request`,
    { reason }
  );
  return response.data;
}

export async function createSale(payload: CreateSalePayload): Promise<CreateSaleResult> {
  const response = await httpClient.post<CreateSaleResult>("/api/sales", payload);
  return response.data;
}

export async function markReceiptPrinted(saleId: number): Promise<void> {
  await httpClient.patch(`/api/sales/${saleId}/mark-receipt-printed`, {});
}

export async function getSaleByInvoice(invoiceNumber: string): Promise<Sale> {
  const response = await httpClient.get<Sale>(
    `/api/sales/${encodeURIComponent(invoiceNumber)}`
  );
  return response.data;
}

export async function searchSales(params: {
  invoice_number?: string;
  customer_name?: string;
  date_from?: string;
  date_to?: string;
}): Promise<SaleSummary[]> {
  const response = await httpClient.get<SaleSummary[]>("/api/sales", { params });
  return response.data;
}

export async function getRecoveryStatus(): Promise<RecoveryStatus> {
  const response = await httpClient.get<RecoveryStatus>("/api/sales/recovery/pending");
  return response.data;
}

export async function fixPaymentStatus(
  saleId: number
): Promise<{ message: string; invoice_number: string }> {
  const response = await httpClient.patch<{ message: string; invoice_number: string }>(
    `/api/sales/recovery/${saleId}/fix-payment-status`,
    {}
  );
  return response.data;
}
