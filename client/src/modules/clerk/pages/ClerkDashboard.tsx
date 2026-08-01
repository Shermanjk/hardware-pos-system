import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Boxes,
  PackagePlus,
  SlidersHorizontal,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowRight,
  CheckCircle,
  Printer,
  ClipboardList,
} from "lucide-react";
import { getInventorySummary, getInventoryLogs, getInventory } from "@/shared/api/inventoryApi";
import { type InventoryItem } from "@/shared/api/inventoryApi";

// ─── Summary card ─────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  iconBg: string;
  iconColor: string;
  loading: boolean;
}

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, loading }: StatCardProps) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow duration-200">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-36" />
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </div>
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Action icon map ──────────────────────────────────────────────────────────

interface ActivityLog {
  id: string;
  action: string;
  product_name: string;
  quantity_change: string;
  performed_by: string;
  timestamp: string;
}

function ActivityIcon({ action }: { action: string }) {
  switch (action) {
    case "Received Stock":
    case "Stock In Saved":
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    case "Damaged":
    case "Lost":
    case "Expired":
    case "Correction":
    case "Stock Adjustment":
      return <TrendingDown className="h-4 w-4 text-amber-600" />;
    case "Printed Barcode":
      return <Printer className="h-4 w-4 text-blue-600" />;
    case "Completed Stock Count":
      return <CheckCircle className="h-4 w-4 text-purple-600" />;
    default:
      return <Activity className="h-4 w-4 text-gray-400" />;
  }
}

function activityIconBg(action: string): string {
  switch (action) {
    case "Received Stock":
    case "Stock In Saved":   return "bg-green-50";
    case "Damaged":
    case "Lost":
    case "Expired":
    case "Correction":
    case "Stock Adjustment": return "bg-amber-50";
    case "Printed Barcode":  return "bg-blue-50";
    case "Completed Stock Count": return "bg-purple-50";
    default:                 return "bg-gray-50";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClerkDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalQty: 0,
    lowStockCount: 0,
    todayStockIn: 0,
  });
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<InventoryItem[]>([]);

  // Fetch real data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summary, inventoryLogs, inventoryData] = await Promise.all([
          getInventorySummary(),
          getInventoryLogs({ limit: 10 }),
          getInventory(),
        ]);
        const allProducts = inventoryData;
        setLowStockProducts(allProducts.filter((p) => p.quantity <= p.reorder_level).slice(0, 6));

        setStats({
          totalProducts: summary.total_products ?? 0,
          totalQty: Number(summary.total_units ?? 0),
          lowStockCount: (summary.low_stock ?? 0) + (summary.critical ?? 0) + (summary.out_of_stock ?? 0),
          todayStockIn: inventoryLogs.filter(
            (l) =>
              l.action === "Received Stock" &&
              new Date(l.created_at).toDateString() === new Date().toDateString()
          ).length,
        });

        setLogs(
          inventoryLogs.map((l) => ({
            id: String(l.id),
            action: l.action || "",
            product_name: l.product_name,
            quantity_change: l.quantity_change ? (l.quantity_change > 0 ? `+${l.quantity_change}` : String(l.quantity_change)) : "—",
            performed_by: l.performed_by,
            timestamp: l.created_at,
          }))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to fetch dashboard data:", message.replace(/[\r\n\t]/g, " "));
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Auto-refresh every 3 minutes so the clerk dashboard stays current
    // throughout the business day without requiring a manual page reload.
    const id = setInterval(fetchData, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const cards = [
    {
      icon: Boxes,
      label: "Total Products",
      value: stats.totalProducts,
      sub: "Registered in system",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Activity,
      label: "Current Inventory Qty",
      value: stats.totalQty.toLocaleString(),
      sub: "Total units across all products",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
    },
    {
      icon: PackagePlus,
      label: "Today's Stock In",
      value: stats.todayStockIn,
      sub: "Deliveries received today",
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      icon: AlertTriangle,
      label: "Low Stock Products",
      value: stats.lowStockCount,
      sub: "At or below reorder level",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Welcome back — here's your inventory overview.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
          <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs font-medium text-green-700">System Online</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} loading={loading} />
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/clerk/stock-in" className="block">
          <Card className="p-4 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <PackagePlus className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">New Stock In</p>
                  <p className="text-xs text-blue-600">Receive a delivery</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-500 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        </Link>

        <Link href="/clerk/stock-adjustment" className="block">
          <Card className="p-4 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <SlidersHorizontal className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900">Stock Adjustment</p>
                  <p className="text-xs text-amber-700">Damaged, lost, expired</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-amber-500 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        </Link>

        <Link href="/clerk/low-stock" className="block">
          <Card className="p-4 border-red-200 bg-red-50 hover:bg-red-100 hover:shadow-md transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-900">View Low Stock</p>
                  <p className="text-xs text-red-600">{stats.lowStockCount} items need attention</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-red-500 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        </Link>
      </div>

      {/* Main content row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent activity — 2/3 width */}
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Recent Inventory Activities</h2>
              <p className="text-xs text-gray-500 mt-0.5">Latest transactions by you</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-blue-600 text-xs gap-1">
              <Link href="/clerk/inventory">View all <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>

          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-3 px-6 font-semibold text-gray-600 text-xs uppercase tracking-wide">Action</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Qty Change</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr
                      key={log.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                      }`}
                    >
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${activityIconBg(log.action)}`}>
                            <ActivityIcon action={log.action} />
                          </div>
                          <span className="text-gray-800 font-medium text-xs">{log.action}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-700 text-xs max-w-[160px] truncate">
                        {log.product_name}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold text-xs ${
                            log.quantity_change.startsWith("+")
                              ? "text-green-600"
                              : log.quantity_change.startsWith("-")
                              ? "text-red-600"
                              : "text-gray-500"
                          }`}
                        >
                          {log.quantity_change}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs whitespace-nowrap">
                        {log.timestamp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Quick stock status — 1/3 width */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Stock Status</h2>
              <p className="text-xs text-gray-500 mt-0.5">Products needing attention</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-blue-600 text-xs gap-1">
              <Link href="/clerk/low-stock">See all <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {lowStockProducts.map((p) => {
                  const isCritical = p.quantity === 0 || p.quantity <= p.reorder_level * 0.5;
                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg border ${
                        isCritical
                          ? "bg-red-50 border-red-200"
                          : "bg-amber-50 border-amber-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{p.product_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{p.barcode}</p>
                        </div>
                        <span
                          className={`flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-bold ${
                            isCritical
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {p.quantity}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isCritical ? "bg-red-500" : "bg-amber-400"}`}
                            style={{
                              width: `${Math.min(100, Math.max(4, (p.quantity / (p.reorder_level * 1.5)) * 100))}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          /{p.reorder_level}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {stats.lowStockCount > 6 && (
                <Link href="/clerk/low-stock" className="block text-center py-2 text-xs text-blue-600 hover:underline font-medium">
                  +{stats.lowStockCount - 6} more items
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom action row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "View Inventory",    href: "/clerk/inventory",        icon: Boxes,            color: "text-blue-600" },
          { label: "Stock Count",       href: "/clerk/stock-count",      icon: ClipboardList,    color: "text-purple-600" },
          { label: "Print Barcodes",    href: "/clerk/barcode-printing", icon: Printer,          color: "text-gray-600" },
          { label: "Low Stock Report",  href: "/clerk/low-stock",        icon: AlertTriangle,    color: "text-amber-600" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <Card className="p-4 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group">
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${item.color}`} />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                    {item.label}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400 ml-auto group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
