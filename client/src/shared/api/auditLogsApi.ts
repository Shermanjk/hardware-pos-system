import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

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

// ─── Axios helper ─────────────────────────────────────────────────────────────

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getAuditLogs(
  page = 1,
  pageSize = 20
): Promise<AuditLogsResponse> {
  const response = await axios.get<AuditLogsResponse>("/api/audit-logs", {
    params: { page, pageSize },
    headers: authHeaders(),
  });
  return response.data;
}
