import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ClipboardList, Search, CheckCircle2, RotateCcw,
  TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { liveProducts } from "./ClerkStockIn";
import { mockActivityLogs } from "@/modules/clerk/mockData";
import { nanoid } from "nanoid";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CountRow {
  productId: number;
  barcode: string;
  productName: string;
  category: string;
  unit: string;
  systemQty: number;
  physicalCount: string; // string so input can be blank
  remarks: string;
}

// ─── Difference badge ─────────────────────────────────────────────────────────
function DiffCell({ system, physical }: { system: number; physical: string }) {
  if (physical === "") {
    return <span className="text-gray-300 text-sm">—</span>;
  }
  const diff = parseInt(physical, 10) - system;
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 font-semibold text-sm">
        <Minus className="h-3.5 w-3.5" /> 0
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-600 font-semibold text-sm">
        <TrendingUp className="h-3.5 w-3.5" /> +{diff}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-sm">
      <TrendingDown className="h-3.5 w-3.5" /> {diff}
    </span>
  );
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

  // Initialise rows from liveProducts
  useEffect(() => {
    const t = setTimeout(() => {
      setRows(
        liveProducts.map((p) => ({
          productId: p.id,
          barcode: p.barcode,
          productName: p.name,
          category: p.category,
          unit: p.unit,
          systemQty: p.quantity,
          physicalCount: "",
          remarks: "",
        }))
      );
      setLoading(false);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // Reset count sheet
  const handleReset = () => {
    setRows((prev) => prev.map((r) => ({ ...r, physicalCount: "", remarks: "" })));
    setCountComplete(false);
    toast.info("Count sheet cleared");
  };

  // Update a single row's physicalCount or remarks
  const updateRow = (productId: number, field: "physicalCount" | "remarks", value: string) => {
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
  const matchRows    = countedRows.filter((r) => parseInt(r.physicalCount, 10) === r.systemQty);
  const overRows     = countedRows.filter((r) => parseInt(r.physicalCount, 10) > r.systemQty);
  const shortRows    = countedRows.filter((r) => parseInt(r.physicalCount, 10) < r.systemQty);

  const canComplete = countedRows.length > 0;

  // Save stock count — update liveProducts for rows with a difference
  const handleSave = () => {
    let updatedCount = 0;
    countedRows.forEach((row) => {
      const physical = parseInt(row.physicalCount, 10);
      if (physical !== row.systemQty) {
        const p = liveProducts.find((p) => p.id === row.productId);
        if (p) {
          p.quantity = physical;
          if (p.quantity === 0)                          p.status = "Out of Stock";
          else if (p.quantity <= p.reorderLevel * 0.5)  p.status = "Critical";
          else if (p.quantity <= p.reorderLevel)         p.status = "Low Stock";
          else                                           p.status = "In Stock";
          updatedCount++;
        }
      }
    });

    // Log activity
    mockActivityLogs.unshift({
      id: nanoid(6),
      action: "Completed Stock Count",
      product: `${countedRows.length} product(s) counted`,
      qtyChange: `${updatedCount} adjusted`,
      performedBy: "Maria Santos",
      timestamp: new Date().toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      }),
    });

    toast.success(
      `Stock count completed — ${countedRows.length} counted, ${updatedCount} quantity update(s) applied`
    );
    setCountComplete(true);
    // Update systemQty in rows to reflect new values
    setRows((prev) =>
      prev.map((r) => {
        if (r.physicalCount !== "") {
          return { ...r, systemQty: parseInt(r.physicalCount, 10), physicalCount: "", remarks: "" };
        }
        return r;
      })
    );
  };

  return (
    <div className="space-y-6">
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
          Rows with a difference will update the system quantity when you click{" "}
          <strong>Complete Stock Count</strong>.
        </p>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{countedRows.length}</span> of{" "}
            <span className="font-semibold text-gray-900">{rows.length}</span> products counted
          </p>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Barcode", "Product Name", "Category", "Unit", "System Qty", "Physical Count", "Difference", "Remarks"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <ClipboardList className="h-10 w-10 opacity-30" />
                      <p className="font-medium text-gray-600">No products match your search</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const hasDiff = row.physicalCount !== "" &&
                    parseInt(row.physicalCount, 10) !== row.systemQty;
                  const isCounted = row.physicalCount !== "";

                  return (
                    <tr
                      key={row.productId}
                      className={`border-b border-gray-100 transition-colors ${
                        hasDiff
                          ? parseInt(row.physicalCount, 10) > row.systemQty
                            ? "bg-blue-50/40"
                            : "bg-red-50/30"
                          : isCounted
                          ? "bg-green-50/30"
                          : idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {row.barcode}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900 text-xs max-w-[160px]">
                        <span className="truncate block">{row.productName}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{row.category}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{row.unit}</td>
                      <td className="py-3 px-4 font-bold text-gray-900 text-base text-center">
                        {row.systemQty}
                      </td>
                      <td className="py-3 px-4">
                        <Input
                          type="number"
                          min={0}
                          placeholder="—"
                          value={row.physicalCount}
                          onChange={(e) => updateRow(row.productId, "physicalCount", e.target.value)}
                          className={`h-9 w-24 text-center font-bold text-base ${
                            hasDiff
                              ? parseInt(row.physicalCount, 10) > row.systemQty
                                ? "border-blue-400 bg-blue-50 text-blue-700"
                                : "border-red-400 bg-red-50 text-red-700"
                              : isCounted
                              ? "border-green-400 bg-green-50 text-green-700"
                              : ""
                          }`}
                        />
                      </td>
                      <td className="py-3 px-4 text-center min-w-[80px]">
                        <DiffCell system={row.systemQty} physical={row.physicalCount} />
                      </td>
                      <td className="py-3 px-4 min-w-[160px]">
                        <Input
                          placeholder="Optional note…"
                          value={row.remarks}
                          onChange={(e) => updateRow(row.productId, "remarks", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer action */}
        {!loading && (
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {canComplete
                ? `Ready to complete — ${countedRows.length} product(s) counted, ${shortRows.length + overRows.length} with differences`
                : "Enter at least one physical count to complete the stock count"}
            </p>
            <Button
              disabled={!canComplete}
              onClick={() => setConfirmOpen(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <CheckCircle2 className="h-4 w-4" /> Complete Count
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
                ? `${shortRows.length + overRows.length} product(s) have a quantity difference and will be updated.`
                : "All counted products match the system quantity."}
              {" "}This action will update the inventory and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Mini summary in confirm dialog */}
          {countedRows.filter((r) => parseInt(r.physicalCount, 10) !== r.systemQty).length > 0 && (
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
                    .filter((r) => parseInt(r.physicalCount, 10) !== r.systemQty)
                    .map((r) => {
                      const diff = parseInt(r.physicalCount, 10) - r.systemQty;
                      return (
                        <tr key={r.productId} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 px-3 font-medium text-gray-800 truncate max-w-[140px]">{r.productName}</td>
                          <td className="py-2 px-2 text-center text-gray-500">{r.systemQty}</td>
                          <td className="py-2 px-2 text-center font-bold text-gray-800">{r.physicalCount}</td>
                          <td className={`py-2 px-2 text-center font-bold ${diff > 0 ? "text-blue-600" : "text-red-600"}`}>
                            {diff > 0 ? `+${diff}` : diff}
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
    </div>
  );
}
