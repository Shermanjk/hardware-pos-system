import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, ShieldCheck, Boxes } from "lucide-react";
import { useClerkAuth } from "@/shared/contexts/ClerkAuthContext";

type Role = "admin" | "inventory_clerk";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const [rememberMe, setRememberMe] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>("admin");
  const { login: clerkLogin } = useClerkAuth();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole === "inventory_clerk") {
      clerkLogin("clerk01");
      setLocation("/clerk/dashboard");
    } else {
      setLocation("/");
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Side - Illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 to-blue-100 items-center justify-center p-12">
        <img
          src="/manus-storage/hardware_store_login_illustration_c297adc7.png"
          alt="Isra Hardware"
          className="w-full h-full object-cover rounded-2xl shadow-2xl"
        />
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <Card className="w-full max-w-md p-8 shadow-lg">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-white font-display font-bold text-xl">IH</span>
              </div>
              <h1 className="text-2xl font-display font-bold text-gray-900">Isra Hardware POS</h1>
            </div>
            <p className="text-gray-600 text-sm">Point of Sale & Inventory Management System</p>
            <p className="text-gray-500 text-xs mt-2">Version 1.0.0</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Role Selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Login As</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole("admin")}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    selectedRole === "admin"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Administrator
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRole("inventory_clerk")}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    selectedRole === "inventory_clerk"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <Boxes className="h-4 w-4" />
                  Inventory Clerk
                </button>
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Username</label>
              <Input
                type="text"
                placeholder="Enter your username"
                className="h-11 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-500"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className="h-11 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <label htmlFor="remember" className="text-sm text-gray-700 cursor-pointer">
                Remember me
              </label>
            </div>

            {/* Login Button */}
            <Button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {selectedRole === "inventory_clerk" ? "Login as Inventory Clerk" : "Sign In"}
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs font-semibold text-blue-900 mb-2">Demo Credentials:</p>
            <div className="space-y-1">
              <p className="text-xs text-blue-800 font-medium">Administrator</p>
              <p className="text-xs text-blue-700">Username: <span className="font-mono">admin</span> · Password: <span className="font-mono">demo123</span></p>
            </div>
            <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
              <p className="text-xs text-blue-800 font-medium">Inventory Clerk</p>
              <p className="text-xs text-blue-700">Username: <span className="font-mono">clerk01</span> · Password: <span className="font-mono">demo123</span></p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">
              © 2024 Isra Hardware. All rights reserved.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              System Version 1.0.0 | Enterprise Edition
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
