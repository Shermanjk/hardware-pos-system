import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Sale } from "@/shared/api/salesApi";
import { getSaleByInvoice } from "@/shared/api/salesApi";
import { AlertTriangle, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import VoidAuthModal from "./VoidAuthModal";

interface Props {
  open: boolean;
  onClose: () => void;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

export default function VoidSaleDialog({ open, onClose }: Props) {
  const [invoiceInput, setInvoiceInput] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);

  // Auth modal state — shown after void request is successfully created
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingVoidId, setPendingVoidId] = useState<number | null>(null);

  const reset = () => {
    setInvoiceInput("");
    setSale(null);
    setLookupError(null);
    setReason("");
    setPendingVoidId(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleLookup = async () => {
    const inv = invoiceInput.trim();
    if (!inv) return;
    setLookupLoading(true);
    setLookupError(null);
    setSale(null);
    try {
      const data = await getSaleByInvoice(inv);
      if (data.void_status === "voided") {
        setLookupError("This sale has already been voided.");
      } else if (data.void_status === "void_requested") {
        setLookupError("A void request for this sale is already pending admin review.");
      } else {
        setSale(data);
      }
    } catch (err: any) {
      setLookupError(err?.response?.data?.message ?? "Invoice not found.");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!sale || !reason.trim()) return;
    // Don't create the void request yet — just capture the data and show the auth modal
    // The request will only be created if the cashier chooses "Send to Admin Terminal"
    setSubmitLoading(false);
    setPendingVoidId(null); // No void_id yet until we create it
    setShowAuthModal(true);
  };

  const handleVoidApproved = () => {
    toast.success(`Sale ${sale?.invoice_number ?? ""} has been voided successfully.`);
    setShowAuthModal(false);
    handleClose();
  };

  return (
    <>
      <Dialog open={open && !showAuthModal} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Sale Void</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Invoice lookup */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Invoice Number
              </Label>
              <div className="flex gap-2">
                <Input
                  value={invoiceInput}
                  onChange={(e) => { setInvoiceInput(e.target.value); setSale(null); setLookupError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
                  placeholder="e.g. INV-20250120-0001"
                  className="h-9 text-sm font-mono"
                  disabled={submitLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3 shrink-0"
                  onClick={handleLookup}
                  disabled={!invoiceInput.trim() || lookupLoading || submitLoading}
                >
                  {lookupLoading
                    ? <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Lookup error */}
            {lookupError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border-2 border-red-300 rounded-lg text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {lookupError}
              </div>
            )}

            {/* Sale summary */}
            {sale && (
              <div className="p-3 bg-gray-50 border-2 border-gray-300 rounded-lg space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-mono font-semibold text-gray-900">{sale.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-gray-900">{sale.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-bold text-gray-900">{fmt(sale.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Items</span>
                  <span className="text-gray-700">{sale.items.length} line(s)</span>
                </div>
              </div>
            )}

            {/* Void reason */}
            {sale && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Void Reason <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason for voiding this sale…"
                  className="h-9 text-sm"
                  disabled={submitLoading}
                  maxLength={500}
                />
              </div>
            )}

            {/* Warning */}
            {sale && (
              <p className="text-xs text-amber-700 bg-amber-50 border-2 border-amber-300 rounded-lg px-3 py-2">
                After submitting, an admin can approve it remotely or authorize it right here on this terminal.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose} disabled={submitLoading}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!sale || !reason.trim() || submitLoading}
              onClick={handleSubmit}
            >
              {submitLoading
                ? <><span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" />Submitting…</>
                : "Submit Void Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auth modal — shown after request is created */}
      <VoidAuthModal
        open={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          // If cashier closes without approval, just close the whole flow
          handleClose();
        }}
        saleId={sale?.id ?? null}
        voidReason={reason}
        invoiceNumber={sale?.invoice_number ?? ""}
        totalAmount={sale ? Number(sale.total_amount) : 0}
        onApproved={handleVoidApproved}
      />
    </>
  );
}
