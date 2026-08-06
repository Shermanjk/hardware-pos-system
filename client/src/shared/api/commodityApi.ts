import httpClient from "@/shared/api/httpClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type ApprovalStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface CommodityProduct {
  id: number;
  product_name: string;
  barcode: string;
  pricing_type: "FIXED_PRICE" | "MARKET_BASED";
  unit: string;
  unit_abbreviation: string;
  unit_id: number;
  quantity: number;
  current_price: number | null;
  price_effective_from: string | null;
}

export interface CommodityPriceRecord {
  id: number;
  price_per_unit: number;
  effective_from: string;
  reason: string | null;
  changed_by_name: string;
}

export interface CommodityCurrentPrice extends CommodityPriceRecord {
  product_id: number;
  product_name: string;
  unit: string;
  unit_abbreviation: string;
}

export interface CommodityPurchase {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string;
  seller: string;
  seller_name: string | null;
  seller_address: string | null;
  seller_contact: string | null;
  quantity: number;
  unit_name: string;
  reference_price: number;
  deducted_quantity: number;
  payable_quantity: number;
  deduction_amount: number;
  deduction_per_unit: number;
  final_unit_price: number;
  gross_amount: number;
  total_deduction: number;
  final_amount: number;
  payment_status: PaymentStatus;
  approval_status?: ApprovalStatus;
  amount_paid: number;
  balance_due: number;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  remarks: string | null;
  transaction_date: string;
  created_at: string;
  recorded_by_name: string;
  prepared_by_name?: string;
  approved_by_name?: string;
  approved_at?: string;
  rejected_by?: number;
  rejected_at?: string;
  rejection_reason?: string;
}

export interface CommodityPaymentEvent {
  id: number;
  commodity_purchase_id: number;
  amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  recorded_by_name: string;
}

export interface SetPricePayload {
  price_per_unit: number;
  reason?: string | null;
}

export interface RecordPurchasePayload {
  product_id: number;
  supplier_id?: number | null;
  seller_name?: string | null;
  seller_address?: string | null;
  seller_contact?: string | null;
  quantity: number;
  deducted_quantity?: number;
  deduction_per_unit?: number;
  transaction_date: string;
  remarks?: string | null;
  payment_status?: PaymentStatus;
  amount_paid?: number;
  payment_method?: string | null;
  payment_reference?: string | null;
}

export interface RecordPaymentPayload {
  amount: number;
  payment_method?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
}

export interface PurchaseResult {
  message: string;
  id: number;
  product_id: number;
  quantity: number;
  deducted_quantity: number;
  payable_quantity: number;
  deduction_amount: number;
  reference_price: number;
  deduction_per_unit: number;
  final_unit_price: number;
  gross_amount: number;
  total_deduction: number;
  final_amount: number;
  status: ApprovalStatus;
  payment_status: PaymentStatus;
  amount_paid: number;
  balance_due: number;
  new_stock_quantity?: number;
}

export interface ApproveResult {
  message: string;
  id: number;
  status: ApprovalStatus;
  new_stock_quantity: number;
}

export interface RejectResult {
  message: string;
  id: number;
  status: ApprovalStatus;
}

export interface PaymentResult {
  message: string;
  purchase_id: number;
  payment_event_id: number;
  amount_this_payment: number;
  total_amount_paid: number;
  balance_due: number;
  payment_status: PaymentStatus;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getCommodityProducts(): Promise<CommodityProduct[]> {
  const res = await httpClient.get<CommodityProduct[]>("/api/commodity-prices/products");
  return res.data;
}

export async function getCurrentPrice(productId: number): Promise<CommodityCurrentPrice> {
  const res = await httpClient.get<CommodityCurrentPrice>(
    `/api/commodity-prices/${productId}/current`
  );
  return res.data;
}

export async function getPriceHistory(productId: number): Promise<CommodityPriceRecord[]> {
  const res = await httpClient.get<CommodityPriceRecord[]>(
    `/api/commodity-prices/${productId}/history`
  );
  return res.data;
}

export async function setPrice(
  productId: number,
  payload: SetPricePayload
): Promise<{ message: string; id: number; price_per_unit: number; previous_price: number | null }> {
  const res = await httpClient.post(
    `/api/commodity-prices/${productId}/set-price`,
    payload
  );
  return res.data;
}

export async function submitCommodityPurchase(
  payload: RecordPurchasePayload
): Promise<PurchaseResult> {
  const res = await httpClient.post<PurchaseResult>(
    "/api/commodity-prices/purchase",
    payload
  );
  return res.data;
}

export async function getPendingCommodityPurchases(): Promise<CommodityPurchase[]> {
  const res = await httpClient.get<CommodityPurchase[]>(
    "/api/commodity-prices/purchases/pending"
  );
  return res.data;
}

export async function getApprovedCommodityPurchases(
  payment_status?: PaymentStatus
): Promise<CommodityPurchase[]> {
  const params: Record<string, string> = {};
  if (payment_status) params.payment_status = payment_status;
  const res = await httpClient.get<CommodityPurchase[]>(
    "/api/commodity-prices/purchases/approved",
    { params }
  );
  return res.data;
}

export async function approveCommodityPurchase(purchaseId: number): Promise<ApproveResult> {
  const res = await httpClient.post<ApproveResult>(
    `/api/commodity-prices/purchases/${purchaseId}/approve`,
    {}
  );
  return res.data;
}

export async function rejectCommodityPurchase(
  purchaseId: number,
  rejection_reason: string
): Promise<RejectResult> {
  const res = await httpClient.post<RejectResult>(
    `/api/commodity-prices/purchases/${purchaseId}/reject`,
    { rejection_reason }
  );
  return res.data;
}

export async function localOverrideCommodityPurchase(
  purchaseId: number,
  payload: { username: string; password: string }
): Promise<{ message: string; id: number; status: string; new_stock_quantity: number; admin_name: string; admin_id: number }> {
  const res = await httpClient.post(
    `/api/commodity-prices/purchases/${purchaseId}/local-override`,
    payload
  );
  return res.data;
}

export async function authorizeCommodityPurchase(
  purchasePayload: RecordPurchasePayload,
  credentials: { username: string; password: string }
): Promise<{ message: string; id: number; status: string; new_stock_quantity: number; admin_name: string; admin_id: number; payable_quantity: number; final_amount: number }> {
  const res = await httpClient.post(
    "/api/commodity-prices/purchases/authorize",
    { ...purchasePayload, ...credentials }
  );
  return res.data;
}

// Legacy alias
export const recordPurchase = submitCommodityPurchase;

export async function recordPayment(
  purchaseId: number,
  payload: RecordPaymentPayload
): Promise<PaymentResult> {
  const res = await httpClient.post<PaymentResult>(
    `/api/commodity-prices/purchases/${purchaseId}/payment`,
    payload
  );
  return res.data;
}

export async function getPaymentHistory(purchaseId: number): Promise<CommodityPaymentEvent[]> {
  const res = await httpClient.get<CommodityPaymentEvent[]>(
    `/api/commodity-prices/purchases/${purchaseId}/payments`
  );
  return res.data;
}

export async function getPurchaseHistory(
  filters: {
    product_id?: number;
    date_from?: string;
    date_to?: string;
    payment_status?: PaymentStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<CommodityPurchase[]> {
  const params: Record<string, string> = {};
  if (filters.product_id)    params.product_id    = String(filters.product_id);
  if (filters.date_from)     params.date_from     = filters.date_from;
  if (filters.date_to)       params.date_to       = filters.date_to;
  if (filters.payment_status) params.payment_status = filters.payment_status;
  if (filters.limit)         params.limit         = String(filters.limit);
  if (filters.offset)        params.offset        = String(filters.offset);

  const res = await httpClient.get<CommodityPurchase[]>(
    "/api/commodity-prices/purchases",
    { params }
  );
  return res.data;
}

// ─── External Processing Delivery Types & APIs ────────────────────────────────

export interface ExternalProcessingCompany {
  id: number;
  name: string;
  address: string | null;
  contact: string | null;
  is_active: number;
  created_at: string;
}

export interface CreateCompanyPayload {
  name: string;
  address?: string | null;
  contact?: string | null;
}

export interface ExternalProcessingDelivery {
  id: number;
  delivery_reference: string;
  product_id: number;
  product_name: string;
  unit: string;
  unit_abbreviation: string;
  quantity: number;
  company_id: number;
  company_name: string;
  delivery_date: string;
  delivered_by: string | null;
  remarks: string | null;
  created_at: string;
  recorded_by_name: string;
}

export interface RecordDeliveryPayload {
  product_id: number;
  quantity: number;
  company_id?: number | null;
  company_name?: string;
  delivery_date: string;
  delivered_by?: string | null;
  remarks?: string | null;
}

export interface RecordDeliveryResult {
  message: string;
  id: number;
  delivery_reference: string;
  product_id: number;
  product_name: string;
  quantity: number;
  company: string;
  delivery_date: string;
  delivered_by: string | null;
  remarks: string | null;
  previous_stock: number;
  remaining_stock: number;
}

export async function getEprCompanies(): Promise<ExternalProcessingCompany[]> {
  const res = await httpClient.get<ExternalProcessingCompany[]>(
    "/api/external-processing/companies"
  );
  return res.data;
}

export async function updateEprCompany(
  id: number,
  payload: CreateCompanyPayload
): Promise<ExternalProcessingCompany> {
  const res = await httpClient.put<ExternalProcessingCompany>(
    `/api/external-processing/companies/${id}`,
    payload
  );
  return res.data;
}

export async function deleteEprCompany(id: number): Promise<{ message: string }> {
  const res = await httpClient.delete<{ message: string }>(
    `/api/external-processing/companies/${id}`
  );
  return res.data;
}

export async function createEprCompany(
  payload: CreateCompanyPayload
): Promise<ExternalProcessingCompany> {
  const res = await httpClient.post<ExternalProcessingCompany>(
    "/api/external-processing/companies",
    payload
  );
  return res.data;
}

export async function recordEprDelivery(
  payload: RecordDeliveryPayload
): Promise<RecordDeliveryResult> {
  const res = await httpClient.post<RecordDeliveryResult>(
    "/api/external-processing/deliveries",
    payload
  );
  return res.data;
}

export async function getEprDeliveries(
  filters: {
    product_id?: number;
    company_id?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ExternalProcessingDelivery[]> {
  const params: Record<string, string> = {};
  if (filters.product_id) params.product_id = String(filters.product_id);
  if (filters.company_id) params.company_id = String(filters.company_id);
  if (filters.date_from)  params.date_from  = filters.date_from;
  if (filters.date_to)    params.date_to    = filters.date_to;
  if (filters.search)     params.search     = filters.search;
  if (filters.limit)      params.limit      = String(filters.limit);
  if (filters.offset)     params.offset     = String(filters.offset);

  const res = await httpClient.get<ExternalProcessingDelivery[]>(
    "/api/external-processing/deliveries",
    { params }
  );
  return res.data;
}

export async function getEprDelivery(id: number): Promise<ExternalProcessingDelivery> {
  const res = await httpClient.get<ExternalProcessingDelivery>(
    `/api/external-processing/deliveries/${id}`
  );
  return res.data;
}
