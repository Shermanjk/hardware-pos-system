import { useState, useEffect, useCallback, useRef } from "react";
import { Check, X, AlertCircle, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

interface DiscountRequest {
  id: number;
  discount_id: number;
  discount_name: string;
  discount_type: string;
  discount_value: number;
  cashier_id: number;
  cashier_username: string;
  cashier_name: string;
  requested_percentage: number;
  discount_amount: number;
  reason: string;
  status: string;
  created_at: string;
}

interface DiscountDecisionNotification {
  type: "discount_decision";
  request_id: number;
  discount_id: number;
  discount_name: string;
  requested_percentage: number;
  discount_amount: number;
  decision: "approved" | "rejected";
  admin_name: string;
  rejection_reason: string | null;
  cashier_user_id: number;
}

interface DiscountRequestNotification {
  type: "discount_request";
  request_id: number;
  discount_id: number;
  discount_name: string;
  requested_percentage: number;
  discount_amount: number;
  reason: string;
  cashier_name: string;
  cashier_user_id: number;
  created_at: string;
}

export default function DiscountApprovals() {
  const [requests, setRequests] = useState<DiscountRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DiscountRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get("/api/discount-approvals");
      setRequests(response.data);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to load requests" : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // WebSocket for real-time notifications
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryDelay = 1000;
    const MAX_DELAY = 30_000;
    let destroyed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (destroyed) return;

      const token = loadToken();
      if (!token) return;

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${token}`);

      ws.onopen = () => {
        retryDelay = 1000;
        loadRequests(); // Refresh on reconnect
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "discount_request" || data.type === "discount_decision") {
            loadRequests();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = (event) => {
        if (destroyed) return;
        if (event.code === 1008) return; // Don't retry on auth error

        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
          connect();
        }, retryDelay);
      };

      ws.onerror = () => {
        // onerror is always followed by onclose
      };
    }

    connect();

    // Reconnect on visibility change
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          if (retryTimer) clearTimeout(retryTimer);
          retryDelay = 1000;
          connect();
        }
      }
    }

    function handleOnline() {
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (retryTimer) clearTimeout(retryTimer);
        retryDelay = 1000;
        connect();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      ws?.close(1000, "Component unmounted");
    };
  }, [loadRequests]);

  const handleApprove = async (requestId: number) => {
    try {
      await axios.patch(`/api/discount-approvals/${requestId}/approve`);
      loadRequests();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to approve request" : "An error occurred");
    }
  };

  const openRejectDialog = (request: DiscountRequest) => {
    setSelectedRequest(request);
    setRejectionReason("");
    setIsRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    try {
      await axios.patch(`/api/discount-approvals/${selectedRequest.id}/reject`, {
        rejection_reason: rejectionReason || null,
      });
      setIsRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason("");
      loadRequests();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to reject request" : "An error occurred");
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discount Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {requests.length > 0 ? `${requests.length} pending request${requests.length !== 1 ? "s" : ""}` : "No pending requests"}
          </p>
        </div>
        <Button variant="outline" onClick={loadRequests} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Requests List */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-20 text-center text-gray-400">
          Loading discount requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="h-7 w-7 text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">All caught up</p>
              <p className="text-xs text-gray-400 mt-1">No pending discount approval requests</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                {/* Left side - Request details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{request.discount_name}</h3>
                      <p className="text-xs text-gray-400">{formatDateTime(request.created_at)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Cashier</p>
                      <p className="font-medium text-gray-900">{request.cashier_name}</p>
                      <p className="text-xs text-gray-400">@{request.cashier_username}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Discount</p>
                      <p className="font-bold text-amber-600">{request.requested_percentage}%</p>
                      <p className="text-xs text-gray-400">Discount amount: ₱{request.discount_amount.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reason</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2">{request.reason}</p>
                  </div>
                </div>

                {/* Right side - Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    onClick={() => handleApprove(request.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => openRejectDialog(request)}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Reject Discount Request</DialogTitle>
          <div className="space-y-4 mt-4">
            {selectedRequest && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-semibold text-gray-900">{selectedRequest.discount_name}</p>
                <p className="text-gray-600">{selectedRequest.requested_percentage}% discount - ₱{selectedRequest.discount_amount.toFixed(2)}</p>
                <p className="text-gray-500 mt-1">Reason: {selectedRequest.reason}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-semibold text-gray-700">Rejection Reason (Optional)</Label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why are you rejecting this request?"
                className="mt-1.5"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleReject} variant="destructive" className="flex-1">Reject</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
