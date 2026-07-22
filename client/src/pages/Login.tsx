import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, AlertCircle, X } from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import axios from "axios";

export default function Login() {
  const { login } = useAuth();

  const images = ["/store-image-1.png", "/store-image-2.png", "/store-image-3.png"];
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) setCurrentImage((prev) => (prev + 1) % images.length);
    else setCurrentImage((prev) => (prev - 1 + images.length) % images.length);
  };

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
    <div className="min-h-screen flex relative">
      <button
        onClick={() => window.close()}
        className="absolute top-4 right-4 z-50 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Close application"
      >
        <X className="h-5 w-5" />
      </button>
      {/* Left — slideshow */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 p-10">
        <div
          className="relative w-full h-full max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10"
          onWheel={handleWheel}
        >
          {images.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={`Store ${i + 1}`}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
              style={{ opacity: currentImage === i ? 1 : 0 }}
            />
          ))}
          {/* Subtle vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          {/* Dot indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImage(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentImage === i ? "bg-white w-6" : "bg-white/40 w-2"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-blue-50">
        <Card className="w-full max-w-md p-8 shadow-2xl border border-gray-100 bg-white/90 backdrop-blur-sm rounded-2xl">

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-lg mb-4">
              <span className="text-white font-bold text-2xl">IH</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">Welcome back</h1>
            <p className="text-gray-400 text-sm mt-1">Sign in to Isra Hardware POS</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" noValidate>

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
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
              <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-1.5">
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
                className={`h-11 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${
                  fieldErrors.username ? "border-red-400 focus:border-red-400" : ""
                }`}
                autoComplete="username"
                disabled={isLoading}
              />
              {fieldErrors.username && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.username}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
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
                  className={`h-11 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 pr-10 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${
                    fieldErrors.password ? "border-red-400 focus:border-red-400" : ""
                  }`}
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                disabled={isLoading}
                className="border-gray-300"
              />
              <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer">
                Remember me <span className="text-gray-400">(30 days)</span>
              </label>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-60"
            >
              {isLoading && (
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />
              )}
              {isLoading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">© 2024 Isra Hardware. All rights reserved.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
