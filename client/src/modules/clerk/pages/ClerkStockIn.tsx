import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PackagePlus, ScanLine, Search, Trash2, CheckCircle2,
  ChevronRight, ChevronLeft, Truck, FileText, Plus,
  Package, Clock, AlertCircle, Edit2, RefreshCw,
  History, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  lookupProduct, getSuppliers,
  type Supplier, type CashierProduct,
} from "@/shared/api/productsApi";
import {
  submitStockIn, getInventoryLogs,
  type StockInSource, type InventoryLog,
} from "@/shared/api/inventoryApi";

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
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Source — REQUIRED */}
        <div className="sm:col-span-2">
          <Label className="mb-1.5 block font-semibold text-sm">
            Source <span className="text-red-500">*</span>
          </Label>
          <Select value={state.source} onValueChange={(v) => set("source", v)}>
            <SelectTrigger className={`h-10 ${errors.source ? "border-red-400" : ""}`}>
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

        {/* Supplier — optional */}
        <div>
          <Label className="mb-1.5 block font-semibold text-sm">
            Supplier <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </Label>
          <Select value={state.supplierId || "none"} onValueChange={(v) => set("supplierId", v === "none" ? "" : v)}>
            <SelectTrigger className="h-10">
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

        {/* Invoice / DR No. — optional */}
        <div>
          <Label className="mb-1.5 block font-semibold text-sm">
            Invoice / DR No. <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </Label>
          <Input
            placeholder="e.g. INV-2025-0420"
            value={state.invoiceNumber}
            onChange={(e) => set("invoiceNumber", e.target.value)}
            className="h-10"
          />
        </div>

        {/* Delivery Date — REQUIRED */}
        <div>
          <Label className="mb-1.5 block font-semibold text-sm">
            Delivery Date <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <Input
              type="date"
              value={state.deliveryDate}
              onChange={(e) => set("deliveryDate", e.target.value)}
              className={`h-10 pl-8 ${errors.deliveryDate ? "border-red-400" : ""}`}
            />
          </div>
          {errors.deliveryDate && <p className="mt-1 text-xs text-red-600">{errors.deliveryDate}</p>}
        </div>

        {/* Remarks — optional */}
        <div className="sm:col-span-2">
          <Label className="mb-1.5 block font-semibold text-sm">
            Remarks <span className="text-gray-400 font-normal text-xs">(optional)</span>
          </Label>
          <textarea
            rows={3}
            placeholder="Any delivery remarks or notes…"
            value={state.remarks}
            onChange={(e) => set("remarks", e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onNext} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          Next: Add Items <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
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
}

function Step2({ session, suppliers, items, setItems, onBack, onNext }: Step2Props) {
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
      const exact = data.find((r) => r.barcode === query.trim());
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
    const qty = parseInt(qtyInput, 10);
    if (!qty || qty < 1) { toast.error("Quantity must be at least 1."); return; }

    setItems((() => {
      const existing = items.findIndex((i) => i.productId === matched.id);
      if (existing >= 0) {
        const updated = [...items];
        updated[existing] = {
          ...updated[existing],
          quantityReceived: updated[existing].quantityReceived + qty,
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
    setItems(items.map((i) => i.productId === id ? { ...i, quantityReceived: parseInt(value) || 1 } : i));
  };

  const totalQty = items.reduce((s, i) => s + i.quantityReceived, 0);

  return (
    <div className="space-y-4">

      {/* Session summary strip */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs">
        <span className="flex items-center gap-1 font-semibold text-blue-800">
          <Package className="h-3.5 w-3.5" /> {session.source}
        </span>
        {supplierName && (
          <span className="flex items-center gap-1 text-blue-700">
            <Truck className="h-3.5 w-3.5" /> {supplierName}
          </span>
        )}
        {session.invoiceNumber && (
          <span className="flex items-center gap-1 text-blue-700">
            <FileText className="h-3.5 w-3.5" /> {session.invoiceNumber}
          </span>
        )}
        <span className="flex items-center gap-1 text-blue-700">
          <Clock className="h-3.5 w-3.5" />
          {new Date(session.deliveryDate + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        {items.length > 0 && (
          <span className="ml-auto bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Search input with results dropdown */}
      <div ref={wrapperRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            {searching
              ? <Spinner className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
              : <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
            }
            <Input
              ref={barcodeRef}
              placeholder="Scan barcode or type product name…"
              value={barcodeInput}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  lookup(barcodeInput);
                }
                if (e.key === "Escape") clearSearch();
              }}
              className="pl-9 pr-8 h-11 bg-white border-2 border-gray-300 hover:border-blue-400 focus:border-blue-500 rounded-lg shadow-sm"
              autoFocus
            />
            {barcodeInput && (
              <button onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm"
            className="h-11 px-5 shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2"
            onClick={() => { if (debounceRef.current) clearTimeout(debounceRef.current); lookup(barcodeInput); }}
            disabled={searching || !barcodeInput.trim()}>
            <Search className="h-4 w-4" /> Search
          </Button>
        </div>

        {/* Results dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
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
                        {" · "}Stock: <span className="font-medium text-gray-600">{r.quantity}</span>
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Error */}
      {lookupError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {lookupError}
          <button className="ml-auto" onClick={() => setLookupError("")}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Selected product card */}
      {matched && (
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
                {" · "}<span className="font-medium">Current stock: {matched.quantity}</span>
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
        <div className="border-2 border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left py-3 px-4 font-bold text-gray-700 text-xs uppercase tracking-wider">Barcode</th>
                  <th className="text-left py-3 px-4 font-bold text-gray-700 text-xs uppercase tracking-wider">Product</th>
                  <th className="text-center py-3 px-3 font-bold text-gray-700 text-xs uppercase tracking-wider">Unit</th>
                  <th className="text-center py-3 px-3 font-bold text-gray-700 text-xs uppercase tracking-wider">Qty Received</th>
                  <th className="py-3 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isEditing = editingId === item.productId;
                  return (
                    <tr key={item.productId}
                      className={`border-b border-gray-200 transition-colors hover:bg-blue-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">{item.barcode}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-gray-900">{item.productName}</p>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">{item.unit}</span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {isEditing ? (
                          <Input
                            type="number" min={1}
                            value={item.quantityReceived}
                            onChange={(e) => updateItem(item.productId, e.target.value)}
                            onBlur={() => setEditingId(null)}
                            className="h-8 w-20 text-center mx-auto border-2 border-blue-400"
                            autoFocus
                          />
                        ) : (
                          <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm border border-emerald-200 tabular-nums">+{item.quantityReceived}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setEditingId(isEditing ? null : item.productId)}
                            className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => removeItem(item.productId)}
                            className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
                  <td colSpan={3} className="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">
                    {items.length} product{items.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-sm tabular-nums">+{totalQty}</span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No items yet</p>
          <p className="text-xs mt-1">Scan a barcode or search for a product above</p>
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
      <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">Session Summary</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500">Source:</span>{" "}
            <span className="font-semibold text-gray-900">{session.source}</span>
          </div>
          <div>
            <span className="text-gray-500">Delivery Date:</span>{" "}
            <span className="font-semibold text-gray-900">
              {new Date(session.deliveryDate + "T00:00:00").toLocaleDateString("en-PH", {
                month: "long", day: "numeric", year: "numeric",
              })}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Supplier:</span>{" "}
            <span className="font-semibold text-gray-900">{supplierName ?? <em className="text-gray-400 font-normal">None</em>}</span>
          </div>
          <div>
            <span className="text-gray-500">Invoice / DR:</span>{" "}
            <span className="font-semibold text-gray-900">{session.invoiceNumber || <em className="text-gray-400 font-normal">None</em>}</span>
          </div>
        </div>
        {session.remarks && (
          <p className="text-xs text-gray-600 border-t border-blue-200 pt-2 mt-2">
            <span className="font-semibold text-gray-500">Remarks:</span> {session.remarks}
          </p>
        )}
      </div>

      {/* Items summary */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Items Summary</p>
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="text-left py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Barcode</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Product Name</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Unit</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                    <tr key={item.productId} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-gray-600">{item.barcode}</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900">{item.productName}</td>
                      <td className="py-3 px-3 text-center text-xs text-gray-500">{item.unit}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700 tabular-nums">+{item.quantityReceived}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-600 text-white font-bold">
                  <td className="py-2.5 px-4 text-xs" colSpan={2}>
                    {items.length} unique product{items.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums">+{totalQty}</td>
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
          { label: "Total Qty Received", value: String(totalQty) },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums">{c.value}</p>
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

  // History log state
  const [logs,        setLogs]        = useState<InventoryLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshKey,  setRefreshKey]  = useState(0);

  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  useEffect(() => {
    setLogsLoading(true);
    getInventoryLogs({ limit: 50 })
      .then((data) => {
        setLogs(data.filter((l) =>
          l.transaction_type === "Stock In" || l.action === "Received Stock"
        ));
      })
      .catch(() => {})
      .finally(() => setLogsLoading(false));
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
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Failed to save stock in. Please try again.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

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

      {/* History log */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-gray-900">Stock In History</h2>
          </div>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${logsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {logsLoading ? (
          <div className="py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Spinner className="text-blue-500" /> Loading history…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No stock-in history yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-300">
                  <th className="text-left py-3 px-5 font-bold text-gray-700 text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left py-3 px-5 font-bold text-gray-700 text-xs uppercase tracking-wider">Product</th>
                  <th className="text-center py-3 px-4 font-bold text-gray-700 text-xs uppercase tracking-wider">Qty Added</th>
                  <th className="text-center py-3 px-4 font-bold text-gray-700 text-xs uppercase tracking-wider">New Stock</th>
                  <th className="text-left py-3 px-4 font-bold text-gray-700 text-xs uppercase tracking-wider">Reference</th>
                  <th className="text-left py-3 px-4 font-bold text-gray-700 text-xs uppercase tracking-wider">By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={log.id}
                    className={`border-b border-gray-200 transition-colors hover:bg-blue-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                    <td className="py-3 px-5 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(log.created_at)}</td>
                    <td className="py-3 px-5">
                      <p className="font-semibold text-gray-900 text-sm">{log.product_name}</p>
                      <span className="font-mono text-xs text-gray-400">{log.barcode}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm border border-emerald-200 tabular-nums">
                        +{log.quantity_change ?? log.quantity ?? 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-gray-800 tabular-nums">
                      {log.remaining_stock ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-gray-600">{log.reference ?? "—"}</td>
                    <td className="py-3 px-4 text-xs text-gray-600">{log.performed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
