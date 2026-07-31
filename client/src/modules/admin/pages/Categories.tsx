import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, FolderOpen, X, AlertCircle, RefreshCw, Tag, Package, Check, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  getCategories, createCategory, updateCategory, deleteCategory,
  getUnits, createUnit, updateUnit, deleteUnit,
} from "@/shared/api/productsApi";
import type { Category, Unit } from "@/shared/api/productsApi";
import axios from "axios";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body?.message) return body.message;
    if (body?.errors?.[0]?.message) return body.errors[0].message;
  }
  return "An unexpected error occurred.";
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />
  );
}

// ─── Category Form Modal ──────────────────────────────────────────────────────

interface CategoryFormModalProps {
  mode: "add" | "edit";
  open: boolean;
  initial?: Category | null;
  onClose: () => void;
  onSaved: (category: Category) => void;
}

function CategoryFormModal({ mode, open, initial, onClose, onSaved }: CategoryFormModalProps) {
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [isLoading,   setIsLoading]   = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.category_name ?? "");
    setDescription(initial?.description ?? "");
    setError(null);
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Category name is required."); return; }
    setError(null);
    setIsLoading(true);
    try {
      const payload = { category_name: name.trim(), description: description.trim() || undefined };
      const saved = mode === "add"
        ? await createCategory(payload)
        : await updateCategory(initial!.id, payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add New Category" : "Edit Category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <Label className="mb-1.5 block font-semibold">
              Category Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hand Tools"
              disabled={isLoading}
              autoFocus
            />
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={isLoading}
              placeholder="Brief description of this category…"
              className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading && <Spinner className="mr-2 text-white" />}
              {isLoading ? "Saving…" : mode === "add" ? "Add Category" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unit Form Modal ─────────────────────────────────────────────────────────────

interface UnitFormModalProps {
  mode: "add" | "edit";
  open: boolean;
  initial?: Unit | null;
  onClose: () => void;
  onSaved: (unit: Unit) => void;
}

function UnitFormModal({ mode, open, initial, onClose, onSaved }: UnitFormModalProps) {
  const [unitName,    setUnitName]    = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [unitType,    setUnitType]    = useState<"Count" | "Weight" | "Volume" | "Length" | "Area" | "Packaging" | "Other">("Other");
  const [allowDecimal, setAllowDecimal] = useState<boolean>(false);
  const [description, setDescription] = useState("");
  const [status,      setStatus]      = useState<"Active" | "Inactive">("Active");
  const [error,       setError]       = useState<string | null>(null);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isLocked,    setIsLocked]    = useState(false);

  useEffect(() => {
    if (!open) return;
    setUnitName(initial?.unit_name ?? "");
    setAbbreviation(initial?.abbreviation ?? "");
    setUnitType(initial?.unit_type ?? "Other");
    setAllowDecimal(initial?.allow_decimal ?? false);
    setDescription(initial?.description ?? "");
    setStatus(initial?.status ?? "Active");
    setError(null);
    setIsLocked(mode === "edit" && (initial?.product_count ?? 0) > 0);
  }, [open, initial, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitName.trim()) { setError("Unit name is required."); return; }
    if (!abbreviation.trim()) { setError("Abbreviation is required."); return; }
    setError(null);
    setIsLoading(true);
    try {
      const payload = {
        unit_name: unitName.trim(),
        abbreviation: abbreviation.trim(),
        unit_type: unitType,
        allow_decimal: allowDecimal,
        description: description.trim() || null,
        status
      };
      const saved = mode === "add"
        ? await createUnit(payload)
        : await updateUnit(initial!.id, payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add New Unit" : "Edit Unit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <Label className="mb-1.5 block font-semibold">
              Unit Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              placeholder="e.g. Kilogram"
              disabled={isLoading}
              autoFocus
            />
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold">
              Abbreviation <span className="text-red-500">*</span>
            </Label>
            <Input
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              placeholder="e.g. kg"
              disabled={isLoading}
            />
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold">
              Unit Type <span className="text-red-500">*</span>
            </Label>
            <Select value={unitType} onValueChange={(value: any) => setUnitType(value)} disabled={isLoading || isLocked}>
              <SelectTrigger className={isLocked ? "bg-gray-50" : ""}>
                <SelectValue placeholder="Select unit type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Count">Count</SelectItem>
                <SelectItem value="Weight">Weight</SelectItem>
                <SelectItem value="Volume">Volume</SelectItem>
                <SelectItem value="Length">Length</SelectItem>
                <SelectItem value="Area">Area</SelectItem>
                <SelectItem value="Packaging">Packaging</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            {isLocked && (
              <p className="text-xs text-amber-600 mt-1">
                Unit Type cannot be changed because this unit is assigned to products.
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold">
              Decimal Support <span className="text-red-500">*</span>
            </Label>
            <Select value={allowDecimal ? "1" : "0"} onValueChange={(value: "0" | "1") => setAllowDecimal(value === "1")} disabled={isLoading || isLocked}>
              <SelectTrigger className={isLocked ? "bg-gray-50" : ""}>
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Whole Numbers Only</SelectItem>
                <SelectItem value="1">Allow Decimal Quantities</SelectItem>
              </SelectContent>
            </Select>
            {isLocked && (
              <p className="text-xs text-amber-600 mt-1">
                Decimal Support cannot be changed because this unit is assigned to products.
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold">
              Status <span className="text-red-500">*</span>
            </Label>
            <Select value={status} onValueChange={(value: "Active" | "Inactive") => setStatus(value)} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={isLoading}
              placeholder="Brief description of this unit…"
              className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading && <Spinner className="mr-2 text-white" />}
              {isLoading ? "Saving…" : mode === "add" ? "Add Unit" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  category: Category | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

function DeleteDialog({ category, onClose, onDeleted }: DeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => { if (category) setError(null); }, [category]);

  const handleConfirm = async () => {
    if (!category) return;
    setIsLoading(true);
    try {
      await deleteCategory(category.id);
      onDeleted(category.id);
      onClose();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={!!category} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Category?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete{" "}
            <span className="font-semibold text-gray-900">{category?.category_name}</span>.
            This cannot be undone. Categories in use by active products cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {isLoading && <Spinner className="mr-2 text-white" />}
            {isLoading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Unit Delete Dialog ─────────────────────────────────────────────────────────

interface UnitDeleteDialogProps {
  unit: Unit | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

function UnitDeleteDialog({ unit, onClose, onDeleted }: UnitDeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [canMarkInactive, setCanMarkInactive] = useState(false);

  useEffect(() => {
    if (unit) {
      setError(null);
      setCanMarkInactive(false);
    }
  }, [unit]);

  const handleConfirm = async () => {
    if (!unit) return;
    setIsLoading(true);
    try {
      await deleteUnit(unit.id);
      onDeleted(unit.id);
      onClose();
    } catch (err) {
      const errorMsg = extractError(err);
      setError(errorMsg);
      // Check if error message suggests marking as inactive
      if (errorMsg.includes("mark it as Inactive") || errorMsg.includes("assigned to")) {
        setCanMarkInactive(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkInactive = async () => {
    if (!unit) return;
    setIsLoading(true);
    try {
      await updateUnit(unit.id, {
        unit_name: unit.unit_name,
        abbreviation: unit.abbreviation,
        unit_type: unit.unit_type ?? "Other",
        allow_decimal: unit.allow_decimal ?? false,
        description: unit.description ?? null,
        status: "Inactive"
      });
      onDeleted(unit.id);
      onClose();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={!!unit} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Unit?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete{" "}
            <span className="font-semibold text-gray-900">{unit?.unit_name}</span> ({unit?.abbreviation}).
            This cannot be undone. Units in use by active products cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          {canMarkInactive ? (
            <Button
              onClick={handleMarkInactive}
              disabled={isLoading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isLoading && <Spinner className="mr-2 text-white" />}
              {isLoading ? "Marking Inactive…" : "Mark as Inactive"}
            </Button>
          ) : (
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isLoading && <Spinner className="mr-2 text-white" />}
              {isLoading ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Categories & Units Page ───────────────────────────────────────────────

type TabType = "categories" | "units";

export default function Categories() {
  const [activeTab, setActiveTab] = useState<TabType>("categories");
  
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [units,        setUnits]        = useState<Unit[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [search,       setSearch]       = useState("");

  const [showAdd,          setShowAdd]          = useState(false);
  const [editTarget,       setEditTarget]       = useState<Category | Unit | null>(null);
  const [deleteTarget,     setDeleteTarget]     = useState<Category | Unit | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [catsData, unitsData] = await Promise.all([
        getCategories(),
        getUnits(),
      ]);
      setCategories(catsData);
      setUnits(unitsData);
    } catch {
      setLoadError("Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCategorySaved = (cat: Category) => {
    setCategories((prev) => {
      const exists = prev.find((c) => c.id === cat.id);
      return exists ? prev.map((c) => c.id === cat.id ? cat : c) : [...prev, cat];
    });
    showToast(`"${cat.category_name}" saved.`);
  };

  const handleCategoryDeleted = (id: number) => {
    const cat = categories.find((c) => c.id === id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    showToast(`"${cat?.category_name}" deleted.`);
  };

  const handleUnitSaved = (unit: Unit) => {
    setUnits((prev) => {
      const exists = prev.find((u) => u.id === unit.id);
      return exists ? prev.map((u) => u.id === unit.id ? unit : u) : [...prev, unit];
    });
    showToast(`"${unit.unit_name}" saved.`);
  };

  const handleUnitDeleted = (id: number) => {
    const unit = units.find((u) => u.id === id);
    setUnits((prev) => prev.filter((u) => u.id !== id));
    showToast(`"${unit?.unit_name}" deleted.`);
  };

  const filteredCategories = categories.filter((c) =>
    c.category_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredUnits = units.filter((u) =>
    u.unit_name.toLowerCase().includes(search.toLowerCase()) ||
    u.abbreviation.toLowerCase().includes(search.toLowerCase())
  );

  const isCategory = (item: Category | Unit | null): item is Category => {
    return item !== null && "category_name" in item;
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium bg-emerald-600 text-white border border-emerald-700">
          {toast}
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories & Units</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage product categories and measurement units</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0 border-gray-300 text-gray-600 hover:bg-gray-100"
            onClick={load}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm shadow-sm"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="h-4 w-4" /> Add {activeTab === "categories" ? "Category" : "Unit"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-1 flex gap-1">
        <button
          onClick={() => { setActiveTab("categories"); setSearch(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeTab === "categories"
              ? "bg-blue-50 text-blue-700"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <FolderOpen className="h-4 w-4" /> Categories
        </button>
        <button
          onClick={() => { setActiveTab("units"); setSearch(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeTab === "units"
              ? "bg-blue-50 text-blue-700"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Package className="h-4 w-4" /> Units
        </button>
      </div>

      {/* Error */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{loadError}</p>
          <button onClick={load} className="text-red-600 hover:text-red-800 text-sm font-semibold">Retry</button>
        </div>
      )}

      {/* Search + count */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all max-w-sm">
            {activeTab === "categories" ? (
              <FolderOpen className="h-4 w-4 text-gray-400 shrink-0" />
            ) : (
              <Package className="h-4 w-4 text-gray-400 shrink-0" />
            )}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === "categories" ? "Search categories…" : "Search units…"}
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400 text-gray-800"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!isLoading && (
            <p className="text-sm text-gray-500 font-medium">
              {activeTab === "categories" ? filteredCategories.length : filteredUnits.length}{" "}
              {activeTab === "categories" 
                ? (filteredCategories.length === 1 ? "category" : "categories")
                : (filteredUnits.length === 1 ? "unit" : "units")
              }
            </p>
          )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-400">
            <Spinner className="text-blue-500" />
            <span className="text-sm">Loading {activeTab === "categories" ? "categories" : "units"}…</span>
          </div>
        </div>
      ) : activeTab === "categories" && filteredCategories.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <FolderOpen className="h-7 w-7 text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">
                {search ? "No categories match your search" : "No categories yet"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {search ? "Try a different search term" : "Add your first category to get started"}
              </p>
            </div>
            {search
              ? <button onClick={() => setSearch("")} className="text-blue-600 text-sm font-semibold hover:underline">Clear search</button>
              : <button onClick={() => setShowAdd(true)} className="text-blue-600 text-sm font-semibold hover:underline">Add a category</button>
            }
          </div>
        </div>
      ) : activeTab === "units" && filteredUnits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <Package className="h-7 w-7 text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">
                {search ? "No units match your search" : "No units yet"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {search ? "Try a different search term" : "Add your first unit to get started"}
              </p>
            </div>
            {search
              ? <button onClick={() => setSearch("")} className="text-blue-600 text-sm font-semibold hover:underline">Clear search</button>
              : <button onClick={() => setShowAdd(true)} className="text-blue-600 text-sm font-semibold hover:underline">Add a unit</button>
            }
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeTab === "categories" 
            ? filteredCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  {/* Icon + name */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                      <Tag className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{cat.category_name}</p>
                      {cat.description ? (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{cat.description}</p>
                      ) : (
                        <p className="text-xs text-gray-300 mt-0.5 italic">No description</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t border-gray-100">
                    <button
                      onClick={() => setEditTarget(cat)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </button>
                    <div className="w-px bg-gray-100" />
                    <button
                      onClick={() => setDeleteTarget(cat)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))
            : filteredUnits.map((unit) => (
                <div
                  key={unit.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  {/* Icon + name */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 group-hover:opacity-80 transition-colors ${unit.status === "Active" ? "bg-purple-50" : "bg-gray-100"}`}>
                      <Package className={`h-5 w-5 ${unit.status === "Active" ? "text-purple-600" : "text-gray-400"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{unit.unit_name}</p>
                        <Badge variant={unit.status === "Active" ? "default" : "secondary"} className="text-xs">
                          {unit.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">{unit.abbreviation}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {unit.unit_type}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-normal flex items-center gap-1">
                          {unit.allow_decimal ? <Check className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
                          Decimal
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Used by {unit.product_count || 0} {unit.product_count === 1 ? 'Product' : 'Products'}
                      </p>
                      {unit.description ? (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{unit.description}</p>
                      ) : (
                        <p className="text-xs text-gray-300 mt-1 italic">No description</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t border-gray-100">
                    <button
                      onClick={() => setEditTarget(unit)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </button>
                    <div className="w-px bg-gray-100" />
                    <button
                      onClick={() => setDeleteTarget(unit)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* Modals */}
      {activeTab === "categories" ? (
        <>
          <CategoryFormModal
            mode="add"
            open={showAdd}
            onClose={() => setShowAdd(false)}
            onSaved={handleCategorySaved}
          />
          <CategoryFormModal
            mode="edit"
            open={!!editTarget && isCategory(editTarget)}
            initial={editTarget && isCategory(editTarget) ? editTarget : null}
            onClose={() => setEditTarget(null)}
            onSaved={handleCategorySaved}
          />
          <DeleteDialog
            category={deleteTarget && isCategory(deleteTarget) ? deleteTarget : null}
            onClose={() => setDeleteTarget(null)}
            onDeleted={handleCategoryDeleted}
          />
        </>
      ) : (
        <>
          <UnitFormModal
            mode="add"
            open={showAdd}
            onClose={() => setShowAdd(false)}
            onSaved={handleUnitSaved}
          />
          <UnitFormModal
            mode="edit"
            open={!!editTarget && !isCategory(editTarget)}
            initial={editTarget && !isCategory(editTarget) ? editTarget : null}
            onClose={() => setEditTarget(null)}
            onSaved={handleUnitSaved}
          />
          <UnitDeleteDialog
            unit={deleteTarget && !isCategory(deleteTarget) ? deleteTarget : null}
            onClose={() => setDeleteTarget(null)}
            onDeleted={handleUnitDeleted}
          />
        </>
      )}
    </div>
  );
}
