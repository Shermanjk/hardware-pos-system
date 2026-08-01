# Implementation Plan: Production Readiness Audit

## Overview

Six additive improvements to the POS system: WebSocket heartbeat for dead-socket eviction, a token refresh endpoint, client-side token auto-renewal, a centralized Axios instance, a cashier offline indicator, and resilient pending-count polling for both Cashier and Admin terminals. No database migrations are needed. All changes build on existing infrastructure and must not break passing functionality.

## Tasks

- [ ] 1. WebSocket heartbeat (`server/ws.ts`)
  - [ ] 1.1 Add per-socket ping/pong heartbeat with strict 10 s pong timeout
    - Extend each `WebSocket` with an `isAlive` marker set to `true` on connection
    - On connection: start a `setInterval` every 30 s that sends `ws.ping()` and starts a 10 s `setTimeout` to call `ws.terminate()` if no pong arrives
    - On `pong` event: clear the pending pong timer and reset `isAlive = true`
    - On `close` event: clear both the heartbeat interval and any pending pong timer (keep existing Set-removal logic intact)
    - Apply to both `Admin` and `Cashier` branches inside `wss.on("connection", ...)`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.2 Write property tests for heartbeat logic
    - **Property 1: Dead socket termination** — after a heartbeat cycle, every socket with `isAlive = false` is terminated and removed from its Set
    - **Property 2: Pong resets alive marker** — receiving a `pong` event always sets `isAlive = true`
    - **Validates: Requirements 1.2, 1.3, 1.5**

- [ ] 2. Token refresh endpoint (`server/routes/auth.ts`)
  - [ ] 2.1 Add `POST /api/auth/refresh` route to the existing auth router
    - Import `authenticate` middleware and `jwt` (already imported in the file)
    - After login route: add `router.post("/refresh", authenticate, ...)` handler
    - Guard against `mustChangePassword` tokens — return 403 if payload contains that flag
    - Issue a new 12 h token using the same identity claims (id, full_name, username, role, employee_id)
    - Return `{ token: newToken }` with HTTP 200
    - Expired tokens are automatically rejected 401 by the `authenticate` middleware — no extra code needed
    - _Requirements: 2.5, 2.6_

  - [ ]* 2.2 Write property tests for the refresh endpoint
    - **Property 5: Refresh endpoint preserves user claims** — new token payload contains same identity fields and a future `exp`
    - **Property 6: Expired tokens are rejected** — expired JWT returns HTTP 401
    - **Validates: Requirements 2.5, 2.6**

- [ ] 3. Centralized Axios instance (`client/src/shared/api/httpClient.ts`)
  - [ ] 3.1 Create `httpClient.ts` with a single configured Axios instance
    - Create `client/src/shared/api/httpClient.ts`
    - `axios.create({ timeout: 15_000 })`
    - Request interceptor: call `loadToken()`; if present, set `config.headers.Authorization = "Bearer <token>"`; if absent, pass config through unchanged
    - Response interceptor: on 401 with a stored token → `clearToken()` + `window.location.href = "/login"`; move the identical logic currently in `authApi.ts`'s global `axios.interceptors.response.use` here
    - Export the instance as default
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.2 Migrate `authApi.ts` to `httpClient`
    - Replace `import axios from "axios"` with `import httpClient from "@/shared/api/httpClient"`
    - Remove the global `axios.interceptors.response.use(...)` block (now lives in `httpClient`)
    - Update `loginRequest` to use `httpClient.post(...)` — interceptor skips the header when no token is stored, so login still works
    - _Requirements: 3.4, 3.5_

  - [ ] 3.3 Migrate `salesApi.ts` to `httpClient`
    - Replace `import axios from "axios"` with `import httpClient from "@/shared/api/httpClient"`
    - Remove `authHeaders()` function
    - Replace all `axios.*(..., { headers: authHeaders() })` calls with `httpClient.*(...)`  dropping the `headers` option
    - _Requirements: 3.5_

  - [ ] 3.4 Migrate remaining API modules to `httpClient`
    - Apply the same migration pattern to: `productsApi.ts`, `inventoryApi.ts`, `returnsApi.ts`, `voidApi.ts`, `usersApi.ts`, `requestsApi.ts`, `auditLogsApi.ts`, `dashboardApi.ts`, `settingsApi.ts`, `suspendedSalesApi.ts`, `commodityApi.ts`
    - For each file: swap `axios` import for `httpClient`, remove `authHeaders()` helper and all manual `Authorization` header constructions
    - _Requirements: 3.5_

  - [ ]* 3.5 Write property test for `httpClient` interceptor
    - **Property 7: Authorization header attachment** — request made while token is stored includes `Authorization: Bearer <token>`; request made without stored token has no `Authorization` header
    - **Validates: Requirements 3.2, 3.3**

- [ ] 4. Checkpoint — server-side and shared client infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Token auto-renewal (`client/src/shared/contexts/AuthContext.tsx`)
  - [ ] 5.1 Add `renewalTimerRef` and `retryTimerRef`, and `scheduleRenewal` / `doRenew` functions
    - Add two new `useRef<ReturnType<typeof setTimeout> | null>(null)` refs alongside the existing `expiryTimerRef`
    - Implement `scheduleRenewal(tkn)`: decode token expiry (`exp` claim), compute `msUntilRenew = exp * 1000 - Date.now() - 10 * 60 * 1000`; if positive, set `renewalTimerRef` to fire `doRenew(false)` at that delay
    - Implement `doRenew(isRetry)`: call `httpClient.post("/api/auth/refresh")` (interceptor auto-attaches token); on success, call `saveToken(newToken)`, update state, reschedule expiry warning and renewal; on 401, clear token + timers + redirect `/login`; on other error and `!isRetry`, set `retryTimerRef` to call `doRenew(true)` after 30 s
    - Call `scheduleRenewal` whenever a token is loaded or set (after login, after refresh success, on app init)
    - Clear both new timers in `logout()` and on component unmount
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 5.2 Write property tests for token renewal scheduling
    - **Property 3: Renewal scheduled at correct time** — `scheduleRenewal` sets timer to fire at `(exp - 10 min - now)` ±1 s
    - **Property 4: Successful refresh replaces stored token** — after `doRenew` success handler, `loadToken()` returns the new token and a new renewal timer is scheduled
    - **Validates: Requirements 2.1, 2.2**

- [ ] 6. Health endpoint (`server/index.ts`) and Cashier network indicator
  - [ ] 6.1 Add `GET /api/health` to `server/index.ts`
    - Before all other route registrations, add `app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }))`
    - No authentication middleware — intentionally unauthenticated
    - Also import and register `notificationsRoutes`: `app.use("/api/notifications", notificationsRoutes)` (can be co-located here for a single server-side edit)
    - _Requirements: 4.5_

  - [ ] 6.2 Create `server/routes/notifications.ts`
    - New file: `GET /pending-counts` route protected by `authenticate` middleware
    - Query `returns` table for `COUNT(*) WHERE status = 'pending'`
    - Query `void_requests` table for `COUNT(*) WHERE status = 'pending'`
    - Return `{ pendingReturns: number, pendingVoids: number }` with HTTP 200
    - Return HTTP 500 with JSON error message on DB failure
    - _Requirements: 6.5_

  - [ ] 6.3 Add health poll + offline banner to `Cashier.tsx`
    - Add `const [isOffline, setIsOffline] = useState(false)`
    - Add a `useEffect` that calls `httpClient.get("/api/health", { timeout: 5_000 })` immediately on mount, then every 15 s via `setInterval`; set `isOffline` based on success/failure; clear interval on unmount
    - Render a red banner `"Server Unreachable — Transactions Unavailable"` below the header when `isOffline` is true
    - Pass `isOffline` prop to `<PaymentPanel>`
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 6.4 Add `isOffline` prop to `PaymentPanel.tsx`
    - Add `isOffline: boolean` to `PaymentPanelProps` interface
    - Set `disabled={isProcessing || isOffline}` on the payment submission button
    - _Requirements: 4.4_

  - [ ]* 6.5 Write property tests for offline state
    - **Property 8: Offline state reflects health-check result** — `isOffline` is `true` after any failed health-check and `false` after any success, regardless of prior state
    - **Property 9: Payment is disabled when offline** — when `isOffline = true`, the payment submit button has `disabled` attribute
    - **Validates: Requirements 4.1, 4.2, 4.4_**

- [ ] 7. Cashier pending poll (`client/src/modules/cashier/pages/Cashier.tsx`)
  - [ ] 7.1 Replace one-time load effects with a unified `fetchPendingData` callback and 60 s poll
    - Extract `getMyPendingReturns()` and `getMyVoidRequests()` calls from existing one-time `useEffect`s into a `useCallback` named `fetchPendingData`
    - Use `Promise.allSettled` for both fetches; on returns success, map API response to `HeldReturn[]` and call `setHeldReturns(prev => mergeReturns(prev, fresh))`; on void success, call `setPendingVoidRequestsCount`; retain last known state on failure (no state update in catch)
    - Add a pure `mergeReturns(current, polled)` helper function: keep all polled items, plus any `current` items absent from polled that have no `decision` value
    - Set up `setInterval(fetchPendingData, 60_000)` in a `useEffect`; add `visibilitychange` listener that calls `fetchPendingData()` when tab becomes visible; clean up both on unmount
    - In existing WS `return_decision` and `void_decision` callbacks, call `fetchPendingData()` after updating local state
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 7.2 Write property test for `mergeReturns`
    - **Property 10: Pending list merge preserves unacknowledged items** — result contains all polled items plus unacknowledged current items absent from polled; acknowledged items absent from polled are dropped
    - **Validates: Requirements 5.3**

- [ ] 8. Admin notification poll hook and sidebar integration
  - [ ] 8.1 Create `client/src/shared/hooks/useAdminNotificationPoll.ts`
    - New hook that holds `{ pendingReturns: number, pendingVoids: number }` state (both start at 0)
    - `fetchCounts` callback: `httpClient.get("/api/notifications/pending-counts")`; on success, merge via `Math.max(prev.X, polled.X)` for each count; on failure, retain existing counts
    - `useEffect` calls `fetchCounts()` on mount and every 60 s; cleans up on unmount
    - Return `{ pendingReturns, pendingVoids, triggerRefresh: fetchCounts }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [ ] 8.2 Integrate `useAdminNotificationPoll` into `AdminSidebar.tsx`
    - Call `useAdminNotificationPoll()` in `AdminSidebar`
    - Pass `triggerRefresh` as the `onOpen` callback to the WS hook(s) used by the sidebar (`useReturnNotifications` / `useVoidRequestNotifications`) so the poll fires immediately on reconnect
    - Replace any hard-coded badge count state or existing count-fetching logic with the values from the hook
    - _Requirements: 6.2, 6.6_

  - [ ]* 8.3 Write property test for admin notification merge
    - **Property 11: Badge count uses the maximum of polled and WebSocket values** — for any `(currentCount, polledCount)` pair of non-negative integers, the merged badge equals `Math.max(currentCount, polledCount)`
    - **Validates: Requirements 6.3**

- [ ] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
- The `httpClient` migration (task 3.4) touches many files but each change is mechanical — swap import, remove `authHeaders()`, drop manual headers
- `server/index.ts` (task 6.1) handles both the health route and the notifications route registration in a single edit

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "6.2"] },
    { "id": 1, "tasks": ["3.2", "3.3", "3.4", "6.1"] },
    { "id": 2, "tasks": ["1.2", "2.2", "3.5", "5.1"] },
    { "id": 3, "tasks": ["5.2", "6.3", "8.1"] },
    { "id": 4, "tasks": ["6.4", "7.1", "8.2"] },
    { "id": 5, "tasks": ["6.5", "7.2", "8.3"] }
  ]
}
```
