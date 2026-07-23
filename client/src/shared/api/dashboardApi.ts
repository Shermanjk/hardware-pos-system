import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface PendingCounts {
  pending_commodity_approvals: number;
  pending_returns: number;
  pending_voids: number;
}

export async function getPendingCounts(): Promise<PendingCounts> {
  const res = await axios.get<PendingCounts>("/api/dashboard/pending-counts", {
    headers: authHeaders(),
  });
  return res.data;
}