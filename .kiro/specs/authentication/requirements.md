# Authentication & Login — Requirements

## Overview

The Login page (`client/src/pages/Login.tsx`) is already built visually. This spec covers replacing the mock authentication with real database-backed auth so that users are verified against the `hardware_pos.users` MySQL table before any module can be accessed.

---

## Requirements

### REQ-1: Login Form Submission

**User Story:** As a user, I want to enter my username and password to log in, so that only authorized personnel can access the system.

**Acceptance Criteria:**
- 1.1 The login form must send a POST request to `/api/auth/login` with `{ username, password, role }` in the request body.
- 1.2 The `role` field must be derived from the selected role button: `"admin"`, `"inventory_clerk"`, or `"cashier"`.
- 1.3 The submit button must show a loading state while the request is in flight.
- 1.4 Username and password fields must not be empty on submission — show inline validation errors if blank.

---

### REQ-2: Credential Verification

**User Story:** As the system, I want to verify credentials against the database so that only users with valid accounts can log in.

**Acceptance Criteria:**
- 2.1 The server must query the `users` table by `username`.
- 2.2 The server must compare the submitted password against `password_hash` using bcrypt.
- 2.3 If username does not exist or password does not match, return HTTP 401 with: `"Invalid username or password."`
- 2.4 Credentials must never be logged or exposed in API responses.

---

### REQ-3: Role Validation

**User Story:** As the system, I want to enforce that a user can only log in via their assigned role so that role-based access cannot be bypassed.

**Acceptance Criteria:**
- 3.1 The server must compare the submitted `role` against the user's `role` column.
- 3.2 Role mapping: `"admin"` → `"Admin"`, `"inventory_clerk"` → `"Inventory Clerk"`, `"cashier"` → `"Cashier"`.
- 3.3 If roles do not match, return HTTP 403 with: `"You are not authorized to log in as this role."`

---

### REQ-4: Account Status Check

**User Story:** As the system, I want to block inactive accounts from logging in so that terminated employees cannot access the system.

**Acceptance Criteria:**
- 4.1 If the user's `status` is `'Inactive'`, return HTTP 403 with: `"Your account has been deactivated. Please contact your administrator."`
- 4.2 Status check must occur after credential verification.

---

### REQ-5: JWT Session

**User Story:** As the system, I want to issue a session token after successful login so that authenticated users can make subsequent API calls.

**Acceptance Criteria:**
- 5.1 On successful login, return a signed JWT containing: `{ id, full_name, username, role, employee_id }`.
- 5.2 JWT must be signed with a secret from the `JWT_SECRET` environment variable.
- 5.3 Default JWT expiry: 8 hours.
- 5.4 If "Remember Me" is checked, JWT expiry must be 30 days.
- 5.5 The token must be stored in `localStorage` under key `pos_token`.
- 5.6 The token must be sent as a `Bearer` token in the `Authorization` header on all API requests.

---

### REQ-6: Role-Based Redirect After Login

**User Story:** As a logged-in user, I want to be automatically redirected to my module after login.

**Acceptance Criteria:**
- 6.1 After successful login, redirect based on role from JWT:
  - `Admin` → `/`
  - `Inventory Clerk` → `/clerk/dashboard`
  - `Cashier` → `/cashier`
- 6.2 Redirect must use the role from the JWT response, not the selected button.

---

### REQ-7: Protected Routes

**User Story:** As the system, I want to protect all non-login routes so that unauthenticated users are redirected to `/login`.

**Acceptance Criteria:**
- 7.1 Navigating to `/`, `/clerk/*`, or `/cashier` without a valid JWT must redirect to `/login`.
- 7.2 A JWT utility must check token existence and expiry on the client.
- 7.3 If the token is expired, it must be cleared and the user redirected to `/login`.
- 7.4 A `ProtectedRoute` component must wrap the three router sections in `App.tsx`.

---

### REQ-8: Logout

**User Story:** As a logged-in user, I want to log out so that my session is terminated.

**Acceptance Criteria:**
- 8.1 Clicking Logout must clear the JWT from `localStorage`.
- 8.2 After logout, the user must be redirected to `/login`.
- 8.3 A global `useAuth` hook must expose `{ user, token, login, logout }` to all modules.

---

### REQ-9: Unified Auth Context

**User Story:** As a developer, I want a single unified auth context for all roles so that all modules access the current user consistently.

**Acceptance Criteria:**
- 9.1 Replace `ClerkAuthContext` with a unified `AuthContext` covering all three roles.
- 9.2 `AuthContext` must expose: `user` (id, full_name, username, role, employee_id), `token`, `isAuthenticated`, `login(username, password, role, rememberMe)`, `logout()`.
- 9.3 The existing `useClerkAuth` hook must be aliased to the new context to avoid breaking clerk pages during migration.

---

### REQ-10: Error Display

**User Story:** As a user, I want to see clear error messages when login fails so that I know what went wrong.

**Acceptance Criteria:**
- 10.1 API errors must be displayed as a visible error banner inside the login card, above the submit button.
- 10.2 The error banner must be dismissible.
- 10.3 Error messages must be user-friendly — no stack traces or raw error objects.
- 10.4 On a new submission attempt, the previous error must be cleared.

---

## Out of Scope

- Password reset / forgot password
- Multi-factor authentication
- OAuth / SSO
- Auto-logout after inactivity
- Audit logging of login events (separate spec)
