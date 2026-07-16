/**
 * Backward-compatibility shim.
 *
 * All clerk pages that import `useClerkAuth` or `ClerkAuthProvider` continue
 * to work unchanged. The real implementation now lives in AuthContext.
 */
export { useAuth as useClerkAuth, AuthProvider as ClerkAuthProvider } from "./AuthContext";
