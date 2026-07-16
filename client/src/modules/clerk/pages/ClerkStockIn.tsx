import { useState, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PackagePlus, ScanLine, Search, Trash2, CheckCircle2,
  ChevronRight, ChevronLeft, Truck, FileText, Plus, TrendingUp,
  Package, Clock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { mockProducts, mockSuppliers, mockActivityLogs } from "@/modules/clerk/mockData";
import type { Product, StockInItem } from "@/modules/clerk/types";
import { nanoid } from "nanoid";

// ─── Mutable in-memory product store (shared across pages this session) ───────
// We expose a simple singleton so StockIn updates are visible in Inventory.
export const liveProducts: Product[] = mockProducts.map((p) => ({ ...p }));

// ─── Recent stock-in sessions (mock history) ─────────────────────────────────
interface StockInRecord {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  date: string;
  itemCount: number;
  totalQty: number;
}

const recentRecords: StockInRecord[] = [
  { id: "SI-041", supplierName: "BuildCo Supplies",      invoiceNumber: "INV-2025-0410", date: "Jan 14, 2025", itemCount: 3, totalQty: 150 },
  { id: "SI-040", supplierName: "Hardware Plus",         invoiceNumber: "INV-2025-0398", date: "Jan 13, 2025", itemCount: 5, totalQty: 320 },
  { id: "SI-039", supplierName: "Industrial Tools Inc.", invoiceNumber: "INV-2025-0385", date: "Jan 12, 2025", itemCount: 2, totalQty: 60  },
];

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Session Info" },
    { n: 2, label: "Add Items" },
    { n: 3, label: "Review & Save" },
  ];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1">
          <div className="flex flex-col items-center gap-1 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
              step > s.n ? "bg-blue-600 border-blue-600 text-white"
              : step === s.n ? "bg-blue-600 border-blue-600 text-white"
              : "bg-white border-gray-300 text-gray-400"
            }`}>
              {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </div>
            <span className={`text-xs font-medium whitespace-nowrap ${step === s.n ? "text-blue-600" : "text-gray-400"}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mb-4 mx-1 ${step > s.n ? "bg-blue-600" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Stock In Modal ───────────────────────────────────────────────────────────
interface StockInModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function StockInModal({ open, onClose, onSaved }: StockInModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Step 1 fields
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // Step 2 fields
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [items, setItems] = useState<StockInItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1); setSupplierId(""); setInvoiceNumber(""); setNotes("");
    setBarcodeInput(""); setSearchInput(""); setMatchedProduct(null);
    setQtyInput(""); setLookupError(""); setItems([]);
  };

  const handleClose = () => { reset(); onClose(); };

  const supplierName = mockSuppliers.find((s) => String(s.id) === supplierId)?.name ?? "";

  // Lookup by barcode
  const lookupByBarcode = useCallback((val: string) => {
    setLookupError("");
    const found = liveProducts.find((p) => p.barcode.toLowerCase() === val.trim().toLowerCase());
    if (found) { setMatchedProduct(found); setQtyInput(""); }
    else {
      setMatchedProduct(null);
      setLookupError("Product not registered. Please contact the Administrator.");
    }
    setBarcodeInput("");
  }, []);

  // Lookup by search
  const lookupBySearch = useCallback(() => {
    setLookupError("");
    const val = searchInput.trim().toLowerCase();
    if (!val) return;
    const found = liveProducts.find(
      (p) => p.name.toLowerCase().includes(val) || p.barcode.toLowerCase().includes(val)
    );
    if (found) { setMatchedProduct(found); setQtyInput(""); }
    else {
      setMatchedProduct(null);
      setLookupError("Product not registered. Please contact the Administrator.");
    }
  }, [searchInput]);

  const addItem = () => {
    if (!matchedProduct) return;
    const qty = parseInt(qtyInput, 10);
    if (!qty || qty < 1) { toast.error("Enter a valid quantity (min 1)"); return; }
    // Check if already in list — update qty instead
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === matchedProduct.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantityReceived: updated[existing].quantityReceived + qty };
        return updated;
      }
      return [...prev, {
        productId: matchedProduct.id,
        barcode: matchedProduct.barcode,
        productName: matchedProduct.name,
        unit: matchedProduct.unit,
        currentStock: matchedProduct.quantity,
        costPrice: matchedProduct.costPrice,
        quantityReceived: qty,
      }];
    });
    setMatchedProduct(null);
    setQtyInput("");
    setSearchInput("");
    setBarcodeInput("");
    toast.success(`${matchedProduct.name} added to list`);
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const handleSave = () => {
    // Update liveProducts quantities in-memory
    items.forEach((item) => {
      const p = liveProducts.find((p) => p.id === item.productId);
      if (p) {
        p.quantity += item.quantityReceived;
        // Update status
        if (p.quantity === 0) p.status = "Out of Stock";
        else if (p.quantity <= p.reorderLevel * 0.5) p.status = "Critical";
        else if (p.quantity <= p.reorderLevel) p.status = "Low Stock";
        else p.status = "In Stock";
      }
    });
    // Log activity
    const id = `SI-${String(Date.now()).slice(-3)}`;
    recentRecords.unshift({
      id,
      supplierName,
      invoiceNumber,
      date: today,
      itemCount: items.length,
      totalQty: items.reduce((s, i) => s + i.quantityReceived, 0),
    });
    items.forEach((item) => {
      mockActivityLogs.unshift({
        id: nanoid(6),
        action: "Received Stock",
        product: item.productName,
        qtyChange: `+${item.quantityReceived}`,
        performedBy: "Maria Santos",
        timestamp: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      });
    });
    toast.success(`Stock In ${id} saved — ${items.length} product(s) updated`);
    reset();
    onSaved();
  };

  const step1Valid = supplierId && invoiceNumber.trim();
  const step2Valid = items.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-blue-600" />
              New Stock In
            </DialogTitle>
            <DialogDescription>
              Record a delivery from a supplier and update product quantities.
            </DialogDescription>
          </DialogHeader>

          <StepIndicator step={step} />

          {/* ── Step 1: Session Info ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Supplier <span className="text-red-500">*</span>
                  </label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="w-full h-10">
                      <SelectValue placeholder="Select supplier…" />
                    </SelectTrigger>
                    <SelectContent>
                      {mockSuppliers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Invoice Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="e.g. INV-2025-0420"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
                  <Input value={today} disabled className="h-10 bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
                  <Input
                    placeholder="Any delivery remarks…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  disabled={!step1Valid}
                  onClick={() => setStep(2)}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  Next: Add Items <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Add Items ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Session summary strip */}
              <div className="flex flex-wrap gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs">
                <span className="flex items-center gap-1 text-blue-800 font-medium">
                  <Truck className="h-3.5 w-3.5" /> {supplierName}
                </span>
                <span className="flex items-center gap-1 text-blue-700">
                  <FileText className="h-3.5 w-3.5" /> {invoiceNumber}
                </span>
                <span className="flex items-center gap-1 text-blue-700">
                  <Clock className="h-3.5 w-3.5" /> {today}
                </span>
                {items.length > 0 && (
                  <Badge className="ml-auto bg-blue-600 text-white">{items.length} item{items.length !== 1 ? "s" : ""}</Badge>
                )}
              </div>

              {/* Scan / search row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
                  <Input
                    ref={barcodeRef}
                    placeholder="Scan barcode (Enter to lookup)…"
                    value={barcodeInput}
                    onChange={(e) => { setBarcodeInput(e.target.value); setLookupError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupByBarcode(barcodeInput); }}}
                    className="pl-9 h-10 font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <Input
                      placeholder="Search by name or barcode…"
                      value={searchInput}
                      onChange={(e) => { setSearchInput(e.target.value); setLookupError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupBySearch(); }}}
                      className="pl-9 h-10"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-10 px-4" onClick={lookupBySearch}>
                    Search
                  </Button>
                </div>
              </div>

              {/* Lookup error */}
              {lookupError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {lookupError}
                </div>
              )}

              {/* Matched product card */}
              {matchedProduct && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-green-100 rounded-lg"><Package className="h-5 w-5 text-green-700" /></div>
                      <div>
                        <p className="font-semibold text-gray-900">{matchedProduct.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {matchedProduct.barcode} · {matchedProduct.unit} · Current stock: <strong>{matchedProduct.quantity}</strong>
                        </p>
                        <p className="text-xs text-gray-500">
                          Cost price: ₱{matchedProduct.costPrice.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        value={qtyInput}
                        onChange={(e) => setQtyInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); }}}
                        className="h-9 w-24 text-center font-semibold"
                      />
                      <Button size="sm" onClick={addItem} className="h-9 gap-1 bg-green-600 hover:bg-green-700">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Items table */}
              {items.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2.5 px-4 font-semibold text-gray-600 text-xs">Product</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs">Current</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs">Received</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs">New Qty</th>
                        <th className="py-2.5 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.productId} className="border-b border-gray-100 last:border-0">
                          <td className="py-3 px-4">
                            <p className="font-medium text-gray-900 text-xs">{item.productName}</p>
                            <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                          </td>
                          <td className="py-3 px-3 text-center text-gray-600 text-sm">{item.currentStock}</td>
                          <td className="py-3 px-3 text-center text-green-700 font-bold text-sm">+{item.quantityReceived}</td>
                          <td className="py-3 px-3 text-center text-blue-700 font-bold text-sm">
                            {item.currentStock + item.quantityReceived}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                              onClick={() => removeItem(item.productId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td className="py-2 px-4 text-xs font-semibold text-gray-600" colSpan={2}>
                          Total items: {items.length}
                        </td>
                        <td className="py-2 px-3 text-center text-green-700 font-bold text-sm">
                          +{items.reduce((s, i) => s + i.quantityReceived, 0)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center border border-dashed border-gray-200 rounded-lg text-gray-400">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No items added yet. Scan a barcode or search for a product.</p>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  disabled={!step2Valid}
                  onClick={() => setStep(3)}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  Review & Save <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Review & Save ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Session header */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery Summary</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Supplier:</span> <span className="font-semibold text-gray-900">{supplierName}</span></div>
                  <div><span className="text-gray-500">Invoice:</span> <span className="font-semibold text-gray-900">{invoiceNumber}</span></div>
                  <div><span className="text-gray-500">Date:</span> <span className="font-semibold text-gray-900">{today}</span></div>
                  <div><span className="text-gray-500">Total Items:</span> <span className="font-semibold text-gray-900">{items.length} product(s)</span></div>
                </div>
                {notes && <p className="text-xs text-gray-500 italic">Note: {notes}</p>}
              </div>

              {/* Items review */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-2.5 px-4 font-semibold text-gray-600 text-xs">Product</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs">Unit</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs">Current</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs">Received</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs">New Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.productId} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">{item.productName}</p>
                          <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>
                        </td>
                        <td className="py-3 px-3 text-center text-gray-500 text-xs">{item.unit}</td>
                        <td className="py-3 px-3 text-center text-gray-600">{item.currentStock}</td>
                        <td className="py-3 px-3 text-center text-green-700 font-bold">+{item.quantityReceived}</td>
                        <td className="py-3 px-3 text-center text-blue-700 font-bold">
                          {item.currentStock + item.quantityReceived}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4" /> Confirm & Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Stock In</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the quantity of {items.length} product(s) and log the delivery.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => { setConfirmOpen(false); handleSave(); }}
            >
              Save Stock In
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClerkStockIn() {
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSaved = () => {
    setModalOpen(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock In</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record deliveries and update product quantities</p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="gap-2 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
        >
          <PackagePlus className="h-4 w-4" /> New Stock In
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-xl"><TrendingUp className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Today's Deliveries</p>
              <p className="text-2xl font-bold text-gray-900">{recentRecords.filter((r) => r.date === new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })).length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-50 rounded-xl"><Package className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{recentRecords.length + refreshKey}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 rounded-xl"><Truck className="h-5 w-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Units Received (All)</p>
              <p className="text-2xl font-bold text-gray-900">
                {recentRecords.reduce((s, r) => s + r.totalQty, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent sessions table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Recent Stock In Sessions</h2>
            <p className="text-xs text-gray-500 mt-0.5">History of received deliveries this session</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Session ID", "Supplier", "Invoice No.", "Date", "Products", "Total Qty", "Status"].map((h) => (
                  <th key={h} className="text-left py-3 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRecords.map((r, idx) => (
                <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                  <td className="py-3.5 px-5 font-mono text-xs font-semibold text-blue-700">{r.id}</td>
                  <td className="py-3.5 px-5 text-gray-800 font-medium">{r.supplierName}</td>
                  <td className="py-3.5 px-5 text-gray-600 font-mono text-xs">{r.invoiceNumber}</td>
                  <td className="py-3.5 px-5 text-gray-500 text-xs">{r.date}</td>
                  <td className="py-3.5 px-5 text-gray-700">{r.itemCount}</td>
                  <td className="py-3.5 px-5 text-green-700 font-bold">+{r.totalQty}</td>
                  <td className="py-3.5 px-5">
                    <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                      Saved
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <StockInModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
