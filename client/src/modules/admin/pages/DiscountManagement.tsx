import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import httpClient from "@/shared/api/httpClient";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { loadToken } from "@/shared/utils/auth";
import axios from "axios";
import { AlertCircle, Check, Clock, Edit, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface Discount {
  id: number;
  discount_name: string;
  discount_type: string;
  value: number;
  status: string;
  requires_admin_approval: boolean;
  is_sc_pwd: boolean;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string | null;
}

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

export default function DiscountManagement() {
  const [activeTab, setActiveTab] = useState("discounts");

  // Discount management state
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [discountsError, setDiscountsError] = useState<string | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null);

  const [formData, setFormData] = useState({
    discount_name: "",
    discount_type: "Percentage",
    value: 0,
    requires_admin_approval: false,
    is_sc_pwd: false,
    status: "Active",
  });

  // Discount approvals state
  const [requests, setRequests] = useState<DiscountRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DiscountRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const loadDiscounts = useCallback(async () => {
    setDiscountsLoading(true);
    setDiscountsError(null);
    try {
      const res = await httpClient.get("/api/discounts");
      setDiscounts(res.data);
    } catch (err) {
      setDiscountsError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to load discounts" : "An error occurred");
    } finally {
      setDiscountsLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const response = await httpClient.get("/api/discount-approvals");
      setRequests(response.data);
    } catch (err) {
      setRequestsError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to load requests" : "An error occurred");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiscounts();
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
        loadRequests();
        window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "discount_cancelled") {
            const cancelledId = Number(data.request_id);
            setRequests((prev) => prev.filter((r) => r.id !== cancelledId));
            window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
            loadRequests();
          } else if (data.type === "discount_decision") {
            const decidedId = Number(data.request_id);
            setRequests((prev) => prev.filter((r) => r.id !== decidedId));
            window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
            loadRequests();
          } else if (data.type === "discount_request") {
            window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
            loadRequests();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = (event) => {
        if (destroyed) return;
        if (event.code === 1008) return;

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

  const handleCreate = async () => {
    try {
      await httpClient.post("/api/discounts", formData);
      setIsCreateDialogOpen(false);
      setFormData({ discount_name: "", discount_type: "Percentage", value: 0, requires_admin_approval: false, is_sc_pwd: false, status: "Active" });
      loadDiscounts();
    } catch (err) {
      setDiscountsError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to create discount" : "An error occurred");
    }
  };

  const handleUpdate = async () => {
    if (!selectedDiscount) return;
    try {
      await httpClient.patch(`/api/discounts/${selectedDiscount.id}`, formData);
      setIsEditDialogOpen(false);
      setSelectedDiscount(null);
      setFormData({ discount_name: "", discount_type: "Percentage", value: 0, requires_admin_approval: false, is_sc_pwd: false, status: "Active" });
      loadDiscounts();
    } catch (err) {
      setDiscountsError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to update discount" : "An error occurred");
    }
  };

  const handleDelete = async () => {
    if (!selectedDiscount) return;
    try {
      await httpClient.delete(`/api/discounts/${selectedDiscount.id}`);
      setIsDeleteDialogOpen(false);
      setSelectedDiscount(null);
      loadDiscounts();
    } catch (err) {
      setDiscountsError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to delete discount" : "An error occurred");
    }
  };

  const openEditDialog = (discount: Discount) => {
    setSelectedDiscount(discount);
    setFormData({
      discount_name: discount.discount_name,
      discount_type: discount.discount_type,
      value: discount.value,
      requires_admin_approval: discount.requires_admin_approval,
      is_sc_pwd: discount.is_sc_pwd,
      status: discount.status,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (discount: Discount) => {
    setSelectedDiscount(discount);
    setIsDeleteDialogOpen(true);
  };

  const handleApprove = async (id: number) => {
    try {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      await httpClient.patch(`/api/discount-approvals/${id}/approve`);
      window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
      loadRequests();
    } catch (err) {
      setRequestsError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to approve request" : "An error occurred");
      loadRequests();
    }
  };

  const openRejectDialog = (request: DiscountRequest) => {
    setSelectedRequest(request);
    setRejectionReason("");
    setIsRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    const targetId = selectedRequest.id;
    try {
      setRequests((prev) => prev.filter((r) => r.id !== targetId));
      await httpClient.patch(`/api/discount-approvals/${targetId}/reject`, { rejection_reason: rejectionReason });
      setIsRejectDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason("");
      window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
      loadRequests();
    } catch (err) {
      setRequestsError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to reject request" : "An error occurred");
      loadRequests();
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Discount Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage discounts and approval requests</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="discounts">Discounts</TabsTrigger>
          <TabsTrigger value="approvals">
            Approvals
            {requests.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                {requests.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Discounts Tab */}
        <TabsContent value="discounts" className="space-y-5 mt-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={loadDiscounts} disabled={discountsLoading}>
              {discountsLoading ? <LoadingSpinner size={16} className="mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Discount
            </Button>
          </div>

          {discountsError && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 flex-1">{discountsError}</p>
              <button onClick={() => setDiscountsError(null)} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                    <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Type</th>
                    <th className="text-right py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Value</th>
                    <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">SC/PWD</th>
                    <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Requires Approval</th>
                    <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                    <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {discountsLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                        <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                        <td className="py-3.5 px-5"><Skeleton className="h-4 w-16" /></td>
                        <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                        <td className="py-3.5 px-5"><Skeleton className="h-4 w-16" /></td>
                        <td className="py-3.5 px-5"><Skeleton className="h-4 w-16" /></td>
                        <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                      </tr>
                    ))
                  ) : discounts.length === 0 ? (
                    <tr><td colSpan={7} className="py-16 text-center text-gray-400">No discounts found</td></tr>
                  ) : (
                    discounts.map((discount) => (
                      <tr key={discount.id} className="hover:bg-gray-50">
                        <td className="py-3.5 px-5 font-medium text-gray-900">{discount.discount_name}</td>
                        <td className="py-3.5 px-5 text-gray-600">{discount.discount_type}</td>
                        <td className="py-3.5 px-5 text-right font-semibold text-gray-900">{discount.value}%</td>
                        <td className="py-3.5 px-5 text-center">
                          {discount.is_sc_pwd ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Yes</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">No</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          {discount.requires_admin_approval ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Yes</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">No</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          {discount.status === "Active" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Active</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">Inactive</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openEditDialog(discount)}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openDeleteDialog(discount)}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals" className="space-y-5 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {requests.length > 0 ? `${requests.length} pending request${requests.length !== 1 ? "s" : ""}` : "No pending requests"}
            </p>
            <Button variant="outline" onClick={loadRequests} disabled={requestsLoading}>
              {requestsLoading ? <LoadingSpinner size={16} className="mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>

          {requestsError && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 flex-1">{requestsError}</p>
              <button onClick={() => setRequestsError(null)} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {requestsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Skeleton className="h-9 w-24" />
                      <Skeleton className="h-9 w-20" />
                    </div>
                  </div>
                </div>
              ))}
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
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Create New Discount</DialogTitle>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Name</Label>
              <Input
                value={formData.discount_name}
                onChange={(e) => setFormData({ ...formData, discount_name: e.target.value })}
                placeholder="e.g., Contractor 10%, VIP 15%"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Type</Label>
              <div className="mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                Percentage
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Value (%)</Label>
              <Input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                placeholder={formData.discount_type === "Percentage" ? "10" : "100"}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Label className="text-sm font-semibold text-gray-700">Requires Admin Approval</Label>
              <Switch
                checked={formData.requires_admin_approval}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_admin_approval: checked })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div>
                <Label className="text-sm font-semibold text-gray-700">SC/PWD Discount</Label>
                <p className="text-xs text-gray-500 mt-0.5">Applies on VAT-exclusive base (RA 9994/9442)</p>
              </div>
              <Switch
                checked={formData.is_sc_pwd}
                onCheckedChange={(checked) => setFormData({ ...formData, is_sc_pwd: checked })}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleCreate} className="flex-1">Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit Discount</DialogTitle>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Name</Label>
              <Input
                value={formData.discount_name}
                onChange={(e) => setFormData({ ...formData, discount_name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Type</Label>
              <div className="mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                Percentage
              </div>
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Value (%)</Label>
              <Input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Label className="text-sm font-semibold text-gray-700">Requires Admin Approval</Label>
              <Switch
                checked={formData.requires_admin_approval}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_admin_approval: checked })}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div>
                <Label className="text-sm font-semibold text-gray-700">SC/PWD Discount</Label>
                <p className="text-xs text-gray-500 mt-0.5">Applies on VAT-exclusive base (RA 9994/9442)</p>
              </div>
              <Switch
                checked={formData.is_sc_pwd}
                onCheckedChange={(checked) => setFormData({ ...formData, is_sc_pwd: checked })}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleUpdate} className="flex-1">Update</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Delete Discount</DialogTitle>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <strong>{selectedDiscount?.discount_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleDelete} variant="destructive" className="flex-1">Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
