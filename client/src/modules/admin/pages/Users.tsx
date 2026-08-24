import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreateUserPayload, UpdateUserPayload, UserRecord } from "@/shared/api/usersApi";
import { createUser, deactivateUser, getUsers, resetPassword, updateUser } from "@/shared/api/usersApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import axios from "axios";
import { AlertCircle, CheckCircle2, Copy, Edit2, Eye, EyeOff, KeyRound, Lock, Plus, Printer, RotateCcw, Search, ShieldOff, Sparkles, UserCog, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_KEY_CREATE_USER = "admin-user-create";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Auto-generates the next sequential Employee ID (e.g. EMP-001, EMP-002, EMP-010).
 * Scans existing users for ID patterns and increments the highest found sequence number.
 * Guarantees that the returned ID is unique among existing users.
 */
export function generateNextEmployeeId(existingUsers: UserRecord[]): string {
  const existingIds = new Set(
    existingUsers
      .map((u) => u.employee_id?.trim().toUpperCase())
      .filter((id): id is string => Boolean(id))
  );

  let maxSeq = 0;
  for (const id of Array.from(existingIds)) {
    // Match patterns like EMP-001, EMP001, E-001, or purely numeric 001
    const match = id.match(/^(?:EMP-?|E-?)?(\d+)$/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  let nextSeq = maxSeq + 1;
  let candidate = `EMP-${String(nextSeq).padStart(3, "0")}`;

  while (existingIds.has(candidate)) {
    nextSeq++;
    candidate = `EMP-${String(nextSeq).padStart(3, "0")}`;
  }

  return candidate;
}

function formatLastLogin(record: UserRecord): string {
  if (record.password_changed_at && record.password_changed_at !== "0") {
    const d = new Date(record.password_changed_at);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  if (record.must_change_password) return "Never logged in";
  return "Active";
}

function extractErrors(err: unknown): Record<string, string> {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (Array.isArray(body?.errors)) {
      const map: Record<string, string> = {};
      for (const e of body.errors) {
        map[e.field] = e.message;
      }
      return map;
    }
    if (body?.message) return { general: body.message };
  }
  return { general: "An unexpected error occurred. Please try again." };
}

async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Modern clipboard API (HTTPS or localhost)
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Password copied to clipboard!");
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // 2. Universal fallback for plain HTTP / LAN connections (e.g. http://noob:3001)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    if (success) {
      toast.success("Password copied to clipboard!");
      return true;
    }
  } catch {
    // silent
  }

  toast.info("Please select and copy the password manually.");
  return false;
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCopy = async () => {
    const ok = await copyToClipboard(password);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSelect = () => {
    inputRef.current?.select();
  };

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-amber-800 font-medium">Save this password — it will not be shown again.</p>
          <p className="text-xs text-amber-700 mt-0.5">The employee must change it on first login.</p>
        </div>
      </div>

      <div>
        <Label className="text-sm font-semibold text-gray-900 mb-1.5 block">Temporary Password</Label>
        <div className="relative">
          <Input
            ref={inputRef}
            readOnly
            type={showPwd ? "text" : "password"}
            value={password}
            onClick={handleSelect}
            onFocus={handleSelect}
            className="pr-10 text-lg font-mono bg-gray-50 select-all tracking-widest cursor-pointer"
            title="Click to select all"
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

      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 -mx-6 -mb-5 mt-2">
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (user: UserRecord) => void;
  existingUsers?: UserRecord[];
}

function CreateUserModal({ open, onClose, onCreated }: CreateUserModalProps) {
  const [fullName,    setFullName]    = useState("");
  const [username,    setUsername]    = useState("");
  const [role,        setRole]        = useState<"Cashier" | "Inventory Clerk">("Cashier");
  const [status,      setStatus]      = useState<"Active" | "Inactive">("Active");
  const [isLoading,   setIsLoading]   = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState("");

  // ── Draft recovery ────────────────────────────────────────────────────────
  interface UserCreateDraft { fullName: string; username: string; role: string; status: string; savedAt: string; }
  const userDraft = useDraftRecovery<UserCreateDraft>(DRAFT_KEY_CREATE_USER);
  const [recoverableDraft, setRecoverableDraft] = useState<UserCreateDraft | null>(null);

  useEffect(() => {
    if (!open) return;
    const draft = userDraft.getRecoverableDraft();
    if (draft?.fullName || draft?.username) {
      setFullName(draft.fullName || "");
      setUsername(draft.username || "");
      setRole((draft.role as any) || "Cashier");
      setStatus((draft.status as any) || "Active");
      setRecoverableDraft(draft);
    }
    setErrors({}); setTempPassword(null); setCreatedUsername("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-save draft
  useEffect(() => {
    if (!open) return;
    if (fullName || username) {
      userDraft.saveDraft({ fullName, username, role, status, savedAt: new Date().toISOString() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fullName, username, role, status]);

  const reset = () => {
    setFullName(""); setUsername("");
    setRole("Cashier"); setStatus("Active");
    setErrors({}); setTempPassword(null); setCreatedUsername("");
    userDraft.discardDraft();
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const payload: CreateUserPayload = {
      full_name: fullName.trim(),
      username: username.trim(),
      role,
      status,
    };
    setIsLoading(true);
    try {
      const data = await createUser(payload);
      // ── Clear draft — user committed to DB ────────────────────────────────
      userDraft.commitDraft();
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
    <>
      <DraftRecoveryPrompt
        draft={recoverableDraft}
        formLabel="Add New User"
        savedSummary={
          recoverableDraft
            ? `${recoverableDraft.fullName || ""}${recoverableDraft.username ? ` · @${recoverableDraft.username}` : ""}${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
            : undefined
        }
        onRestore={() => setRecoverableDraft(null)}
        onDiscard={() => {
          userDraft.discardDraft();
          setFullName(""); setUsername("");
          setRole("Cashier"); setStatus("Active");
          setRecoverableDraft(null);
        }}
      />
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">{tempPassword ? "Account Created" : "Add New User"}</DialogTitle>

        {/* Colored header */}
        <div className={`flex items-center gap-3 px-6 py-4 rounded-t-lg ${tempPassword ? "bg-emerald-400" : "bg-blue-400"}`}>
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            {tempPassword
              ? <CheckCircle2 className="h-5 w-5 text-white" />
              : <UserPlus className="h-5 w-5 text-white" />
            }
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              {tempPassword ? "Account Created" : "Add New User"}
            </h2>
            <p className={`text-xs mt-0.5 ${tempPassword ? "text-emerald-100" : "text-blue-100"}`}>
              {tempPassword ? "Share credentials with the employee" : "Create a new employee account"}
            </p>
          </div>
        </div>

        {tempPassword ? (
          <TempPasswordDisplay password={tempPassword} username={createdUsername} onDone={handleClose} />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-4">
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
                  Employee ID (e.g. <strong>EMP-001</strong>) and a secure temporary password will be generated automatically.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>Cancel</Button>
              <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                {isLoading && <LoadingSpinner size={16} className="mr-2 text-white" />}
                {isLoading ? "Creating…" : "Save User"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: UserRecord | null;
  onClose: () => void;
  onUpdated: (user: UserRecord) => void;
  existingUsers?: UserRecord[];
}

function EditUserModal({ user, onClose, onUpdated }: EditUserModalProps) {
  const [fullName,  setFullName]  = useState(user?.full_name  ?? "");
  const [role,      setRole]      = useState<"Cashier" | "Inventory Clerk">(
    (user?.role === "Cashier" || user?.role === "Inventory Clerk") ? user.role : "Cashier"
  );
  const [status,    setStatus]    = useState<"Active" | "Inactive">(user?.status ?? "Active");
  const [isLoading, setIsLoading] = useState(false);
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
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
      role,
      status,
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
      <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Edit User</DialogTitle>
        {/* Dark header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-slate-700 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <UserCog className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Edit User</h2>
            <p className="text-xs text-slate-200 mt-0.5">
              @{user?.username} {user?.employee_id ? `· ${user.employee_id}` : ""}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            {errors.general && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{errors.general}</p>
              </div>
            )}
            <div>
              <Label className="mb-1.5 block font-semibold">Full Name <span className="text-red-500">*</span></Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
                disabled={isLoading} className={errors.full_name ? "border-red-400" : ""} />
              {errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name}</p>}
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
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading && <LoadingSpinner size={16} className="mr-2 text-white" />}
              {isLoading ? "Saving…" : "Save Changes"}
            </Button>
          </div>
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
      <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">{step === "confirm" ? "Reset Password" : "Password Reset Successful"}</DialogTitle>

        {/* Colored header */}
        <div className={`flex items-center gap-3 px-6 py-4 rounded-t-lg ${step === "done" ? "bg-emerald-400" : "bg-amber-400"}`}>
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            {step === "done"
              ? <CheckCircle2 className="h-5 w-5 text-white" />
              : <KeyRound className="h-5 w-5 text-white" />
            }
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              {step === "done" ? "Password Reset" : "Reset Password"}
            </h2>
            <p className={`text-xs mt-0.5 ${step === "done" ? "text-emerald-100" : "text-amber-100"}`}>
              {step === "done" ? "Share credentials with the employee" : "A new temporary password will be generated"}
            </p>
          </div>
        </div>

        {step === "confirm" ? (
          <>
            <div className="px-6 py-5 space-y-4">
              {/* User info card */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                <p className="font-semibold text-gray-900">{user.full_name}</p>
                <p className="font-mono text-xs text-gray-500 mt-0.5">{user.username}</p>
              </div>
              <p className="text-sm text-gray-600">
                A new temporary password will be generated. The employee must change it on next login.
              </p>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
              <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
                {isLoading && <LoadingSpinner size={16} className="mr-2 text-white" />}
                {isLoading ? "Resetting…" : "Reset Password"}
              </Button>
            </div>
          </>
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
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Deactivate Account</DialogTitle>
        {/* Red header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-400 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <ShieldOff className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Deactivate Account</h2>
            <p className="text-xs text-red-100 mt-0.5">This action will prevent the user from logging in</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* User info card */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <p className="font-semibold text-gray-900">{user?.full_name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{user?.role} · <span className="font-mono">{user?.username}</span></p>
          </div>
          <p className="text-sm text-gray-700">
            Are you sure you want to deactivate this account? The user will no longer be able to log in.
          </p>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {isLoading && <LoadingSpinner size={16} className="text-white" />}
            {isLoading ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Users Page ──────────────────────────────────────────────────────────

export default function Users() {
  const [users,       setUsers]       = useState<UserRecord[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("all");

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

      {/* Search & Filters */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-4.5">
        <div className="flex flex-wrap gap-3.5 items-center">
          <div className="flex-1 min-w-56 flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-xs">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user by name, username, or employee ID…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400 text-slate-800 font-medium"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48 bg-white border-slate-300 hover:border-slate-400 text-slate-800 h-10 shadow-xs">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Cashier">Cashier</SelectItem>
              <SelectItem value="Inventory Clerk">Inventory Clerk</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Employee Name</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Username</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Assigned Role</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Account Status</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Last Activity</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-16" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-28" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))
              ) : users.filter((u) => {
                  const matchSearch = !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()) || (u.employee_id && u.employee_id.toLowerCase().includes(search.toLowerCase()));
                  const matchRole = roleFilter === "all" || u.role === roleFilter;
                  return matchSearch && matchRole;
                }).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <Plus className="h-7 w-7 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">No users found</p>
                        <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or role filters</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                users
                  .filter((u) => {
                    const matchSearch = !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()) || (u.employee_id && u.employee_id.toLowerCase().includes(search.toLowerCase()));
                    const matchRole = roleFilter === "all" || u.role === roleFilter;
                    return matchSearch && matchRole;
                  })
                  .map((user) => (
                  <tr key={user.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{user.full_name}</p>
                        {user.employee_id && (
                          <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-1.5 py-0.5 rounded">
                            {user.employee_id}
                          </span>
                        )}
                      </div>
                      {user.must_change_password === true && (
                        <span className="inline-block px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-800 rounded border border-amber-200 mt-0.5">
                          Temp Password
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                        {user.username}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200/60 px-2.5 py-1 rounded-md">
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        user.status === "Active"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-slate-500 font-medium">{formatLastLogin(user)}</td>
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
        existingUsers={users}
      />
      <EditUserModal
        user={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={handleUpdated}
        existingUsers={users}
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
