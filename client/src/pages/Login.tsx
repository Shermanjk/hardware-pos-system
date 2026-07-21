import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, AlertCircle, X } from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import axios from "axios";

export default function Login() {
  const { login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [isLoading,    setIsLoading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [fieldErrors,  setFieldErrors]  = useState<{ username?: string; password?: string }>({});

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) errors.username = "Username is required";
    if (!password)        errors.password = "Password is required";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      // Role is determined server-side from the database — no client selection needed
      await login(username.trim(), password, rememberMe);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message =
          err.response?.data?.message ?? "An unexpected error occurred. Please try again.";
        setError(message);
      } else {
        setError("Unable to connect to the server. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left — illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 to-blue-100 items-center justify-center p-12">
        <img
          src="/manus-storage/hardware_store_login_illustration_c297adc7.png"
          alt="Isra Hardware"
          className="w-full h-full object-cover rounded-2xl shadow-2xl"
        />
      </div>

      {/* Right — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <Card className="w-full max-w-md p-8 shadow-lg">

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-lg">
                <span className="text-white font-display font-bold text-xl">IH</span>
              </div>
              <h1 className="text-2xl font-display font-bold text-gray-900">Isra Hardware POS</h1>
            </div>
            <p className="text-gray-600 text-sm">Point of Sale &amp; Inventory Management System</p>
            <p className="text-gray-500 text-xs mt-2">Version 1.0.0</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" noValidate>

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-semibold text-gray-900 mb-2"
              >
                Username
              </label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username)
                    setFieldErrors((p) => ({ ...p, username: undefined }));
                }}
                className={`h-11 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-500 ${
                  fieldErrors.username ? "border-red-400 focus:border-red-400" : ""
                }`}
                autoComplete="username"
                disabled={isLoading}
              />
              {fieldErrors.username && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-gray-900 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  className={`h-11 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-500 pr-10 ${
                    fieldErrors.password ? "border-red-400 focus:border-red-400" : ""
                  }`}
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="h-5 w-5" />
                    : <Eye    className="h-5 w-5" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                disabled={isLoading}
                className="border-gray-400"
              />
              <label htmlFor="remember" className="text-sm text-gray-700 cursor-pointer">
                Remember me{" "}
                <span className="text-gray-400">(stay logged in for 30 days)</span>
              </label>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 disabled:opacity-60"
            >
              {isLoading && (
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />
              )}
              {isLoading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">© 2024 Isra Hardware. All rights reserved.</p>
            <p className="text-xs text-gray-500 mt-1">
              System Version 1.0.0 | Enterprise Edition
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
