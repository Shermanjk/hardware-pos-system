import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Filter, X } from "lucide-react";
import { useState } from "react";

export type QuickDateFilter = "today" | "yesterday" | "this_week" | "this_month" | "this_year" | "custom";

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  quickDateFilter: QuickDateFilter;
  cashierId: string;
  status: string;
  categoryId: string;
  supplierId: string;
  productId: string;
  movementType: string;
  resolution: string;
  approvedBy: string;
  authorizationType: string;
  actionType: string;
  search: string;
}

interface GlobalReportFilterProps {
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  onGenerate: () => void;
  isLoading?: boolean;
  availableCashiers?: Array<{ id: number; full_name: string }>;
  availableCategories?: Array<{ id: number; category_name: string }>;
  availableSuppliers?: Array<{ id: number; supplier_name: string }>;
  availableProducts?: Array<{ id: number; product_name: string }>;
  showCashierFilter?: boolean;
  showStatusFilter?: boolean;
  showCategoryFilter?: boolean;
  showSupplierFilter?: boolean;
  showProductFilter?: boolean;
  showMovementTypeFilter?: boolean;
  showResolutionFilter?: boolean;
  showApprovedByFilter?: boolean;
  showAuthorizationTypeFilter?: boolean;
  showActionTypeFilter?: boolean;
  showSearchFilter?: boolean;
  searchPlaceholder?: string;
  statusOptions?: Array<{ value: string; label: string }>;
  movementTypeOptions?: Array<{ value: string; label: string }>;
  resolutionOptions?: Array<{ value: string; label: string }>;
  authorizationTypeOptions?: Array<{ value: string; label: string }>;
  actionTypeOptions?: Array<{ value: string; label: string }>;
}

export default function GlobalReportFilter({
  filters,
  onFiltersChange,
  onGenerate,
  isLoading = false,
  availableCashiers = [],
  availableCategories = [],
  availableSuppliers = [],
  availableProducts = [],
  showCashierFilter = true,
  showStatusFilter = false,
  showCategoryFilter = false,
  showSupplierFilter = false,
  showProductFilter = false,
  showMovementTypeFilter = false,
  showResolutionFilter = false,
  showApprovedByFilter = false,
  showAuthorizationTypeFilter = false,
  showActionTypeFilter = false,
  showSearchFilter = false,
  searchPlaceholder = "Search...",
  statusOptions = [
    { value: "all", label: "All Status" },
    { value: "completed", label: "Completed" },
    { value: "returned", label: "Returned" },
    { value: "voided", label: "Voided" },
    { value: "cancelled", label: "Cancelled" },
  ],
  movementTypeOptions = [
    { value: "all", label: "All Types" },
    { value: "stock_in", label: "Stock In" },
    { value: "stock_out", label: "Stock Out" },
    { value: "adjustment", label: "Adjustment" },
    { value: "return", label: "Return" },
  ],
  resolutionOptions = [
    { value: "all", label: "All Resolutions" },
    { value: "refund", label: "Refund" },
    { value: "exchange", label: "Exchange" },
    { value: "store_credit", label: "Store Credit" },
  ],
  authorizationTypeOptions = [
    { value: "all", label: "All Types" },
    { value: "discount", label: "Discount" },
    { value: "return", label: "Return" },
    { value: "void", label: "Void" },
    { value: "price_override", label: "Price Override" },
  ],
  actionTypeOptions = [
    { value: "all", label: "All Actions" },
    { value: "login", label: "Login" },
    { value: "logout", label: "Logout" },
    { value: "product_change", label: "Product Changes" },
    { value: "price_change", label: "Price Changes" },
    { value: "stock_adjustment", label: "Stock Adjustments" },
    { value: "discount_approval", label: "Discount Approvals" },
    { value: "return_approval", label: "Return Approvals" },
    { value: "void_approval", label: "Void Approvals" },
    { value: "backup", label: "Backup" },
    { value: "restore", label: "Restore" },
    { value: "system_update", label: "System Updates" },
  ],
}: GlobalReportFilterProps) {
  const handleQuickDateFilter = (value: QuickDateFilter) => {
    const today = new Date();
    let dateFrom = "";
    let dateTo = today.toISOString().slice(0, 10);

    switch (value) {
      case "today":
        dateFrom = dateTo;
        break;
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        dateFrom = yesterday.toISOString().slice(0, 10);
        dateTo = dateFrom;
        break;
      case "this_week":
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        dateFrom = weekStart.toISOString().slice(0, 10);
        break;
      case "this_month":
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        dateFrom = monthStart.toISOString().slice(0, 10);
        break;
      case "this_year":
        const yearStart = new Date(today.getFullYear(), 0, 1);
        dateFrom = yearStart.toISOString().slice(0, 10);
        break;
      case "custom":
        // Keep existing dates
        dateFrom = filters.dateFrom;
        dateTo = filters.dateTo;
        break;
    }

    onFiltersChange({
      ...filters,
      quickDateFilter: value,
      dateFrom,
      dateTo,
    });
  };

  const clearFilters = () => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    
    onFiltersChange({
      ...filters,
      quickDateFilter: "this_month",
      dateFrom: monthStart,
      dateTo: today,
      cashierId: "",
      status: "all",
      categoryId: "",
      supplierId: "",
      productId: "",
      movementType: "all",
      resolution: "all",
      approvedBy: "",
      authorizationType: "all",
      actionType: "all",
      search: "",
    });
  };

  const hasActiveFilters = 
    filters.cashierId !== "" ||
    filters.status !== "all" ||
    filters.categoryId !== "" ||
    filters.supplierId !== "" ||
    filters.productId !== "" ||
    filters.movementType !== "all" ||
    filters.resolution !== "all" ||
    filters.approvedBy !== "" ||
    filters.authorizationType !== "all" ||
    filters.actionType !== "all" ||
    filters.search !== "";

  return (
    <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <Filter className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Report Filters & Parameters</h3>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white font-medium">
              Active Filters
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-end gap-4">
          {/* Quick Date Filter */}
          <div>
            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 block">
              Quick Date
            </Label>
            <Select
              value={filters.quickDateFilter}
              onValueChange={(v) => handleQuickDateFilter(v as QuickDateFilter)}
            >
              <SelectTrigger className="h-9.5 text-sm w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

        {/* Date From */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
            Date From
          </Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value, quickDateFilter: "custom" })}
              className="h-9 text-sm pl-8 w-40"
              disabled={filters.quickDateFilter !== "custom"}
            />
          </div>
        </div>

        {/* Date To */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
            Date To
          </Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value, quickDateFilter: "custom" })}
              className="h-9 text-sm pl-8 w-40"
              disabled={filters.quickDateFilter !== "custom"}
            />
          </div>
        </div>

        {/* Cashier Filter */}
        {showCashierFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Cashier
            </Label>
            <Select value={filters.cashierId} onValueChange={(v) => onFiltersChange({ ...filters, cashierId: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="All Cashiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cashiers</SelectItem>
                {availableCashiers.map((cashier) => (
                  <SelectItem key={cashier.id} value={String(cashier.id)}>
                    {cashier.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Status Filter */}
        {showStatusFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Status
            </Label>
            <Select value={filters.status} onValueChange={(v) => onFiltersChange({ ...filters, status: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Category Filter */}
        {showCategoryFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Category
            </Label>
            <Select value={filters.categoryId} onValueChange={(v) => onFiltersChange({ ...filters, categoryId: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Supplier Filter */}
        {showSupplierFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Supplier
            </Label>
            <Select value={filters.supplierId} onValueChange={(v) => onFiltersChange({ ...filters, supplierId: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="All Suppliers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {availableSuppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={String(supplier.id)}>
                    {supplier.supplier_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Product Filter */}
        {showProductFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Product
            </Label>
            <Select value={filters.productId} onValueChange={(v) => onFiltersChange({ ...filters, productId: v })}>
              <SelectTrigger className="h-9 text-sm w-48">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {availableProducts.map((product) => (
                  <SelectItem key={product.id} value={String(product.id)}>
                    {product.product_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Movement Type Filter */}
        {showMovementTypeFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Movement Type
            </Label>
            <Select value={filters.movementType} onValueChange={(v) => onFiltersChange({ ...filters, movementType: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {movementTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Resolution Filter */}
        {showResolutionFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Resolution
            </Label>
            <Select value={filters.resolution} onValueChange={(v) => onFiltersChange({ ...filters, resolution: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resolutionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Approved By Filter */}
        {showApprovedByFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Approved By
            </Label>
            <Select value={filters.approvedBy} onValueChange={(v) => onFiltersChange({ ...filters, approvedBy: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue placeholder="All Admins" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Admins</SelectItem>
                {availableCashiers.map((admin) => (
                  <SelectItem key={admin.id} value={String(admin.id)}>
                    {admin.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Authorization Type Filter */}
        {showAuthorizationTypeFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Authorization Type
            </Label>
            <Select value={filters.authorizationType} onValueChange={(v) => onFiltersChange({ ...filters, authorizationType: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {authorizationTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Action Type Filter */}
        {showActionTypeFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Action Type
            </Label>
            <Select value={filters.actionType} onValueChange={(v) => onFiltersChange({ ...filters, actionType: v })}>
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {actionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Search Filter */}
        {showSearchFilter && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Search
            </Label>
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              className="h-9 text-sm w-56"
            />
          </div>
        )}

        {/* Generate Button */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onGenerate}
            disabled={isLoading}
            className="h-9.5 px-5 gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <Filter className="h-4 w-4" />
            )}
            Generate Report
          </Button>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
              className="h-9.5 px-4 text-sm font-medium text-slate-600 border-slate-300 hover:bg-slate-100 hover:text-slate-900 gap-1.5 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
