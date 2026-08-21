import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Package, 
  ArrowUpDown, 
  TrendingUp, 
  ShoppingCart, 
  RotateCcw, 
  Ban, 
  Percent, 
  ShieldCheck, 
  ClipboardList,
  ChevronRight
} from "lucide-react";
import PesoSign from "@/shared/components/PesoSign";
import { useState } from "react";
import SalesReport from "./SalesReport";
import InventoryReport from "./InventoryReport";
import StockMovementReport from "./StockMovementReport";
import ProductSalesReport from "./ProductSalesReport";
import TopProductsReport from "./TopProductsReport";
import SupplierPurchaseReport from "./SupplierPurchaseReport";
import ReturnReport from "./ReturnReport";
import VoidReport from "./VoidReport";
import DiscountReport from "./DiscountReport";
import CashReconciliationReport from "./CashReconciliationReport";
import AuthorizationHistoryReport from "./AuthorizationHistoryReport";
import AuditLogReport from "./AuditLogReport";
import CreditReceivablesReport from "./CreditReceivablesReport";
import ZReadingReport from "./ZReadingReport";
import { CreditCard } from "lucide-react";

type ReportType = 
  | "hub"
  | "z-reading"
  | "sales"
  | "credit-receivables"
  | "inventory"
  | "stock-movement"
  | "product-sales"
  | "top-products"
  | "supplier-purchases"
  | "returns"
  | "voids"
  | "discounts"
  | "cash-reconciliation"
  | "authorization-history"
  | "audit-logs";

interface ReportCard {
  id: ReportType;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: string;
}

const reports: ReportCard[] = [
  {
    id: "z-reading",
    title: "BIR Z-Reading & Tax Compliance",
    description: "Non-resettable End-of-Day Z-Readings, tax breakdowns, audit counters, and eSales .CSV exports",
    icon: <ShieldCheck className="h-6 w-6 text-blue-600" />,
    category: "Operations",
  },
  {
    id: "sales",
    title: "Sales Report",
    description: "Detailed sales transaction data with gross sales, discounts, returns, and net sales",
    icon: <FileText className="h-6 w-6" />,
    category: "Sales",
  },
  {
    id: "credit-receivables",
    title: "Accounts Receivable & Utang",
    description: "Customer credit balances, aging analysis (0-30, 31-60, 61-90, >90 days), and credit sales vs collection",
    icon: <CreditCard className="h-6 w-6" />,
    category: "Sales",
  },
  {
    id: "inventory",
    title: "Inventory Report",
    description: "Stock levels, beginning stock, stock in/out, and ending stock by product",
    icon: <Package className="h-6 w-6" />,
    category: "Inventory",
  },
  {
    id: "stock-movement",
    title: "Stock Movement Report",
    description: "History of all inventory movements with reasons and performed by",
    icon: <ArrowUpDown className="h-6 w-6" />,
    category: "Inventory",
  },
  {
    id: "product-sales",
    title: "Product Sales Report",
    description: "Sales performance by product including quantity sold, revenue, and profit",
    icon: <TrendingUp className="h-6 w-6" />,
    category: "Sales",
  },
  {
    id: "top-products",
    title: "Top Selling Products",
    description: "Best performing products ranked by sales volume and revenue",
    icon: <ShoppingCart className="h-6 w-6" />,
    category: "Sales",
  },
  {
    id: "supplier-purchases",
    title: "Supplier Purchase Report",
    description: "Purchases from suppliers with total costs and products purchased",
    icon: <ShoppingCart className="h-6 w-6" />,
    category: "Inventory",
  },
  {
    id: "returns",
    title: "Return Report",
    description: "Product returns, refunds, and resolution details",
    icon: <RotateCcw className="h-6 w-6" />,
    category: "Transactions",
  },
  {
    id: "voids",
    title: "Void Report",
    description: "Voided transactions with reasons and approval details",
    icon: <Ban className="h-6 w-6" />,
    category: "Transactions",
  },
  {
    id: "discounts",
    title: "Discount Report",
    description: "Discount applications, percentages, and approval history",
    icon: <Percent className="h-6 w-6" />,
    category: "Transactions",
  },
  {
    id: "cash-reconciliation",
    title: "Cash Reconciliation",
    description: "Cash drawer reconciliation with expected vs actual and variance tracking",
    icon: <PesoSign className="text-2xl" />,
    category: "Operations",
  },
  {
    id: "authorization-history",
    title: "Authorization History",
    description: "Admin authorization requests, decisions, and reference numbers",
    icon: <ShieldCheck className="h-6 w-6" />,
    category: "Security",
  },
  {
    id: "audit-logs",
    title: "Audit Log Report",
    description: "System activity and audit trail with user actions and timestamps",
    icon: <ClipboardList className="h-6 w-6" />,
    category: "Security",
  },
];

const categories = ["Sales", "Inventory", "Transactions", "Operations", "Security"];

export default function ReportsHub() {
  const [selectedReport, setSelectedReport] = useState<ReportType>("hub");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const filteredReports = selectedCategory === "All" 
    ? reports 
    : reports.filter(r => r.category === selectedCategory);

  const renderReport = () => {
    switch (selectedReport) {
      case "z-reading":
        return <ZReadingReport />;
      case "sales":
        return <SalesReport />;
      case "credit-receivables":
        return <CreditReceivablesReport />;
      case "inventory":
        return <InventoryReport />;
      case "stock-movement":
        return <StockMovementReport />;
      case "product-sales":
        return <ProductSalesReport />;
      case "top-products":
        return <TopProductsReport />;
      case "supplier-purchases":
        return <SupplierPurchaseReport />;
      case "returns":
        return <ReturnReport />;
      case "voids":
        return <VoidReport />;
      case "discounts":
        return <DiscountReport />;
      case "cash-reconciliation":
        return <CashReconciliationReport />;
      case "authorization-history":
        return <AuthorizationHistoryReport />;
      case "audit-logs":
        return <AuditLogReport />;
      default:
        return null;
    }
  };

  if (selectedReport !== "hub") {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => setSelectedReport("hub")}
          className="gap-2"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to Reports Hub
        </Button>
        {renderReport()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 mt-1">Generate and export business reports for store operations, management auditing, and accountant/BIR reference</p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedCategory === "All" ? "default" : "outline"}
          onClick={() => setSelectedCategory("All")}
          size="sm"
        >
          All Reports
        </Button>
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            onClick={() => setSelectedCategory(category)}
            size="sm"
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReports.map((report) => (
          <button
            key={report.id}
            onClick={() => setSelectedReport(report.id)}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-left hover:shadow-md hover:border-blue-300 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-50 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                {report.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {report.title}
                </h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {report.description}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {report.category}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
