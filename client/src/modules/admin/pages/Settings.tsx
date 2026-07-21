import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { getSettings, updateSettings } from "@/shared/api/settingsApi";
import { changePassword } from "@/shared/api/usersApi";
import { useAuth } from "@/shared/contexts/AuthContext";
import { saveToken } from "@/shared/utils/auth";
import type { StoreSettings } from "@/shared/api/settingsApi";
import axios from "axios";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractErrors(err: unknown): Record<string, string> {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body?.errors && Array.isArray(body.errors)) {
      const map: Record<string, string> = {};
      for (const e of body.errors as { field: string; message: string }[]) {
        map[e.field] = e.message;
      }
      return map;
    }
    if (body?.message) return { general: body.message };
  }
  return { general: "An unexpected error occurred. Please try again." };
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ initial }: { initial: StoreSettings | null }) {
  const [form, setForm] = useState({ store_name: "", store_fb: "", store_phone: "", store_address: "" });
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    if (initial) setForm({
      store_name:    initial.store_name,
      store_fb:      initial.store_fb,
      store_phone:   initial.store_phone,
      store_address: initial.store_address,
    });
  }, [initial]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccess(false);
    setIsLoading(true);
    try {
      await updateSettings({
        store_name:    form.store_name.trim(),
        store_fb:      form.store_fb.trim(),
        store_phone:   form.store_phone.trim(),
        store_address: form.store_address.trim(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setErrors(extractErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-display font-bold text-gray-900 mb-6">General Settings</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{errors.general}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">General settings saved.</p>
          </div>
        )}

        <div>
          <Label className="mb-1.5 block font-semibold">Store Name</Label>
          <Input value={form.store_name} onChange={(e) => set("store_name", e.target.value)}
            placeholder="Isra Hardware" disabled={isLoading}
            className={errors.store_name ? "border-red-400" : ""} />
          {errors.store_name && <p className="mt-1 text-xs text-red-600">{errors.store_name}</p>}
        </div>

        <div>
          <Label className="mb-1.5 block font-semibold">Facebook Page</Label>
          <Input value={form.store_fb} onChange={(e) => set("store_fb", e.target.value)}
            placeholder="e.g. Rexjie Saludo" disabled={isLoading}
            className={errors.store_fb ? "border-red-400" : ""} />
          {errors.store_fb && <p className="mt-1 text-xs text-red-600">{errors.store_fb}</p>}
        </div>

        <div>
          <Label className="mb-1.5 block font-semibold">Store Phone</Label>
          <Input value={form.store_phone} onChange={(e) => set("store_phone", e.target.value)}
            placeholder="+63 912 345 6789" disabled={isLoading}
            className={errors.store_phone ? "border-red-400" : ""} />
          {errors.store_phone && <p className="mt-1 text-xs text-red-600">{errors.store_phone}</p>}
        </div>

        <div>
          <Label className="mb-1.5 block font-semibold">Store Address</Label>
          <Input value={form.store_address} onChange={(e) => set("store_address", e.target.value)}
            placeholder="123 Main Street, City" disabled={isLoading}
            className={errors.store_address ? "border-red-400" : ""} />
          {errors.store_address && <p className="mt-1 text-xs text-red-600">{errors.store_address}</p>}
        </div>

        <Button type="submit" disabled={isLoading} className="mt-2">
          {isLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />}
          {isLoading ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </Card>
  );
}

// ─── Business Tab ─────────────────────────────────────────────────────────────

function BusinessTab({ initial }: { initial: StoreSettings | null }) {
  const [form, setForm] = useState({ business_license: "", pos_min: "", pos_serial: "" });
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    if (initial) setForm({
      business_license: initial.business_license,
      pos_min:          initial.pos_min,
      pos_serial:       initial.pos_serial,
    });
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccess(false);

    setIsLoading(true);
    try {
      await updateSettings({
        business_license: form.business_license.trim(),
        pos_min:          form.pos_min.trim(),
        pos_serial:       form.pos_serial.trim(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setErrors(extractErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-display font-bold text-gray-900 mb-6">Business Settings</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{errors.general}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">Business settings saved.</p>
          </div>
        )}

        <div>
          <Label className="mb-1.5 block font-semibold">Currency</Label>
          <div className="w-40 h-9 flex items-center px-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500 select-none">
            PHP (₱ — fixed)
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block font-semibold">Tax Rate (%)</Label>
          <div className="w-40 h-9 flex items-center px-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500 select-none">
            12% (VAT — fixed)
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block font-semibold">
            Business License <span className="text-gray-400 font-normal">(optional)</span>
          </Label>
          <Input value={form.business_license}
            onChange={(e) => setForm((p) => ({ ...p, business_license: e.target.value }))}
            placeholder="License Number" disabled={isLoading}
            className={errors.business_license ? "border-red-400" : ""} />
          {errors.business_license && <p className="mt-1 text-xs text-red-600">{errors.business_license}</p>}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">BIR POS Machine Registration</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block font-semibold">
                MIN <span className="text-gray-400 font-normal">(Machine Identification No.)</span>
              </Label>
              <Input value={form.pos_min}
                onChange={(e) => setForm((p) => ({ ...p, pos_min: e.target.value }))}
                placeholder="e.g. 000-123456789" disabled={isLoading}
                className={errors.pos_min ? "border-red-400" : ""} />
              {errors.pos_min && <p className="mt-1 text-xs text-red-600">{errors.pos_min}</p>}
            </div>
            <div>
              <Label className="mb-1.5 block font-semibold">
                S/N <span className="text-gray-400 font-normal">(POS Serial Number)</span>
              </Label>
              <Input value={form.pos_serial}
                onChange={(e) => setForm((p) => ({ ...p, pos_serial: e.target.value }))}
                placeholder="e.g. SN-20250001" disabled={isLoading}
                className={errors.pos_serial ? "border-red-400" : ""} />
              {errors.pos_serial && <p className="mt-1 text-xs text-red-600">{errors.pos_serial}</p>}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">These will be printed on every Sales Invoice receipt.</p>
        </div>

        <Button type="submit" disabled={isLoading} className="mt-2">
          {isLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />}
          {isLoading ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </Card>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [errors, setErrors]     = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess]   = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    setForm((p) => ({ ...p, [key]: value }));
    setErrors((p) => ({ ...p, [key]: "" }));
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrors({});
    setSuccess(false);

    const clientErrors: Record<string, string> = {};
    if (!form.currentPassword) clientErrors.currentPassword = "Current password is required.";
    if (!form.newPassword)     clientErrors.newPassword     = "New password is required.";
    if (!form.confirmPassword) clientErrors.confirmPassword = "Please confirm your new password.";
    if (form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword)
      clientErrors.confirmPassword = "Passwords do not match.";
    if (Object.keys(clientErrors).length > 0) { setErrors(clientErrors); return; }

    setIsLoading(true);
    try {
      const data = await changePassword(user.id, {
        currentPassword: form.currentPassword,
        newPassword:     form.newPassword,
        confirmPassword: form.confirmPassword,
      });
      saveToken(data.token);
      setSuccess(true);
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const body = err.response?.data;
        if (body?.errors && Array.isArray(body.errors)) {
          const fe: Record<string, string> = {};
          for (const e of body.errors as { field: string; message: string }[]) {
            fe[e.field] = fe[e.field] ? `${fe[e.field]} ${e.message}` : e.message;
          }
          setErrors(fe);
        } else {
          setErrors({ general: body?.message ?? "An unexpected error occurred. Please try again." });
        }
      } else {
        setErrors({ general: "Unable to connect to the server. Please try again." });
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, form]);

  const pwdField = (
    id: "currentPassword" | "newPassword" | "confirmPassword",
    label: string,
    placeholder: string,
    showKey: "current" | "new" | "confirm"
  ) => (
    <div>
      <Label className="mb-1.5 block font-semibold">
        {label} <span className="text-red-500">*</span>
      </Label>
      <div className="relative">
        <Input
          type={show[showKey] ? "text" : "password"}
          value={form[id]}
          onChange={(e) => set(id, e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          className={`pr-10 ${errors[id] ? "border-red-400" : ""}`}
          autoComplete={id === "currentPassword" ? "current-password" : "new-password"}
        />
        <button type="button" tabIndex={-1}
          onClick={() => setShow((p) => ({ ...p, [showKey]: !p[showKey] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
          {show[showKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {errors[id] && <p className="mt-1 text-xs text-red-600">{errors[id]}</p>}
    </div>
  );

  return (
    <Card className="p-6">
      <h2 className="text-lg font-display font-bold text-gray-900 mb-6">Security Settings</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        {errors.general && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{errors.general}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">Password updated successfully.</p>
          </div>
        )}

        {pwdField("currentPassword", "Current Password", "Enter current password", "current")}
        {pwdField("newPassword",     "New Password",     "Min 8 chars, uppercase, number", "new")}
        {pwdField("confirmPassword", "Confirm Password", "Re-enter new password", "confirm")}

        <p className="text-xs text-gray-400">Minimum 8 characters · uppercase · lowercase · number</p>

        <Button type="submit" disabled={isLoading} className="mt-2">
          {isLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />}
          {isLoading ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </Card>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const [settings,  setSettings]  = useState<StoreSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => setLoadError("Failed to load settings. Please refresh the page."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Configure system preferences and options</p>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="general"  className="space-y-6"><GeneralTab  initial={settings} /></TabsContent>
        <TabsContent value="business" className="space-y-6"><BusinessTab initial={settings} /></TabsContent>
        <TabsContent value="security" className="space-y-6"><SecurityTab /></TabsContent>
      </Tabs>
    </div>
  );
}
