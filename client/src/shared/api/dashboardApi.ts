import httpClient from "@/shared/api/httpClient";

export interface PendingCounts {
  pending_commodity_approvals: number;
  pending_returns: number;
  pending_voids: number;
  pending_adjustments: number;
}

export async function getPendingCounts(): Promise<PendingCounts> {
  const res = await httpClient.get<PendingCounts>("/api/dashboard/pending-counts");
  return res.data;
}
