import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Scale, Search, CheckCircle2, XCircle, Clock, Filter,
  Download, RefreshCw, Loader2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAdjustmentRequests,
  approveAdjustmentRequest,
  rejectAdjustmentRequest,
  getAdjustmentHistory,
  type MarketBasedAdjustmentRequest,
} from "@/shared/api/inventoryApi";

export default function MarketBasedAdjustments() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<MarketBasedAdjustmentRequest[]>([]);
  const [view, setView] = useState<"pending" | "history">("pending");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Approval/Rejection state
  const [selectedRequest, setSelectedRequest] = useState<MarketBasedAdjustmentRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = view === "pending"
        ? await getAdjustmentRequests({ status: "PENDING_APPROVAL", limit: 100 })
        : await getAdjustmentHistory({
            status: statusFilter === "all" ? undefined : statusFilter,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            limit: 100,
          });
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load adjustment requests:", err);
      toast.error("Failed to load adjustment requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [view, statusFilter, dateFrom, dateTo]);

  const filtered = requests.filter((r) =>
    search === "" ||
    r.product_name.toLowerCase().includes(search.toLowerCase()) ||
    r.barcode.toLowerCase().includes(search.toLowerCase()) ||
    r.reference.toLowerCase().includes(search.toLowerCase())
  );

  const handleApprove = async () => {
    if (!selectedRequest) return;
    setProcessing(true);
    try {
      await approveAdjustmentRequest(selectedRequest.id);
      toast.success(`Adjustment request ${selectedRequest.reference} approved`);
      setSelectedRequest(null);
      setActionType(null);
      loadData();
    } catch (err) {
      console.error("Failed to approve request:", err);
      toast.error("Failed to approve request");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setProcessing(true);
    try {
      await rejectAdjustmentRequest(selectedRequest.id, rejectionReason.trim());
      toast.success(`Adjustment request ${selectedRequest.reference} rejected`);
      setSelectedRequest(null);
      setActionType(null);
      setRejectionReason("");
      loadData();
    } catch (err) {
      console.error("Failed to reject request:", err);
      toast.error("Failed to reject request");
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING_APPROVAL":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 font-bold text-xs">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-bold text-xs">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-bold text-xs">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      default:
        return <span className="text-gray-500 text-xs">{status}</span>;
    }
  };

  const formatQuantity = (qty: number) => {
    return qty % 1 === 0 ? qty.toString() : qty.toFixed(3);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Scale className="h-6 w-6 text-blue-600" />
            Market-Based Adjustments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and approve stock count adjustment requests for Market-Based products
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === "pending" ? "default" : "outline"}
            onClick={() => setView("pending")}
            className="gap-2"
          >
            <Clock className="h-4 w-4" /> Pending Requests
          </Button>
          <Button
            variant={view === "history" ? "default" : "outline"}
            onClick={() => setView("history")}
            className="gap-2"
          >
            <Filter className="h-4 w-4" /> History
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by product, barcode, or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {view === "history" && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="PENDING_APPROVAL">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </>
          )}
          <Button variant="outline" onClick={loadData} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </Card>

      {/* Stats */}
      {view === "pending" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
                <p className="text-xs text-gray-500">Pending Requests</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Scale className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {requests.filter((r) => r.difference > 0).length}
                </p>
                <p className="text-xs text-gray-500">Over Count</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {requests.filter((r) => r.difference < 0).length}
                </p>
                <p className="text-xs text-gray-500">Short Count</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                {[
                  "Reference",
                  "Date",
                  "Product",
                  "Barcode",
                  "System Qty",
                  "Physical Qty",
                  "Difference",
                  "Reason",
                  "Prepared By",
                  "Status",
                  view === "pending" ? "Actions" : "",
                ].filter(Boolean).map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-bold uppercase tracking-wider whitespace-nowrap text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: view === "pending" ? 11 : 10 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={view === "pending" ? 11 : 10} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <Scale className="h-10 w-10 opacity-30" />
                      <p className="font-medium text-gray-500">No adjustment requests found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((req) => (
                  <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        {req.reference}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">{formatDate(req.prepared_at)}</td>
                    <td className="py-3 px-4 font-semibold text-gray-900">{req.product_name}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-gray-600">{req.barcode}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-sm">{formatQuantity(req.system_quantity)}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm">{formatQuantity(req.physical_quantity)}</td>
                    <td className="py-3 px-4 text-right font-mono text-sm font-bold">
                      <span className={req.difference > 0 ? "text-blue-600" : req.difference < 0 ? "text-red-600" : "text-green-600"}>
                        {req.difference > 0 ? "+" : ""}{formatQuantity(req.difference)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">{req.reason}</td>
                    <td className="py-3 px-4 text-xs text-gray-600">{req.prepared_by_name}</td>
                    <td className="py-3 px-4">{getStatusBadge(req.status)}</td>
                    {view === "pending" && (
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-green-600 border-green-600 hover:bg-green-50"
                            onClick={() => {
                              setSelectedRequest(req);
                              setActionType("approve");
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-red-600 border-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedRequest(req);
                              setActionType("reject");
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Approval/Rejection Dialog */}
      <AlertDialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "approve" ? "Approve Adjustment Request" : "Reject Adjustment Request"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRequest && (
                <div className="mt-4 space-y-3">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="font-semibold text-gray-900">{selectedRequest.product_name}</p>
                    <p className="text-sm text-gray-600">Reference: {selectedRequest.reference}</p>
                    <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">System Qty:</span>
                        <span className="ml-2 font-mono">{formatQuantity(selectedRequest.system_quantity)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Physical Qty:</span>
                        <span className="ml-2 font-mono">{formatQuantity(selectedRequest.physical_quantity)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Difference:</span>
                        <span className={`ml-2 font-mono ${selectedRequest.difference > 0 ? "text-blue-600" : selectedRequest.difference < 0 ? "text-red-600" : "text-green-600"}`}>
                          {selectedRequest.difference > 0 ? "+" : ""}{formatQuantity(selectedRequest.difference)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Reason:</span>
                        <span className="ml-2">{selectedRequest.reason}</span>
                      </div>
                    </div>
                    {selectedRequest.remarks && (
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="text-gray-500">Remarks:</span> {selectedRequest.remarks}
                      </p>
                    )}
                  </div>
                  {actionType === "approve" ? (
                    <p className="text-sm text-gray-600">
                      This will update the inventory quantity to <strong>{formatQuantity(selectedRequest.physical_quantity)}</strong>.
                      This action cannot be undone.
                    </p>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">
                        Please provide a reason for rejecting this request:
                      </p>
                      <Input
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Enter rejection reason..."
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={actionType === "approve" ? handleApprove : handleReject}
              disabled={processing || (actionType === "reject" && !rejectionReason.trim())}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : actionType === "approve" ? (
                "Approve & Update Inventory"
              ) : (
                "Reject Request"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
