import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { changePassword } from "@/shared/api/usersApi";
import { saveToken, getRedirectPath } from "@/shared/utils/auth";
import axios from "axios";

// ─── Password strength ────────────────────────────────────────────────────────

type Strength = "weak" | "fair" | "strong";

function getPasswordStrength(password: string): Strength {
  if (password.length === 0) return "weak";
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/].filter((re) =>
    re.test(password)
  ).length;
  if (password.length >= 8 && classes === 3) return "strong";
  if (password.length >= 8 && classes === 2) return "fair";
  return "weak";
}

const strengthConfig: Record<Strength, { label: string; color: string; bar: string }> = {
  weak:   { label: "Weak",   color: "text-red-600",    bar: "bg-red-500"    },
  fair:   { label: "Fair",   color: "text-yellow-600", bar: "bg-yellow-500" },
  strong: { label: "Strong", color: "text-green-600",  bar: "bg-green-500"  },
};

const strengthWidth: Record<Strength, string> = {
  weak:   "w-1/3",
  fair:   "w-2/3",
  strong: "w-full",
};

// ─── Field error shape ────────────────────────────────────────────────────────

interface FieldErrors {
  currentPassword?: string;
  newPassword?: string | string[];
  confirmPassword?: string;
  general?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChangePassword() {
  const { user, login: _login } = useAuth();
  const [, setLocation] = useLocation();

  const [currentPassword,  setCurrentPassword]  = useState("");
  const [newPassword,      setNewPassword]       = useState("");
  const [confirmPassword,  setConfirmPassword]   = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isLoading,   setIsLoading]   = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success,     setSuccess]     = useState(false);

  const strength = getPasswordStrength(newPassword);
  const sc = strengthConfig[strength];

  // ─── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;

      setFieldErrors({});

      // Client-side pre-validation before hitting the server
      const errors: FieldErrors = {};
      if (!currentPassword) errors.currentPassword = "Current password is required.";
      if (!newPassword)      errors.newPassword     = "New password is required.";
      if (!confirmPassword)  errors.confirmPassword = "Please confirm your new password.";
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      setIsLoading(true);
      try {
        const data = await changePassword(user.id, {
          currentPassword,
          newPassword,
          confirmPassword,
        });

        // Persist the new full-access token and update context user
        saveToken(data.token);

        // Brief success flash, then redirect to the role dashboard
        setSuccess(true);
        setTimeout(() => {
          // Reload the page so AuthContext re-hydrates from the new token,
          // which will NOT have mustChangePassword, routing to the dashboard.
          window.location.href = getRedirectPath(data.user.role);
        }, 1200);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const body = err.response?.data;
          if (body?.errors && Array.isArray(body.errors)) {
            const fe: FieldErrors = {};
            for (const e of body.errors as { field: string; message: string }[]) {
              if (e.field === "currentPassword") fe.currentPassword = e.message;
              else if (e.field === "newPassword") {
                // Accumulate multiple complexity errors
                if (!fe.newPassword) fe.newPassword = e.message;
                else if (Array.isArray(fe.newPassword)) fe.newPassword.push(e.message);
                else fe.newPassword = [fe.newPassword, e.message];
              } else if (e.field === "confirmPassword") fe.confirmPassword = e.message;
              else fe.general = e.message;
            }
            setFieldErrors(fe);
          } else {
            setFieldErrors({
              general: body?.message ?? "An unexpected error occurred. Please try again.",
            });
          }
        } else {
          setFieldErrors({ general: "Unable to connect to the server. Please try again." });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [user, currentPassword, newPassword, confirmPassword]
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 shadow-xl bg-white">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl">IH</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Isra Hardware POS</h1>
          </div>

          {/* Mandatory-change notice */}
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-left">
            <p className="text-sm font-semibold text-amber-800 mb-1">Welcome!</p>
            <p className="text-sm text-amber-700">
              For security reasons, you must change your temporary password before
              using the POS.
            </p>
          </div>
        </div>

        {/* Success state */}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">
              Password changed successfully! Redirecting…
            </p>
          </div>
        )}

        {/* General error */}
        {fieldErrors.general && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{fieldErrors.general}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Current Password */}
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              Current Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setFieldErrors((p) => ({ ...p, currentPassword: undefined }));
                }}
                placeholder="Enter your temporary password"
                className={`h-11 pr-10 ${
                  fieldErrors.currentPassword ? "border-red-400 focus:border-red-400" : ""
                }`}
                autoComplete="current-password"
                disabled={isLoading || success}
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {fieldErrors.currentPassword && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.currentPassword}</p>
            )}
          </div>

          {/* New Password */}
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setFieldErrors((p) => ({ ...p, newPassword: undefined }));
                }}
                placeholder="Create a strong password"
                className={`h-11 pr-10 ${
                  fieldErrors.newPassword ? "border-red-400 focus:border-red-400" : ""
                }`}
                autoComplete="new-password"
                disabled={isLoading || success}
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            {/* Strength indicator */}
            {newPassword.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${sc.bar} ${strengthWidth[strength]}`}
                  />
                </div>
                <p className={`text-xs font-medium ${sc.color}`}>
                  Strength: {sc.label}
                </p>
              </div>
            )}

            {fieldErrors.newPassword && (
              <div className="mt-1 space-y-0.5">
                {Array.isArray(fieldErrors.newPassword) ? (
                  fieldErrors.newPassword.map((msg, i) => (
                    <p key={i} className="text-xs text-red-600">{msg}</p>
                  ))
                ) : (
                  <p className="text-xs text-red-600">{fieldErrors.newPassword}</p>
                )}
              </div>
            )}

            {/* Requirements hint */}
            <p className="mt-1.5 text-xs text-gray-500">
              Minimum 8 characters · uppercase · lowercase · number
            </p>
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-semibold text-gray-900 mb-1.5"
            >
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
                }}
                placeholder="Re-enter your new password"
                className={`h-11 pr-10 ${
                  fieldErrors.confirmPassword ? "border-red-400 focus:border-red-400" : ""
                }`}
                autoComplete="new-password"
                disabled={isLoading || success}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isLoading || success}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 disabled:opacity-60"
          >
            {isLoading && (
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />
            )}
            {isLoading ? "Changing Password…" : "Change Password"}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} Isra Hardware. All rights reserved.
          </p>
        </div>
      </Card>
    </div>
  );
}
