import httpClient from "./httpClient";

export interface Customer {
  id: number;
  customer_code: string;
  full_name: string;
  address?: string;
  contact_number?: string;
  tin?: string;
  business_style?: string;
  credit_limit: number;
  current_balance: number;
  is_credit_enabled: boolean;
  status: "Active" | "Inactive";
  created_at: string;
  updated_at?: string;
  created_by_name?: string;
}

export interface CustomerSearchResult {
  id: number;
  customer_code: string;
  full_name: string;
  address?: string;
  contact_number?: string;
  credit_limit: number;
  current_balance: number;
  is_credit_enabled: boolean;
  status: "Active" | "Inactive";
}

export interface CreditLedgerEntry {
  id: number;
  entry_type: "CREDIT_SALE" | "PAYMENT" | "VOID_REVERSAL" | "ADJUSTMENT";
  amount: number;
  amount_remaining: number | null; // only for CREDIT_SALE entries
  reference: string | null;
  notes: string | null;
  created_at: string;
  sale_id: number | null;
  invoice_number: string | null;
  recorded_by_name: string;
  authorized_by_name: string | null;
}

export interface CreateCustomerPayload {
  full_name: string;
  address?: string;
  contact_number?: string;
  tin?: string;
  business_style?: string;
}

export interface RecordPaymentPayload {
  amount: number;
  notes?: string;
}

export interface CreditSettingsPayload {
  is_credit_enabled: boolean;
  credit_limit: number;
}

// ─── Search (typeahead for checkout) ─────────────────────────────────────────
export async function searchCustomers(q: string): Promise<CustomerSearchResult[]> {
  const res = await httpClient.get<CustomerSearchResult[]>("/api/customers/search", {
    params: { q },
  });
  return res.data;
}

// ─── List all customers ───────────────────────────────────────────────────────
export async function getCustomers(params?: { status?: string; credit_enabled?: boolean }): Promise<Customer[]> {
  const res = await httpClient.get<Customer[]>("/api/customers", { params });
  return res.data;
}

// ─── Get single customer ──────────────────────────────────────────────────────
export async function getCustomer(id: number): Promise<Customer> {
  const res = await httpClient.get<Customer>(`/api/customers/${id}`);
  return res.data;
}

// ─── Get customer ledger ──────────────────────────────────────────────────────
export async function getCustomerLedger(customerId: number): Promise<CreditLedgerEntry[]> {
  const res = await httpClient.get<CreditLedgerEntry[]>(`/api/customers/${customerId}/ledger`);
  return res.data;
}

// ─── Create customer ──────────────────────────────────────────────────────────
export async function createCustomer(payload: CreateCustomerPayload): Promise<{ id: number; customer_code: string; full_name: string }> {
  const res = await httpClient.post("/api/customers", payload);
  return res.data;
}

// ─── Update customer basic info ───────────────────────────────────────────────
export async function updateCustomer(id: number, payload: Partial<CreateCustomerPayload & { status: string }>): Promise<void> {
  await httpClient.put(`/api/customers/${id}`, payload);
}

// ─── Update credit settings (Admin only) ──────────────────────────────────────
export async function updateCreditSettings(id: number, payload: CreditSettingsPayload): Promise<void> {
  await httpClient.put(`/api/customers/${id}/credit-settings`, payload);
}

// ─── Record credit payment ────────────────────────────────────────────────────
export async function recordCreditPayment(
  customerId: number,
  payload: RecordPaymentPayload
): Promise<{ ledger_id: number; reference: string; amount_paid: number; new_balance: number; customer_name: string }> {
  const res = await httpClient.post(`/api/customers/${customerId}/payments`, payload);
  return res.data;
}

// ─── Record adjustment (Admin only) ──────────────────────────────────────────
export async function recordAdjustment(
  customerId: number,
  amount: number,
  notes: string
): Promise<{ ledger_id: number; amount: number; new_balance: number }> {
  const res = await httpClient.post(`/api/customers/${customerId}/adjustments`, { amount, notes });
  return res.data;
}
