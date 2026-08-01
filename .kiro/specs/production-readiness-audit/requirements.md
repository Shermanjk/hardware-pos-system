# Requirements Document

## Introduction

This feature addresses six production-readiness gaps identified in the POS system audit. The system serves Admin, Cashier, and Clerk terminals over a local network using a Node.js/Express backend and React frontend. The six improvements target WebSocket connection reliability, authentication token lifecycle management, API request centralization, offline visibility for cashiers, and data synchronization resilience. All changes must be additive and must not break existing passing functionality.

## Glossary

- **WebSocket_Server**: The `ws`-based server in `server/index.ts` that maintains `adminClients` and `cashierClients` Sets and pushes real-time notifications to connected terminals.
- **WebSocket_Client**: The browser-side WebSocket connection established by each terminal (Admin or Cashier) to receive real-time push notifications.
- **Heartbeat**: A periodic ping/pong exchange between the WebSocket_Server and each WebSocket_Client used to detect and evict dead connections.
- **JWT**: The JSON Web Token issued on login and stored client-side, used to authenticate all API requests.
- **Auth_Interceptor**: A centralized Axios request interceptor that automatically attaches the Authorization header to every outgoing HTTP request.
- **Token_Renewal**: The silent, automatic issuance of a new JWT before the current token expires, without requiring the user to re-login.
- **Network_Status_Indicator**: A persistent UI banner or badge on the Cashier terminal that reflects the current reachability of the server.
- **Pending_Returns_Poll**: A periodic HTTP fetch on the Cashier terminal that retrieves the count and list of pending return and void requests.
- **Admin_Notification_Poll**: A periodic HTTP fetch on the Admin terminal that retrieves current pending-count badges for sidebar notifications.
- **Axios_Instance**: A shared, pre-configured Axios client with base URL, timeout, and interceptors applied once and reused across all API modules.
- **Cashier_Terminal**: The React page used by cashiers to process sales, handle returns, and manage the transaction queue.
- **Admin_Terminal**: The React dashboard used by administrators to manage products, users, reports, and approve return/void requests.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the WebSocket server to detect and remove dead client connections, so that server memory does not accumulate zombie sockets over a full business day.

#### Acceptance Criteria

1. THE WebSocket_Server SHALL send a ping frame to every connected client at a fixed interval not exceeding 30 seconds.
2. WHEN a connected client does not respond with a pong frame within 10 seconds of receiving a ping, THE WebSocket_Server SHALL terminate that connection and remove the socket from the `adminClients` or `cashierClients` Set.
3. WHEN a WebSocket connection is established, THE WebSocket_Server SHALL mark that socket as alive and reset the alive marker upon receiving any pong frame from that socket.
4. THE WebSocket_Server SHALL clear the heartbeat interval for a socket WHEN that socket emits a `close` event.
5. WHILE the WebSocket_Server is running, THE WebSocket_Server SHALL maintain only verified-alive sockets in the `adminClients` and `cashierClients` Sets at all times.

---

### Requirement 2

**User Story:** As a cashier or admin, I want my session token to renew automatically before it expires, so that I am never interrupted mid-shift by a forced re-login.

#### Acceptance Criteria

1. WHEN the remaining lifetime of the current JWT falls below 10 minutes, THE Auth_Context SHALL silently request a new JWT from the `/api/auth/refresh` endpoint using the current valid token.
2. WHEN the `/api/auth/refresh` endpoint returns a new JWT, THE Auth_Context SHALL replace the stored token with the new JWT and reset the expiry timer without interrupting the user session.
3. IF the `/api/auth/refresh` request fails with a non-401 network error, THEN THE Auth_Context SHALL retry the renewal once after a 30-second delay before presenting the expiry warning to the user.
4. IF the `/api/auth/refresh` request fails with a 401 response, THEN THE Auth_Context SHALL clear the stored token, cancel all renewal timers, and redirect the user to the login page.
5. THE server SHALL expose a `POST /api/auth/refresh` endpoint that accepts a valid, non-expired JWT in the Authorization header and returns a new JWT with a reset expiry window.
6. THE `POST /api/auth/refresh` endpoint SHALL reject requests that carry an already-expired JWT with a 401 response.

---

### Requirement 3

**User Story:** As a developer, I want all API calls to use a single centralized Axios instance with automatic auth-header injection, so that no page can accidentally send unauthenticated requests.

#### Acceptance Criteria

1. THE system SHALL provide a single Axios_Instance exported from a shared module that all API modules import and use for HTTP requests.
2. THE Axios_Instance SHALL include a request interceptor that reads the current JWT from storage and attaches it as the `Authorization: Bearer <token>` header on every outgoing request before the request is sent.
3. WHEN the JWT is absent from storage, THE Axios_Instance request interceptor SHALL allow the request to proceed without an Authorization header so that public endpoints (login, health-check) remain functional.
4. THE Axios_Instance SHALL include the response interceptor already present in `authApi.ts` that redirects to `/login` on a 401 response, consolidating duplicate interceptor logic.
5. THE system SHALL remove all manual `loadToken()` calls and inline `Authorization` header constructions from individual API modules after the Axios_Instance interceptor is in place.

---

### Requirement 4

**User Story:** As a cashier, I want a visible indicator when the server is unreachable, so that I do not attempt transactions that will fail and I can alert a supervisor immediately.

#### Acceptance Criteria

1. THE Cashier_Terminal SHALL display a persistent banner at the top of the page with the text "Server Unreachable — Transactions Unavailable" WHEN the HTTP health-check endpoint returns an error or times out.
2. WHEN the health-check endpoint returns a successful response after a period of failure, THE Cashier_Terminal SHALL dismiss the offline banner and restore full transaction capability.
3. THE Cashier_Terminal SHALL poll the server health-check endpoint at an interval not exceeding 15 seconds to determine current connectivity status.
4. WHILE the offline banner is displayed, THE Cashier_Terminal SHALL disable the payment submission controls to prevent transactions from being attempted.
5. THE server SHALL expose a `GET /api/health` endpoint that returns HTTP 200 with a JSON body `{ "status": "ok" }` without requiring authentication.

---

### Requirement 5

**User Story:** As a cashier, I want pending return and void requests to stay current even if a WebSocket notification was missed, so that I never process a transaction against an already-approved return.

#### Acceptance Criteria

1. THE Cashier_Terminal SHALL poll the pending returns and void requests endpoint at an interval not exceeding 60 seconds while the terminal is active.
2. WHEN the WebSocket_Client receives a return or void notification, THE Cashier_Terminal SHALL immediately trigger an out-of-band fetch of the pending list to reconcile the WebSocket event with the server state.
3. THE Cashier_Terminal SHALL merge the results of the HTTP poll with the current in-memory list, updating counts and entries without clearing any item that has not yet been acknowledged by the cashier.
4. IF the HTTP poll request fails, THEN THE Cashier_Terminal SHALL retain the most recently fetched list and display a visual indicator that the pending list may be stale.
5. WHEN the Cashier_Terminal is unmounted or the browser tab is hidden, THE Cashier_Terminal SHALL pause the polling interval and resume it WHEN the tab becomes visible again.

---

### Requirement 6

**User Story:** As an admin, I want the sidebar notification badges to remain accurate even after a WebSocket reconnection, so that I never miss a pending approval request.

#### Acceptance Criteria

1. THE Admin_Terminal SHALL poll the pending-counts endpoint at an interval not exceeding 60 seconds to retrieve current counts of pending return requests and void requests.
2. WHEN the WebSocket_Client reconnects after a disconnection, THE Admin_Terminal SHALL immediately trigger an out-of-band HTTP fetch of the pending counts to recover any notifications missed during the disconnection gap.
3. THE Admin_Terminal SHALL update the sidebar badge counts using the higher of the WebSocket-pushed value and the HTTP-polled value to prevent badge counts from decreasing incorrectly due to race conditions.
4. IF the HTTP poll request fails, THEN THE Admin_Terminal SHALL retain the last known badge counts and not reset them to zero.
5. THE server SHALL expose a `GET /api/notifications/pending-counts` endpoint that returns the current count of pending return requests and pending void requests for the authenticated admin without requiring a WebSocket connection.
6. WHEN the Admin_Notification_Poll receives a response, THE Admin_Terminal SHALL update the badge values displayed in the AdminSidebar component without requiring a full page reload.
