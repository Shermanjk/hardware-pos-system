import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createCustomer, searchCustomers, type CustomerSearchResult } from "@/shared/api/customersApi";
import { createReturn, directOverrideReturn, localOverrideReturn, type CreateReturnPayload } from "@/shared/api/returnsApi";
import { loadToken } from "@/shared/utils/auth";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RotateCcw,
  Search,
  Send,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Resolution = "refund" | "exchange" | "store_credit" | "rejected";

interface ReturnAuthModalProps {
  open: boolean;
  onClose: () => void;
  /** The full payload needed to create the return — only submitted when a method is chosen */
  returnPayload: CreateReturnPayload | null;
  invoiceNumber: string;
  customerName: string;
  customerId?: number | null;
  /** Called when the return is approved (remote or local) so the parent can refresh */
  onApproved: () => void;
}

type ModalStatus = "idle" | "pending" | "approved" | "rejected";
type ApprovalMethod = "remote" | "local";

function isWalkIn(name?: string | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return n === "walk-in customer" || n === "walk-in" || n === "walkin" || n === "unknown";
}

export default function ReturnAuthModal({
  open,
  onClose,
  returnPayload,
  invoiceNumber,
  customerName,
  customerId,
  onApproved,
}: ReturnAuthModalProps) {
  const [method, setMethod] = useState<ApprovalMethod | null>(null);
  const [status, setStatus] = useState<ModalStatus>("idle");
  const [adminName, setAdminName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // The return id — set only after createReturn succeeds
  const [returnId, setReturnId] = useState<number | null>(null);
  const [returnNumber, setReturnNumber] = useState("");

  // Remote flow state
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);

  // Local override state
  const [resolution, setResolution] = useState<Resolution>("refund");
  const [exchangeBarcode, setExchangeBarcode] = useState("");
  const [exchangeQuantity, setExchangeQuantity] = useState<number>(1);
  const [localRejectionReason, setLocalRejectionReason] = useState("");
  const [managerUsername, setManagerUsername] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);

  // Store credit customer state
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string } | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerSearchResult[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerPhone, setQuickCustomerPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset all state when dialog opens
  useEffect(() => {
    if (open) {
      setMethod(null);
      setStatus("idle");
      setAdminName("");
      setRejectionReason("");
      setReturnId(null);
      setReturnNumber("");
      setIsCreatingRequest(false);
      setResolution("refund");
      setExchangeBarcode("");
      setExchangeQuantity(1);
      setLocalRejectionReason("");
      setManagerUsername("");
      setManagerPassword("");
      setShowPassword(false);
      setLocalError(null);
      setIsOverriding(false);

      if (customerId && !isWalkIn(customerName)) {
        setSelectedCustomer({ id: customerId, name: customerName });
      } else {
        setSelectedCustomer(null);
      }
      setCustomerSearchQuery("");
      setCustomerSearchResults([]);
      setShowQuickAddCustomer(false);
      setQuickCustomerName("");
      setQuickCustomerPhone("");
      setIsCreatingCustomer(false);
    }
  }, [open, customerId, customerName]);

  // Customer search typeahead
  useEffect(() => {
    const q = customerSearchQuery.trim();
    if (q.length < 2) {
      setCustomerSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const results = await searchCustomers(q);
        if (mountedRef.current) {
          setCustomerSearchResults(results);
        }
      } catch {
        if (mountedRef.current) setCustomerSearchResults([]);
      } finally {
        if (mountedRef.current) setIsSearchingCustomer(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  // WebSocket — listen for remote return decision
  useEffect(() => {
    if (!open || status !== "pending" || returnId === null) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const token = loadToken();
      if (!token) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "return_decision" && data.id === returnId) {
            if (!mountedRef.current) return;
            const decidedBy = data.admin_name ?? "Admin";
            setAdminName(decidedBy);

            if (data.decision === "approved") {
              setStatus("approved");
              toast.success(`Return approved by ${decidedBy}!`, { duration: 4000 });
              setTimeout(() => {
                if (!mountedRef.current) return;
                onApproved();
                onClose();
              }, 1500);
            } else if (data.decision === "rejected") {
              setStatus("rejected");
              setRejectionReason(data.rejection_reason ?? "No reason provided.");
              toast.error(`Return rejected by ${decidedBy}`, { duration: 5000 });
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [open, status, returnId, onApproved, onClose]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateCustomer = async () => {
    const name = quickCustomerName.trim();
    if (!name) {
      toast.error("Please enter the customer's full name.");
      return;
    }
    setIsCreatingCustomer(true);
    try {
      const created = await createCustomer({
        full_name: name,
        contact_number: quickCustomerPhone.trim() || undefined,
      });
      setSelectedCustomer({ id: created.id, name: created.full_name });
      setShowQuickAddCustomer(false);
      setQuickCustomerName("");
      setQuickCustomerPhone("");
      setLocalError(null);
      toast.success(`Customer account created for ${created.full_name}!`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create customer.");
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleSendRemoteRequest = async () => {
    if (!returnPayload) return;
    setIsCreatingRequest(true);
    try {
      const result = await createReturn(returnPayload);
      if (!mountedRef.current) return;
      setReturnId(result.id);
      setReturnNumber(result.return_number);
      setStatus("pending");
      toast.info("Return request sent to Admin.", { duration: 3000 });
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg: string = err?.response?.data?.message ?? "Failed to create return request.";
      toast.error(msg);
      setMethod(null);
    } finally {
      if (mountedRef.current) setIsCreatingRequest(false);
    }
  };

  const handleLocalOverride = async () => {
    if (!returnPayload) return;
    if (!managerUsername.trim() || !managerPassword) {
      setLocalError("Manager username and password are required.");
      return;
    }
    if (resolution === "exchange" && (!exchangeBarcode.trim() || !exchangeQuantity)) {
      setLocalError("Exchange barcode and quantity are required.");
      return;
    }
    if (resolution === "store_credit" && !selectedCustomer?.id) {
      setLocalError("Store Credit requires a registered customer account. Please select or register a customer.");
      return;
    }
    if (resolution === "rejected" && !localRejectionReason.trim()) {
      setLocalError("A rejection reason is required.");
      return;
    }
    setLocalError(null);
    setIsOverriding(true);

    try {
      let result;
      if (returnId) {
        // Approving a request that was already sent to Admin
        result = await localOverrideReturn(returnId, {
          username: managerUsername.trim(),
          password: managerPassword,
          resolution,
          customer_id: resolution === "store_credit" ? selectedCustomer?.id : undefined,
          exchange_barcode: resolution === "exchange" ? exchangeBarcode.trim() : undefined,
          exchange_quantity: resolution === "exchange" ? exchangeQuantity : undefined,
          rejection_reason: resolution === "rejected" ? localRejectionReason.trim() : undefined,
        });
      } else {
        // Direct manager override: Authenticates credentials FIRST before creating any DB record
        result = await directOverrideReturn({
          ...returnPayload,
          username: managerUsername.trim(),
          password: managerPassword,
          resolution,
          customer_id: resolution === "store_credit" ? selectedCustomer?.id : undefined,
          exchange_barcode: resolution === "exchange" ? exchangeBarcode.trim() : undefined,
          exchange_quantity: resolution === "exchange" ? exchangeQuantity : undefined,
          rejection_reason: resolution === "rejected" ? localRejectionReason.trim() : undefined,
        });
        if (mountedRef.current) {
          setReturnId(result.id);
          setReturnNumber(result.return_number);
        }
      }

      if (!mountedRef.current) return;

      const approvedBy = result.admin_name ?? "Manager";

      if (resolution === "rejected") {
        setStatus("rejected");
        setAdminName(approvedBy);
        toast.error(`Return rejected by ${approvedBy}`, { duration: 4000 });
      } else {
        setStatus("approved");
        setAdminName(approvedBy);
        toast.success(`Return approved by ${approvedBy}`, { duration: 4000 });
        setTimeout(() => {
          if (!mountedRef.current) return;
          onApproved();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg: string = err?.response?.data?.message ?? "Authorization failed.";
      setLocalError(msg);
      setManagerPassword("");
    } finally {
      if (mountedRef.current) setIsOverriding(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && status === "pending") return;
    if (!nextOpen) onClose();
  };

  const ReturnSummary = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-blue-800 mb-1">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-semibold">Admin Approval Required</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Invoice:</span>
        <span className="font-semibold">{invoiceNumber}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Customer:</span>
        <span className="font-medium">{customerName}</span>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-blue-600" />
            Return Approval Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── METHOD SELECTION ─────────────────────────────────────────── */}
          {status === "idle" && method === null && (
            <>
              <ReturnSummary />
              <p className="text-sm text-gray-600 font-medium">How would you like to get approval?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isCreatingRequest}
                  onClick={() => {
                    setMethod("remote");
                    handleSendRemoteRequest();
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors text-left disabled:opacity-60"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    {isCreatingRequest ? (
                      <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-blue-900">Send to Admin</p>
                    <p className="text-xs text-blue-600 mt-0.5">Wait for remote approval</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("local")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <KeyRound className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-purple-900">Manager Override</p>
                    <p className="text-xs text-purple-600 mt-0.5">Admin signs in here</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* ── LOCAL OVERRIDE FORM ───────────────────────────────────────── */}
          {status === "idle" && method === "local" && (
            <>
              <ReturnSummary />
              <div className="space-y-3">

                {/* Resolution selector */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Resolution</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["refund", "exchange", "store_credit", "rejected"] as Resolution[]).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setResolution(opt); setLocalError(null); }}
                        className={`p-2.5 rounded-lg border-2 text-xs font-semibold text-center transition-colors ${
                          resolution === opt
                            ? opt === "rejected"
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {opt === "refund" ? "💰 Refund"
                          : opt === "exchange" ? "🔄 Exchange"
                          : opt === "store_credit" ? "💳 Store Credit"
                          : "❌ Reject"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Store Credit Customer Verification Section */}
                {resolution === "store_credit" && (
                  <div className="space-y-2">
                    {selectedCustomer?.id ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                            <span>Registered Account Linked</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(null)}
                            className="text-xs font-medium text-emerald-700 hover:underline"
                          >
                            Change
                          </button>
                        </div>
                        <p className="text-sm text-emerald-950 font-semibold">{selectedCustomer.name}</p>
                        <p className="text-[11px] text-emerald-700">Store credit will be deposited to this customer's account balance.</p>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>Customer Account Required for Store Credit</span>
                        </div>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          The original invoice was a walk-in sale. Link an existing customer or quickly register a new profile to deposit this credit.
                        </p>

                        {!showQuickAddCustomer ? (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                              <Input
                                placeholder="Search customer by name or phone…"
                                value={customerSearchQuery}
                                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                className="h-8 pl-8 text-xs bg-white"
                              />
                            </div>

                            {isSearchingCustomer && (
                              <p className="text-[11px] text-gray-500 italic">Searching customers…</p>
                            )}

                            {customerSearchResults.length > 0 && (
                              <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md bg-white divide-y divide-gray-100">
                                {customerSearchResults.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCustomer({ id: c.id, name: c.full_name });
                                      setCustomerSearchQuery("");
                                      setCustomerSearchResults([]);
                                      setLocalError(null);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between"
                                  >
                                    <div>
                                      <span className="font-semibold text-gray-900">{c.full_name}</span>
                                      {c.contact_number && <span className="text-gray-500 ml-1.5">({c.contact_number})</span>}
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400">{c.customer_code}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="pt-1 flex items-center justify-between">
                              <span className="text-[11px] text-gray-500">Don't see the customer?</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowQuickAddCustomer(true)}
                                className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                Quick Add Customer
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <Input
                              placeholder="Full Name *"
                              value={quickCustomerName}
                              onChange={(e) => setQuickCustomerName(e.target.value)}
                              className="h-8 text-xs bg-white"
                            />
                            <Input
                              placeholder="Contact Number (optional)"
                              value={quickCustomerPhone}
                              onChange={(e) => setQuickCustomerPhone(e.target.value)}
                              className="h-8 text-xs bg-white"
                            />
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                type="button"
                                size="sm"
                                onClick={handleCreateCustomer}
                                disabled={isCreatingCustomer}
                                className="h-7 text-xs flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                              >
                                {isCreatingCustomer ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                                Save & Link Account
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowQuickAddCustomer(false)}
                                className="h-7 text-xs text-gray-500"
                              >
                                Back
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Exchange details */}
                {resolution === "exchange" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-900">Exchange Details</p>
                    <Input
                      placeholder="Exchange product barcode"
                      value={exchangeBarcode}
                      onChange={(e) => { setExchangeBarcode(e.target.value); setLocalError(null); }}
                      className="h-9 text-sm bg-white"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Quantity"
                      value={exchangeQuantity}
                      onChange={(e) => setExchangeQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                )}

                {/* Rejection reason */}
                {resolution === "rejected" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">
                      Rejection Reason <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="Enter reason for rejection…"
                      value={localRejectionReason}
                      onChange={(e) => { setLocalRejectionReason(e.target.value); setLocalError(null); }}
                      className="h-9 text-sm bg-white"
                    />
                  </div>
                )}

                {/* Manager credentials */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-purple-800">
                    <KeyRound className="h-4 w-4" />
                    <span className="text-sm font-semibold">Manager Credentials</span>
                  </div>
                  <Input
                    placeholder="Admin username"
                    value={managerUsername}
                    onChange={(e) => { setManagerUsername(e.target.value); setLocalError(null); }}
                    autoComplete="off"
                    className="h-9 text-sm bg-white"
                  />
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Admin password"
                      value={managerPassword}
                      onChange={(e) => { setManagerPassword(e.target.value); setLocalError(null); }}
                      autoComplete="new-password"
                      className="h-9 text-sm pr-10 bg-white"
                      onKeyDown={(e) => { if (e.key === "Enter") handleLocalOverride(); }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {localError && (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />{localError}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── PENDING (remote waiting) ──────────────────────────────────── */}
          {status === "pending" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Waiting for Admin Approval</p>
                  <p className="text-sm text-gray-500 mt-1">The admin will review and select a resolution.</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-blue-800 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">Pending Return Request</span>
                </div>
                {returnNumber && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Return #:</span>
                    <span className="font-mono font-semibold">{returnNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice:</span>
                  <span className="font-semibold">{invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Customer:</span>
                  <span>{customerName}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── APPROVED ─────────────────────────────────────────────────── */}
          {status === "approved" && (
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Return Approved</p>
                <p className="text-sm text-gray-500 mt-1">Approved by {adminName}. Processing now…</p>
              </div>
            </div>
          )}

          {/* ── REJECTED ─────────────────────────────────────────────────── */}
          {status === "rejected" && (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="h-7 w-7 text-red-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">Return Rejected</p>
                  <p className="text-sm text-gray-500 mt-1">Rejected by {adminName}</p>
                </div>
              </div>
              {rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                  <p className="text-xs font-semibold text-red-800 uppercase mb-1">Reason</p>
                  <p className="text-red-700">{rejectionReason}</p>
                </div>
              )}
            </div>
          )}

        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {status === "idle" && method === null && (
            <Button type="button" variant="outline" onClick={onClose} className="w-full">
              Cancel
            </Button>
          )}

          {status === "idle" && method === "local" && (
            <div className="flex gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setMethod(null); setLocalError(null); }}
                className="flex-1"
                disabled={isOverriding}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleLocalOverride}
                disabled={isOverriding}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isOverriding ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-1.5" />
                )}
                Authorize
              </Button>
            </div>
          )}

          {status === "pending" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStatus("idle");
                setMethod("local");
              }}
              className="w-full text-purple-700 border-purple-200 hover:bg-purple-50"
            >
              <KeyRound className="h-4 w-4 mr-1.5" />
              Switch to Manager Override
            </Button>
          )}

          {status === "rejected" && (
            <Button type="button" variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
