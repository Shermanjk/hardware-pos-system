import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Minus, LogOut, Clock, User, DollarSign, Percent, Receipt, X } from "lucide-react";

interface CartItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export default function Cashier() {
  const [cartItems, setCartItems] = useState<CartItem[]>([
    { id: 1, name: "Hammer - 16oz", quantity: 2, unitPrice: 15.99, subtotal: 31.98 },
    { id: 2, name: "Nails - 2 inch", quantity: 3, unitPrice: 0.35, subtotal: 1.05 },
    { id: 3, name: "Drill Bit Set", quantity: 1, unitPrice: 24.99, subtotal: 24.99 },
  ]);

  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");

  const subtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = discountType === "percent" ? (subtotal * discount) / 100 : discount;
  const taxRate = 0.08;
  const taxAmount = (subtotal - discountAmount) * taxRate;
  const total = subtotal - discountAmount + taxAmount;

  const updateQuantity = (id: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(id);
      return;
    }
    setCartItems(
      cartItems.map((item) =>
        item.id === id
          ? { ...item, quantity: newQuantity, subtotal: newQuantity * item.unitPrice }
          : item
      )
    );
  };

  const removeItem = (id: number) => {
    setCartItems(cartItems.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const getCurrentTime = () => {
    const now = new Date();
    return now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">HW</span>
            </div>
            <h1 className="text-xl font-display font-bold text-gray-900">POS Terminal</h1>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="h-4 w-4" />
              <span>{getCurrentTime()}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4" />
              <span>Cashier: John Doe</span>
            </div>
          </div>
        </div>
        <Button variant="outline" className="gap-2">
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 p-8">
        {/* Left Section - Product Entry & Cart */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Barcode Input */}
          <Card className="p-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">Barcode Scanner / Product Search</label>
            <Input
              placeholder="Scan barcode or type product name..."
              className="h-12 text-lg bg-gray-50 border-2 border-gray-200 focus:border-blue-500"
              autoFocus
            />
          </Card>

          {/* Shopping Cart */}
          <Card className="flex-1 p-6 flex flex-col">
            <h2 className="text-lg font-display font-bold text-gray-900 mb-4">Shopping Cart</h2>
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-2">
                {cartItems.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-500">
                    <p>Cart is empty</p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 pb-3 px-3 border-b-2 border-gray-200 text-xs font-semibold text-gray-600">
                      <div className="col-span-4">Product</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-2 text-right">Price</div>
                      <div className="col-span-3 text-right">Subtotal</div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* Items */}
                    {cartItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-4 py-3 px-3 bg-white hover:bg-gray-50 rounded-lg items-center border border-gray-100">
                        <div className="col-span-4">
                          <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        </div>
                        <div className="col-span-2 flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="col-span-2 text-right text-sm text-gray-700">
                          ₱{item.unitPrice.toFixed(2)}
                        </div>
                        <div className="col-span-3 text-right text-sm font-semibold text-gray-900">
                          ₱{item.subtotal.toFixed(2)}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            onClick={() => removeItem(item.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Actions */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex gap-3">
              <Button variant="outline" className="flex-1 gap-2">
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
              <Button variant="outline" className="flex-1 gap-2 text-red-600" onClick={clearCart}>
                <Trash2 className="h-4 w-4" />
                Clear Cart
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Section - Order Summary & Payment */}
        <div className="w-96 flex flex-col gap-6">
          {/* Order Summary */}
          <Card className="p-6">
            <h2 className="text-lg font-display font-bold text-gray-900 mb-6">Order Summary</h2>
            <div className="space-y-4">
              {/* Subtotal */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <span className="text-gray-700">Subtotal</span>
                <span className="text-lg font-semibold text-gray-900">₱{subtotal.toFixed(2)}</span>
              </div>

              {/* Discount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Discount</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-sm text-right"
                      placeholder="0"
                    />
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}
                      className="h-8 px-2 text-sm border border-gray-200 rounded"
                    >
                      <option value="fixed">₱</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div className="text-right text-sm text-red-600 font-medium">
                    -₱{discountAmount.toFixed(2)}
                  </div>
                )}
              </div>

              {/* Tax */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <span className="text-gray-700">Tax (8%)</span>
                <span className="text-lg font-semibold text-gray-900">₱{taxAmount.toFixed(2)}</span>
              </div>

              {/* Grand Total */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border-2 border-blue-200">
                <p className="text-sm text-gray-600 mb-1">Grand Total</p>
                <p className="text-4xl font-display font-bold text-blue-600">₱{total.toFixed(2)}</p>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button className="w-full h-14 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg gap-2">
              <DollarSign className="h-5 w-5" />
              Process Payment
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 gap-2">
                <Receipt className="h-4 w-4" />
                Hold
              </Button>
              <Button variant="outline" className="h-12 gap-2">
                <Receipt className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
