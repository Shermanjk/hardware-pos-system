import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreSettings } from "@/shared/api/settingsApi";
import { getSettings, updateSettings } from "@/shared/api/settingsApi";
import { changePassword } from "@/shared/api/usersApi";
import { useAuth } from "@/shared/contexts/AuthContext";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { saveToken } from "@/shared/utils/auth";
import axios from "axios";
import { webSerialPrinter, type SerialPrinterState } from "@/shared/services/escpos/webSerialPrinter";
import { AlertCircle, Check, CheckCircle2, DollarSign, Eye, EyeOff, Pencil, Printer, RefreshCw, X, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import BackupSettings from "./BackupSettings";
import SystemUpdate from "./SystemUpdate";

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

// ─── Inline editable field ────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string;
  fieldKey: string;
  savedValue: string;
  placeholder?: string;
  onSave: (key: string, value: string) => Promise<void>;
}

function EditableField({ label, fieldKey, savedValue, placeholder, onSave }: EditableFieldProps) {
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState(savedValue);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);

  // Keep draft in sync when parent reloads saved value
  useEffect(() => { if (!editing) setDraft(savedValue); }, [savedValue, editing]);

  const handleEdit = () => { setDraft(savedValue); setError(null); setEditing(true); };

  const handleCancel = () => { setDraft(savedValue); setError(null); setEditing(false); };

  const handleSave = async () => {
    const trimmed = draft.trim();
    setLoading(true);
    setError(null);
    try {
      await onSave(fieldKey, trimmed);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const errs = extractErrors(err);
      setError(errs[fieldKey] ?? errs.general ?? "Failed to save.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Label className="mb-1.5 block font-semibold text-sm">{label}</Label>
      {editing ? (
        <div className="flex gap-2 items-center">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
            placeholder={placeholder}
            disabled={loading}
            autoFocus
            className={`h-9 text-sm flex-1 ${error ? "border-red-400" : ""}`}
          />
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 shrink-0"
          >
            {loading
              ? <LoadingSpinner size={14} className="text-white" />
              : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 hover:bg-gray-100 text-gray-600 disabled:opacity-50 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 group">
          <div className="flex-1 h-9 px-3 flex items-center rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-800 truncate">
            {savedValue || <span className="text-gray-400 italic">{placeholder ?? "Not set"}</span>}
          </div>
          <button
            onClick={handleEdit}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 hover:bg-blue-50 hover:border-blue-300 text-gray-400 hover:text-blue-600 transition-colors shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {saved && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ initial, onSettingsChange }: { initial: StoreSettings | null; onSettingsChange: (s: StoreSettings) => void }) {
  const [saved, setSaved] = useState<Record<string, string>>({
    store_name: "", facebook: "", contact_number: "", address: "",
  });

  useEffect(() => {
    if (initial) setSaved({
      store_name:    initial.store_name    ?? "",
      facebook:      initial.facebook      ?? "",
      contact_number: initial.contact_number ?? "",
      address:       initial.address       ?? "",
    });
  }, [initial]);

  const handleSave = async (key: string, value: string) => {
    const updated = await updateSettings({ [key]: value });
    setSaved((p) => ({ ...p, [key]: value }));
    onSettingsChange(updated);
  };

  const fields: { key: string; label: string; placeholder: string }[] = [
    { key: "store_name",    label: "Store Name",    placeholder: "e.g. Isra Hardware" },
    { key: "facebook",      label: "Facebook Page", placeholder: "e.g. Isra Hardware Page" },
    { key: "contact_number", label: "Store Phone",   placeholder: "+63 912 345 6789" },
    { key: "address",       label: "Store Address", placeholder: "123 Main Street, City" },
  ];

  return (
    <Card className="p-6">
      <h2 className="text-lg font-display font-bold text-gray-900 mb-6">General Settings</h2>
      <div className="space-y-4">
        {fields.map((f) => (
          <EditableField
            key={f.key}
            label={f.label}
            fieldKey={f.key}
            savedValue={saved[f.key] ?? ""}
            placeholder={f.placeholder}
            onSave={handleSave}
          />
        ))}
      </div>
    </Card>
  );
}

import { localPrintAgent, type AgentStatus, type WindowsPrinterInfo } from "@/shared/services/escpos/localPrintAgent";
import { toast } from "sonner";

function LocalPrintAgentCard() {
  const [status, setStatus] = useState<AgentStatus>({ online: false });
  const [printers, setPrinters] = useState<WindowsPrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(
    localStorage.getItem("pos_selected_printer") || ""
  );
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await localPrintAgent.checkHealth();
      setStatus(res);
      if (res.online) {
        const list = await localPrintAgent.getPrinters();
        setPrinters(list);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 6000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handlePrinterChange = (printerName: string) => {
    setSelectedPrinter(printerName);
    if (printerName) {
      localStorage.setItem("pos_selected_printer", printerName);
      toast.success(`Target thermal printer set to: ${printerName}`);
    } else {
      localStorage.removeItem("pos_selected_printer");
      toast.success("Target set to Windows Default Printer");
    }
  };

  const handleTestPrint = async () => {
    setActionLoading("test-print");
    try {
      const ok = await localPrintAgent.sendTestPrint(selectedPrinter || undefined);
      if (ok) {
        toast.success("Test receipt sent directly to Windows thermal printer!");
      } else {
        toast.error("Failed to send test print. Ensure Print Agent is running.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenDrawer = async () => {
    setActionLoading("open-drawer");
    try {
      const ok = await localPrintAgent.openCashDrawer(selectedPrinter || undefined);
      if (ok) {
        toast.success("Cash drawer kick command sent!");
      } else {
        toast.error("Failed to trigger cash drawer. Check printer connection.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-display font-bold text-gray-900 flex items-center gap-2">
            <Printer className="h-5 w-5 text-blue-600" />
            Local Hardware Print Agent (100% Zero-Flash Printing)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Streams raw ESC/POS binary directly to your Windows Thermal Printer with 0% browser flash or dialogs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {status.online ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-300"></span>
            )}
          </span>
          <span className={`text-xs font-bold uppercase ${status.online ? "text-emerald-700" : "text-slate-500"}`}>
            {loading ? "Checking..." : status.online ? `Agent Active :${status.port || 18181} (0% Flash)` : "Agent Offline"}
          </span>
        </div>
      </div>

      {status.online ? (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-semibold text-emerald-950 block mb-1">Select Windows Thermal Printer</Label>
                <select
                  value={selectedPrinter}
                  onChange={(e) => handlePrinterChange(e.target.value)}
                  className="h-9 px-3 text-xs border border-emerald-300 rounded-md bg-white font-mono min-w-[280px]"
                >
                  <option value="">(Auto: Windows Default — {status.defaultPrinter || "None"})</option>
                  {printers.map((p) => (
                    <option key={p.Name} value={p.Name}>
                      {p.Name} {p.Default ? "(Default)" : ""} {p.PortName ? `[${p.PortName}]` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-emerald-700 font-mono">
                Agent URL: http://127.0.0.1:{status.port || 18181} (Connected)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestPrint}
                disabled={actionLoading !== null}
                className="text-xs h-9 bg-white border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-semibold gap-1.5 shadow-sm"
              >
                <Printer className="h-3.5 w-3.5" />
                {actionLoading === "test-print" ? "Printing..." : "Send Test Receipt"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenDrawer}
                disabled={actionLoading !== null}
                className="text-xs h-9 bg-white border-emerald-300 hover:bg-emerald-100 text-emerald-900 font-semibold gap-1.5 shadow-sm"
              >
                <DollarSign className="h-3.5 w-3.5" />
                {actionLoading === "open-drawer" ? "Opening..." : "Test Cash Drawer"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={refreshStatus}
                disabled={loading}
                className="text-xs h-9 px-2 text-emerald-700 hover:text-emerald-900"
                title="Refresh Status"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-800">
                Print Agent Not Detected on this PC (Using Standard Browser Printing)
              </p>
              <p className="text-xs text-slate-600">
                To enable <strong>100% Zero-Flash hardware printing</strong> on this Cashier terminal:
              </p>
              <ol className="text-xs text-slate-600 list-decimal list-inside space-y-0.5">
                <li>Copy the <code className="bg-slate-200 px-1 rounded">print-agent</code> folder to this PC.</li>
                <li>Double-click <code className="bg-slate-200 px-1 rounded">Install_Startup.bat</code> once to start it automatically on Windows boot.</li>
              </ol>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refreshStatus}
              disabled={loading}
              className="text-xs h-8 gap-1.5 font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Check Connection Again
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DirectThermalPrinterSettingsCard({ storeName = "ISRA HARDWARE POS" }: { storeName?: string }) {
  const [state, setState] = useState<SerialPrinterState>(webSerialPrinter.getState());

  useEffect(() => {
    const unsub = webSerialPrinter.subscribe((s) => setState(s));
    return () => unsub();
  }, []);

  if (!state.isSupported) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <Zap className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-display font-bold text-gray-900">
            Direct USB Serial Port (COM / Web Serial)
          </h2>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-600">
            Web Serial API is available on <code className="bg-slate-200 px-1 rounded">http://localhost</code> or via the Local Print Agent above for LAN connections.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-display font-bold text-gray-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Direct USB Thermal Receipt Printer (0% Flash ESC/POS)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Bypass browser print dialogs completely by streaming raw ESC/POS commands directly over USB.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {state.isConnected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-300"></span>
            )}
          </span>
          <span className={`text-xs font-bold uppercase ${state.isConnected ? "text-emerald-700" : "text-slate-500"}`}>
            {state.isConnected ? "Direct USB Connected" : "Not Paired / Offline"}
          </span>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Label className="text-xs font-semibold text-slate-700 block mb-1">Printer Serial Baud Rate</Label>
            <select
              value={state.baudRate}
              onChange={(e) => webSerialPrinter.setBaudRate(Number(e.target.value))}
              className="h-9 px-3 text-xs border border-slate-300 rounded-md bg-white font-mono"
            >
              <option value={9600}>9600 bps (Standard Xprinter / POS-80)</option>
              <option value={19200}>19200 bps</option>
              <option value={38400}>38400 bps (High Speed)</option>
              <option value={115200}>115200 bps (Ultra High Speed)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!state.isConnected ? (
              <Button
                type="button"
                onClick={() => webSerialPrinter.requestAndConnect()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-semibold gap-1.5 shadow-sm"
              >
                <Zap className="h-3.5 w-3.5" />
                Pair / Connect Thermal Printer
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => webSerialPrinter.printTestReceipt(storeName)}
                  className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-9 font-semibold gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5 text-slate-500" />
                  Test Print (0% Flash)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => webSerialPrinter.openCashDrawer()}
                  className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-9 font-semibold gap-1.5"
                >
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  Kick Cash Drawer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => webSerialPrinter.disconnect()}
                  className="bg-white border-red-200 text-red-600 hover:bg-red-50 text-xs h-9 font-semibold gap-1.5"
                >
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 border-t border-slate-200 pt-3">
          💡 <strong>Tip</strong>: When paired once, Chrome remembers the connection permission and auto-reconnects every time the POS Kiosk is launched.
        </div>
      </div>
    </Card>
  );
}

// ─── Business Tab ─────────────────────────────────────────────────────────────

function BusinessTab({ initial, onSettingsChange }: { initial: StoreSettings | null; onSettingsChange: (s: StoreSettings) => void }) {
  const [saved, setSaved] = useState<Record<string, string>>({
    proprietor: "", registered_taxpayer_name: "", tin: "", branch_code: "00000",
    business_license: "", document_type: "", pos_min: "", pos_serial: "", ptu_or_accn_no: "",
  });
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatSaving, setVatSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setSaved({
        proprietor:               initial.proprietor               ?? "",
        registered_taxpayer_name: initial.registered_taxpayer_name ?? "",
        tin:                      initial.tin                      ?? "",
        branch_code:              initial.branch_code              ?? "00000",
        business_license:         initial.business_license         ?? "",
        document_type:            initial.document_type            ?? "SALES INVOICE",
        pos_min:                  initial.pos_min                  ?? "",
        pos_serial:               initial.pos_serial               ?? "",
        ptu_or_accn_no:           initial.ptu_or_accn_no           ?? "",
      });
      setVatEnabled(initial.vat_enabled ?? false);
    }
  }, [initial]);

  const handleSave = async (key: string, value: string) => {
    const updated = await updateSettings({ [key]: value });
    setSaved((p) => ({ ...p, [key]: value }));
    onSettingsChange(updated);
  };

  const handleVatToggle = async (checked: boolean) => {
    setVatSaving(true);
    try {
      const updated = await updateSettings({ vat_enabled: checked });
      setVatEnabled(checked);
      onSettingsChange(updated);
    } finally {
      setVatSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-display font-bold text-gray-900 mb-6">Business Settings</h2>
      <div className="space-y-4">

        {/* Registered Taxpayer Information */}
        <div className="border border-amber-100 bg-amber-50 rounded-lg p-4 space-y-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            Registered Taxpayer Information
          </p>
          <p className="text-xs text-amber-600">
            Confirm these values with your accountant or BIR before printing on official documents.
          </p>
          <EditableField
            label="Proprietor Name"
            fieldKey="proprietor"
            savedValue={saved.proprietor}
            placeholder="e.g. Juan Dela Cruz"
            onSave={handleSave}
          />
          <EditableField
            label="Registered Taxpayer Name"
            fieldKey="registered_taxpayer_name"
            savedValue={saved.registered_taxpayer_name}
            placeholder="e.g. DELA CRUZ, JUAN SANTOS"
            onSave={handleSave}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EditableField
              label="TIN (9 Digits)"
              fieldKey="tin"
              savedValue={saved.tin}
              placeholder="e.g. 766490574 or 766-490-574"
              onSave={handleSave}
            />
            <EditableField
              label="Branch Code (3–5 Digits)"
              fieldKey="branch_code"
              savedValue={saved.branch_code}
              placeholder="e.g. 00000"
              onSave={handleSave}
            />
          </div>
          <EditableField
            label="Document Type"
            fieldKey="document_type"
            savedValue={saved.document_type}
            placeholder="e.g. SALES INVOICE"
            onSave={handleSave}
          />
          <p className="text-xs text-amber-600">
            Document type (e.g. SALES INVOICE, OFFICIAL RECEIPT) must be confirmed by your accountant or BIR.
          </p>
        </div>

        <div>
          <Label className="mb-1.5 block font-semibold text-sm">Currency</Label>
          <div className="h-9 px-3 flex items-center rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500 w-40 select-none">
            PHP (₱ — fixed)
          </div>
        </div>

        <div>
          <Label className="mb-1.5 block font-semibold text-sm">VAT Registered</Label>
          <div className="flex items-center gap-3 h-9">
            <Switch
              checked={vatEnabled}
              onCheckedChange={handleVatToggle}
              disabled={vatSaving}
            />
            <span className="text-sm text-gray-600">
              {vatEnabled ? "Yes — (VAT-Registered) printed on receipts" : "No — (Non-VAT Registered) printed on receipts"}
            </span>
          </div>
        </div>

        <div>
          <div className="h-9 px-3 flex items-center rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500 w-40 select-none">
            12% (VAT — fixed)
          </div>
        </div>

        <EditableField
          label="Business License / Other Reference"
          fieldKey="business_license"
          savedValue={saved.business_license}
          placeholder="e.g. Business Permit No."
          onSave={handleSave}
        />

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">POS Machine Registration & Accreditation</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EditableField
              label="MIN (Machine Identification No.)"
              fieldKey="pos_min"
              savedValue={saved.pos_min}
              placeholder="e.g. 000-123456789"
              onSave={handleSave}
            />
            <EditableField
              label="S/N (POS Serial Number)"
              fieldKey="pos_serial"
              savedValue={saved.pos_serial}
              placeholder="e.g. SN-20250001"
              onSave={handleSave}
            />
          </div>
          <div className="mt-4">
            <EditableField
              label="PTU / ACCN Number"
              fieldKey="ptu_or_accn_no"
              savedValue={saved.ptu_or_accn_no}
              placeholder="e.g. PTU-2026-000123 or ACCN No."
              onSave={handleSave}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">These identifiers will be printed on every official receipt and Z-reading.</p>
        </div>
      </div>
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
          {isLoading && <LoadingSpinner size={16} className="mr-2 text-white" />}
          {isLoading ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </Card>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const [settings,  setSettings]  = useState<StoreSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  const [hasUnsavedBackupChanges, setHasUnsavedBackupChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data);
        setIsLoading(false);
      })
      .catch(() => {
        setLoadError("Failed to load settings. Please refresh the page.");
        setIsLoading(false);
      });
  }, []);

  const handleTabChange = (newTab: string) => {
    if (hasUnsavedBackupChanges && activeTab === "backup-settings") {
      setPendingTab(newTab);
      setShowUnsavedDialog(true);
    } else {
      setActiveTab(newTab);
    }
  };

  const handleDiscardChanges = () => {
    setHasUnsavedBackupChanges(false);
    setShowUnsavedDialog(false);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  const handleKeepEditing = () => {
    setShowUnsavedDialog(false);
    setPendingTab(null);
  };

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

      {isLoading ? (
        <Card className="p-6 space-y-6">
          <Skeleton className="h-7 w-48" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="printers">Printer / Hardware</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="system-update">System Update</TabsTrigger>
            <TabsTrigger value="backup-settings">Backup Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="general"  className="space-y-6"><GeneralTab  initial={settings} onSettingsChange={setSettings} /></TabsContent>
          <TabsContent value="printers" className="space-y-6">
            <LocalPrintAgentCard />
            <DirectThermalPrinterSettingsCard storeName={settings?.store_name} />
          </TabsContent>
          <TabsContent value="system-update" className="space-y-6"><SystemUpdate /></TabsContent>
          <TabsContent value="backup-settings" className="space-y-6"><BackupSettings onUnsavedChange={setHasUnsavedBackupChanges} /></TabsContent>
        </Tabs>
      )}

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes to your backup settings. Do you want to discard these changes and switch to another tab?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleKeepEditing}>
              Keep Editing
            </Button>
            <Button variant="destructive" onClick={handleDiscardChanges}>
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
