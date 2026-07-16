import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Barcode, Search, Edit2, Trash2, Eye } from "lucide-react";

const products = [
  { id: 1, barcode: "HW-001", name: "Hammer - 16oz", category: "Tools", supplier: "BuildCo", cost: "₱8.50", price: "₱15.99", stock: 45, reorder: 20, status: "In Stock" },
  { id: 2, barcode: "HW-002", name: "Nails - 2 inch", category: "Fasteners", supplier: "Hardware Plus", cost: "₱0.15", price: "₱0.35", stock: 5, reorder: 50, status: "Low Stock" },
  { id: 3, barcode: "HW-003", name: "Screws - Phillips", category: "Fasteners", supplier: "Industrial Tools", cost: "₱0.20", price: "₱0.50", stock: 120, reorder: 100, status: "In Stock" },
  { id: 4, barcode: "HW-004", name: "Wood Glue", category: "Adhesives", supplier: "BuildCo", cost: "₱3.20", price: "₱7.99", stock: 3, reorder: 10, status: "Critical" },
  { id: 5, barcode: "HW-005", name: "Drill Bit Set", category: "Tools", supplier: "Hardware Plus", cost: "₱12.00", price: "₱24.99", stock: 28, reorder: 15, status: "In Stock" },
];

export default function Products() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-1">Manage your product catalog</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Barcode className="h-4 w-4" />
            Print Barcode
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products..."
              className="border-0 bg-transparent text-sm focus-visible:ring-0"
            />
          </div>
          <Select>
            <SelectTrigger className="bg-gray-50">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tools">Tools</SelectItem>
              <SelectItem value="fasteners">Fasteners</SelectItem>
              <SelectItem value="adhesives">Adhesives</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger className="bg-gray-50">
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="buildco">BuildCo</SelectItem>
              <SelectItem value="hardware">Hardware Plus</SelectItem>
              <SelectItem value="industrial">Industrial Tools</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger className="bg-gray-50">
              <SelectValue placeholder="Stock Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in-stock">In Stock</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Products Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Barcode</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Product Name</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Category</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Supplier</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Cost Price</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Selling Price</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Stock</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Reorder</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Status</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, idx) => (
                <tr key={product.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 transition-colors`}>
                  <td className="py-4 px-6 text-gray-900 font-medium">{product.barcode}</td>
                  <td className="py-4 px-6 text-gray-900">{product.name}</td>
                  <td className="py-4 px-6 text-gray-700">{product.category}</td>
                  <td className="py-4 px-6 text-gray-700">{product.supplier}</td>
                  <td className="py-4 px-6 text-gray-900 font-medium">{product.cost}</td>
                  <td className="py-4 px-6 text-gray-900 font-medium">{product.price}</td>
                  <td className="py-4 px-6 text-gray-900 font-medium">{product.stock}</td>
                  <td className="py-4 px-6 text-gray-700">{product.reorder}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      product.status === "In Stock" ? "bg-green-100 text-green-800" :
                      product.status === "Low Stock" ? "bg-amber-100 text-amber-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
