import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, RotateCcw, Lock, Eye, EyeOff, Copy, Printer, AlertCircle, CheckCircle2, X } from "lucide-react";
import { getUsers, createUser, updateUser, resetPassword, deactivateUser } from "@/shared/api/usersApi";
import type { UserRecord, CreateUserPayload, UpdateUserPayload } from "@/shared/api/usersApi";
import axios from "axios";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastLogin(record: UserRecord): string {
  if (record.password_changed_at && record.password_changed_at !== "0") {
    const d = new Date(record.password_changed_at);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  if (record.must_change_password) return "Never logged in";
  return "—";
}

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

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* silent */ }
}

function printCredentials(username: string, password: string) {
  const w = window.open("", "_blank", "width=400,height=300");
  if (!w) return;
  w.document.write(`<html><body style="font-family:monospace;padding:24px">
    <h3>Isra Hardware POS — Account Credentials</h3>
    <p><b>Username:</b> ${username}</p>
    <p><b>Temporary Password:</b> ${password}</p>
    <p style="color:#888;font-size:12px">Change this password on first login. Keep it confidential.</p>
    <script>window.print();window.close();<\/script>
  </body></html>`);
}

// ─── Temp-password display (shared between Create + Reset modals) ─────────────

interface TempPasswordDisplayProps {
  password: string;
  username: string;
  onDone: () => void;
}

function TempPasswordDisplay({ password, username, onDone }: TempPasswordDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800 font-medium mb-1">
          Save this password — it will not be shown again.
        </p>
        <p className="text-xs text-amber-700">
          The employee must change it on first login.
        </p>
      </div>

      <div>
        <Label className="text-sm font-semibold text-gray-900 mb-1.5 block">
          Temporary Password
        </Label>
        <div className="relative">
          <Input
            readOnly
            type={showPwd ? "text" : "password"}
            value={password}
            className="pr-10 font-mono bg-gray-50 select-all"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={handleCopy}>
          {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy Password"}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-2"
          onClick={() => printCredentials(username, password)}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <Button className="w-full" onClick={onDone}>Done</Button>
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (user: UserRecord) => void;
}

function CreateUserModal({ open, onClose, onCreated }: CreateUserModalProps) {
  const [fullName,    setFullName]    = useState("");
  const [username,    setUsername]    = useState("");
  const [employeeId,  setEmployeeId]  = useState("");
  const [role,        setRole]        = useState<"Cashier" | "Inventory Clerk">("Cashier");
  const [status,      setStatus]      = useState<"Active" | "Inactive">("Active");
  const [isLoading,   setIsLoading]   = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState("");

  const reset = () => {
    setFullName(""); setUsername(""); setEmployeeId("");
    setRole("Cashier"); setStatus("Active");
    setErrors({}); setTempPassword(null); setCreatedUsername("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const payload: CreateUserPayload = {
      full_name: fullName.trim(), username: username.trim(),
      role, status,
      ...(employeeId.trim() ? { employee_id: employeeId.trim() } : {}),
    };
    setIsLoading(true);
    try {
      const data = await createUser(payload);
      setTempPassword(data.tempPassword);
      setCreatedUsername(data.user.username);
      onCreated(data.user);
    } catch (err) {
      setErrors(extractErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tempPassword ? "Account Created" : "Add New User"}</DialogTitle>
        </DialogHeader>

        {tempPassword ? (
          <TempPasswordDisplay password={tempPassword} username={createdUsername} onDone={handleClose} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.general && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{errors.general}</p>
              </div>
            )}

            <div>
              <Label htmlFor="cu-fullname" className="mb-1.5 block font-semibold">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input id="cu-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Juan dela Cruz" disabled={isLoading}
                className={errors.full_name ? "border-red-400" : ""} />
              {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name}</p>}
            </div>

            <div>
              <Label htmlFor="cu-username" className="mb-1.5 block font-semibold">
                Username <span className="text-red-500">*</span>
              </Label>
              <Input id="cu-username" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. juan.cruz" disabled={isLoading}
                className={errors.username ? "border-red-400" : ""} />
              {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
            </div>

            <div>
              <Label htmlFor="cu-empid" className="mb-1.5 block font-semibold">
                Employee ID <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input id="cu-empid" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. EMP-001" disabled={isLoading} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block font-semibold">Role <span className="text-red-500">*</span></Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)} disabled={isLoading}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cashier">Cashier</SelectItem>
                    <SelectItem value="Inventory Clerk">Inventory Clerk</SelectItem>
                  </SelectContent>
                </Select>
                {errors.role && <p className="mt-1 text-xs text-red-600">{errors.role}</p>}
              </div>
              <div>
                <Label className="mb-1.5 block font-semibold">Status <span className="text-red-500">*</span></Label>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)} disabled={isLoading}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-xs text-blue-700">
                A secure temporary password will be generated automatically. The employee must change it on first login.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />}
                {isLoading ? "Creating…" : "Save User"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: UserRecord | null;
  onClose: () => void;
  onUpdated: (user: UserRecord) => void;
}

function EditUserModal({ user, onClose, onUpdated }: EditUserModalProps) {
  const [fullName,  setFullName]  = useState(user?.full_name  ?? "");
  const [employeeId,setEmployeeId]= useState(user?.employee_id ?? "");
  const [role,      setRole]      = useState<"Cashier" | "Inventory Clerk">(
    (user?.role === "Cashier" || user?.role === "Inventory Clerk") ? user.role : "Cashier"
  );
  const [status,    setStatus]    = useState<"Active" | "Inactive">(user?.status ?? "Active");
  const [isLoading, setIsLoading] = useState(false);
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setEmployeeId(user.employee_id ?? "");
      setRole((user.role === "Cashier" || user.role === "Inventory Clerk") ? user.role : "Cashier");
      setStatus(user.status);
      setErrors({});
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrors({});
    const payload: UpdateUserPayload = {
      full_name: fullName.trim() || undefined,
      role, status,
      ...(employeeId.trim() ? { employee_id: employeeId.trim() } : {}),
    };
    setIsLoading(true);
    try {
      const updated = await updateUser(user.id, payload);
      onUpdated(updated);
      onClose();
    } catch (err) {
      setErrors(extractErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{errors.general}</p>
            </div>
          )}
          <div>
            <Label className="mb-1.5 block font-semibold">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading} className={errors.full_name ? "border-red-400" : ""} />
            {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name}</p>}
          </div>
          <div>
            <Label className="mb-1.5 block font-semibold">Employee ID <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={isLoading} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block font-semibold">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)} disabled={isLoading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cashier">Cashier</SelectItem>
                  <SelectItem value="Inventory Clerk">Inventory Clerk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block font-semibold">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)} disabled={isLoading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />}
              {isLoading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

interface ResetPasswordModalProps {
  user: UserRecord | null;
  onClose: () => void;
}

function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [step,        setStep]        = useState<"confirm" | "done">("confirm");
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [tempPassword,setTempPassword]= useState<string>("");

  useEffect(() => { if (user) { setStep("confirm"); setError(null); setTempPassword(""); } }, [user]);

  const handleConfirm = async () => {
    if (!user) return;
    setError(null);
    setIsLoading(true);
    try {
      const data = await resetPassword(user.id);
      setTempPassword(data.tempPassword);
      setStep("done");
    } catch (err) {
      const errs = extractErrors(err);
      setError(errs.general ?? "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "confirm" ? "Reset Password" : "Password Reset Successful"}
          </DialogTitle>
        </DialogHeader>

        {step === "confirm" ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Reset password for <span className="font-semibold">{user.full_name}</span>{" "}
              (<span className="font-mono text-gray-600">{user.username}</span>)?
            </p>
            <p className="text-sm text-gray-600">
              A new temporary password will be generated. The employee must change it on next login.
            </p>
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
              <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
                {isLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />}
                {isLoading ? "Resetting…" : "Reset Password"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <TempPasswordDisplay password={tempPassword} username={user.username} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Deactivate Confirmation Dialog ──────────────────────────────────────────

interface DeactivateDialogProps {
  user: UserRecord | null;
  onClose: () => void;
  onDeactivated: (user: UserRecord) => void;
}

function DeactivateDialog({ user, onClose, onDeactivated }: DeactivateDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => { if (user) setError(null); }, [user]);

  const handleConfirm = async () => {
    if (!user) return;
    setError(null);
    setIsLoading(true);
    try {
      const updated = await deactivateUser(user.id);
      onDeactivated(updated);
      onClose();
    } catch (err) {
      const errs = extractErrors(err);
      setError(errs.general ?? "Failed to deactivate account.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate Account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will deactivate{" "}
            <span className="font-semibold text-gray-900">{user?.full_name}</span>'s account.
            They will no longer be able to log in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {isLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2 inline-block" />}
            {isLoading ? "Deactivating…" : "Deactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Users Page ──────────────────────────────────────────────────────────

export default function Users() {
  const [users,       setUsers]       = useState<UserRecord[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  // Modal / dialog state
  const [showCreate,       setShowCreate]       = useState(false);
  const [editTarget,       setEditTarget]       = useState<UserRecord | null>(null);
  const [resetTarget,      setResetTarget]      = useState<UserRecord | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRecord | null>(null);

  // ─── Load users ─────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      const errs = extractErrors(err);
      setLoadError(errs.general ?? "Failed to load users.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ─── Callbacks ──────────────────────────────────────────────────────────────
  const handleCreated = (newUser: UserRecord) => {
    setUsers((prev) => [...prev, newUser]);
  };

  const handleUpdated = (updated: UserRecord) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const handleDeactivated = (updated: UserRecord) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 mt-1">Manage employee accounts and permissions</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Load error banner */}
      {loadError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 font-medium">Failed to load users</p>
            <p className="text-sm text-red-600 mt-0.5">{loadError}</p>
          </div>
          <button onClick={loadUsers} className="text-red-600 hover:text-red-800 text-sm font-medium">
            Retry
          </button>
          <button onClick={() => setLoadError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Name</th>
                <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Username</th>
                <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Role</th>
                <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Last Login</th>
                <th className="text-center py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <span className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                      <span className="text-sm">Loading users…</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                        <Plus className="h-7 w-7 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-700">No users found</p>
                        <p className="text-xs text-gray-400 mt-1">Click Add User to create the first account</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-gray-900">{user.full_name}</p>
                      {user.must_change_password === true && (
                        <span className="inline-block px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded mt-0.5">
                          Temp pwd
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        {user.username}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-xs font-medium text-gray-600 bg-slate-100 px-2 py-1 rounded-full">
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        user.status === "Active"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-gray-500">{formatLastLogin(user)}</td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="Edit user"
                          onClick={() => setEditTarget(user)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          title="Reset password"
                          onClick={() => setResetTarget(user)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        {user.status === "Active" && (
                          <button
                            title="Deactivate account"
                            onClick={() => setDeactivateTarget(user)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Lock className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && users.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-400">Isra Hardware POS</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
      <EditUserModal
        user={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={handleUpdated}
      />
      <ResetPasswordModal
        user={resetTarget}
        onClose={() => setResetTarget(null)}
      />
      <DeactivateDialog
        user={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onDeactivated={handleDeactivated}
      />
    </div>
  );
}
