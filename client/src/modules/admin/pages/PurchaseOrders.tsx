import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const purchaseOrders = [
  { id: "PO-001", supplier: "BuildCo Supplies", items: 15, total: "₱2,450.00", date: "2024-01-15", status: "Pending" },
  { id: "PO-002", supplier: "Hardware Plus", items: 8, total: "₱1,200.00", date: "2024-01-14", status: "Received" },
  { id: "PO-003", supplier: "Industrial Tools", items: 12, total: "₱3,890.00", date: "2024-01-13", status: "In Transit" },
];

export default function PurchaseOrders() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-gray-600 mt-1">Manage supplier purchase orders</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Purchase Order
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Order ID</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Supplier</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Items</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Total</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Date</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Status</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Action</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((order, idx) => (
                <tr key={order.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50`}>
                  <td className="py-4 px-6 text-gray-900 font-medium">{order.id}</td>
                  <td className="py-4 px-6 text-gray-900">{order.supplier}</td>
                  <td className="py-4 px-6 text-gray-700">{order.items}</td>
                  <td className="py-4 px-6 text-gray-900 font-medium">{order.total}</td>
                  <td className="py-4 px-6 text-gray-700">{order.date}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      order.status === "Pending" ? "bg-amber-100 text-amber-800" :
                      order.status === "Received" ? "bg-green-100 text-green-800" :
                      "bg-blue-100 text-blue-800"
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <Button variant="outline" size="sm">View</Button>
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
