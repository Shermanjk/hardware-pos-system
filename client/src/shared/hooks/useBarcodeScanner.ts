import { useCallback, useEffect, useRef } from "react";

// ─── Scanner timing constants ─────────────────────────────────────────────────
// Real keyboard-wedge scanners burst keystrokes well under 50ms; manual typing is slower.
const SCAN_GAP_MS = 50;
// If keystrokes pause longer than this, treat any subsequent keystroke as a new scan / typing session.
const SCAN_IDLE_MS = 150;
// Minimum characters for a valid barcode scan burst.
const MIN_SCAN_LENGTH = 3;

export interface UseBarcodeScannerOptions {
  /**
   * Value state setter from the parent component (e.g. setSearch).
   * Used to replace or update the search bar value.
   */
  setValue?: (val: string) => void;

  /**
   * Callback fired when a barcode scan is completed (via Enter or burst idle).
   */
  onScan?: (barcode: string) => void;

  /**
   * Reference to the input element (optional, allows auto-focus & select).
   */
  inputRef?: React.RefObject<HTMLInputElement | null>;

  /**
   * Whether to capture scans globally on the document when no other text input is active.
   * Default: false
   */
  enableGlobalScan?: boolean;

  /**
   * Whether scanner detection is enabled. Default: true
   */
  enabled?: boolean;
}

export function useBarcodeScanner({
  setValue,
  onScan,
  inputRef,
  enableGlobalScan = false,
  enabled = true,
}: UseBarcodeScannerOptions) {
  // Burst tracking refs for the focused input
  const lastInputKeyTimeRef = useRef<number>(0);
  const inputBurstBufferRef = useRef<string>("");
  const isInputBurstingRef = useRef<boolean>(false);
  const inputIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Burst tracking refs for global document-level capture
  const globalScanBufferRef = useRef<string>("");
  const lastGlobalKeyTimeRef = useRef<number>(0);
  const globalIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest callbacks in refs to avoid stale closures
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;

  // ── Input Event Handlers ───────────────────────────────────────────────────

  /**
   * Handle keydown on the targeted search / barcode input.
   * Detects if the incoming keystrokes are arriving at scanner speed (< 50ms).
   * If a new scan burst starts while the input already has previous text,
   * it replaces the old text with the new barcode instead of appending to it.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!enabled) return;

      const now = Date.now();
      const timeSinceLastKey = now - lastInputKeyTimeRef.current;
      lastInputKeyTimeRef.current = now;

      // Handle Enter (standard barcode terminator)
      if (e.key === "Enter") {
        if (inputIdleTimerRef.current) {
          clearTimeout(inputIdleTimerRef.current);
          inputIdleTimerRef.current = null;
        }

        const raw = isInputBurstingRef.current && inputBurstBufferRef.current.trim().length >= MIN_SCAN_LENGTH
          ? inputBurstBufferRef.current.trim()
          : e.currentTarget.value.trim();

        isInputBurstingRef.current = false;
        inputBurstBufferRef.current = "";

        if (raw) {
          e.preventDefault();
          setValueRef.current?.(raw);
          onScanRef.current?.(raw);
          // Auto-select text so any future scan or typing will overwrite it cleanly
          try {
            e.currentTarget.select();
          } catch {
            // Ignore selection error if unmounted
          }
        }
        return;
      }

      // Ignore modifier keys and control keys
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Meta" ||
        e.key === "CapsLock" ||
        e.key === "Tab" ||
        e.key === "Escape" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Backspace" ||
        e.key === "Delete"
      ) {
        if (timeSinceLastKey > SCAN_IDLE_MS) {
          isInputBurstingRef.current = false;
          inputBurstBufferRef.current = "";
        }
        return;
      }

      // Only single printable characters (letters, digits, symbols)
      if (e.key.length !== 1) return;

      // If gap is large, this is the first character of a potential new scan (or slow human typing)
      if (timeSinceLastKey > SCAN_IDLE_MS) {
        isInputBurstingRef.current = false;
        inputBurstBufferRef.current = e.key;
      } else if (timeSinceLastKey < SCAN_GAP_MS) {
        // Fast consecutive key — scanner burst detected!
        if (!isInputBurstingRef.current) {
          // This is the 2nd key in a rapid burst.
          // Replace the input with the burst buffer so far.
          isInputBurstingRef.current = true;
          inputBurstBufferRef.current += e.key;
          setValueRef.current?.(inputBurstBufferRef.current);
          e.preventDefault();
        } else {
          // Continuing rapid burst: update state with new buffer
          inputBurstBufferRef.current += e.key;
          setValueRef.current?.(inputBurstBufferRef.current);
          e.preventDefault();
        }
      } else {
        // Normal human typing speed (e.g. 60-150ms gap)
        isInputBurstingRef.current = false;
        inputBurstBufferRef.current = "";
      }

      // Scanner idle timer for scanners that do NOT send a trailing Enter key
      if (inputIdleTimerRef.current) clearTimeout(inputIdleTimerRef.current);
      inputIdleTimerRef.current = setTimeout(() => {
        inputIdleTimerRef.current = null;
        if (isInputBurstingRef.current && inputBurstBufferRef.current.trim().length >= MIN_SCAN_LENGTH) {
          const barcode = inputBurstBufferRef.current.trim();
          isInputBurstingRef.current = false;
          inputBurstBufferRef.current = "";
          setValueRef.current?.(barcode);
          onScanRef.current?.(barcode);
          if (inputRef?.current) {
            try {
              inputRef.current.select();
            } catch {
              // Ignore
            }
          }
        }
      }, SCAN_IDLE_MS);
    },
    [enabled, inputRef]
  );

  /**
   * Auto-select all text when the input is focused so that
   * the user or scanner can immediately replace the old text without manual deletion.
   */
  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    try {
      e.currentTarget.select();
    } catch {
      // Ignore
    }
  }, []);

  // ── Global Document-Level Scanner Listener ─────────────────────────────────
  useEffect(() => {
    if (!enabled || !enableGlobalScan) return;

    const OVERLAY_SELECTOR =
      '[data-radix-popper-content-wrapper], [data-radix-dialog-content], [data-radix-menu-content], [data-radix-select-content], [data-radix-popover-content]';

    function isInteractiveArea(el: Element | null): boolean {
      if (!el) return false;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable
      ) {
        return true;
      }
      return !!el.closest('[role="dialog"], [role="menu"], [role="listbox"], ' + OVERLAY_SELECTOR);
    }

    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const activeEl = document.activeElement as HTMLElement | null;
      // If the target input itself is already focused, let handleKeyDown process it
      if (activeEl && inputRef?.current && activeEl === inputRef.current) return;
      // Don't intercept typing in other text fields or modal dialogs
      if (isInteractiveArea(activeEl)) return;

      if (
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Meta" ||
        e.key === "CapsLock" ||
        e.key === "Tab"
      ) {
        return;
      }

      if (e.key === "Enter") {
        if (globalScanBufferRef.current.trim().length >= MIN_SCAN_LENGTH) {
          const barcode = globalScanBufferRef.current.trim();
          globalScanBufferRef.current = "";
          e.preventDefault();
          e.stopPropagation();

          if (globalIdleTimerRef.current) {
            clearTimeout(globalIdleTimerRef.current);
            globalIdleTimerRef.current = null;
          }

          setValueRef.current?.(barcode);
          onScanRef.current?.(barcode);

          if (inputRef?.current) {
            inputRef.current.focus();
            try {
              inputRef.current.select();
            } catch {
              // Ignore
            }
          }
        }
        return;
      }

      if (e.key.length !== 1) return;

      const now = Date.now();
      if (lastGlobalKeyTimeRef.current > 0 && now - lastGlobalKeyTimeRef.current > SCAN_GAP_MS) {
        globalScanBufferRef.current = "";
      }
      lastGlobalKeyTimeRef.current = now;
      globalScanBufferRef.current += e.key;

      if (globalIdleTimerRef.current) clearTimeout(globalIdleTimerRef.current);
      globalIdleTimerRef.current = setTimeout(() => {
        globalIdleTimerRef.current = null;
        if (globalScanBufferRef.current.trim().length >= MIN_SCAN_LENGTH) {
          const barcode = globalScanBufferRef.current.trim();
          globalScanBufferRef.current = "";
          setValueRef.current?.(barcode);
          onScanRef.current?.(barcode);

          if (inputRef?.current) {
            inputRef.current.focus();
            try {
              inputRef.current.select();
            } catch {
              // Ignore
            }
          }
        }
      }, SCAN_IDLE_MS);
    }

    document.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown, true);
      if (globalIdleTimerRef.current) clearTimeout(globalIdleTimerRef.current);
      if (inputIdleTimerRef.current) clearTimeout(inputIdleTimerRef.current);
    };
  }, [enabled, enableGlobalScan, inputRef]);

  return {
    handleKeyDown,
    handleFocus,
  };
}
