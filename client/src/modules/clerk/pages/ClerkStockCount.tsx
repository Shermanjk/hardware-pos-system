import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdjustmentReason, getInventory, getInventoryLogs, type CreateAdjustmentRequestPayload } from "@/shared/api/inventoryApi";
import { createStockCountRequest } from "@/shared/api/requestsApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import { DRAFT_KEYS, useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import ClerkAuthModal from "../components/ClerkAuthModal";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";
import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Loader2,
    Minus,
    PackagePlus,
    RefreshCw,
    RotateCcw,
    Search,
    ShoppingCart, SlidersHorizontal,
    TrendingDown,
    TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ─── Reason Lists ───────────────────────────────────────────────────────────────
const STANDARD_REASONS = [
  "Inventory Miscount",
  "Damaged Items",
  "Lost Items",
  "Newly Found Stock",
  "Encoding Error",
  "Other",
] as const;

const MARKET_BASED_REASONS = [
  "Drying/Moisture Loss",
  "Spillage",
  "Theft",
  "Processing Loss",
  "Warehouse Damage",
  "Other",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface CountRow {
  productId: number;
  barcode: string;
  productName: string;
  category: string;
  unit: string;
  unit_abbreviation?: string;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  unit_allow_decimal?: boolean;
  pricing_type?: "FIXED_PRICE" | "MARKET_BASED";
  systemQty: number;
  physicalCount: string; // string so input can be blank
  remarks: string;
  reason?: AdjustmentReason; // For Market-Based products
}

// ─── Difference badge ─────────────────────────────────────────────────────────
function DiffCell({ system, physical, quantityType, allowDecimal }: { system: number; physical: string; quantityType?: "WHOLE_UNIT" | "WEIGHTED"; allowDecimal?: boolean }) {
  if (physical === "") {
    return <span className="text-slate-300 text-sm font-mono">—</span>;
  }
  const physNum = parseFloat(physical);
  const diff = physNum - system;
  const useDecimal = allowDecimal ?? quantityType === "WEIGHTED";

  if (diff === 0) return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
      <Minus className="h-3 w-3" /> Match
    </span>
  );
  if (diff > 0) return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs">
      <TrendingUp className="h-3.5 w-3.5" /> +{useDecimal ? diff.toFixed(3) : Math.round(diff)} over
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
      <TrendingDown className="h-3.5 w-3.5" /> {useDecimal ? diff.toFixed(3) : Math.round(diff)} short
    </span>
  );
}

// ─── System Qty cell with inline movement breakdown ──────────────────────────
interface Breakdown { stockIn: number; sold: number; adjustments: number; }

function SystemQtyCell({ productId, systemQty, unit, quantityType }: { productId: number; systemQty: number; unit?: string; quantityType?: "WHOLE_UNIT" | "WEIGHTED" }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);

  const isWeighted = quantityType === "WEIGHTED";

  // Format a breakdown number: decimals for weighted, whole numbers for unit-based
  const fmt = (n: number) => isWeighted ? parseFloat(n.toFixed(3)).toString() : Math.round(n).toString();

  useEffect(() => {
    getInventoryLogs({ product_id: productId, limit: 500 })
      .then((logs) => {
        const stockIn     = logs.filter((l) => l.transaction_type === "Stock In")
                               .reduce((s, l) => s + Math.abs(Number(l.quantity_change) || 0), 0);
        const sold        = logs.filter((l) => l.transaction_type === "Sale")
                               .reduce((s, l) => s + Math.abs(Number(l.quantity_change) || 0), 0);
        const returned    = logs.filter((l) => l.transaction_type === "Return")
                               .reduce((s, l) => s + Math.abs(Number(l.quantity_change) || 0), 0);
        const adjustments = logs.filter((l) => l.transaction_type === "Adjustment")
                               .reduce((s, l) => s + (Number(l.quantity_change) || 0), 0);
        setData({ stockIn, sold: sold - returned, adjustments });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [productId]);

  return (
    <div className="flex flex-col gap-1.5">
      {(() => {
        const parts = formatQuantityParts(systemQty, unit, quantityType);
        return (
          <div className="flex items-center gap-0.5">
            <span className="font-bold text-gray-900 text-lg leading-none">{parts.number}</span>
            {parts.unit && <span className="text-xs text-gray-500">{parts.unit}</span>}
          </div>
        );
      })()}
      {loading ? (
        <div className="flex items-center gap-1 text-gray-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs">loading…</span>
        </div>
      ) : data ? (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold">
            <PackagePlus className="h-3 w-3" />+{fmt(data.stockIn)} received
          </span>
          <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold">
            <ShoppingCart className="h-3 w-3" />−{fmt(data.sold)} sold
          </span>
          {data.adjustments !== 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
              <SlidersHorizontal className="h-3 w-3" />
              {data.adjustments > 0 ? `+${fmt(data.adjustments)}` : fmt(data.adjustments)} adj
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Draft type ───────────────────────────────────────────────────────────────
interface StockCountDraft {
  /** Sparse: only rows that have been touched (physicalCount !== "") */
  countedRows: Array<{ productId: number; physicalCount: string; remarks: string; reason?: AdjustmentReason }>;
  savedAt: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClerkStockCount() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CountRow[]>([]);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countComplete, setCountComplete] = useState(false);
  const [sessionDate] = useState(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  );

  // Auth modal — shown after market-based adjustment requests are submitted
  // When multiple market-based rows exist, we authorise them one at a time (queue)
  const [authQueue, setAuthQueue] = useState<Array<{
    payload: CreateAdjustmentRequestPayload;
    summary: { label: string; value: string }[];
  }>>([]);
  const [authQueueIndex, setAuthQueueIndex] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // ── Draft recovery ──────────────────────────────────────────────────────────
  const countDraft = useDraftRecovery<StockCountDraft>(DRAFT_KEYS.CLERK_STOCK_COUNT);
  const [recoverableDraft, setRecoverableDraft] = useState<StockCountDraft | null>(null);

  useEffect(() => {
    const draft = countDraft.getRecoverableDraft();
    if (draft && draft.countedRows.length > 0) {
      setRecoverableDraft(draft);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialise rows from real API, then apply any restored draft
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getInventory();
        const baseRows: CountRow[] = data.map((p) => ({
          productId: p.id,
          barcode: p.barcode,
          productName: p.product_name,
          category: p.category,
          unit: p.unit,
          unit_abbreviation: p.unit_abbreviation,
          quantity_type: p.quantity_type,
          pricing_type: (p as any).pricing_type,
          systemQty: p.quantity,
          physicalCount: "",
          remarks: "",
          reason: undefined,
        }));

        // If the user just restored a draft, overlay the saved counts on top.
        // We do NOT hold rows in state at this point — the user will be prompted
        // separately via DraftRecoveryPrompt.  We store them directly here after
        // the user clicks "Restore".
        setRows(baseRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load products:", message.replace(/[\r\n\t]/g, " "));
        toast.error("Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Auto-save draft whenever any row's physicalCount changes
  useEffect(() => {
    const counted = rows.filter((r) => r.physicalCount !== "");
    if (counted.length > 0) {
      countDraft.saveDraft({
        countedRows: counted.map((r) => ({
          productId: r.productId,
          physicalCount: r.physicalCount,
          remarks: r.remarks,
          reason: r.reason,
        })),
        savedAt: new Date().toISOString(),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Apply restored draft once rows are loaded
  const applyDraft = (draft: StockCountDraft) => {
    setRows((prev) => prev.map((r) => {
      const saved = draft.countedRows.find((c) => c.productId === r.productId);
      if (!saved) return r;
      return { ...r, physicalCount: saved.physicalCount, remarks: saved.remarks, reason: saved.reason };
    }));
  };

  // Reset count sheet
  const handleReset = () => {
    setRows((prev) => prev.map((r) => ({ ...r, physicalCount: "", remarks: "" })));
    setCountComplete(false);
    countDraft.discardDraft();
    toast.info("Count sheet cleared");
  };

  // Update a single row's physicalCount, remarks, or reason
  const updateRow = (productId: number, field: "physicalCount" | "remarks" | "reason", value: string) => {
    if (field === "physicalCount" && value !== "" && (isNaN(Number(value)) || Number(value) < 0)) return;
    setRows((prev) =>
      prev.map((r) => r.productId === productId ? { ...r, [field]: value } : r)
    );
  };

  // Filtered rows
  const filtered = useMemo(() =>
    rows.filter(
      (r) =>
        search === "" ||
        r.productName.toLowerCase().includes(search.toLowerCase()) ||
        r.barcode.toLowerCase().includes(search.toLowerCase()) ||
        r.category.toLowerCase().includes(search.toLowerCase())
    ),
    [rows, search]
  );

  // Stats
  const countedRows  = rows.filter((r) => r.physicalCount !== "");
  const matchRows    = countedRows.filter((r) => parseFloat(r.physicalCount) === r.systemQty);
  const overRows     = countedRows.filter((r) => parseFloat(r.physicalCount) > r.systemQty);
  const shortRows    = countedRows.filter((r) => parseFloat(r.physicalCount) < r.systemQty);

  const canComplete = countedRows.length > 0;

  // Save stock count — submit corrections via API
  const handleSave = async () => {
    const rowsWithDiff = countedRows.filter(
      (r) => parseFloat(r.physicalCount) !== r.systemQty
    );

    // Validate all rows with discrepancy have a reason
    for (const row of rowsWithDiff) {
      if (!row.reason) {
        throw new Error(`Reason required for product with discrepancy: ${row.productName}`);
      }
      if (row.reason === "Other" && !row.remarks.trim()) {
        throw new Error(`Remarks required when reason is 'Other' for: ${row.productName}`);
      }
    }

    // Separate Market-Based and standard products
    const marketBasedRows = rowsWithDiff.filter((r) => r.pricing_type === "MARKET_BASED");
    const standardRows = rowsWithDiff.filter((r) => r.pricing_type !== "MARKET_BASED");

    try {
      // Process standard products with approval workflow
      if (standardRows.length > 0) {
        await Promise.all(
          standardRows.map((row) =>
            createStockCountRequest({
              product_id: row.productId,
              system_quantity: Number(row.systemQty),
              physical_quantity: parseFloat(row.physicalCount),
              reason: row.reason || "",
              remarks: row.remarks.trim() || undefined,
            })
          )
        );
      }

      // Process Market-Based products with approval workflow
      if (marketBasedRows.length > 0) {
        // Build auth queue with payloads — requests are created lazily in the modal
        const queue = marketBasedRows.map((row) => {
          const diff = parseFloat(row.physicalCount) - Number(row.systemQty);
          return {
            payload: {
              product_id: row.productId,
              system_quantity: Number(row.systemQty),
              physical_quantity: parseFloat(row.physicalCount),
              reason: row.reason || "",
              remarks: row.remarks.trim() || undefined,
            } as CreateAdjustmentRequestPayload,
            summary: [
              { label: "Product", value: row.productName },
              { label: "System Qty", value: String(row.systemQty) },
              { label: "Physical Qty", value: row.physicalCount },
              { label: "Difference", value: diff >= 0 ? `+${diff}` : String(diff) },
              { label: "Reason", value: row.reason ?? "" },
            ],
          };
        });
        setAuthQueue(queue);
        setAuthQueueIndex(0);
        setAuthModalOpen(true);
      }

      toast.success(
        `Stock count completed — ${countedRows.length} counted, ${standardRows.length + marketBasedRows.length} approval request(s) submitted`
      );
      setCountComplete(true);
      // ── Clear draft — stock count has been submitted ──────────────────────
      countDraft.commitDraft();
      setRows((prev) =>
        prev.map((r) => {
          if (r.physicalCount !== "") {
            return { ...r, systemQty: parseFloat(r.physicalCount), physicalCount: "", remarks: "", reason: undefined };
          }
          return r;
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to save stock count:", message.replace(/[\r\n\t]/g, " "));
      toast.error(message || "Failed to save stock count");
    }
  };

  return (
    <div className="space-y-6">
      {/* Draft recovery prompt */}
      <DraftRecoveryPrompt
        draft={recoverableDraft}
        formLabel="Stock Count"
        savedSummary={
          recoverableDraft
            ? `${recoverableDraft.countedRows.length} product(s) counted${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
            : undefined
        }
        onRestore={() => {
          applyDraft(recoverableDraft!);
          setRecoverableDraft(null);
          toast.success("Draft restored — continue where you left off.");
        }}
        onDiscard={() => {
          countDraft.discardDraft();
          setRecoverableDraft(null);
          toast.info("Draft discarded.");
        }}
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Count</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Physical count session — {sessionDate}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" /> Clear Sheet
          </Button>
          <Button
            disabled={!canComplete || loading}
            onClick={() => setConfirmOpen(true)}
            className="gap-2 bg-purple-600 hover:bg-purple-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Complete Stock Count
            {canComplete && (
              <span className="ml-1 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                {countedRows.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Count complete banner */}
      {countComplete && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">Stock count completed successfully</p>
            <p className="text-xs text-green-600 mt-0.5">
              System quantities have been updated. Start a new count anytime.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto gap-2 text-green-700 hover:bg-green-100"
            onClick={() => setCountComplete(false)}>
            <RefreshCw className="h-3.5 w-3.5" /> New Count
          </Button>
        </div>
      )}

      {/* Progress summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
          ))
        ) : (
          <>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">Total Products</p>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${rows.length > 0 ? (countedRows.length / rows.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{countedRows.length} counted</p>
            </Card>
            <Card className="p-4 text-center bg-green-50 border-green-100">
              <p className="text-2xl font-bold text-green-600">{matchRows.length}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">Matched</p>
            </Card>
            <Card className="p-4 text-center bg-blue-50 border-blue-100">
              <p className="text-2xl font-bold text-blue-600">{overRows.length}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">Over Count</p>
            </Card>
            <Card className="p-4 text-center bg-red-50 border-red-100">
              <p className="text-2xl font-bold text-red-600">{shortRows.length}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">Short Count</p>
            </Card>
          </>
        )}
      </div>

      {/* Instructions */}
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        <AlertTriangle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p>
          Enter the physical count for each product you have counted. Leave blank to skip.
          <strong className="font-semibold"> When a discrepancy is detected, you must select a reason.</strong>
          Rows with a difference will be submitted for admin approval.
        </p>
      </div>

      {/* Table */}
      <Card className="overflow-hidden border border-slate-200/80 shadow-sm rounded-xl bg-white">
        {/* Table toolbar */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">
              {countedRows.length > 0
                ? <><span className="text-purple-600 font-extrabold">{countedRows.length}</span> of {rows.length} products counted</>
                : <>{rows.length} products in count session</>}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Enter physical counts to automatically calculate variances</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search products by name or barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 text-white shadow-sm">
              <tr>
                {[
                  { label: "#",              cls: "w-12 text-center" },
                  { label: "Barcode",        cls: "w-36" },
                  { label: "Product Name",   cls: "min-w-[200px]" },
                  { label: "Category",       cls: "w-32" },
                  { label: "Unit",           cls: "text-center w-20" },
                  { label: "System Qty",     cls: "text-center min-w-[140px]" },
                  { label: "Physical Count", cls: "text-center w-36" },
                  { label: "Difference",     cls: "text-center w-32" },
                  { label: "Reason",         cls: "min-w-[160px]" },
                  { label: "Remarks",        cls: "min-w-[160px]" },
                ].map(({ label, cls }) => (
                  <th key={label} className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider whitespace-nowrap text-left ${cls}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="bg-white">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4"><Skeleton className="h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center bg-white">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="p-3.5 bg-slate-100 rounded-full text-slate-400">
                        <ClipboardList className="h-7 w-7" />
                      </div>
                      <p className="font-semibold text-slate-700 text-sm">No products match your search</p>
                      <p className="text-xs text-slate-400">Try adjusting your search terms</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const physNum  = row.physicalCount !== "" ? parseFloat(row.physicalCount) : 0;
                  const hasDiff  = row.physicalCount !== "" && physNum !== row.systemQty;
                  const isOver   = hasDiff && physNum > row.systemQty;
                  const isShort  = hasDiff && physNum < row.systemQty;
                  const isCounted = row.physicalCount !== "";
                  const isMarketBased = row.pricing_type === "MARKET_BASED";

                  const rowBg = isOver   ? "bg-blue-50/60 border-l-4 border-l-blue-500"
                              : isShort  ? "bg-rose-50/60 border-l-4 border-l-rose-500"
                              : isCounted ? "bg-emerald-50/60 border-l-4 border-l-emerald-500"
                              : idx % 2 === 0 ? "bg-white" : "bg-slate-50/30";

                  return (
                    <tr key={row.productId} className={`transition-colors hover:bg-slate-50/90 ${rowBg}`}>
                      {/* Row number */}
                      <td className="py-3 px-4 text-center text-xs text-slate-400 font-mono">{idx + 1}</td>

                      {/* Barcode */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                          {row.barcode}
                        </span>
                      </td>

                      {/* Product name */}
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 text-sm leading-tight">{row.productName}</p>
                        {isMarketBased && (
                          <span className="inline-block mt-1 text-[11px] font-semibold text-orange-700 bg-orange-100/80 border border-orange-200 px-2 py-0.5 rounded-full">
                            Market-Based
                          </span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full inline-block">
                          {row.category}
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="py-3 px-4 text-center text-xs font-medium text-slate-600">{row.unit}</td>

                      {/* System Qty + breakdown */}
                      <td className="py-3 px-4">
                        <SystemQtyCell productId={row.productId} systemQty={row.systemQty} unit={row.unit_abbreviation} quantityType={row.quantity_type} />
                      </td>

                      {/* Physical count input */}
                      <td className="py-3 px-4 text-center">
                        <Input
                          type="number"
                          min={0}
                          step={row.quantity_type === "WEIGHTED" ? "0.001" : "1"}
                          placeholder="—"
                          value={row.physicalCount}
                          onChange={(e) => updateRow(row.productId, "physicalCount", e.target.value)}
                          className={`h-9 w-28 text-center font-bold text-sm mx-auto rounded-lg transition-all ${
                            isOver    ? "border-2 border-blue-500 bg-white text-blue-700 focus:ring-2 focus:ring-blue-200"
                            : isShort ? "border-2 border-rose-500 bg-white text-rose-700 focus:ring-2 focus:ring-rose-200"
                            : isCounted ? "border-2 border-emerald-500 bg-white text-emerald-700 focus:ring-2 focus:ring-emerald-200"
                            : "border-slate-300 bg-white text-slate-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                          }`}
                        />
                      </td>

                      {/* Difference */}
                      <td className="py-3 px-4 text-center">
                        <DiffCell system={row.systemQty} physical={row.physicalCount} quantityType={row.quantity_type} allowDecimal={row.unit_allow_decimal} />
                      </td>

                      {/* Reason (for products with discrepancy) */}
                      <td className="py-3 px-4">
                        {hasDiff ? (
                          <select
                            value={row.reason || ""}
                            onChange={(e) => updateRow(row.productId, "reason", e.target.value)}
                            className={`h-9 text-xs border rounded-lg px-2 w-full transition-all ${
                              hasDiff && !row.reason ? "border-rose-400 bg-rose-50/50 text-rose-800" : "border-slate-300 bg-white text-slate-800 focus:border-purple-500"
                            }`}
                          >
                            <option value="">Select reason…</option>
                            {(isMarketBased ? MARKET_BASED_REASONS : STANDARD_REASONS).map((reason) => (
                              <option key={reason} value={reason}>{reason}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Remarks (only when Other is selected) */}
                      <td className="py-3 px-4">
                        {row.reason === "Other" ? (
                          <Input
                            placeholder="Specify reason…"
                            value={row.remarks}
                            onChange={(e) => updateRow(row.productId, "remarks", e.target.value)}
                            className={`h-9 text-xs border rounded-lg ${
                              !row.remarks.trim() ? "border-rose-400 bg-rose-50/50 focus:border-rose-500" : "border-slate-300 bg-white"
                            }`}
                          />
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && (
          <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50/80 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm" /> Matched
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shadow-sm" /> Over Count
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm" /> Short Count
              </span>
            </div>
            <Button
              disabled={!canComplete}
              onClick={() => setConfirmOpen(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm text-xs h-9 px-4"
            >
              <CheckCircle2 className="h-4 w-4" /> Complete Stock Count
            </Button>
          </div>
        )}
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-600" />
              Complete Stock Count
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have counted <strong>{countedRows.length}</strong> product(s).{" "}
              {shortRows.length + overRows.length > 0
                ? `${shortRows.length + overRows.length} product(s) have a quantity difference and require a reason for admin approval.`
                : "All counted products match the system quantity."}
              {" "}Ensure all discrepancies have a reason selected before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Mini summary in confirm dialog */}
          {countedRows.filter((r) => parseFloat(r.physicalCount) !== r.systemQty).length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Product</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">System</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Physical</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {countedRows
                    .filter((r) => parseFloat(r.physicalCount) !== r.systemQty)
                    .map((r) => {
                      const physNum = parseFloat(r.physicalCount);
                      const diff = physNum - r.systemQty;
                      const isWeighted = r.quantity_type === "WEIGHTED";
                      const displayDiff = isWeighted ? diff.toFixed(3) : Math.round(diff);
                      return (
                        <tr key={r.productId} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 px-3 font-medium text-gray-800 truncate max-w-[140px]">{r.productName}</td>
                          <td className="py-2 px-2 text-center text-gray-500">{r.systemQty}</td>
                          <td className="py-2 px-2 text-center font-bold text-gray-800">{r.physicalCount}</td>
                          <td className={`py-2 px-2 text-center font-bold ${diff > 0 ? "text-blue-600" : "text-red-600"}`}>
                            {diff > 0 ? `+${displayDiff}` : displayDiff}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => { setConfirmOpen(false); handleSave(); }}
            >
              Confirm & Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin auth modal — shown after market-based requests are submitted */}
      {/* If there are multiple requests, the clerk authorises them one at a time */}
      {authQueue.length > 0 && (
        <ClerkAuthModal
          open={authModalOpen}
          onClose={() => {
            // Advance to next item in queue, or close if done
            const next = authQueueIndex + 1;
            if (next < authQueue.length) {
              setAuthQueueIndex(next);
            } else {
              setAuthModalOpen(false);
              setAuthQueue([]);
              setAuthQueueIndex(0);
            }
          }}
          requestType="market_adjustment"
          createPayload={{ type: "market_adjustment", payload: authQueue[authQueueIndex]?.payload }}
          title={`Authorize Adjustment${authQueue.length > 1 ? ` (${authQueueIndex + 1} of ${authQueue.length})` : ""}`}
          summary={authQueue[authQueueIndex]?.summary ?? []}
          onRequestCreated={() => {
            // Request created — nothing extra needed, modal handles the flow
          }}
          onApproved={(_adminName: string) => {
            const next = authQueueIndex + 1;
            if (next < authQueue.length) {
              setAuthQueueIndex(next);
            } else {
              setAuthModalOpen(false);
              setAuthQueue([]);
              setAuthQueueIndex(0);
            }
          }}
        />
      )}
    </div>
  );
}
