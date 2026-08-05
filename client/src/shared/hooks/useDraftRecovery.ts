/**
 * useDraftRecovery
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-ready draft recovery engine for all POS forms.
 *
 * How it works
 * ──────────────
 * 1. Caller calls `saveDraft(data)` after each significant user input.
 *    Saves are debounced (default 800 ms) so typing doesn't hammer localStorage.
 * 2. On each session start (user logs in / page loads) `getRecoverableDraft()`
 *    returns the saved draft if the last session ended without a clean commit.
 * 3. The caller calls `commitDraft()` once the transaction is successfully
 *    persisted to the server — this deletes the draft so it cannot be replayed.
 * 4. The caller calls `discardDraft()` when the user explicitly wants to throw
 *    away the saved data.
 *
 * Draft key format
 * ─────────────────
 *   pos_draft::{role}::{userId}::{draftKey}
 *
 * This ensures that drafts are per-user and per-form, never cross-pollinating
 * between users sharing the same browser (e.g. shift handover).
 *
 * Session tracking
 * ─────────────────
 * A lightweight "dirty session" flag is written to localStorage the moment
 * a draft is first saved and cleared only when commitDraft() or discardDraft()
 * is called. On the next load, if the flag is still present, we know the last
 * session ended unexpectedly (crash, power-loss, browser close mid-form).
 * That triggers the "Recover Draft?" prompt.
 */

import { getUserFromToken, loadToken } from "@/shared/utils/auth";
import { useCallback, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const DRAFT_PREFIX   = "pos_draft";
const SESSION_PREFIX = "pos_draft_session";
const DEFAULT_DEBOUNCE_MS = 800;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DraftRecoveryHook<T> {
  /** Save current form state (debounced). Call on every significant input. */
  saveDraft: (data: T) => void;
  /** Read back the persisted draft immediately (synchronous). Returns null if none. */
  getSavedDraft: () => T | null;
  /** Call after the transaction is successfully committed to the DB. Clears draft. */
  commitDraft: () => void;
  /** Call when the user chooses to discard the saved draft. Clears draft. */
  discardDraft: () => void;
  /**
   * Returns the draft data if one was saved and the last session ended
   * unexpectedly. Returns null if the session ended cleanly.
   * Intended to be called once on component mount.
   */
  getRecoverableDraft: () => T | null;
  /** True if there is currently a dirty (uncommitted) draft in localStorage */
  hasDraft: () => boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentUserId(): string {
  const token = loadToken();
  if (!token) return "anonymous";
  const user = getUserFromToken(token);
  if (!user) return "anonymous";
  return `${user.role}::${user.id}`;
}

function draftKey(formKey: string): string {
  return `${DRAFT_PREFIX}::${currentUserId()}::${formKey}`;
}

function sessionFlagKey(formKey: string): string {
  return `${SESSION_PREFIX}::${currentUserId()}::${formKey}`;
}

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWrite(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage quota exceeded or private-browsing restriction — silently ignore.
  }
}

function safeDelete(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param formKey   Short, stable identifier for the form, e.g. "cashier-cart".
 *                  Must be unique per form type (not per session).
 * @param debounceMs  How long to debounce saves. Default 800 ms.
 */
export function useDraftRecovery<T>(
  formKey: string,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): DraftRecoveryHook<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the debounce timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const saveDraft = useCallback(
    (data: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const key = draftKey(formKey);
        const flag = sessionFlagKey(formKey);
        safeWrite(key, data);
        // Mark session as dirty so we can detect unexpected exits.
        if (!localStorage.getItem(flag)) {
          safeWrite(flag, { savedAt: new Date().toISOString() });
        }
      }, debounceMs);
    },
    [formKey, debounceMs],
  );

  const getSavedDraft = useCallback((): T | null => {
    return safeRead<T>(draftKey(formKey));
  }, [formKey]);

  const commitDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    safeDelete(draftKey(formKey));
    safeDelete(sessionFlagKey(formKey));
  }, [formKey]);

  const discardDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    safeDelete(draftKey(formKey));
    safeDelete(sessionFlagKey(formKey));
  }, [formKey]);

  const getRecoverableDraft = useCallback((): T | null => {
    // A draft is "recoverable" only if the session flag exists (dirty session)
    // AND a draft payload is actually stored.
    const flag = localStorage.getItem(sessionFlagKey(formKey));
    if (!flag) return null;
    return safeRead<T>(draftKey(formKey));
  }, [formKey]);

  const hasDraft = useCallback((): boolean => {
    return !!localStorage.getItem(draftKey(formKey));
  }, [formKey]);

  return { saveDraft, getSavedDraft, commitDraft, discardDraft, getRecoverableDraft, hasDraft };
}

// ─── Utility: flush all drafts for a user (call on logout) ───────────────────
// We intentionally do NOT flush drafts on logout — the user may have been
// force-logged-out by a token expiry. On the next login we still want to offer
// recovery. Call this only if you explicitly want to wipe everything.

export function flushAllDraftsForCurrentUser(): void {
  const prefix = `${DRAFT_PREFIX}::${currentUserId()}`;
  const sessionPrefix = `${SESSION_PREFIX}::${currentUserId()}`;
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith(prefix) || key.startsWith(sessionPrefix))) {
      toDelete.push(key);
    }
  }
  toDelete.forEach((k) => localStorage.removeItem(k));
}

// ─── Well-known draft keys (avoids magic strings across the codebase) ─────────

export const DRAFT_KEYS = {
  // Cashier
  CASHIER_CART:          "cashier-cart",

  // Clerk
  CLERK_STOCK_IN:        "clerk-stock-in",
  CLERK_STOCK_COUNT:     "clerk-stock-count",
  CLERK_STOCK_ADJUSTMENT: "clerk-stock-adjustment",

  // Admin
  ADMIN_PRODUCT_ADD:     "admin-product-add",
  ADMIN_PRODUCT_EDIT:    "admin-product-edit",
  ADMIN_SUPPLIER_ADD:    "admin-supplier-add",
  ADMIN_SUPPLIER_EDIT:   "admin-supplier-edit",
} as const;
