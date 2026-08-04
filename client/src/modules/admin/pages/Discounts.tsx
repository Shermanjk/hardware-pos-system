import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import axios from "axios";

interface Discount {
  id: number;
  discount_name: string;
  discount_type: string;
  value: number;
  status: string;
  requires_admin_approval: boolean;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string | null;
}

export default function Discounts() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    discount_name: "",
    discount_type: "Percentage",
    value: 0,
    requires_admin_approval: false,
    status: "Active",
  });

  const loadDiscounts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get("/api/discounts");
      setDiscounts(response.data);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to load discounts" : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDiscounts();
  }, []);

  const handleCreate = async () => {
    try {
      await axios.post("/api/discounts", formData);
      setIsCreateDialogOpen(false);
      setFormData({ discount_name: "", discount_type: "Percentage", value: 0, requires_admin_approval: false, status: "Active" });
      loadDiscounts();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to create discount" : "An error occurred");
    }
  };

  const handleUpdate = async () => {
    if (!selectedDiscount) return;
    try {
      await axios.patch(`/api/discounts/${selectedDiscount.id}`, formData);
      setIsEditDialogOpen(false);
      setSelectedDiscount(null);
      setFormData({ discount_name: "", discount_type: "Percentage", value: 0, requires_admin_approval: false, status: "Active" });
      loadDiscounts();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to update discount" : "An error occurred");
    }
  };

  const handleDelete = async () => {
    if (!selectedDiscount) return;
    try {
      await axios.delete(`/api/discounts/${selectedDiscount.id}`);
      setIsDeleteDialogOpen(false);
      setSelectedDiscount(null);
      loadDiscounts();
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? "Failed to delete discount" : "An error occurred");
    }
  };

  const openEditDialog = (discount: Discount) => {
    setSelectedDiscount(discount);
    setFormData({
      discount_name: discount.discount_name,
      discount_type: discount.discount_type,
      value: discount.value,
      requires_admin_approval: discount.requires_admin_approval,
      status: discount.status,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (discount: Discount) => {
    setSelectedDiscount(discount);
    setIsDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage percentage discount types</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDiscounts} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Discount
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Discounts Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Type</th>
                <th className="text-right py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Value</th>
                <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Requires Approval</th>
                <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr><td colSpan={6} className="py-20 text-center text-gray-400">Loading discounts...</td></tr>
              ) : discounts.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-gray-400">No discounts found</td></tr>
              ) : (
                discounts.map((discount) => (
                  <tr key={discount.id} className="hover:bg-gray-50">
                    <td className="py-3.5 px-5 font-medium text-gray-900">{discount.discount_name}</td>
                    <td className="py-3.5 px-5 text-gray-600">{discount.discount_type}</td>
                    <td className="py-3.5 px-5 text-right font-semibold text-gray-900">{discount.value}%</td>
                    <td className="py-3.5 px-5 text-center">
                      {discount.requires_admin_approval ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Yes</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">No</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      {discount.status === "Active" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">Inactive</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditDialog(discount)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openDeleteDialog(discount)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Create New Discount</DialogTitle>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Name</Label>
              <Input
                value={formData.discount_name}
                onChange={(e) => setFormData({ ...formData, discount_name: e.target.value })}
                placeholder="e.g., Contractor 10%, VIP 15%"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Type</Label>
              <Select value={formData.discount_type} onValueChange={(v) => setFormData({ ...formData, discount_type: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Percentage">Percentage</SelectItem>
                  <SelectItem value="Fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Value ({formData.discount_type === "Percentage" ? "%" : "₱"})</Label>
              <Input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                placeholder={formData.discount_type === "Percentage" ? "10" : "100"}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-700">Requires Admin Approval</Label>
              <Switch
                checked={formData.requires_admin_approval}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_admin_approval: checked })}
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleCreate} className="flex-1">Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit Discount</DialogTitle>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Name</Label>
              <Input
                value={formData.discount_name}
                onChange={(e) => setFormData({ ...formData, discount_name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Discount Type</Label>
              <Select value={formData.discount_type} onValueChange={(v) => setFormData({ ...formData, discount_type: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Percentage">Percentage</SelectItem>
                  <SelectItem value="Fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Value ({formData.discount_type === "Percentage" ? "%" : "₱"})</Label>
              <Input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-700">Requires Admin Approval</Label>
              <Switch
                checked={formData.requires_admin_approval}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_admin_approval: checked })}
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-700">Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleUpdate} className="flex-1">Update</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Delete Discount</DialogTitle>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <strong>{selectedDiscount?.discount_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleDelete} variant="destructive" className="flex-1">Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
