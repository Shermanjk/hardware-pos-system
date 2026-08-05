import httpClient from "./httpClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CashSession {
  id:                   number;
  cashier_id:           number;
  cashier_name:         string;
  cashier_employee_id:  string | null;
  shift_date:           string;   // "YYYY-MM-DD"
  shift_label:          string;
  opened_at:            string;   // ISO datetime
  closed_at:            string | null;
  opening_cash:         number;
  cash_sales:           number | null;
  cash_refunds:         number | null;
  cash_paid_out:        number | null;
  expected_cash:        number | null;
  actual_cash:          number | null;
  variance:             number | null;
  status:               "Balanced" | "Short" | "Over" | null;
  review_notes:         string | null;
  reviewed_at:          string | null;
  reviewer_name:        string | null;
  session_status:       "open" | "closed";
  sales?:               SessionSale[];
  refunds?:             SessionRefund[];
}

export interface SessionSale {
  id:                 number;
  invoice_number:     string;
  total_amount:       number;
  created_at:         string;
  transaction_status: string;
  void_status:        string;
  customer_name:      string;
}

export interface SessionRefund {
  id:             number;
  return_number:  string;
  refund_amount:  number;
  created_at:     string;
  resolution:     string;
  invoice_number: string;
  status:         string;
}

export interface OpenSessionPayload {
  opening_cash: number;
  shift_label?: string;
}

export interface CloseSessionPayload {
  actual_cash: number;
}

export interface CloseSessionResult {
  id:            number;
  opening_cash:  number;
  cash_sales:    number;
  cash_refunds:  number;
  cash_paid_out: number;
  expected_cash: number;
  actual_cash:   number;
  variance:      number;
  status:        "Balanced" | "Short" | "Over";
  message:       string;
}

export interface SessionListParams {
  cashier_id?:  number;
  date_from?:   string;
  date_to?:     string;
  shift_label?: string;
  status?:      "Balanced" | "Short" | "Over" | "";
  page?:        number;
  limit?:       number;
}

export interface SessionListResponse {
  data:  CashSession[];
  total: number;
  page:  number;
  limit: number;
}

export interface CashierOption {
  id:          number;
  full_name:   string;
  employee_id: string | null;
}

// ─── API functions ────────────────────────────────────────────────────────────

/** Cashier: open a new shift session */
export async function openSession(payload: OpenSessionPayload): Promise<{ id: number; message: string }> {
  const res = await httpClient.post("/api/cash-reconciliation/open-session", payload);
  return res.data;
}

/** Cashier: get current open session (returns null if none) */
export async function getMySession(): Promise<CashSession | null> {
  const res = await httpClient.get<{ session: CashSession | null }>("/api/cash-reconciliation/my-session");
  return res.data.session;
}

/** Cashier: submit end-of-shift cash count */
export async function closeSession(payload: CloseSessionPayload): Promise<CloseSessionResult> {
  const res = await httpClient.post("/api/cash-reconciliation/close-session", payload);
  return res.data;
}

/** Admin: list sessions with optional filters */
export async function listSessions(params: SessionListParams = {}): Promise<SessionListResponse> {
  const res = await httpClient.get("/api/cash-reconciliation", { params });
  return res.data;
}

/** Admin or owning Cashier: get session detail with sales/refunds */
export async function getSessionDetail(id: number): Promise<CashSession> {
  const res = await httpClient.get(`/api/cash-reconciliation/${id}`);
  return res.data;
}

/** Admin: save review notes on a session */
export async function reviewSession(id: number, review_notes: string): Promise<void> {
  await httpClient.patch(`/api/cash-reconciliation/${id}/review`, { review_notes });
}

/** Admin: get list of cashiers for filter dropdown */
export async function getCashiers(): Promise<CashierOption[]> {
  const res = await httpClient.get("/api/cash-reconciliation/cashiers/list");
  return res.data;
}
