import { useState, useEffect, useCallback } from "react";
import { fetchActiveTerminals, type POSTerminal } from "@/shared/api/terminalsApi";
import type { StoreSettings } from "@/shared/api/settingsApi";

const STORAGE_KEY = "isra_pos_bound_terminal_id";

export interface ActiveTerminalInfo {
  terminal: POSTerminal | null;
  terminalCode: string;
  terminalName: string;
  posSerial: string;
  posMin: string;
  isBound: boolean;
}

export function getSavedTerminalId(): number | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (!val) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

export function setSavedTerminalId(id: number | null): void {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new Event("isra_pos_terminal_changed"));
  } catch (err) {
    console.warn("[useActiveTerminal] Failed to save terminal to localStorage", err);
  }
}

export function useActiveTerminal(settings?: StoreSettings | null) {
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<number | null>(getSavedTerminalId());

  const loadTerminals = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchActiveTerminals();
      setTerminals(list);
    } catch (err) {
      console.warn("[useActiveTerminal] Could not fetch terminals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTerminals();
  }, [loadTerminals]);

  // Listen for storage changes across tabs or custom event within same tab
  useEffect(() => {
    const handleStorage = () => {
      setSelectedId(getSavedTerminalId());
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("isra_pos_terminal_changed", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("isra_pos_terminal_changed", handleStorage);
    };
  }, []);

  // Resolve matching terminal
  const activeTerminal = terminals.find((t) => t.id === selectedId) || null;

  // Fallback to first terminal or system settings if not bound
  const fallbackSerial = settings?.pos_serial || "";
  const fallbackMin = settings?.pos_min || "";

  const terminalInfo: ActiveTerminalInfo = {
    terminal: activeTerminal,
    terminalCode: activeTerminal?.terminal_code || (terminals.length === 1 ? terminals[0].terminal_code : "TERM-01"),
    terminalName: activeTerminal?.terminal_name || "Unassigned Station",
    posSerial: activeTerminal?.pos_serial || fallbackSerial,
    posMin: activeTerminal?.pos_min || fallbackMin,
    isBound: Boolean(activeTerminal),
  };

  const bindTerminal = useCallback((id: number | null) => {
    setSavedTerminalId(id);
    setSelectedId(id);
  }, []);

  return {
    terminals,
    loading,
    activeTerminal,
    terminalInfo,
    bindTerminal,
    refreshTerminals: loadTerminals,
  };
}
