import httpClient from "@/shared/api/httpClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthType =
  | "DISCOUNT"
  | "VOID"
  | "RETURN"
  | "STOCK_COUNT_STANDARD"
  | "STOCK_COUNT_MARKET"
  | "COMMODITY_PURCHASE";

export type FinalDecision = "APPROVED" | "REJECTED" | "PENDING" | "CANCELLED" | "COMPLETED";

export interface AuthHistoryRow {
  auth_type: AuthType;
  source_id: number;
  reference: string;
  auth_type_label: string;
  requester_name: string;
  requester_id: number;
  admin_name: string;
  admin_id: number | null;
  customer_name: string;
  reason: string;
  rejection_reason: string | null;
  requested_action: string;
  final_decision: FinalDecision;
  status_normalized: string;
  created_at: string;
  resolved_at: string | null;
  extra_ref: string;
}

export interface AuthHistoryListResponse {
  total: number;
  rows: AuthHistoryRow[];
}

export interface AuthHistoryFilters {
  type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  requested_by?: string;
  admin_id?: string;
  limit?: number;
  offset?: number;
}

export interface ReportTypeSummary {
  label: string;
  APPROVED: number;
  REJECTED: number;
  PENDING: number;
  CANCELLED: number;
  COMPLETED: number;
  total: number;
  pass_rate: string;
}

export interface ReportSummary {
  by_type: Record<string, ReportTypeSummary>;
  grand_total: ReportTypeSummary;
  generated_at: string;
  date_from: string | null;
  date_to: string | null;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getAuthorizationHistory(
  filters?: AuthHistoryFilters
): Promise<AuthHistoryListResponse> {
  const res = await httpClient.get<AuthHistoryListResponse>(
    "/api/authorization-history",
    { params: filters }
  );
  return res.data;
}

export async function getAuthorizationDetail(
  type: AuthType,
  id: number
): Promise<any> {
  const res = await httpClient.get(`/api/authorization-history/${type.toLowerCase()}/${id}`);
  return res.data;
}

export async function getAuthorizationReport(filters?: {
  date_from?: string;
  date_to?: string;
}): Promise<ReportSummary> {
  const res = await httpClient.get<ReportSummary>(
    "/api/authorization-history/report/summary",
    { params: filters }
  );
  return res.data;
}
