import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Edit2 } from "lucide-react";

const inventoryItems = [
  { id: 1, barcode: "HW-001", product: "Hammer - 16oz", current: 45, unit: "pcs", lastUpdated: "2 hours ago", status: "In Stock" },
  { id: 2, barcode: "HW-002", product: "Nails - 2 inch", current: 5, unit: "boxes", lastUpdated: "1 day ago", status: "Low Stock" },
  { id: 3, barcode: "HW-003", product: "Screws - Phillips", current: 120, unit: "boxes", lastUpdated: "3 hours ago", status: "In Stock" },
  { id: 4, barcode: "HW-004", product: "Wood Glue", current: 3, unit: "bottles", lastUpdated: "5 days ago", status: "Critical" },
  { id: 5, barcode: "HW-005", product: "Drill Bit Set", current: 28, unit: "sets", lastUpdated: "1 hour ago", status: "In Stock" },
];

export default function Inventory() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-600 mt-1">Current stock levels and movements</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">Stock Adjustment</Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Stock In
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">Total Items</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">1,234</p>
        </Card>
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">In Stock</p>
          <p className="text-2xl font-bold text-green-600 mt-2">1,198</p>
        </Card>
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">Low Stock</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">23</p>
        </Card>
        <Card className="p-4">
          <p className="text-gray-600 text-sm font-medium">Critical</p>
          <p className="text-2xl font-bold text-red-600 mt-2">13</p>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="flex gap-4">
          <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by product name..."
              className="border-0 bg-transparent text-sm focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Input
              placeholder="Barcode search..."
              className="border-0 bg-transparent text-sm focus-visible:ring-0"
            />
          </div>
        </div>
      </Card>

      {/* Inventory Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Barcode</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Product</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Current Stock</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Unit</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Last Updated</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Status</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Action</th>
              </tr>
            </thead>
            <tbody>
              {inventoryItems.map((item, idx) => (
                <tr key={item.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50`}>
                  <td className="py-4 px-6 text-gray-900 font-medium">{item.barcode}</td>
                  <td className="py-4 px-6 text-gray-900">{item.product}</td>
                  <td className="py-4 px-6 text-gray-900 font-bold text-lg">{item.current}</td>
                  <td className="py-4 px-6 text-gray-700">{item.unit}</td>
                  <td className="py-4 px-6 text-gray-700">{item.lastUpdated}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      item.status === "In Stock" ? "bg-green-100 text-green-800" :
                      item.status === "Low Stock" ? "bg-amber-100 text-amber-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Edit2 className="h-4 w-4" />
                    </Button>
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
