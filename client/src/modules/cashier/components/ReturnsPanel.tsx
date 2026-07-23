import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RotateCcw, Loader2, X, Search, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { searchSales, getSaleByInvoice, type SaleSummary, type Sale } from "@/shared/api/salesApi";
import { createReturn, getReturnById, resolveReturn, type Return as ReturnFull } from "@/shared/api/returnsApi";
import { useReturnDecisions, type ReturnDecisionNotification } from "@/shared/hooks/useReturnNotifications";
import { printReturnReceipt } from "@/shared/utils/returnReceiptPrinter";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { useAuth } from "@/shared/contexts/AuthContext";

interface ReturnsPanelProps {
  show: boolean;
  onClose: () => void;
  storeSettings: StoreSettings;
  onHeldReturn: (hr: { id: string; heldAt: Date; returnId: number; returnNumber: string; invoiceNumber: string; customerName: string }) => void;
  onProcessResolution: (ret: ReturnFull) => void;
}

interface SelectedItem {
  checked: boolean;
  quantity: number;
  reason: string;
  scannedBarcode: string;
  barcodeConfirmed: boolean;
}

export default function ReturnsPanel({ show, onClose, storeSettings, onHeldReturn, onProcessResolution }: ReturnsPanelProps) {
  const { user } = useAuth();
  const [searchMode, setSearchMode] = useState<"invoice" | "customer" | "date">("invoice");
  const [returnInvoice, setReturnInvoice] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [saleSearchResults, setSaleSearchResults] = useState<SaleSummary[]>([]);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnLookupError, setReturnLookupError] = useState<string | null>(null);
  const [returnLookupLoading, setReturnLookupLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<number, SelectedItem>>({});
  const [returnSubmitError, setReturnSubmitError] = useState<string | null>(null);
  const [returnSubmitLoading, setReturnSubmitLoading] = useState(false);
  const [submittedReturn, setSubmittedReturn] = useState<{ return_number: string; id: number } | null>(null);
  const [showResolution, setShowResolution] = useState(false);
  const [resolveData, setResolveData] = useState<ReturnFull | null>(null);
  const [resolution, setResolution] = useState<"refund" | "replacement">("refund");
  const [itemCondition, setItemCondition] = useState<"good" | "damaged">("good");
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const resetPanel = () => {
    setReturnInvoice(""); setCustomerSearch(""); setDateFrom(""); setDateTo("");
    setSaleSearchResults([]); setReturnSale(null); setReturnLookupError(null);
    setSelectedItems({}); setSubmittedReturn(null); setReturnSubmitError(null);
  };

  const handleSaleSearch = async () => {
    setReturnLookupLoading(true); setReturnLookupError(null); setSaleSearchResults([]);
    try {
      const results = await searchSales(searchMode === "customer" ? { customer_name: customerSearch.trim() } : { date_from: dateFrom || undefined, date_to: dateTo || undefined });
      if (results.length === 0) setReturnLookupError("No transactions found.");
      else setSaleSearchResults(results);
    } catch { setReturnLookupError("Search failed."); }
    finally { setReturnLookupLoading(false); }
  };

  const handleReturnLookup = async () => {
    if (!returnInvoice.trim()) return;
    setReturnLookupLoading(true); setReturnLookupError(null); setReturnSale(null); setSelectedItems({});
    try {
      const sale = await getSaleByInvoice(returnInvoice.trim());
      setReturnSale(sale);
      const init: Record<number, SelectedItem> = {};
      sale.items.forEach((item) => {
        const remaining = item.quantity - item.quantity_returned;
        if (remaining > 0 && item.is_returnable) {
          init[item.id] = { checked: false, quantity: 1, reason: "Damaged", scannedBarcode: "", barcodeConfirmed: !item.barcode };
        }
      });
      setSelectedItems(init);
    } catch (err: any) {
      setReturnLookupError(err?.response?.status === 404 ? "Invoice not found." : err?.response?.data?.message ?? "Failed to look up invoice.");
    } finally { setReturnLookupLoading(false); }
  };

  const handleReturnSubmit = async () => {
    if (!returnSale) return;
    const itemsToReturn = Object.entries(selectedItems).filter(([, v]) => v.checked).map(([idStr, v]) => {
      const saleItemId = Number(idStr);
      const saleItem = returnSale.items.find((i) => i.id === saleItemId)!;
      return { sale_item_id: saleItemId, product_id: saleItem.product_id, quantity_returned: v.quantity, unit_price: saleItem.unit_price, _barcode: saleItem.barcode, _barcodeConfirmed: v.barcodeConfirmed, _reason: v.reason };
    });
    if (itemsToReturn.length === 0) { setReturnSubmitError("Select at least one item."); return; }
    setReturnSubmitLoading(true);
    try {
      const result = await createReturn({ sale_id: Number(returnSale.id), return_reason: itemsToReturn[0]._reason, items: itemsToReturn.map(({ sale_item_id, product_id, quantity_returned, unit_price }) => ({ sale_item_id: Number(sale_item_id), product_id: Number(product_id), quantity_returned, unit_price })) });
      setSubmittedReturn(result);
    } catch (err: any) { setReturnSubmitError(err?.response?.data?.message ?? "Failed to submit."); }
    finally { setReturnSubmitLoading(false); }
  };

  const handleFetchForResolution = async (returnId: number) => {
    const ret = await getReturnById(returnId).catch(() => { toast.error("Failed to fetch."); throw new Error("fail"); });
    if (ret.status !== "approved") { toast.error("Not approved yet."); throw new Error("not_approved"); }
    setResolveData(ret); setResolution("refund"); setItemCondition("good"); setResolveError(null); setShowResolution(true);
  };

  const handleResolve = async () => {
    if (!resolveData) return;
    setResolveLoading(true); setResolveError(null);
    try {
      const resolved = await resolveReturn(resolveData.id, { resolution, item_condition: itemCondition });
      printReturnReceipt({ return_number: resolved.return_number, invoice_number: resolved.invoice_number, customer_name: resolved.customer_name, processed_by_name: user?.full_name ?? "—", resolution: resolved.resolution!, item_condition: resolved.item_condition!, refund_amount: resolved.refund_amount, items: resolved.items.map((i) => ({ product_name: i.product_name, quantity_returned: i.quantity_returned, unit_price: i.unit_price })), resolved_at: resolved.resolved_at ?? undefined, store_name: storeSettings.store_name, store_fb: storeSettings.store_fb, store_phone: storeSettings.store_phone, store_address: storeSettings.store_address, store_tin: storeSettings.business_license, store_vat_registered: storeSettings.vat_registered, currency: storeSettings.currency });
      toast.success(resolution === "refund" ? "Return completed." : "Replacement completed.");
      setShowResolution(false); setResolveData(null); setSubmittedReturn(null); resetPanel(); onClose();
    } catch (err: any) { setResolveError(err?.response?.data?.message ?? "Failed to process."); }
    finally { setResolveLoading(false); }
  };

  return (
    <>
      {show && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { onClose(); resetPanel(); }} />}
      <div className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${show ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-blue-500" /><h2 className="text-base font-bold text-gray-900">Process Return</h2></div>
          <button onClick={() => { onClose(); resetPanel(); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!returnSale && !submittedReturn && (
            <div className="space-y-3">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                {(["invoice", "customer", "date"] as const).map((m) => (
                  <button key={m} onClick={() => { setSearchMode(m); setReturnLookupError(null); setSaleSearchResults([]); }} className={`flex-1 py-2 ${searchMode === m ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>{m === "invoice" ? "Invoice #" : m === "customer" ? "Customer" : "Date"}</button>
                ))}
              </div>
              {searchMode === "invoice" && (<div className="flex gap-2"><Input value={returnInvoice} onChange={(e) => setReturnInvoice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleReturnLookup()} placeholder="INV-..." className="h-10 text-sm flex-1" autoFocus /><Button size="sm" onClick={handleReturnLookup} disabled={returnLookupLoading || !returnInvoice.trim()}>{returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}</Button></div>)}
              {searchMode === "customer" && (<div className="flex gap-2"><Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaleSearch()} placeholder="Customer name…" className="h-10 text-sm flex-1" /><Button size="sm" onClick={handleSaleSearch} disabled={returnLookupLoading || !customerSearch.trim()}>{returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}</Button></div>)}
              {searchMode === "date" && (<div className="space-y-2"><div className="flex gap-2"><div className="flex-1"><label className="text-xs mb-0.5 block">From</label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 text-sm" /></div><div className="flex-1"><label className="text-xs mb-0.5 block">To</label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 text-sm" /></div></div><Button size="sm" onClick={handleSaleSearch} disabled={returnLookupLoading || (!dateFrom && !dateTo)} className="h-9 w-full">{returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}</Button></div>)}
              {returnLookupError && <p className="text-xs text-red-600">{returnLookupError}</p>}
              {saleSearchResults.length > 0 && (<div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">{saleSearchResults.map((s) => (<button key={s.id} onClick={() => { setSaleSearchResults([]); setReturnInvoice(s.invoice_number); setSearchMode("invoice"); setReturnLookupLoading(true); setReturnLookupError(null); getSaleByInvoice(s.invoice_number).then((sale) => { setReturnSale(sale); const init: Record<number, SelectedItem> = {}; sale.items.forEach((item) => { const rem = item.quantity - item.quantity_returned; if (rem > 0 && item.is_returnable) init[item.id] = { checked: false, quantity: 1, reason: "Damaged", scannedBarcode: "", barcodeConfirmed: !item.barcode }; }); setSelectedItems(init); }).catch((err: any) => setReturnLookupError(err?.response?.status === 404 ? "Not found." : err?.response?.data?.message)).finally(() => setReturnLookupLoading(false)); }} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 text-left"><div><p className="text-sm font-medium">{s.invoice_number}</p><p className="text-xs text-gray-500">{s.customer_name}</p></div><div className="text-right"><p className="text-xs font-semibold text-blue-600">₱{Number(s.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p><p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</p></div></button>))}</div>)}
            </div>)}
          {returnSale && !submittedReturn && (<div className="space-y-4"><div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1"><div className="flex justify-between"><span className="text-gray-500">Invoice</span><span className="font-semibold">{returnSale.invoice_number}</span></div><div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium">{returnSale.customer_name}</span></div></div><div><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Select Items</p><div className="space-y-2">{returnSale.items.filter((item) => { const rem = item.quantity - item.quantity_returned; return rem > 0 && item.is_returnable; }).map((item) => { const sel = selectedItems[item.id]; if (!sel) return null; const rem = item.quantity - item.quantity_returned; return (<div key={item.id} className={`border rounded-lg p-3 ${sel.checked ? "border-blue-300 bg-blue-50/40" : "border-gray-200 bg-white"}`}><div className="flex items-start gap-2"><input type="checkbox" checked={sel.checked} onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], checked: e.target.checked } }))} className="mt-0.5 h-4 w-4 accent-blue-600" /><div className="flex-1"><p className="text-sm font-medium">{item.product_name}</p><p className="text-xs text-gray-500">Ret: {rem} · ₱{Number(item.unit_price).toFixed(2)}</p></div></div>{sel.checked && (<div className="pl-6 flex gap-2 mt-2"><div className="flex-1"><label className="text-xs mb-0.5 block">Qty</label><input type="number" min={1} max={rem} value={sel.quantity} onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], quantity: Math.min(rem, Math.max(1, Number(e.target.value))) } }))} className="w-full h-9 text-sm border rounded px-2" /></div><div className="flex-1"><label className="text-xs mb-0.5 block">Reason</label><select value={sel.reason} onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], reason: e.target.value } }))} className="w-full h-9 text-sm border rounded px-2"><option>Damaged</option><option>Missing Items</option><option>Wrong Item</option><option>Other</option></select></div></div>)}</div>); })}</div></div>{returnSubmitError && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{returnSubmitError}</p>}<div className="flex gap-2"><Button variant="outline" size="sm" className="flex-1" onClick={() => { setReturnSale(null); setReturnInvoice(""); setSelectedItems({}); }}>Back</Button><Button size="sm" className="flex-1" onClick={handleReturnSubmit} disabled={returnSubmitLoading || !Object.values(selectedItems).some((v) => v.checked)}>{returnSubmitLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Return"}</Button></div></div>)}
          {submittedReturn && (<div className="space-y-4"><div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center"><div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto"><RotateCcw className="h-5 w-5 text-green-600" /></div><p className="text-sm font-semibold text-green-800 mt-2">Return Submitted</p><p className="text-xs font-mono text-green-700 bg-green-100 rounded px-2 py-1 mt-1">{submittedReturn.return_number}</p><p className="text-xs text-green-700 mt-1">Wait for admin approval.</p></div><Button className="w-full" onClick={() => handleFetchForResolution(submittedReturn.id)}>Process Return</Button><Button variant="outline" className="w-full" onClick={() => { onHeldReturn({ id: `hret-${Date.now()}`, heldAt: new Date(), returnId: submittedReturn.id, returnNumber: submittedReturn.return_number, invoiceNumber: returnSale?.invoice_number ?? "", customerName: returnSale?.customer_name ?? "" }); onClose(); resetPanel(); toast.success("Return parked."); }}><Hourglass className="h-4 w-4 mr-2" />Serve Next Customer</Button><Button variant="outline" className="w-full h-9 text-xs" onClick={resetPanel}>Start New Return</Button></div>)}
        </div>
      </div>
      <Dialog open={showResolution} onOpenChange={(o) => { if (!o) { setShowResolution(false); setResolveData(null); setResolveError(null); } }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Process Return</DialogTitle></DialogHeader>
          {resolveData && (<div className="space-y-4"><div className="text-xs text-gray-500"><p>Return: <span className="font-mono font-semibold">{resolveData.return_number}</span></p><p>Invoice: <span className="font-semibold">{resolveData.invoice_number}</span></p></div><div><p className="text-sm font-semibold mb-2">Resolution</p><div className="grid grid-cols-2 gap-2">{(["refund", "replacement"] as const).map((opt) => (<button key={opt} onClick={() => setResolution(opt)} className={`p-3 rounded-lg border-2 text-sm font-medium ${resolution === opt ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>{opt === "refund" ? "💰 Refund" : "🔄 Replace"}</button>))}</div></div><div><p className="text-sm font-semibold mb-2">Condition</p><div className="grid grid-cols-2 gap-2">{(["good", "damaged"] as const).map((opt) => (<button key={opt} onClick={() => setItemCondition(opt)} className={`p-3 rounded-lg border-2 text-sm font-medium ${itemCondition === opt ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>{opt === "good" ? "✅ Good" : "⚠️ Damaged"}</button>))}</div></div>{resolveError && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{resolveError}</p>}<Button className="w-full" onClick={handleResolve} disabled={resolveLoading}>{resolveLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Confirm {resolution === "refund" ? "Refund" : "Replacement"}</Button></div>)}
        </DialogContent>
      </Dialog>
    </>
  );
}