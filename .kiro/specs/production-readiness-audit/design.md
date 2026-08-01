# Design Document

## Production Readiness Audit

### Overview

This design addresses six production-readiness gaps in the POS system. All changes are strictly additive — no existing API signatures are removed, no existing routes are altered, and no database migrations are required. The six improvements are:

1. **WebSocket heartbeat** — detect and evict zombie sockets on the server.
2. **Token refresh endpoint** — server-side JWT renewal without re-login.
3. **Token auto-renewal** — client-side silent renewal in `AuthContext`.
4. **Centralized Axios instance** — shared `httpClient.ts` with one interceptor pair.
5. **Health endpoint + Cashier network indicator** — offline banner and payment lockout.
6. **Cashier pending poll + Admin notification poll** — resilient badge/count sync.

---

## Architecture

### Component Map

```
server/
  index.ts                   ← add GET /api/health (unauthenticated)
  ws.ts                      ← add per-socket ping/pong heartbeat
  routes/
    auth.ts                  ← add POST /api/auth/refresh
    notifications.ts         ← NEW: GET /api/notifications/pending-counts

client/src/
  shared/
    api/
      httpClient.ts          ← NEW: single Axios instance with interceptors
      authApi.ts             ← migrate to httpClient, keep loginRequest
      salesApi.ts            ← migrate to httpClient, remove authHeaders()
      productsApi.ts         ← migrate to httpClient, remove authHeaders()
      (all other api/*.ts)   ← same migration pattern
    contexts/
      AuthContext.tsx        ← add token auto-renewal logic
    hooks/
      useAdminNotificationPoll.ts  ← NEW: 60s poll + WS-reconnect trigger
  modules/
    cashier/pages/
      Cashier.tsx            ← add health poll, offline banner, pending poll
    admin/layout/
      AdminSidebar.tsx       ← consume useAdminNotificationPoll
```

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│  WebSocket Server (server/ws.ts)                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │  setInterval(30s)                               │    │
│  │    for each socket:                             │    │
│  │      if !isAlive → terminate + remove from Set  │    │
│  │      else        → isAlive=false; ws.ping()     │    │
│  │  ws.on('pong')   → isAlive=true                 │    │
│  │  ws.on('close')  → clearInterval(heartbeatId)   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  AuthContext (client)                                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │  scheduleRenewal(token):                        │    │
│  │    delay = exp - 10min - now                    │    │
│  │    setTimeout(doRenew, delay)                   │    │
│  │                                                 │    │
│  │  doRenew():                                     │    │
│  │    POST /api/auth/refresh                       │    │
│  │      success → saveToken(newToken)              │    │
│  │               scheduleRenewal(newToken)         │    │
│  │      401     → clearToken(); redirect /login    │    │
│  │      other   → retry once after 30s             │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  httpClient.ts                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  request interceptor:                           │    │
│  │    token = loadToken()                          │    │
│  │    if token → config.headers.Authorization =    │    │
│  │               "Bearer <token>"                  │    │
│  │                                                 │    │
│  │  response interceptor:                          │    │
│  │    on 401 + stored token → clearToken()         │    │
│  │                            redirect /login      │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Cashier.tsx                                            │
│  ┌──────────────────────────────────────────────┐       │
│  │  Health poll (15s):                          │       │
│  │    GET /api/health                           │       │
│  │    ok   → isOffline=false                   │       │
│  │    fail → isOffline=true                    │       │
│  │                                              │       │
│  │  Pending poll (60s) + WS event trigger:     │       │
│  │    GET /api/returns/my-pending              │       │
│  │    GET /api/voids/my-requests               │       │
│  │    merge → update state                     │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  useAdminNotificationPoll (AdminSidebar)                │
│  ┌──────────────────────────────────────────────┐       │
│  │  Poll (60s):                                 │       │
│  │    GET /api/notifications/pending-counts     │       │
│  │    merge = max(currentCount, polledCount)    │       │
│  │                                              │       │
│  │  WS reconnect callback:                      │       │
│  │    immediately trigger poll                  │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

---

## Component Designs

### 1. WebSocket Heartbeat (`server/ws.ts`)

The `ws` library exposes a `ping()` method on each socket. Per-socket heartbeat is preferred over a wss-level heartbeat because `cashierClients` is a `Map<userId, Set<WebSocket>>` and we need to remove dead sockets from the correct nested Set.

**Algorithm per connection:**

```typescript
// Extended WebSocket type with heartbeat marker
interface HeartbeatSocket extends WebSocket {
  isAlive: boolean;
}

// On connection:
(ws as HeartbeatSocket).isAlive = true;
ws.on("pong", () => { (ws as HeartbeatSocket).isAlive = true; });

const heartbeatId = setInterval(() => {
  const sock = ws as HeartbeatSocket;
  if (!sock.isAlive) {
    sock.terminate();               // triggers close event, which removes from Set
    clearInterval(heartbeatId);
    return;
  }
  sock.isAlive = false;             // will be reset by pong
  sock.ping();
}, 30_000);

ws.on("close", () => {
  clearInterval(heartbeatId);
  // existing removal from adminClients / cashierClients Sets
});
```

The `terminate()` call fires a `close` event synchronously, so existing `ws.on("close", ...)` handlers already registered during connection setup will remove the socket from `adminClients` or `cashierClients`. No additional cleanup logic is needed.

**Timeout enforcement:** The ping is sent every 30 s and `isAlive` is cleared immediately before the ping. On the _next_ tick (another 30 s later) the socket will be terminated if no pong arrives — giving an effective 30 s response window. To implement a strict 10 s pong timeout as specified in Requirement 1.2, a per-socket `setTimeout` is used alongside the interval:

```typescript
const HEARTBEAT_INTERVAL = 30_000;
const PONG_TIMEOUT_MS    = 10_000;

let pongTimer: ReturnType<typeof setTimeout> | null = null;

const heartbeatId = setInterval(() => {
  const sock = ws as HeartbeatSocket;
  // Send ping; wait PONG_TIMEOUT_MS for response
  sock.ping();
  pongTimer = setTimeout(() => {
    sock.terminate();
    clearInterval(heartbeatId);
  }, PONG_TIMEOUT_MS);
}, HEARTBEAT_INTERVAL);

ws.on("pong", () => {
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  (ws as HeartbeatSocket).isAlive = true;
});

ws.on("close", () => {
  clearInterval(heartbeatId);
  if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  // existing Set removal
});
```

---

### 2. Token Refresh Endpoint (`server/routes/auth.ts`)

A new route is appended to the existing `auth.ts` router. It reuses the `authenticate` middleware already present in the codebase and issues a fresh token with the same payload.

```typescript
import authenticate from "../middleware/authenticate.js";

// POST /api/auth/refresh
// Authorization: Bearer <current valid token>
router.post("/refresh", authenticate, async (req: Request, res: Response) => {
  const payload = (req as any).user as AuthPayload;

  const secret = process.env.JWT_SECRET;
  if (!secret) { res.status(500).json({ message: "Server configuration error." }); return; }

  // Preserve original expiry duration: inspect original token's exp vs iat
  // For simplicity, always issue a 12h token on refresh
  // (remember-me tokens will need re-login after 12h following a refresh,
  //  which is acceptable since the user is actively working)
  const newToken = jwt.sign(
    {
      id:         payload.id,
      full_name:  payload.full_name,
      username:   payload.username,
      role:       payload.role,
      employee_id: payload.employee_id ?? null,
    },
    secret,
    { expiresIn: "12h" }
  );

  res.status(200).json({ token: newToken });
});
```

The `authenticate` middleware rejects expired tokens with 401, satisfying Requirement 2.6 without any additional code.

**Note on `mustChangePassword` tokens:** The `authenticate` middleware already verifies JWTs. Tokens with `mustChangePassword: true` are restricted 15-minute tokens used only on first login. They should not be refreshed — the user must change their password first. The refresh endpoint will issue a normal 12h token from the decoded payload, but since `mustChangePassword` is not carried forward into `AuthPayload` by the middleware's type definition, these tokens will be rejected cleanly if the middleware strips unknown claims. A guard should be added:

```typescript
if ((payload as any).mustChangePassword) {
  res.status(403).json({ message: "Password change required before refresh." });
  return;
}
```

---

### 3. Token Auto-Renewal (`client/src/shared/contexts/AuthContext.tsx`)

Two timer refs are added alongside the existing `expiryTimerRef`:

- `renewalTimerRef` — fires 10 minutes before expiry to attempt renewal.
- `retryTimerRef` — fires 30 seconds after a non-401 renewal failure for one retry.

**Scheduling logic:**

```typescript
const RENEWAL_BEFORE_EXPIRY_MS = 10 * 60 * 1000; // 10 min

const scheduleRenewal = useCallback((tkn: string) => {
  if (renewalTimerRef.current) clearTimeout(renewalTimerRef.current);

  const exp = decodeTokenExpiry(tkn);
  if (!exp) return;

  const msUntilRenew = exp - Date.now() - RENEWAL_BEFORE_EXPIRY_MS;
  if (msUntilRenew <= 0) return; // token already within the renewal window

  renewalTimerRef.current = setTimeout(() => doRenew(false), msUntilRenew);
}, []);

const doRenew = useCallback(async (isRetry: boolean) => {
  try {
    const response = await axios.post<{ token: string }>("/api/auth/refresh");
    // axios instance will attach current token via interceptor
    const { token: newToken } = response.data;
    saveToken(newToken);
    setToken(newToken);
    scheduleExpiryWarning(newToken);
    scheduleRenewal(newToken);
  } catch (err: any) {
    if (err?.response?.status === 401) {
      // Token has expired or is invalid — force logout
      clearToken();
      if (renewalTimerRef.current) clearTimeout(renewalTimerRef.current);
      if (retryTimerRef.current)   clearTimeout(retryTimerRef.current);
      setToken(null);
      setUser(null);
      setLocation("/login");
    } else if (!isRetry) {
      // Network error — retry once after 30 s
      retryTimerRef.current = setTimeout(() => doRenew(true), 30_000);
    }
    // Second failure: fall through to existing expiry warning toast
  }
}, [scheduleExpiryWarning, scheduleRenewal, setLocation]);
```

All three timers are cleared in `logout()` and on unmount.

The `doRenew` function uses the centralized `httpClient` (see §4), which automatically attaches the current token. No manual `Authorization` header construction is needed here.

---

### 4. Centralized Axios Instance (`client/src/shared/api/httpClient.ts`)

A single module creates and exports one configured Axios instance. All API modules swap their bare `axios` import for this instance.

```typescript
// client/src/shared/api/httpClient.ts
import axios from "axios";
import { loadToken, clearToken, TOKEN_KEY } from "@/shared/utils/auth";

const httpClient = axios.create({
  timeout: 15_000, // 15 s — prevents hanging requests
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
httpClient.interceptors.request.use((config) => {
  const token = loadToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: force-logout on 401 ────────────────────────────────
httpClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) {
        clearToken();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default httpClient;
```

**Migration pattern for each API module:**

```typescript
// Before
import axios from "axios";
import { loadToken } from "@/shared/utils/auth";
function authHeaders() { ... }

// After
import httpClient from "@/shared/api/httpClient";
// Remove authHeaders() function entirely.
// Replace axios.get(...) with httpClient.get(...)
// Remove { headers: authHeaders() } from every call
```

The `loginRequest` in `authApi.ts` does not send a token and continues to work because the interceptor conditionally attaches the header only when `loadToken()` returns a value. During login, no token is stored yet, so the header is omitted.

The existing `axios.interceptors.response.use(...)` global interceptor in `authApi.ts` is **removed** once the `httpClient` instance interceptor is in place, to avoid double-interceptor side effects.

---

### 5. Health Endpoint (`server/index.ts`)

Added directly to `server/index.ts` before all other routes so it is always reachable even if a route module fails to load:

```typescript
// GET /api/health — unauthenticated liveness check
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
```

No authentication middleware is applied. The endpoint is intentionally minimal.

---

### 6. Cashier Network Indicator (`client/src/modules/cashier/pages/Cashier.tsx`)

Two independent concerns are added to `Cashier.tsx`:

#### 6a. Health Poll

```typescript
const HEALTH_POLL_INTERVAL = 15_000; // 15 s

const [isOffline, setIsOffline] = useState(false);

useEffect(() => {
  async function checkHealth() {
    try {
      await httpClient.get("/api/health", { timeout: 5_000 });
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    }
  }

  checkHealth(); // immediate on mount
  const id = setInterval(checkHealth, HEALTH_POLL_INTERVAL);
  return () => clearInterval(id);
}, []);
```

The banner is rendered at the top of the page body (below the `<header>`):

```tsx
{isOffline && (
  <div className="shrink-0 bg-red-600 text-white text-sm font-semibold text-center py-2 px-4">
    Server Unreachable — Transactions Unavailable
  </div>
)}
```

The `isOffline` flag is passed to `<PaymentPanel>` so the process-payment button can be disabled:

```tsx
<PaymentPanel
  ...
  isOffline={isOffline}   // new prop
/>
```

Inside `PaymentPanel`, the submit button gains `disabled={isProcessing || isOffline}`.

#### 6b. Pending Poll

```typescript
const PENDING_POLL_INTERVAL = 60_000; // 60 s

// Replace the two separate one-time load useEffects with a unified fetch function
const fetchPendingData = useCallback(async () => {
  try {
    const [returnsData, voidData] = await Promise.allSettled([
      getMyPendingReturns(),
      getMyVoidRequests(),
    ]);

    if (returnsData.status === "fulfilled") {
      const held: HeldReturn[] = returnsData.value.map((r) => ({
        id: String(r.id),
        heldAt: new Date(r.created_at),
        returnId: r.id,
        returnNumber: r.return_number,
        invoiceNumber: r.invoice_number,
        customerName: r.customer_name,
        decision:
          r.status === "waiting_for_cashier" || r.status === "approved"
            ? "waiting_for_cashier"
            : undefined,
        adminName: r.admin_name || undefined,
      }));
      // Merge: preserve unacknowledged items not present in fresh data
      setHeldReturns((prev) => mergeReturns(prev, held));
    }

    if (voidData.status === "fulfilled") {
      setPendingVoidRequestsCount(voidData.value.length);
    }
  } catch {
    // Retain last known state on failure — no state update
  }
}, []);
```

**Merge helper (pure function, testable):**

```typescript
function mergeReturns(current: HeldReturn[], polled: HeldReturn[]): HeldReturn[] {
  const polledIds = new Set(polled.map((r) => r.returnId));
  // Keep items from current list that are not in polled but are unacknowledged
  const unacknowledged = current.filter(
    (r) => !polledIds.has(r.returnId) && !r.decision
  );
  return [...polled, ...unacknowledged];
}
```

**Poll setup:**

```typescript
useEffect(() => {
  fetchPendingData();
  const id = setInterval(fetchPendingData, PENDING_POLL_INTERVAL);

  // Pause when tab is hidden, resume when visible
  const handleVisibility = () => {
    if (document.visibilityState === "visible") fetchPendingData();
  };
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}, [fetchPendingData]);
```

**WS integration:** The existing `useReturnDecisions` and `useVoidDecisions` callbacks call `fetchPendingData()` after updating local state, reconciling the WS push with server state.

---

### 7. Admin Notification Poll (`client/src/shared/hooks/useAdminNotificationPoll.ts`)

A new hook encapsulates the polling and WS-reconnect trigger logic:

```typescript
// client/src/shared/hooks/useAdminNotificationPoll.ts

interface PendingCounts {
  pendingReturns: number;
  pendingVoids:   number;
}

interface UseAdminNotificationPollResult {
  pendingReturns: number;
  pendingVoids:   number;
  triggerRefresh: () => void;
}

const ADMIN_POLL_INTERVAL = 60_000;

export function useAdminNotificationPoll(): UseAdminNotificationPollResult {
  const [counts, setCounts] = useState<PendingCounts>({
    pendingReturns: 0,
    pendingVoids: 0,
  });

  const fetchCounts = useCallback(async () => {
    try {
      const res = await httpClient.get<PendingCounts>(
        "/api/notifications/pending-counts"
      );
      setCounts((prev) => ({
        pendingReturns: Math.max(prev.pendingReturns, res.data.pendingReturns),
        pendingVoids:   Math.max(prev.pendingVoids,   res.data.pendingVoids),
      }));
    } catch {
      // Retain last known counts on failure
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const id = setInterval(fetchCounts, ADMIN_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchCounts]);

  return {
    pendingReturns: counts.pendingReturns,
    pendingVoids:   counts.pendingVoids,
    triggerRefresh: fetchCounts,
  };
}
```

`AdminSidebar` calls `useAdminNotificationPoll()` and passes `triggerRefresh` as the `onOpen` callback to the existing `createReconnectingWS` factory (via `useReturnNotifications` / `useVoidRequestNotifications` hooks), which already accepts an `onOpen` prop. When the WS reconnects, `triggerRefresh()` fires immediately.

**`GET /api/notifications/pending-counts` endpoint (`server/routes/notifications.ts`):**

```typescript
import { Router, Request, Response } from "express";
import authenticate from "../middleware/authenticate.js";
import { pool } from "../db.js";

const router = Router();

router.get("/pending-counts", authenticate, async (_req: Request, res: Response) => {
  try {
    const [[returnsRow]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS cnt FROM returns WHERE status = 'pending'`
    );
    const [[voidsRow]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS cnt FROM void_requests WHERE status = 'pending'`
    );
    res.json({
      pendingReturns: Number(returnsRow.cnt),
      pendingVoids:   Number(voidsRow.cnt),
    });
  } catch (err) {
    console.error("[notifications/pending-counts] Error:", err);
    res.status(500).json({ message: "Failed to fetch pending counts." });
  }
});

export default router;
```

Registered in `server/index.ts`:
```typescript
import notificationsRoutes from "./routes/notifications.js";
// ...
app.use("/api/notifications", notificationsRoutes);
```

---

## Data Models

No new database tables are introduced. The feature reads from existing `returns` and `void_requests` tables.

### JWT Payload (unchanged)

```typescript
interface AuthPayload {
  id:          number;
  full_name:   string;
  username:    string;
  role:        "Admin" | "Inventory Clerk" | "Cashier";
  employee_id: string | null;
  iat:         number;
  exp:         number;
}
```

### Health Response

```typescript
interface HealthResponse {
  status: "ok";
}
```

### Pending Counts Response

```typescript
interface PendingCountsResponse {
  pendingReturns: number;
  pendingVoids:   number;
}
```

---

## Interfaces

### New Prop: `PaymentPanel` — `isOffline`

```typescript
// client/src/modules/cashier/components/PaymentPanel.tsx
interface PaymentPanelProps {
  // ... existing props ...
  isOffline: boolean;  // NEW: disables payment submit when true
}
```

### New Hook: `useAdminNotificationPoll`

```typescript
interface UseAdminNotificationPollResult {
  pendingReturns: number;
  pendingVoids:   number;
  triggerRefresh: () => void;
}
```

### `createReconnectingWS` — `onOpen` callback (already exists)

The factory in `useReturnNotifications.ts` already has an `onOpen` option. `AdminSidebar` will pass `triggerRefresh` through the hooks that use it.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| WS pong timeout (10 s) | `ws.terminate()` → `close` event fires → socket removed from Set |
| Token refresh 401 | `clearToken()` + cancel timers + redirect `/login` |
| Token refresh network error (1st) | retry after 30 s |
| Token refresh network error (2nd) | fall through to existing expiry warning toast |
| Health check fail / timeout | `isOffline=true`; banner shown; payment disabled |
| Health check recovers | `isOffline=false`; banner dismissed; payment re-enabled |
| Pending poll fail (cashier) | Retain last known list; no state change |
| Pending poll fail (admin) | Retain last known badge counts; no state change |
| `POST /api/auth/refresh` with `mustChangePassword` token | 403 response |
| `GET /api/notifications/pending-counts` DB error | 500 with JSON error message |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Dead socket termination

*For any* Set of WebSocket connections containing a mix of alive and non-alive sockets, after a heartbeat check cycle executes, every socket that had `isAlive = false` at the start of the cycle SHALL have been terminated and removed from its client Set.

**Validates: Requirements 1.2, 1.5**

---

### Property 2: Pong resets alive marker

*For any* WebSocket socket regardless of its current `isAlive` state, when a `pong` event is received on that socket, the `isAlive` marker SHALL be set to `true`.

**Validates: Requirements 1.3**

---

### Property 3: Token renewal is scheduled at the correct time

*For any* valid JWT with an expiry timestamp greater than 10 minutes in the future, when `scheduleRenewal` is called with that token, the renewal timer SHALL be scheduled to fire at approximately `(expiry - 10 minutes - now)` milliseconds from the current time (within a 1-second tolerance).

**Validates: Requirements 2.1**

---

### Property 4: Successful refresh replaces stored token

*For any* new JWT returned by `POST /api/auth/refresh`, after the `doRenew` success handler executes, the value returned by `loadToken()` SHALL equal the new JWT, and a new renewal timer SHALL be scheduled based on the new token's expiry.

**Validates: Requirements 2.2**

---

### Property 5: Refresh endpoint preserves user claims

*For any* valid, non-expired JWT carrying a user payload (id, full_name, username, role, employee_id), calling `POST /api/auth/refresh` with that token SHALL return a new JWT whose decoded payload contains the same identity claims and a new `exp` timestamp in the future.

**Validates: Requirements 2.5**

---

### Property 6: Expired tokens are rejected by the refresh endpoint

*For any* JWT whose `exp` claim is in the past, calling `POST /api/auth/refresh` SHALL return HTTP 401.

**Validates: Requirements 2.6**

---

### Property 7: Authorization header attachment

*For any* HTTP request made through `httpClient` while a valid JWT is stored in `localStorage`, the outgoing request config SHALL contain an `Authorization` header with the value `Bearer <token>`. Conversely, when no token is stored, the `Authorization` header SHALL be absent from the request config.

**Validates: Requirements 3.2, 3.3**

---

### Property 8: Offline state reflects health-check result

*For any* sequence of health-check responses, the `isOffline` state SHALL be `true` after any failed response (error or timeout) and `false` after any successful response, independent of prior state.

**Validates: Requirements 4.1, 4.2**

---

### Property 9: Payment is disabled when offline

*For any* `isOffline = true` state of the Cashier terminal, the payment submission control SHALL have its `disabled` attribute set, preventing transaction submission.

**Validates: Requirements 4.4**

---

### Property 10: Pending list merge preserves unacknowledged items

*For any* current in-memory pending returns list and any freshly polled returns list, after `mergeReturns(current, polled)` executes, the result SHALL contain all items from `polled` plus any items from `current` that are absent from `polled` and have no `decision` value (i.e., are unacknowledged).

**Validates: Requirements 5.3**

---

### Property 11: Badge count uses the maximum of polled and WebSocket values

*For any* pair of `(currentCount, polledCount)` where both are non-negative integers, after the admin notification poll merges values, the resulting badge count for each category SHALL equal `Math.max(currentCount, polledCount)`.

**Validates: Requirements 6.3**
