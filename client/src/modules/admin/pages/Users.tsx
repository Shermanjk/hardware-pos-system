import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, RotateCcw, Lock } from "lucide-react";

const users = [
  { id: 1, name: "John Admin", username: "john.admin", role: "Administrator", status: "Active", lastLogin: "2 mins ago" },
  { id: 2, name: "Sarah Manager", username: "sarah.mgr", role: "Manager", status: "Active", lastLogin: "1 hour ago" },
  { id: 3, name: "Mike Cashier", username: "mike.cashier", role: "Cashier", status: "Active", lastLogin: "3 hours ago" },
  { id: 4, name: "Lisa Inventory", username: "lisa.inv", role: "Inventory Staff", status: "Active", lastLogin: "5 hours ago" },
  { id: 5, name: "Tom Supervisor", username: "tom.sup", role: "Supervisor", status: "Inactive", lastLogin: "2 days ago" },
];

export default function Users() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 mt-1">Manage system users and permissions</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Users Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Name</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Username</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Role</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Status</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Last Login</th>
                <th className="text-left py-4 px-6 font-semibold text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, idx) => (
                <tr key={user.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50`}>
                  <td className="py-4 px-6 text-gray-900 font-medium">{user.name}</td>
                  <td className="py-4 px-6 text-gray-700">{user.username}</td>
                  <td className="py-4 px-6 text-gray-700">{user.role}</td>
                  <td className="py-4 px-6">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      user.status === "Active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-700">{user.lastLogin}</td>
                  <td className="py-4 px-6">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600">
                        <Lock className="h-4 w-4" />
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
