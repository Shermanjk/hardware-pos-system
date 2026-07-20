import { useState, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  SlidersHorizontal, Search, ScanLine, Package, AlertCircle,
  CheckCircle2, Flame, PackageX, Clock4, RotateCcw, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getProducts, getSuppliers, lookupProduct, type ProductRecord,
} from "@/shared/api/productsApi";
import { submitStockAdjustment, getInventoryLogs } from "@/shared/api/inventoryApi";

// ─── Adjustment type config ───────────────────────────────────────────────────
const ADJUSTMENT_TYPES = [
  { value: "DAMAGED", label: "Damaged", icon: Flame, color: "text-red-600", bg: "bg-red-50", description: "Items physically damaged, subtract from stock" },
  { value: "LOST", label: "Lost", icon: PackageX, color: "text-orange-600", bg: "bg-orange-50", description: "Items that cannot be located, subtract from stock" },
  { value: "EXPIRED", label: "Expired", icon: Clock4, color: "text-amber-600", bg: "bg-amber-50", description: "Items past expiry date, subtract from stock" },
  { value: "CORRECTION", label: "Correction", icon: RotateCcw, color: "text-blue-600", bg: "bg-blue-50", description: "Manual correction — sets the absolute quantity" },
];

// ─── Type badge helper ──────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const cfg = ADJUSTMENT_TYPES.find((t) => t.value === type) || ADJUSTMENT_TYPES[3];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

// ─── Adjustment Modal ────────────────────────────────────────────────────────────
interface AdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  prefillProduct?: ProductRecord | null;
  onSaved: () => void;
}

function AdjustmentModal({ open, onClose, prefillProduct, onSaved }: AdjustmentModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(prefillProduct || null);
  const [lookupError, setLookupError] = useState("");
  const [adjType, setAdjType] = useState<string>("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductRecord[]>([]);

  // Sync prefill when modal opens/closes
  useEffect(() => {
    if (open) {
      setSelectedProduct(prefillProduct || null);
      setAdjType("");
      setQty("");
      setReason("");
      setErrors({});
      setLookupError("");
      // Load products
      const fetchProducts = async () => {
        try {
          const data = await getProducts();
          setProducts(data);
        } catch (err) {
          console.error(err);
          toast.error("Failed to load products");
        }
      };
      fetchProducts();
    }
  }, [open, prefillProduct]);

  const lookupProductFn = useCallback(async (val: string) => {
    setLookupError("");
    try {
      const results = await lookupProduct(val);
      if (results.length > 0) {
        const found = products.find(p => p.id === results[0].id);
        if (found) {
          setSelectedProduct(found);
          setLookupError("");
        } else {
          setLookupError("Product not found in inventory");
        }
      } else {
        setLookupError("Product not registered. Please contact the Administrator.");
      }
    } catch {
      setLookupError("Failed to search for product");
    }
  }, [products]);

  // Derived new quantity preview
  const qtyNum = parseInt(qty, 10) || 0;
  const currentQty = selectedProduct?.quantity || 0;
  const previewQty = adjType === "CORRECTION"
    ? qtyNum
    : Math.max(0, currentQty - qtyNum);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedProduct) e.product = "Select a product first";
    if (!adjType) e.type = "Select an adjustment type";
    if (!qty || qtyNum < 1) e.qty = "Enter a valid quantity (min 1)";
    if (adjType !== "CORRECTION" && qtyNum > currentQty) {
      e.qty = `Cannot deduct more than current stock (${currentQty})`;
    }
    if (!reason.trim()) e.reason = "Reason is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await submitStockAdjustment({
        product_id: selectedProduct!.id,
        type: adjType as "Damaged" | "Lost" | "Expired" | "Correction",
        quantity: qtyNum,
        reason,
      });
      toast.success(`Adjustment saved — ${selectedProduct!.product_name} updated to ${previewQty} ${selectedProduct!.unit}`);
      onClose();
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save adjustment");
    } finally {
      setLoading(false);
    }
  };

  const typeConfig = ADJUSTMENT_TYPES.find((t) => t.value === adjType);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-amber-600" />
              Stock Adjustment
            </DialogTitle>
            <DialogDescription>
              Record damaged, lost, expired, or corrected stock. All adjustments are logged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Product lookup */}
            {!selectedProduct ? (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                Find Product <span className="text-red-500">*</span>
              </label>
                <div className="grid grid-cols-1 gap-2">
                  <div className="relative">
                    <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
                    <Input
                      placeholder="Scan barcode (Enter)…"
                      value={barcodeInput}
                      onChange={(e) => { setBarcodeInput(e.target.value); setLookupError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupProductFn(barcodeInput); } }}
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
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupProductFn(searchInput); } }}
                        className="pl-9 h-10"
                      />
                    </div>
                    <Button variant="outline" size="sm" className="h-10 px-4"
                      onClick={() => lookupProductFn(searchInput)}>
                      Search
                    </Button>
                  </div>
                </div>
                {lookupError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />{lookupError}
                  </div>
                )}
                {errors.product && <p className="text-xs text-red-500">{errors.product}</p>}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg"><Package className="h-4 w-4 text-blue-700" /></div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{selectedProduct.product_name}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedProduct.barcode} · {selectedProduct.unit}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Current stock: <strong className="text-gray-900">{selectedProduct.quantity}</strong>
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700"
                  onClick={() => { setSelectedProduct(null); setErrors({}); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Adjustment type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Adjustment Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ADJUSTMENT_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = adjType === t.value;
                  return (
                    <button key={t.value} type="button"
                      onClick={() => { setAdjType(t.value); setErrors((e) => ({ ...e, type: "" })); }}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-all ${
                        active ? `border-current ${t.bg} ${t.color}` : "border-gray-200 hover:border-gray-300 text-gray-600"
                      }`}>
                      <Icon className={`h-4 w-4 flex-shrink-0 ${active ? t.color : "text-gray-400"}`} />
                      <span className="text-sm font-medium">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              {typeConfig && (
                <p className="text-xs text-gray-500 mt-1.5 pl-1">{typeConfig.description}</p>
              )}
              {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type}</p>}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {adjType === "CORRECTION" ? "Set New Quantity" : "Quantity to Deduct"}
                <span className="text-red-500"> *</span>
              </label>
              <Input
                type="number" min={1}
                placeholder={adjType === "CORRECTION" ? "Enter exact new quantity" : "How many units?"}
                value={qty}
                onChange={(e) => { setQty(e.target.value); setErrors((er) => ({ ...er, qty: "" })); }}
                className="h-10"
              />
              {errors.qty && <p className="text-xs text-red-500 mt-1">{errors.qty}</p>}
            </div>

            {/* New quantity preview */}
            {selectedProduct && adjType && qty && qtyNum >= 1 && (
              <div className={`flex items-center justify-between p-3 rounded-lg border ${
                previewQty === 0 ? "bg-red-50 border-red-200" :
                previewQty <= (selectedProduct.reorder_level * 0.5) ? "bg-red-50 border-red-200" :
                previewQty <= selectedProduct.reorder_level ? "bg-amber-50 border-amber-200" :
                "bg-green-50 border-green-200"
              }`}>
                <span className="text-sm text-gray-700 font-medium">New quantity will be:</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 line-through text-sm">{currentQty}</span>
                  <span className={`text-xl font-bold ${
                    previewQty === 0 ? "text-gray-500" :
                    previewQty <= selectedProduct.reorder_level ? "text-amber-700" : "text-green-700"
                  }`}>{previewQty}</span>
                  <span className="text-gray-500 text-sm">{selectedProduct.unit}</span>
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="Describe why this adjustment is needed…"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setErrors((er) => ({ ...er, reason: "" })); }}
                className="min-h-[80px] resize-none"
              />
              {errors.reason && <p className="text-xs text-red-500 mt-1">{errors.reason}</p>}
            </div>
          </div>

          <div className="flex justify-between gap-3 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700"
              onClick={() => { if (validate()) setConfirmOpen(true); }}
              disabled={loading}
            >
              <CheckCircle2 className="h-4 w-4" /> Save Adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Stock Adjustment</AlertDialogTitle>
            <AlertDialogDescription>
              {adjType === "CORRECTION"
                ? `This will set "${selectedProduct?.product_name}" quantity to ${previewQty} ${selectedProduct?.unit}.`
                : `This will deduct ${qtyNum} ${selectedProduct?.unit} from "${selectedProduct?.product_name}" (${currentQty} → ${previewQty}).`
              } This action is logged and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => { setConfirmOpen(false); handleSave(); }}
            >
              {loading ? "Saving..." : "Confirm Adjustment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClerkStockAdjustment() {
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);

  const handleSaved = () => { setModalOpen(false); setRefreshKey((k) => k + 1); };

  // Load adjustment history
  useEffect(() => {
    const fetchLogs = async () => {
      setLoadingLogs(true);
      try {
        const data = await getInventoryLogs();
        const adjustmentLogs = data.filter(log => log.action === "Stock Adjustment" || log.transaction_type === "Adjustment");
        setLogs(adjustmentLogs);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load logs");
      } finally {
        setLoadingLogs(false);
      }
    };
    fetchLogs();
  }, [refreshKey]);

  // Calculate stats
  const totalAdjustments = logs.length;
  const damagedCount = logs.filter(l => l.adjustment_type === 'DAMAGED').length;
  const lostCount = logs.filter(l => l.adjustment_type === 'LOST').length;
  const expiredCount = logs.filter(l => l.adjustment_type === 'EXPIRED').length;

  // Filtered history
  const filteredHistory = logs.filter((r) =>
    historySearch === "" ||
    (r.product_name || "").toLowerCase().includes(historySearch.toLowerCase()) ||
    (r.barcode || "").toLowerCase().includes(historySearch.toLowerCase()) ||
    (r.adjustment_type || "").toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Adjustment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record stock losses due to damage, loss, expiry, or correction</p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="gap-2 bg-amber-600 hover:bg-amber-700 flex-shrink-0">
          <SlidersHorizontal className="h-4 w-4" /> New Adjustment
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Adjustments", value: totalAdjustments, color: "text-gray-900", bg: "bg-gray-50", border: "" },
          { label: "Damaged", value: damagedCount, color: "text-red-600", bg: "bg-red-50", border: "border-red-100" },
          { label: "Lost", value: lostCount, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
          { label: "Expired", value: expiredCount, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
        ].map((s) => (
          <Card key={s.label} className={`p-4 text-center ${s.bg} ${s.border}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* History table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Adjustment History</h2>
            <p className="text-xs text-gray-500 mt-0.5">All recorded stock adjustments</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search adjustments…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["ID", "Product", "Type", "Deducted/Set", "Previous Qty", "New Qty", "Reason", "Date"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingLogs ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <SlidersHorizontal className="h-10 w-10 opacity-30" />
                      <p className="font-medium text-gray-600">No adjustments found</p>
                    </div>
                  </td>
                </tr>
              ) : filteredHistory.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-amber-700">{r.id}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900 text-xs">{r.product_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{r.barcode}</p>
                  </td>
                  <td className="py-3 px-4"><TypeBadge type={r.adjustment_type} /></td>
                  <td className="py-3 px-4 font-bold text-red-600 text-sm">
                    {r.adjustment_type === 'CORRECTION' ? `→${r.quantity_change}` : `-${r.quantity_change}`}
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-sm">{r.previous_quantity}</td>
                  <td className="py-3 px-4 font-bold text-gray-900 text-sm">{r.new_quantity}</td>
                  <td className="py-3 px-4 text-gray-600 text-xs max-w-[180px]">
                    <span className="truncate block">{r.reason}</span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AdjustmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
