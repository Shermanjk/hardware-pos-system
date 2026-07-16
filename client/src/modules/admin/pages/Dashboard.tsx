import { Card } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, AlertCircle, Package, Truck, DollarSign, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mock data
const kpiData = [
  { icon: DollarSign, label: "Today's Sales", value: "₱2,450.50", change: "+12.5%", positive: true },
  { icon: TrendingUp, label: "Monthly Revenue", value: "₱45,320.00", change: "+8.2%", positive: true },
  { icon: Package, label: "Total Products", value: "1,234", change: "+45", positive: true },
  { icon: AlertCircle, label: "Low Stock Items", value: "23", change: "+5", positive: false },
  { icon: Truck, label: "Total Suppliers", value: "42", change: "0", positive: true },
  { icon: ShoppingCart, label: "Pending Orders", value: "12", change: "-3", positive: true },
];

const salesChartData = [
  { date: "Mon", sales: 4000, revenue: 2400 },
  { date: "Tue", sales: 3000, revenue: 1398 },
  { date: "Wed", sales: 2000, revenue: 9800 },
  { date: "Thu", sales: 2780, revenue: 3908 },
  { date: "Fri", sales: 1890, revenue: 4800 },
  { date: "Sat", sales: 2390, revenue: 3800 },
  { date: "Sun", sales: 3490, revenue: 4300 },
];

const revenueData = [
  { month: "Jan", revenue: 12000 },
  { month: "Feb", revenue: 19000 },
  { month: "Mar", revenue: 15000 },
  { month: "Apr", revenue: 22000 },
  { month: "May", revenue: 18000 },
  { month: "Jun", revenue: 25000 },
];

const lowStockItems = [
  { id: 1, name: "Hammer - 16oz", sku: "HMR-001", current: 5, reorder: 20 },
  { id: 2, name: "Nails - 2 inch", sku: "NLS-002", current: 8, reorder: 50 },
  { id: 3, name: "Screws - Phillips", sku: "SCR-003", current: 12, reorder: 100 },
  { id: 4, name: "Wood Glue", sku: "GLU-004", current: 3, reorder: 10 },
];

const recentSales = [
  { id: 1, product: "Drill Bit Set", qty: 2, total: "₱45.99", time: "2 mins ago" },
  { id: 2, product: "Saw Blade", qty: 1, total: "₱32.50", time: "15 mins ago" },
  { id: 3, product: "Sandpaper Pack", qty: 3, total: "₱24.75", time: "1 hour ago" },
  { id: 4, product: "Paint Roller", qty: 2, total: "₱18.99", time: "2 hours ago" },
];

const recentPurchaseOrders = [
  { id: "PO-001", supplier: "BuildCo Supplies", items: 15, total: "₱2,450", status: "Pending" },
  { id: "PO-002", supplier: "Hardware Plus", items: 8, total: "₱1,200", status: "Received" },
  { id: "PO-003", supplier: "Industrial Tools", items: 12, total: "₱3,890", status: "In Transit" },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back! Here's your business overview.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpiData.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <Card key={idx} className="p-6 hover:shadow-lg transition-shadow duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">{kpi.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{kpi.value}</p>
                  <p className={`text-sm font-medium mt-2 ${kpi.positive ? "text-green-600" : "text-red-600"}`}>
                    {kpi.change} from last period
                  </p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Icon className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Revenue Chart */}
        <Card className="lg:col-span-2 p-6">
          <div className="mb-6">
            <h2 className="text-lg font-display font-bold text-gray-900">Sales Analytics</h2>
            <p className="text-gray-600 text-sm">Weekly sales and revenue trends</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" stroke="#6B7280" />
              <YAxis stroke="#6B7280" />
              <Tooltip 
                contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px" }}
              />
              <Legend />
              <Bar dataKey="sales" fill="#2563EB" radius={[8, 8, 0, 0]} />
              <Bar dataKey="revenue" fill="#10B981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Low Stock Alert */}
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-display font-bold text-gray-900">Low Stock Alert</h2>
            <p className="text-gray-600 text-sm">Items below reorder level</p>
          </div>
          <div className="space-y-3">
            {lowStockItems.map((item) => (
              <div key={item.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-600">{item.sku}</p>
                <div className="flex justify-between mt-2">
                  <span className="text-xs text-red-600 font-medium">Stock: {item.current}</span>
                  <span className="text-xs text-gray-600">Reorder: {item.reorder}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Revenue Trend & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-display font-bold text-gray-900">Revenue Trend</h2>
            <p className="text-gray-600 text-sm">Last 6 months performance</p>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#6B7280" />
              <YAxis stroke="#6B7280" />
              <Tooltip 
                contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px" }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} dot={{ fill: "#2563EB" }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Recent Sales */}
        <Card className="p-6">
          <div className="mb-4">
            <h2 className="text-lg font-display font-bold text-gray-900">Recent Sales</h2>
            <p className="text-gray-600 text-sm">Latest transactions</p>
          </div>
          <div className="space-y-3">
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{sale.product}</p>
                  <p className="text-xs text-gray-600">Qty: {sale.qty}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{sale.total}</p>
                  <p className="text-xs text-gray-600">{sale.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Purchase Orders */}
      <Card className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-display font-bold text-gray-900">Recent Purchase Orders</h2>
          <p className="text-gray-600 text-sm">Latest supplier orders</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Order ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Supplier</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Items</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Total</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentPurchaseOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-900 font-medium">{order.id}</td>
                  <td className="py-3 px-4 text-gray-700">{order.supplier}</td>
                  <td className="py-3 px-4 text-gray-700">{order.items}</td>
                  <td className="py-3 px-4 text-gray-900 font-medium">{order.total}</td>
                  <td className="py-3 px-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      order.status === "Pending" ? "bg-amber-100 text-amber-800" :
                      order.status === "Received" ? "bg-green-100 text-green-800" :
                      "bg-blue-100 text-blue-800"
                    }`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
