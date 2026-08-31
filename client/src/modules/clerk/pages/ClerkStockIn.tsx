import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
    getCurrentPrice,
    getPurchaseHistory,
    type CommodityCurrentPrice, type CommodityPurchase
} from "@/shared/api/commodityApi";
import {
    getInventoryLogs,
    submitStockIn,
    type InventoryLog,
    type StockInSource,
} from "@/shared/api/inventoryApi";
import {
    getSuppliers,
    lookupProduct,
    type CashierProduct,
    type Supplier,
} from "@/shared/api/productsApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import { useBarcodeScanner } from "@/shared/hooks/useBarcodeScanner";
import { DRAFT_KEYS, useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import { formatQuantity } from "@/shared/utils/quantityFormat";
import {
    AlertCircle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Edit2,
    FileText,
    History,
    Loader2,
    Package,
    PackagePlus,
    Plus,
    RefreshCw,
    ScanLine, Search, Trash2,
    TrendingUp,
    Truck,
    X,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ClerkAuthModal from "../components/ClerkAuthModal";

type HistoryTabType = "stockin" | "commodity";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCES: StockInSource[] = [
  "Supplier Delivery",
  "Direct Purchase",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardItem {
  productId:        number;
  barcode:          string;
  productName:      string;
  category:         string;
  unit:             string;
  currentStock:     number;
  quantityReceived: number;
  unitCost:         string; // string so the input stays controlled
}

interface Step1State {
  source:          StockInSource | "";
  supplierId:      string;
  invoiceNumber:   string;
  deliveryDate:    string;
  remarks:         string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Session Info" },
    { n: 2, label: "Add Items" },
    { n: 3, label: "Review & Save" },
  ];
  return (
    <div className="flex items-start gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1">
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all shadow-sm
              ${step > s.n
                ? "bg-blue-600 border-blue-600 text-white"
                : step === s.n
                ? "bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100"
                : "bg-white border-gray-300 text-gray-400"}`}>
              {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
            </div>
            <span className={`text-xs font-semibold whitespace-nowrap ${
              step === s.n ? "text-blue-600" : step > s.n ? "text-blue-400" : "text-gray-400"
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mb-5 mx-1 rounded transition-all
              ${step > s.n ? "bg-blue-600" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

function fmt(n: number | string) {
  const v = Number(n);
  if (isNaN(v)) return "—";
  return "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Step 1: Session Info ─────────────────────────────────────────────────────

interface Step1Props {
  state:      Step1State;
  setState:   (s: Step1State) => void;
  suppliers:  Supplier[];
  errors:     Partial<Record<keyof Step1State, string>>;
  onNext:     () => void;
}

function Step1({ state, setState, suppliers, errors, onNext }: Step1Props) {
  const set = (k: keyof Step1State, v: string) =>
    setState({ ...state, [k]: v });

  return (
    <div className="space-y-4">

      {/* Delivery Info section */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-blue-600 flex items-center gap-2">
          <Truck className="h-4 w-4 text-white" />
          <p className="text-sm font-bold text-white">Delivery Information</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Source */}
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block font-semibold text-sm text-gray-700">
              Source <span className="text-red-500">*</span>
            </Label>
            <Select value={state.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger className={`h-10 bg-white border-gray-300 ${errors.source ? "border-red-400" : ""}`}>
                <SelectValue placeholder="Select source…" />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.source && <p className="mt-1 text-xs text-red-600">{errors.source}</p>}
          </div>

          {/* Supplier */}
          <div>
            <Label className="mb-1.5 block font-semibold text-sm text-gray-700">
              Supplier <span className="text-gray-400 font-normal text-xs">(optional)</span>
            </Label>
            <Select value={state.supplierId || "none"} onValueChange={(v) => set("supplierId", v === "none" ? "" : v)}>
              <SelectTrigger className="h-10 bg-white border-gray-300">
                <SelectValue placeholder="Select supplier…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No supplier —</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.supplier_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delivery Date */}
          <div>
            <Label className="mb-1.5 block font-semibold text-sm text-gray-700">
              Delivery Date <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                type="date"
                value={state.deliveryDate}
                onChange={(e) => set("deliveryDate", e.target.value)}
                className={`h-10 pl-8 bg-white border-gray-300 ${errors.deliveryDate ? "border-red-400" : ""}`}
              />
            </div>
            {errors.deliveryDate && <p className="mt-1 text-xs text-red-600">{errors.deliveryDate}</p>}
          </div>
        </div>
      </div>

      {/* Reference section */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-700 flex items-center gap-2">
          <FileText className="h-4 w-4 text-white" />
          <p className="text-sm font-bold text-white">Reference & Notes</p>
          <span className="ml-1 text-xs text-gray-300 font-normal">(optional)</span>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label className="mb-1.5 block font-semibold text-sm text-gray-700">
              Invoice / DR No.
            </Label>
            <Input
              placeholder="e.g. INV-2025-0420"
              value={state.invoiceNumber}
              onChange={(e) => set("invoiceNumber", e.target.value)}
              className="h-10 bg-white border-gray-300"
            />
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold text-sm text-gray-700">Remarks</Label>
            <textarea
              rows={3}
              placeholder="Any delivery remarks or notes…"
              value={state.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={onNext} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          Next: Add Items <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Commodity Purchase Card ─────────────────────────────────────────────────
// Shown instead of the normal qty card when a MARKET_BASED product is matched.

interface CommodityPurchaseCardProps {
  product:    CashierProduct;
  supplierId: string;
  deliveryDate: string;
  onDone:     () => void;
  onCancel:   () => void;
  onRefreshLogs: () => void;
}

function CommodityPurchaseCard({
  product, supplierId, deliveryDate, onDone, onCancel, onRefreshLogs,
}: CommodityPurchaseCardProps) {
  const [currentPrice, setCurrentPrice] = useState<CommodityCurrentPrice | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError,   setPriceError]   = useState("");

  const [qty,              setQty]              = useState("");
  // NEW: deducted_quantity is physical weight (e.g., 3 kg), NOT price per unit
  const [deductedQty,     setDeductedQty]      = useState("");
  const [sellerName,       setSellerName]       = useState("");
  const [sellerAddress,    setSellerAddress]    = useState("");
  const [sellerContact,    setSellerContact]    = useState("");
  const [remarks,          setRemarks]          = useState("");

  const [saving,           setSaving]           = useState(false);

  // Auth modal — shown after the clerk clicks "Submit for Approval"
  // The actual request is only created when the clerk picks a method
  const [authModalOpen,    setAuthModalOpen]    = useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<number | null>(null);
  const [pendingAuthPayload, setPendingAuthPayload] = useState<any>(null);
  const [pendingAuthSummary, setPendingAuthSummary] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    setPriceLoading(true);
    setPriceError("");
    getCurrentPrice(product.id)
      .then(setCurrentPrice)
      .catch(() => setPriceError("No reference price set. Ask the Admin to set a buying price first."))
      .finally(() => setPriceLoading(false));
  }, [product.id]);

  // Live preview — purely for display; backend recalculates authoritatively
  // NEW MODEL: Physical quantity deduction
  // Example: 100 kg received, 3 kg deducted -> pay for 97 kg
  const refPrice      = currentPrice ? Number(currentPrice.price_per_unit) : 0;
  const qtyNum        = parseFloat(qty) || 0;
  const deductedQtyNum = parseFloat(deductedQty) || 0;
  const payableQty    = Math.max(0, qtyNum - deductedQtyNum);
  const grossAmount   = qtyNum * refPrice;
  const deductionVal  = deductedQtyNum * refPrice; // Monetary value of the deduction
  const finalAmt      = payableQty * refPrice;

  const handleSubmitForApproval = async () => {
    if (!currentPrice) return;
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) { toast.error("Quantity must be greater than 0."); return; }
    const d = parseFloat(deductedQty) || 0;
    if (d < 0) { toast.error("Deducted quantity cannot be negative."); return; }
    if (d > q) { toast.error(`Deducted quantity (${d}) cannot exceed Quantity Received (${q}).`); return; }

    // Don't submit to the server yet — just collect the payload and show the auth modal
    // The request will only be created when the clerk actively picks a method
    const payload = {
      product_id:        product.id,
      supplier_id:       supplierId ? parseInt(supplierId) : null,
      seller_name:       sellerName.trim() || null,
      seller_address:    sellerAddress.trim() || null,
      seller_contact:    sellerContact.trim() || null,
      quantity:          q,
      deducted_quantity: d,
      transaction_date:  deliveryDate,
      remarks:           remarks.trim() || null,
    };

    const payableQtyPreview = Math.max(0, q - d);
    const finalAmtPreview = payableQtyPreview * (currentPrice ? Number(currentPrice.price_per_unit) : 0);

    setPendingPurchaseId(null);
    setPendingAuthPayload(payload);
    setPendingAuthSummary([
      { label: "Product", value: product.product_name },
      { label: "Qty Received", value: `${q} ${product.unit_abbreviation}` },
      ...(d > 0 ? [{ label: "Deducted Qty", value: `${d} ${product.unit_abbreviation}` }] : []),
      { label: "Payable Qty", value: `${payableQtyPreview} ${product.unit_abbreviation}` },
      { label: "Est. Amount", value: `₱${finalAmtPreview.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` },
    ]);
    setAuthModalOpen(true);
  };

  return (
    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <TrendingUp className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{product.product_name}</p>
            <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
              Market-Based
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="font-mono">{product.barcode}</span>
            {" · "}{product.unit}
            {" · "}<span className="font-medium">Current stock: {formatQuantity(product.quantity, product.unit_abbreviation, product.quantity_type)}</span>
          </p>
        </div>
      </div>

      {/* Reference price display */}
      {priceLoading ? (
        <div className="p-3 bg-white border border-amber-200 rounded-lg space-y-2">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : priceError ? (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {priceError}
        </div>
      ) : currentPrice && (
        <div className="p-3 bg-white border border-amber-200 rounded-lg">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Current Reference Buying Price</p>
          <p className="text-2xl font-bold text-amber-700 tabular-nums mt-0.5">
            ₱{Number(currentPrice.price_per_unit).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            <span className="text-sm font-normal text-gray-500"> / {product.unit_abbreviation}</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Set by {currentPrice.changed_by_name}</p>
        </div>
      )}

      {/* Inputs */}
      {!priceLoading && !priceError && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">
                Quantity Received ({product.unit_abbreviation}) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number" min="0.001" step="any"
                placeholder="e.g. 100.5"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="h-9 font-bold border-2 border-amber-300 focus:border-amber-500"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">
                Deducted Quantity ({product.unit_abbreviation}) <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                type="number" min="0" step="any"
                placeholder="0.00"
                value={deductedQty}
                onChange={(e) => setDeductedQty(e.target.value)}
                className="h-9 border-2 border-gray-300"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Seller Name <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Juan dela Cruz"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="h-9 border-gray-300"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Remarks <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                placeholder="Quality notes…"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="h-9 border-gray-300"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Seller Address <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Brgy. San Jose, Butuan City"
                value={sellerAddress}
                onChange={(e) => setSellerAddress(e.target.value)}
                className="h-9 border-gray-300"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Seller Contact No. <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. 09XX-XXX-XXXX"
                value={sellerContact}
                onChange={(e) => setSellerContact(e.target.value)}
                className="h-9 border-gray-300"
              />
            </div>
          </div>

          {/* Live calculation preview - NEW MODEL: Physical quantity deduction */}
          {qtyNum > 0 && (
            <div className="p-3 bg-white border border-amber-200 rounded-lg space-y-1.5 text-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Calculation Preview</p>
              
              {/* Quantity breakdown */}
              <div className="flex justify-between text-gray-600">
                <span>Quantity Received</span>
                <span className="tabular-nums font-medium">{qtyNum} {product.unit_abbreviation}</span>
              </div>
              {deductedQtyNum > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Deducted Quantity</span>
                  <span className="tabular-nums font-medium">−{deductedQty} {product.unit_abbreviation}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>Payable Quantity</span>
                <span className="tabular-nums font-bold">{payableQty} {product.unit_abbreviation}</span>
              </div>
              
              {/* Financial breakdown */}
              <div className="flex justify-between text-gray-600 mt-2">
                <span>Gross Value ({qtyNum} × ₱{refPrice.toFixed(2)})</span>
                <span className="tabular-nums font-medium">₱{grossAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
              </div>
              {deductedQtyNum > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Deduction Value ({deductedQty} × ₱{refPrice.toFixed(2)})</span>
                  <span className="tabular-nums font-medium">−₱{deductionVal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>Final Amount Payable</span>
                <span className="tabular-nums text-emerald-700 font-bold">₱{finalAmt.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
              </div>
              
              <p className="text-xs text-gray-400 mt-1">* Backend recalculates all values. This preview is for reference only.</p>
            </div>
          )}

          {/* Approval notice */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-semibold text-blue-700">Submit for Approval</p>
            <p className="text-xs text-blue-600 mt-1">
              This purchase will be submitted to Admin for approval. Inventory will only increase after Admin approves this purchase.
            </p>
            <p className="text-xs text-blue-500 mt-1">
              The Cashier will handle seller payment after approval.
            </p>
          </div>
        </>
      )}

      {/* Actions */}
      {!priceLoading && !priceError && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSubmitForApproval}
            disabled={saving || !qty || parseFloat(qty) <= 0}
            className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {saving ? <Spinner className="text-white" /> : <Plus className="h-3.5 w-3.5" />}
            {saving ? "Submitting…" : "Submit for Approval"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}
            className="text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {priceError && (
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      )}

      {/* Admin auth modal — shown when clerk clicks "Submit for Approval"
          The request is only created when the clerk picks a method */}
      <ClerkAuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          // If they cancelled without choosing, just close — nothing was submitted
          if (!pendingPurchaseId) return;
          onDone();
        }}
        requestType="commodity_purchase"
        createPayload={pendingAuthPayload ? { type: "commodity_purchase", payload: pendingAuthPayload } : null}
        existingRequestId={pendingPurchaseId}
        title="Authorize Commodity Purchase"
        summary={pendingAuthSummary}
        onRequestCreated={(id) => {
          setPendingPurchaseId(id);
          onRefreshLogs();
          toast.success(`${product.product_name} submitted for approval.`);
        }}
        onApproved={(_adminName) => {
          setAuthModalOpen(false);
          onRefreshLogs();
          onDone();
        }}
      />
    </div>
  );
}

// ─── Step 2: Add Items ────────────────────────────────────────────────────────

interface Step2Props {
  session:    Step1State;
  suppliers:  Supplier[];
  items:      WizardItem[];
  setItems:   (items: WizardItem[]) => void;
  onBack:     () => void;
  onNext:     () => void;
  onRefreshLogs: () => void;
}

function Step2({ session, suppliers, items, setItems, onBack, onNext, onRefreshLogs }: Step2Props) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searching,    setSearching]    = useState(false);
  const [results,      setResults]      = useState<CashierProduct[]>([]);
  const [matched,      setMatched]      = useState<CashierProduct | null>(null);
  const [lookupError,  setLookupError]  = useState("");
  const [qtyInput,     setQtyInput]     = useState("");
  const [editingId,    setEditingId]    = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const barcodeRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);

  const supplierName = suppliers.find((s) => String(s.id) === session.supplierId)?.supplier_name;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Prevent the Search button mousedown from closing the dropdown before click fires
  const handleSearchMouseDown = (e: React.MouseEvent) => e.preventDefault();

  const lookup = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    setLookupError("");
    setResults([]);
    setShowDropdown(false);
    try {
      const data = await lookupProduct(query.trim());
      if (data.length === 0) {
        setLookupError("No products found. Make sure it is registered in the system.");
        return;
      }
      // If exact barcode match — skip the list and go straight to the card
      const exact = data.find((r) => r.barcode.toLowerCase() === query.trim().toLowerCase());
      if (exact) {
        setMatched(exact);
        setQtyInput("");
        setBarcodeInput("");
      } else {
        setResults(data);
        setShowDropdown(true);
      }
    } catch {
      setLookupError("Failed to search. Please try again.");
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setBarcodeInput(value);
    setLookupError("");
    setMatched(null);
    setResults([]);
    setShowDropdown(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => lookup(value), 400);
    }
  };

  const { handleKeyDown: handleSearchKeyDown, handleFocus: handleSearchFocus } = useBarcodeScanner({
    setValue: (val) => handleInputChange(val),
    onScan: (val) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      lookup(val);
    },
    inputRef: barcodeRef,
    enabled: !matched,
  });

  const selectResult = (product: CashierProduct) => {
    setMatched(product);
    setQtyInput("");
    setResults([]);
    setShowDropdown(false);
    setBarcodeInput("");
  };

  const clearSearch = () => {
    setBarcodeInput("");
    setResults([]);
    setShowDropdown(false);
    setMatched(null);
    setLookupError("");
    barcodeRef.current?.focus();
  };

  const addOrUpdate = () => {
    if (!matched) return;
    // BUG-07 FIX: Use parseFloat instead of parseInt so decimal quantities (e.g. 2.5 kg) are not truncated
    const qty = parseFloat(qtyInput);
    if (!qty || qty <= 0) { toast.error("Quantity must be greater than 0."); return; }

    setItems((() => {
      const existing = items.findIndex((i) => i.productId === matched.id);
      if (existing >= 0) {
        const updated = [...items];
        updated[existing] = {
          ...updated[existing],
          quantityReceived: Math.round((updated[existing].quantityReceived + qty) * 10000) / 10000,
        };
        toast.success(`${matched.product_name} — quantity updated to ${updated[existing].quantityReceived}`);
        return updated;
      }
      toast.success(`${matched.product_name} added`);
      return [...items, {
        productId:        matched.id,
        barcode:          matched.barcode,
        productName:      matched.product_name,
        category:         "",
        unit:             matched.unit_abbreviation || matched.unit,
        currentStock:     matched.quantity,
        quantityReceived: qty,
        unitCost:         "",
      }];
    })());

    setMatched(null);
    setQtyInput("");
    barcodeRef.current?.focus();
  };

  const removeItem = (id: number) => setItems(items.filter((i) => i.productId !== id));

  const updateItem = (id: number, value: string) => {
    // BUG-07 FIX: Use parseFloat so decimal quantities are preserved
    const parsed = parseFloat(value);
    setItems(items.map((i) => i.productId === id ? { ...i, quantityReceived: parsed > 0 ? parsed : i.quantityReceived } : i));
  };

  const totalQty = items.reduce((s, i) => s + i.quantityReceived, 0);

  return (
    <div className="space-y-4">

      {/* Session summary strip */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-600 rounded-xl text-xs">
        <span className="flex items-center gap-1 font-semibold text-white">
          <Package className="h-3.5 w-3.5" /> {session.source}
        </span>
        {supplierName && (
          <span className="flex items-center gap-1 text-blue-100">
            <Truck className="h-3.5 w-3.5" /> {supplierName}
          </span>
        )}
        {session.invoiceNumber && (
          <span className="flex items-center gap-1 text-blue-100">
            <FileText className="h-3.5 w-3.5" /> {session.invoiceNumber}
          </span>
        )}
        <span className="flex items-center gap-1 text-blue-100">
          <Clock className="h-3.5 w-3.5" />
          {new Date(session.deliveryDate + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {items.length > 0 && (
          <span className="ml-auto bg-white text-blue-700 px-2 py-0.5 rounded-full font-bold">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Search input with results dropdown */}
      <div className="bg-white border-2 border-gray-300 rounded-xl shadow-sm">
        <div className="px-4 py-3 bg-emerald-600 flex items-center gap-2 rounded-t-xl">
          <ScanLine className="h-4 w-4 text-white" />
          <p className="text-sm font-bold text-white">Scan or Search Product</p>
        </div>
        <div className="p-4">
          <div ref={wrapperRef} className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                {searching
                  ? <Spinner className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                  : <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 pointer-events-none" />
                }
                <Input
                  ref={barcodeRef}
                  placeholder="Scan barcode or type product name…"
                  value={barcodeInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") clearSearch();
                    else handleSearchKeyDown(e);
                  }}
                  onFocus={handleSearchFocus}
                  className="pl-11 pr-8 h-12 text-base bg-white border-2 border-gray-300 hover:border-blue-400 focus:border-blue-500 rounded-lg shadow-sm"
                  autoFocus
                />
                {barcodeInput && (
                  <button onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button size="sm"
                className="h-12 px-6 shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2"
                onMouseDown={handleSearchMouseDown}
                onClick={() => { if (debounceRef.current) clearTimeout(debounceRef.current); lookup(barcodeInput); }}
                disabled={searching || !barcodeInput.trim()}>
                <Search className="h-4 w-4" /> Search
              </Button>
            </div>

            {/* Results dropdown */}
            {showDropdown && results.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500">{results.length} result{results.length !== 1 ? "s" : ""} found — select a product</p>
                </div>
                <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left"
                        onClick={() => selectResult(r)}>
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{r.product_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            <span className="font-mono">{r.barcode}</span>
                            {" · "}{r.unit}
                            {" · "}Stock: <span className="font-medium text-gray-600">{formatQuantity(r.quantity, r.unit_abbreviation, r.quantity_type)}</span>
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {lookupError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {lookupError}
          <button className="ml-auto" onClick={() => setLookupError("")}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Selected product card — commodity vs normal */}
      {matched && matched.pricing_type === "MARKET_BASED" ? (
        <CommodityPurchaseCard
          product={matched}
          supplierId={session.supplierId}
          deliveryDate={session.deliveryDate}
          onDone={() => { setMatched(null); setQtyInput(""); barcodeRef.current?.focus(); }}
          onCancel={() => { setMatched(null); setLookupError(""); }}
          onRefreshLogs={onRefreshLogs}
        />
      ) : matched && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">{matched.product_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="font-mono">{matched.barcode}</span>
                {" · "}{matched.unit}
                {" · "}<span className="font-medium">Current stock: {formatQuantity(matched.quantity, matched.unit_abbreviation, matched.quantity_type)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1">
              <Label className="text-xs font-semibold text-gray-600 mb-1 block">Qty Received <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={1}
                placeholder="0"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOrUpdate(); } }}
                className="h-9 text-center font-bold w-28"
                autoFocus
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={addOrUpdate} className="h-9 gap-1 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setMatched(null); setLookupError(""); }}
                className="h-9 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Items table */}
      {items.length > 0 ? (
        <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Barcode</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Product Name</th>
                  <th className="text-center py-3 px-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Unit</th>
                  <th className="text-center py-3 px-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Qty Received</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => {
                  const isEditing = editingId === item.productId;
                  return (
                    <tr key={item.productId}
                      className={`transition-colors hover:bg-slate-50/80 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                          {item.barcode}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 text-sm">{item.productName}</p>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full inline-block">
                          {item.unit}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isEditing ? (
                          <Input
                            type="number" min={1}
                            value={item.quantityReceived}
                            onChange={(e) => updateItem(item.productId, e.target.value)}
                            onBlur={() => setEditingId(null)}
                            className="h-8 w-24 text-center mx-auto font-bold border-2 border-blue-500 rounded-lg"
                            autoFocus
                          />
                        ) : (
                          <span className="inline-flex items-center justify-center min-w-[2.5rem] px-3 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-sm border border-emerald-200 tabular-nums shadow-sm">
                            +{item.quantityReceived}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(isEditing ? null : item.productId)}
                            title="Edit Quantity"
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors border border-transparent hover:border-amber-200"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(item.productId)}
                            title="Remove Product"
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/90 border-t border-slate-200 font-semibold">
                  <td colSpan={3} className="py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Total: {items.length} product{items.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center justify-center px-3.5 py-1 rounded-full bg-emerald-600 text-white font-extrabold text-sm tabular-nums shadow-sm">
                      +{totalQty}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 bg-slate-50/40">
          <Package className="h-9 w-9 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No items added yet</p>
          <p className="text-xs text-slate-400 mt-0.5">Scan a barcode or use the search bar above to add products</p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          disabled={items.length === 0}
          onClick={onNext}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
        >
          Review & Save <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Review & Save ────────────────────────────────────────────────────

interface Step3Props {
  session:   Step1State;
  suppliers: Supplier[];
  items:     WizardItem[];
  saving:    boolean;
  onBack:    () => void;
  onSave:    () => void;
  onCancel:  () => void;
}

function Step3({ session, suppliers, items, saving, onBack, onSave, onCancel }: Step3Props) {
  const supplierName = suppliers.find((s) => String(s.id) === session.supplierId)?.supplier_name;
  const totalQty = items.reduce((s, i) => s + i.quantityReceived, 0);

  return (
    <div className="space-y-5">

      {/* Session summary */}
      <div className="p-5 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Delivery Session Summary</p>
          <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
            {session.source}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between py-1 border-b border-slate-100 sm:border-0">
            <span className="text-slate-500 font-medium">Delivery Date:</span>{" "}
            <span className="font-semibold text-slate-900">
              {new Date(session.deliveryDate + "T00:00:00").toLocaleDateString("en-PH", {
                month: "long", day: "numeric", year: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100 sm:border-0">
            <span className="text-slate-500 font-medium">Supplier:</span>{" "}
            <span className="font-semibold text-slate-900">{supplierName ?? <span className="text-slate-400 font-normal italic">None</span>}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100 sm:border-0">
            <span className="text-slate-500 font-medium">Invoice / DR:</span>{" "}
            <span className="font-mono font-semibold text-slate-900">{session.invoiceNumber || <span className="text-slate-400 font-normal italic font-sans">None</span>}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-500 font-medium">Total Products:</span>{" "}
            <span className="font-bold text-blue-600">{items.length} items ({totalQty} units)</span>
          </div>
        </div>
        {session.remarks && (
          <p className="text-xs text-slate-600 border-t border-slate-200/80 pt-2.5 mt-2">
            <span className="font-semibold text-slate-700">Remarks:</span> {session.remarks}
          </p>
        )}
      </div>

      {/* Items summary */}
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2.5">Items to be Received</p>
        <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Barcode</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Product Name</th>
                  <th className="text-center py-3 px-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Unit</th>
                  <th className="text-center py-3 px-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.productId} className={`transition-colors hover:bg-slate-50/80 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                        {item.barcode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{item.productName}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full inline-block">
                        {item.unit}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2.5rem] px-3 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-sm border border-emerald-200 tabular-nums">
                        +{item.quantityReceived}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                  <td className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider" colSpan={3}>
                    Total ({items.length} items):
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center justify-center px-3.5 py-1 rounded-full bg-emerald-600 text-white font-extrabold text-sm tabular-nums shadow-sm">
                      +{totalQty}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Totals banner */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Unique Products", value: String(items.length) },
          { label: "Total Units Received", value: String(totalQty) },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-slate-200/80 rounded-xl p-3.5 text-center shadow-sm">
            <p className="text-xs text-slate-500 font-medium">{c.label}</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={saving} className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}
            className="text-red-600 border-red-200 hover:bg-red-50">
            Cancel
          </Button>
        </div>
        <Button
          onClick={onSave}
          disabled={saving}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6"
        >
          {saving ? <Spinner className="text-white" /> : <PackagePlus className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Stock In"}
        </Button>
      </div>
    </div>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  stockInId,
  itemCount,
  onNewTransaction,
}: {
  stockInId: string;
  itemCount: number;
  onNewTransaction: () => void;
}) {
  return (
    <div className="py-10 flex flex-col items-center gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-gray-900">Stock In Saved Successfully!</h3>
        <p className="text-sm text-gray-500 mt-1">
          {itemCount} product{itemCount !== 1 ? "s" : ""} added to inventory
        </p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3">
        <p className="text-xs text-gray-500 font-medium">Stock In Reference</p>
        <p className="text-xl font-mono font-bold text-blue-700 mt-0.5">{stockInId}</p>
      </div>
      <div className="flex gap-3 mt-2">
        <Button onClick={onNewTransaction} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          <PackagePlus className="h-4 w-4" /> New Stock In
        </Button>
      </div>
    </div>
  );
}

// ─── History Panel with Tabs ─────────────────────────────────────────────────

interface HistoryPanelProps {
  logs: InventoryLog[];
  logsLoading: boolean;
  commodityRequests: CommodityPurchase[];
  commodityLoading: boolean;
  refreshKey: number;
  onRefresh: () => void;
}

function HistoryPanel({ logs, logsLoading, commodityRequests, commodityLoading, refreshKey, onRefresh }: HistoryPanelProps) {
  const [activeTab, setActiveTab] = useState<HistoryTabType>("stockin");

  const TabButton = ({ tab, icon: Icon, label, count }: { tab: HistoryTabType; icon: any; label: string; count?: number }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
        activeTab === tab
          ? tab === "stockin"
            ? "border-blue-500 text-blue-800 bg-white"
            : "border-amber-500 text-amber-800 bg-white"
          : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      <Icon className={`h-4 w-4 ${activeTab === tab ? (tab === "stockin" ? "text-blue-600" : "text-amber-600") : "text-gray-400"}`} />
      {label}
      {count !== undefined && count > 0 && (
        <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-600">{count}</span>
      )}
    </button>
  );

  const pendingCount = commodityRequests.filter(r => r.approval_status === "PENDING_APPROVAL").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 bg-gray-50">
        <TabButton tab="stockin" icon={History} label="Stock In History" count={logs.length} />
        <TabButton tab="commodity" icon={TrendingUp} label="Commodity Requests" count={pendingCount} />
        <div className="ml-auto px-3">
          <button
            onClick={onRefresh}
            className="h-8 w-8 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${(logsLoading || commodityLoading) ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stock In History Tab */}
      {activeTab === "stockin" && (
        logsLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-y border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-40">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[180px]">Product</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">Qty Added</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">New Stock</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[160px]">Reference</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-20" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No stock-in history yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-y border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-40">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[180px]">Product</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">Qty Added</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">New Stock</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[180px]">Reference & Notes</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log, idx) => (
                  <tr key={log.id}
                    className={`transition-colors hover:bg-blue-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-700">{new Date(log.created_at).toLocaleDateString()}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{log.product_name}</p>
                      <p className="font-mono text-xs text-gray-400 mt-0.5">{log.barcode}</p>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-sm border border-emerald-200 tabular-nums">
                        +{log.quantity_change ?? 0}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{log.remaining_stock ?? "—"}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-gray-500 font-medium">Ref:</span>
                          <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${
                            log.reference && log.reference !== "—"
                              ? "bg-gray-100 text-gray-800 border border-gray-200" 
                              : "text-gray-400 font-normal italic"
                          }`}>
                            {log.reference && log.reference !== "—" ? log.reference : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-start gap-1">
                          <span className="text-[11px] text-gray-500 font-medium shrink-0">Notes:</span>
                          <span className={`text-xs ${
                            log.notes && log.notes !== "—"
                              ? "text-gray-700 italic font-medium" 
                              : "text-gray-400 italic"
                          }`}>
                            {log.notes && log.notes !== "—" ? log.notes : "N/A"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-gray-700">{log.performed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Commodity Requests Tab */}
      {activeTab === "commodity" && (
        commodityLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-y border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-40">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[180px]">Product</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-24">Qty</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">Amount</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">Seller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-4"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : commodityRequests.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No commodity purchase requests yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-y border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-40">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[180px]">Product</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-24">Qty</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">Amount</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">Seller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {commodityRequests.map((req, idx) => (
                  <tr key={req.id}
                    className={`transition-colors hover:bg-amber-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-gray-700">{new Date(req.transaction_date).toLocaleDateString()}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{req.product_name}</p>
                      <p className="font-mono text-xs text-gray-400 mt-0.5">{req.barcode}</p>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{req.quantity} {req.unit_name}</span>
                      {req.deducted_quantity > 0 && (
                        <p className="text-xs text-gray-500">−{req.deducted_quantity} {req.unit_name}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">
                        ₱{Number(req.final_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </span>
                      {req.payment_status !== "PAID" && req.balance_due > 0 && (
                        <p className="text-xs text-gray-500">{req.balance_due > 0 ? `₱${Number(req.balance_due).toLocaleString("en-PH", { minimumFractionDigits: 2 })} balance` : ""}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {req.approval_status === "PENDING_APPROVAL" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold border border-yellow-200">
                          <Loader2 className="h-3 w-3 animate-spin" /> Pending
                        </span>
                      ) : req.approval_status === "APPROVED" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold border border-green-200">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold border border-red-200">
                          <XCircle className="h-3 w-3" /> Rejected
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-700">
                      {req.seller || "—"}
                      {/* WORKFLOW-01 FIX: Show rejection reason when request was rejected */}
                      {req.approval_status === "REJECTED" && req.rejection_reason && (
                        <p className="text-xs text-red-600 mt-0.5 font-medium">
                          Reason: {req.rejection_reason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─── Draft type ───────────────────────────────────────────────────────────────
interface StockInDraft {
  step: 1 | 2 | 3;
  session: Step1State;
  items: WizardItem[];
  savedAt: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClerkStockIn() {
  const [step,      setStep]      = useState<1 | 2 | 3>(1);
  const [saving,    setSaving]    = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items,     setItems]     = useState<WizardItem[]>([]);
  const [step1Errors, setStep1Errors] = useState<Partial<Record<keyof Step1State, string>>>({});
  const [successData, setSuccessData] = useState<{ id: string; count: number } | null>(null);

  const [session, setSession] = useState<Step1State>({
    source:        "",
    supplierId:    "",
    invoiceNumber: "",
    deliveryDate:  todayISO(),
    remarks:       "",
  });

  // ── Draft recovery ──────────────────────────────────────────────────────────
  const stockInDraft = useDraftRecovery<StockInDraft>(DRAFT_KEYS.CLERK_STOCK_IN);
  const [recoverableDraft, setRecoverableDraft] = useState<StockInDraft | null>(null);

  useEffect(() => {
    const draft = stockInDraft.getRecoverableDraft();
    if (draft && (draft.items.length > 0 || draft.step > 1)) {
      setRecoverableDraft(draft);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save whenever step, session, or items change
  useEffect(() => {
    if (items.length > 0 || step > 1) {
      stockInDraft.saveDraft({ step, session, items, savedAt: new Date().toISOString() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, session, items]);

  // History log state
  const [logs,        setLogs]        = useState<InventoryLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshKey,  setRefreshKey]  = useState(0);

  // Commodity purchase requests state
  const [commodityRequests, setCommodityRequests] = useState<CommodityPurchase[]>([]);
  const [commodityLoading, setCommodityLoading] = useState(false);

  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    setLogsLoading(true);
    getInventoryLogs({ limit: 50 })
      .then((data) => {
        setLogs(data.filter((l) =>
          l.transaction_type === "Stock In" ||
          l.action === "Received Stock" ||
          l.action === "Commodity Purchase"
        ));
      })
      .catch(() => {})
      .finally(() => setLogsLoading(false));
  }, [refreshKey]);

  // Fetch clerk's commodity purchase requests
  useEffect(() => {
    setCommodityLoading(true);
    getPurchaseHistory({ limit: 50 })
      .then(setCommodityRequests)
      .catch(() => {})
      .finally(() => setCommodityLoading(false));
  }, [refreshKey]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const handleStep1Next = () => {
    const errs: Partial<Record<keyof Step1State, string>> = {};
    if (!session.source)       errs.source       = "Source is required.";
    if (!session.deliveryDate) errs.deliveryDate  = "Delivery date is required.";
    if (Object.keys(errs).length > 0) { setStep1Errors(errs); return; }
    setStep1Errors({});
    setStep(2);
  };

  const reset = () => {
    setStep(1);
    setItems([]);
    setSession({ source: "", supplierId: "", invoiceNumber: "", deliveryDate: todayISO(), remarks: "" });
    setStep1Errors({});
    setSuccessData(null);
    stockInDraft.discardDraft();
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (items.length === 0) { toast.error("Add at least one item before saving."); return; }
    setSaving(true);
    try {
      const result = await submitStockIn({
        source:          session.source as StockInSource,
        supplier_id:     session.supplierId ? parseInt(session.supplierId) : undefined,
        invoice_number:  session.invoiceNumber.trim() || undefined,
        delivery_date:   session.deliveryDate,
        remarks:         session.remarks.trim() || undefined,
        items: items.map((i) => ({
          product_id:        i.productId,
          quantity_received: i.quantityReceived,
          unit_cost:         i.unitCost ? parseFloat(i.unitCost) : undefined,
        })),
      });
      setSuccessData({ id: result.stock_in_id, count: items.length });
      setRefreshKey((k) => k + 1);
      // ── Clear draft — stock-in is committed to the DB ─────────────────────
      stockInDraft.commitDraft();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Failed to save stock in. Please try again.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Draft recovery handlers ───────────────────────────────────────────────
  const handleRestoreStockInDraft = () => {
    if (!recoverableDraft) return;
    setStep(recoverableDraft.step);
    setSession(recoverableDraft.session);
    setItems(recoverableDraft.items);
    setRecoverableDraft(null);
    toast.success("Draft restored — continue where you left off.");
  };

  const handleDiscardStockInDraft = () => {
    stockInDraft.discardDraft();
    setRecoverableDraft(null);
    toast.info("Draft discarded.");
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Draft recovery prompt */}
      <DraftRecoveryPrompt
        draft={recoverableDraft}
        formLabel="Stock In"
        savedSummary={
          recoverableDraft
            ? `Step ${recoverableDraft.step} of 3 · ${recoverableDraft.items.length} item(s)${recoverableDraft.session.source ? ` · ${recoverableDraft.session.source}` : ""}${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
            : undefined
        }
        onRestore={handleRestoreStockInDraft}
        onDiscard={handleDiscardStockInDraft}
      />

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock In</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record received products and update inventory quantities</p>
      </div>

      {/* Wizard card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {!successData ? (
          <>
            <StepIndicator step={step} />
            {step === 1 && (
              <Step1
                state={session}
                setState={setSession}
                suppliers={suppliers}
                errors={step1Errors}
                onNext={handleStep1Next}
              />
            )}
            {step === 2 && (
              <Step2
                session={session}
                suppliers={suppliers}
                items={items}
                setItems={setItems}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                onRefreshLogs={() => setRefreshKey((k) => k + 1)}
              />
            )}
            {step === 3 && (
              <Step3
                session={session}
                suppliers={suppliers}
                items={items}
                saving={saving}
                onBack={() => setStep(2)}
                onSave={handleSave}
                onCancel={reset}
              />
            )}
          </>
        ) : (
          <SuccessScreen
            stockInId={successData.id}
            itemCount={successData.count}
            onNewTransaction={reset}
          />
        )}
      </div>

      {/* Combined History Panel with Tabs */}
      <HistoryPanel
        logs={logs}
        logsLoading={logsLoading}
        commodityRequests={commodityRequests}
        commodityLoading={commodityLoading}
        refreshKey={refreshKey}
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
