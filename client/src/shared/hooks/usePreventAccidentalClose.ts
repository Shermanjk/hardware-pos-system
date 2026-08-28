import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalType } from "../components/PreventCloseModal";

export interface ActiveWorkDetails {
  /** Short title of the active operation, e.g. "Active Sales Transaction" */
  title?: string;
  /** Number of items staged in cart or operation */
  itemsCount?: number;
  /** Formatted total amount string or number (e.g. "₱1,250.00") */
  totalAmount?: string | number;
  /** Customer name if assigned */
  customerName?: string;
  /** Whether a cashier shift is currently active */
  shiftActive?: boolean;
  /** Label for the active shift (e.g. "Morning Shift") */
  shiftLabel?: string;
  /** Custom warning or explanatory note */
  description?: string;
}

export interface UsePreventAccidentalCloseOptions {
  /** Set to true when an active transaction, cart items, or unsaved work exists */
  hasActiveWork: boolean;
  /** Type of terminal: "CASHIER" | "ADMIN" | "CLERK" */
  terminalType?: TerminalType;
  /** Custom portal/terminal name override */
  portalName?: string;
  /** Optional metadata describing the in-flight work for the warning dialog */
  workDetails?: ActiveWorkDetails;
  /** Optional callback to suspend/hold/save the current transaction to DB before exiting */
  onHoldOrSave?: () => Promise<void> | void;
  /** Optional callback invoked when the user confirms discarding unsaved work and exiting */
  onDiscardAndExit?: () => void;
  /** Optional callback to trigger End Shift flow if shift is open */
  onEndShiftAndExit?: () => void;
  /** Whether this terminal is operating in Kiosk mode (defaults to true) */
  isKiosk?: boolean;
}

export interface UsePreventAccidentalCloseReturn {
  /** Whether the Prevent Close / Exit confirmation modal is currently open */
  showModal: boolean;
  /** Manually open the Prevent Close modal */
  openModal: () => void;
  /** Manually close the Prevent Close modal (cancels exit) */
  closeModal: () => void;
  /** Triggers the Hold/Save and Exit workflow */
  handleHoldAndExit: () => Promise<void>;
  /** Triggers the Force Discard and Exit workflow */
  handleForceExit: () => void;
}

/**
 * Checks if any uncommitted form draft sessions exist in localStorage
 */
export function hasAnyActiveDraft(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("pos_draft_session::")) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * usePreventAccidentalClose
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-layer protection engine for POS Kiosk & Terminals (Cashier, Admin, Clerk):
 *
 * 1. Intercepts keyboard close shortcuts (Ctrl+W, Ctrl+Shift+W, Ctrl+F4, Ctrl+Q, Ctrl+R)
 *    at the document capture phase so accidental keystrokes don't immediately kill the KIOSK/app.
 * 2. Registers a browser `beforeunload` listener whenever `hasActiveWork` or uncommitted drafts exist,
 *    ensuring browser-level close buttons ('X', Alt+F4, or taskbar kill) prompt the native confirmation.
 * 3. Displays a rich, accessible in-app warning modal detailing what transaction/work is in progress.
 */
export function usePreventAccidentalClose({
  hasActiveWork,
  terminalType = "CASHIER",
  portalName,
  workDetails,
  onHoldOrSave,
  onDiscardAndExit,
  onEndShiftAndExit,
  isKiosk = true,
}: UsePreventAccidentalCloseOptions): UsePreventAccidentalCloseReturn {
  const [showModal, setShowModal] = useState(false);

  // Keep latest refs to avoid stale closures in window event listeners
  const hasActiveWorkRef = useRef(hasActiveWork);
  useEffect(() => {
    hasActiveWorkRef.current = hasActiveWork;
  }, [hasActiveWork]);

  const onHoldOrSaveRef = useRef(onHoldOrSave);
  useEffect(() => {
    onHoldOrSaveRef.current = onHoldOrSave;
  }, [onHoldOrSave]);

  const onDiscardAndExitRef = useRef(onDiscardAndExit);
  useEffect(() => {
    onDiscardAndExitRef.current = onDiscardAndExit;
  }, [onDiscardAndExit]);

  const isEffectivelyDirty = useCallback(() => {
    return hasActiveWorkRef.current || hasAnyActiveDraft();
  }, []);

  // ── 1. Browser-level beforeunload guard ─────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isEffectivelyDirty()) {
        e.preventDefault();
        // Standard modern browser beforeunload contract
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isEffectivelyDirty]);

  // ── 2. Keyboard shortcut interceptor (Ctrl+W, Ctrl+Shift+W, Ctrl+F4, Ctrl+Q, Ctrl+R) ─
  useEffect(() => {
    const handleKeyDownCapture = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      const isCloseShortcut =
        (isCtrlOrMeta && (key === "w" || e.key === "F4" || key === "q")) ||
        (isCtrlOrMeta && e.shiftKey && key === "w");

      const isReloadShortcut =
        (isCtrlOrMeta && key === "r") || (e.key === "F5" && !e.altKey && !e.ctrlKey && !e.shiftKey);

      // If it's a close shortcut (e.g. Ctrl+W):
      if (isCloseShortcut) {
        // ALWAYS prevent default browser tab/window close
        e.preventDefault();
        e.stopPropagation();
        setShowModal(true);
        return;
      }

      // If user presses Ctrl+R / F5 while active transaction is in progress, warn first
      if (isReloadShortcut && isEffectivelyDirty()) {
        e.preventDefault();
        e.stopPropagation();
        setShowModal(true);
        return;
      }
    };

    // Use capture phase to intercept before any default browser or element handlers
    window.addEventListener("keydown", handleKeyDownCapture, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, true);
    };
  }, [isEffectivelyDirty]);

  const openModal = useCallback(() => setShowModal(true), []);
  const closeModal = useCallback(() => setShowModal(false), []);

  const handleHoldAndExit = useCallback(async () => {
    try {
      if (onHoldOrSaveRef.current) {
        await onHoldOrSaveRef.current();
      }
      setShowModal(false);
      // Attempt safe window close or logout
      if (onDiscardAndExitRef.current) {
        onDiscardAndExitRef.current();
      } else {
        try {
          window.close();
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("Failed to hold transaction before exit:", err);
    }
  }, []);

  const handleForceExit = useCallback(() => {
    setShowModal(false);
    if (onDiscardAndExitRef.current) {
      onDiscardAndExitRef.current();
    } else {
      try {
        window.close();
      } catch {
        // If window.close is blocked by browser sandbox, redirect to logout/login
        window.location.href = "/login";
      }
    }
  }, []);

  return {
    showModal,
    openModal,
    closeModal,
    handleHoldAndExit,
    handleForceExit,
  };
}
