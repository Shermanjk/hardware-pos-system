import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Download, FileText, Sheet } from "lucide-react";

const dailySalesData = [
  { day: "Mon", sales: 4200, orders: 24 },
  { day: "Tue", sales: 3800, orders: 22 },
  { day: "Wed", sales: 5100, orders: 29 },
  { day: "Thu", sales: 4600, orders: 26 },
  { day: "Fri", sales: 6200, orders: 35 },
  { day: "Sat", sales: 7100, orders: 40 },
  { day: "Sun", sales: 5800, orders: 32 },
];

const monthlySalesData = [
  { month: "Jan", revenue: 32000 },
  { month: "Feb", revenue: 28000 },
  { month: "Mar", revenue: 42000 },
  { month: "Apr", revenue: 38000 },
  { month: "May", revenue: 45000 },
  { month: "Jun", revenue: 52000 },
];

const bestSellingProducts = [
  { name: "Drill Bit Set", value: 2400 },
  { name: "Hammer", value: 1398 },
  { name: "Screws", value: 9800 },
  { name: "Paint Roller", value: 3908 },
  { name: "Sandpaper", value: 4800 },
];

const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

const lowStockReport = [
  { product: "Wood Glue", current: 3, reorder: 10, shortage: 7 },
  { product: "Nails - 2 inch", current: 5, reorder: 50, shortage: 45 },
  { product: "Hammer - 16oz", current: 8, reorder: 20, shortage: 12 },
];

export default function Reports() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">Business analytics and insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" className="gap-2">
            <Sheet className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Daily Sales Report */}
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-lg font-display font-bold text-gray-900">Daily Sales</h2>
          <p className="text-gray-600 text-sm">Weekly sales performance</p>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailySalesData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="day" stroke="#6B7280" />
            <YAxis stroke="#6B7280" />
            <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px" }} />
            <Legend />
            <Bar dataKey="sales" fill="#2563EB" radius={[8, 8, 0, 0]} />
            <Bar dataKey="orders" fill="#10B981" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Monthly Sales & Best Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Sales */}
        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-display font-bold text-gray-900">Monthly Sales</h2>
            <p className="text-gray-600 text-sm">6-month revenue trend</p>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={monthlySalesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#6B7280" />
              <YAxis stroke="#6B7280" />
              <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px" }} />
              <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} dot={{ fill: "#2563EB" }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Best Selling Products */}
        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-display font-bold text-gray-900">Best Selling Products</h2>
            <p className="text-gray-600 text-sm">Top 5 products by revenue</p>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={bestSellingProducts}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ₱${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {bestSellingProducts.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Inventory Report */}
      <Card className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-display font-bold text-gray-900">Low Stock Report</h2>
          <p className="text-gray-600 text-sm">Items below reorder level</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Product</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Current Stock</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Reorder Level</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Shortage</th>
              </tr>
            </thead>
            <tbody>
              {lowStockReport.map((item, idx) => (
                <tr key={idx} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  <td className="py-3 px-4 text-gray-900 font-medium">{item.product}</td>
                  <td className="py-3 px-4 text-gray-700">{item.current}</td>
                  <td className="py-3 px-4 text-gray-700">{item.reorder}</td>
                  <td className="py-3 px-4">
                    <span className="text-red-600 font-semibold">{item.shortage}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">₱245,320</p>
          <p className="text-xs text-green-600 font-medium mt-2">+12.5% from last month</p>
        </Card>
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">1,248</p>
          <p className="text-xs text-green-600 font-medium mt-2">+8.2% from last month</p>
        </Card>
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">Avg Order Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">₱196.50</p>
          <p className="text-xs text-green-600 font-medium mt-2">+3.1% from last month</p>
        </Card>
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">Total Profit</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">₱78,450</p>
          <p className="text-xs text-green-600 font-medium mt-2">+15.8% from last month</p>
        </Card>
      </div>
    </div>
  );
}
