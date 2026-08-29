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

export interface CurrentUserSummary {
  username?: string;
  role?: string;
  full_name?: string;
}

export interface UsePreventAccidentalCloseOptions {
  /** Set to true when an active transaction, cart items, or unsaved work exists */
  hasActiveWork?: boolean;
  /** Whether a user is currently logged in (active session) */
  isLoggedIn?: boolean;
  /** Current logged in user object */
  currentUser?: CurrentUserSummary | null;
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
 * 1. Intercepts keyboard close shortcuts (Ctrl+W, Ctrl+Shift+W, Ctrl+F4, Ctrl+Q, Alt+F4)
 *    when the user has not logged out, preventing accidental termination of the KIOSK.
 * 2. Allows Ctrl+Shift+R / Ctrl+R / F5 (Reload) to refresh seamlessly WITHOUT any warning modal.
 * 3. Registers a browser `beforeunload` listener whenever a user is logged in or active work exists,
 *    ensuring browser-level close buttons ('X', Alt+F4) prompt that the user must log out first.
 * 4. Displays a rich warning modal explaining that the user must log out before closing the Kiosk.
 */
export function usePreventAccidentalClose({
  hasActiveWork = false,
  isLoggedIn = true,
  currentUser,
  terminalType = "CASHIER",
  portalName,
  workDetails,
  onHoldOrSave,
  onDiscardAndExit,
  onEndShiftAndExit,
  isKiosk = true,
}: UsePreventAccidentalCloseOptions): UsePreventAccidentalCloseReturn {
  const [showModal, setShowModal] = useState(false);
  const isReloadingRef = useRef(false);

  // Keep latest refs to avoid stale closures in window event listeners
  const hasActiveWorkRef = useRef(hasActiveWork);
  useEffect(() => {
    hasActiveWorkRef.current = hasActiveWork;
  }, [hasActiveWork]);

  const isLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  const onHoldOrSaveRef = useRef(onHoldOrSave);
  useEffect(() => {
    onHoldOrSaveRef.current = onHoldOrSave;
  }, [onHoldOrSave]);

  const onDiscardAndExitRef = useRef(onDiscardAndExit);
  useEffect(() => {
    onDiscardAndExitRef.current = onDiscardAndExit;
  }, [onDiscardAndExit]);

  const isEffectivelyDirty = useCallback(() => {
    return hasActiveWorkRef.current || hasAnyActiveDraft() || isLoggedInRef.current;
  }, []);

  // ── 1. Browser-level beforeunload guard ─────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // If user is intentionally reloading (e.g. Ctrl+Shift+R or F5), do NOT block!
      if (isReloadingRef.current) {
        return;
      }

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

  // ── 2. Keyboard shortcut interceptor (Ctrl+W, Ctrl+Shift+W, Ctrl+F4, Ctrl+Q, Alt+F4) ─
  useEffect(() => {
    const handleKeyDownCapture = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // RELOAD SHORTCUTS: Ctrl+Shift+R, Ctrl+R, F5, Shift+F5
      // MUST NOT trigger any warning or modal. Allow normal browser reload!
      const isReloadShortcut =
        (isCtrlOrMeta && key === "r") ||
        e.key === "F5" ||
        (e.shiftKey && e.key === "F5");

      if (isReloadShortcut) {
        isReloadingRef.current = true;
        setTimeout(() => {
          isReloadingRef.current = false;
        }, 2000);
        return;
      }

      // CLOSE SHORTCUTS: Ctrl+W, Ctrl+Shift+W, Ctrl+Q, Ctrl+F4, Alt+F4
      const isCloseShortcut =
        (isCtrlOrMeta && (key === "w" || e.key === "F4" || key === "q")) ||
        (isCtrlOrMeta && e.shiftKey && key === "w") ||
        (e.altKey && e.key === "F4");

      // If user tries to close while logged in or with active work:
      if (isCloseShortcut) {
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
  }, []);

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
