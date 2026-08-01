import httpClient from "@/shared/api/httpClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: number;
  action: string;
  performed_by_id: number;
  performed_by_username: string;
  target_user_id: number | null;
  target_username: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogsResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getAuditLogs(
  page = 1,
  pageSize = 20
): Promise<AuditLogsResponse> {
  const response = await httpClient.get<AuditLogsResponse>("/api/audit-logs", {
    params: { page, pageSize },
  });
  return response.data;
}
