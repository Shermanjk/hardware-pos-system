# Implementation Plan: User Account Management

## Overview

Implement the full employee account lifecycle for the Isra Hardware POS system. The plan follows a bottom-up order: database → server utilities → server routes → client API layer → client pages/components → final wiring. Each task is scoped so that every piece of new code is immediately integrated into the running system before the next task begins.

---

## Tasks

- [ ] 1. Database migration — extend `users` table and create `audit_logs` table
  - Create `migrations/001_add_password_lifecycle.sql` with `ALTER TABLE users ADD COLUMN IF NOT EXISTS` statements for `must_change_password`, `password_changed_at`, and `updated_at`
  - Add the `CREATE TABLE IF NOT EXISTS audit_logs` DDL (columns: `id`, `action`, `performed_by_id`, `performed_by_username`, `target_user_id`, `target_username`, `metadata`, `created_at`)
  - Include foreign-key constraints `fk_audit_performed_by` and `fk_audit_target` referencing `users(id)`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1_

- [ ] 2. Server utilities — password generator and audit logger
  - [ ] 2.1 Implement `server/utils/passwordGenerator.ts`
    - Export `generateTempPassword(): string`
    - Use `crypto.randomBytes` for a cryptographically secure source
    - Guarantee length 10–12, at least one uppercase, one lowercase, one digit, one special character from `!@#$%^&*`
    - Use the Fisher-Yates shuffle seeded from `crypto.randomBytes`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 2.2 Write property test for `generateTempPassword` (Property 1)
    - **Property 1: Password generator invariants** — for any call, the returned string has length 10–12, contains ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special char from `!@#$%^&*`
    - Use `fast-check` with `fc.constant(undefined)` repeated ≥100 times
    - Tag: `// Feature: user-account-management, Property 1`
    - **Validates: Requirements 2.1, 2.2, 2.6**

  - [ ] 2.3 Implement `server/utils/auditLogger.ts`
    - Export `logAuditEvent(params)` (see design for full signature)
    - Insert one row into `audit_logs` using `pool` from `server/db.ts`
    - Swallow errors with `console.error` — never throw
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [ ]* 2.4 Write property test for bcrypt round-trip (Property 2)
    - **Property 2: Bcrypt hash round-trip with cost factor** — for any plaintext, `bcrypt.compare(plaintext, hash)` returns `true`, and hash begins with `$2b$10$` or higher
    - Use `fc.string({ minLength: 1, maxLength: 72 })`
    - Tag: `// Feature: user-account-management, Property 2`
    - **Validates: Requirements 2.4, 7.1**

- [ ] 3. Server middleware — extend `AuthPayload`
  - In `server/middleware/authenticate.ts`, add `mustChangePassword?: boolean` to the `AuthPayload` interface
  - Update the global `Express.Request` declaration to reflect the updated type
  - _Requirements: 4.1_

- [ ] 4. Extend `server/routes/auth.ts` — restricted JWT branch
  - After a successful credential + status check, query `must_change_password` from the DB row
  - If `must_change_password = TRUE`, sign a 15-minute JWT with `{ ...payload, mustChangePassword: true }` and return `{ token, user: { ...payload, mustChangePassword: true } }`; return early without issuing the full-access token
  - Leave all existing logic (role check, status check, `rememberMe` expiry) intact
  - _Requirements: 4.1_

  - [ ]* 4.1 Write property test for restricted JWT issuance (Property 5)
    - **Property 5: First login with temp password issues a restricted JWT** — for any user with `must_change_password = TRUE`, valid login yields a JWT where `mustChangePassword === true` and expiry is within 15 minutes of issuance
    - Mock `pool.execute` to return a user row with `must_change_password: 1`
    - Use `fc.record` with `must_change_password: fc.constant(true)`
    - Tag: `// Feature: user-account-management, Property 5`
    - **Validates: Requirements 4.1**

  - [ ]* 4.2 Write property test for inactive login rejection (Property 10)
    - **Property 10: Inactive account login is rejected with HTTP 403** — for any user with `status = 'Inactive'`, a login attempt returns 403 and no JWT
    - Mock `pool.execute` to return rows with `status: "Inactive"`
    - Use `fc.record` with `status: fc.constant("Inactive")`
    - Tag: `// Feature: user-account-management, Property 10`
    - **Validates: Requirements 6.3**

- [ ] 5. Implement `server/routes/users.ts`
  - [ ] 5.1 Scaffold the router with `authenticate` middleware and Admin role guard
    - Import `authenticate` from `../middleware/authenticate.js`
    - Write a helper `requireAdmin` that checks `req.user?.role === "Admin"` and returns 403 if not
    - Apply `authenticate` to all routes; apply `requireAdmin` to all routes except `change-password`
    - _Requirements: 7.5_

  - [ ]* 5.2 Write property test for Admin role enforcement (Property 12)
    - **Property 12: Protected user endpoints enforce Admin role** — requests with no JWT, expired JWT, or non-Admin role return 403 for all protected routes
    - Use `fc.constantFrom(undefined, "Cashier", "Inventory Clerk")` for `req.user.role`
    - Tag: `// Feature: user-account-management, Property 12`
    - **Validates: Requirements 7.5**

  - [ ] 5.3 Implement `GET /api/users` — list all users
    - Query all columns except `password_hash` from `users`; return as JSON array
    - Include `must_change_password`, `password_changed_at`, `updated_at` in the response
    - _Requirements: 9.1_

  - [ ] 5.4 Implement `POST /api/users` — create user
    - Validate body with zod: `full_name` (required), `username` (required), `role` (required, enum), `status` (required, enum), `employee_id` (optional)
    - Return 422 with field-level errors on validation failure
    - Return 409 with `"Username already exists."` on duplicate username
    - Call `generateTempPassword()`, hash with bcrypt (cost 10), insert row with `must_change_password = TRUE`, `password_changed_at = NULL`
    - Call `logAuditEvent` with action `"account_created"`
    - Return `{ user, tempPassword }` — never persist or log the plaintext
    - _Requirements: 3.4, 3.7, 3.8, 3.9, 7.2, 7.4_

  - [ ]* 5.5 Write property test for user creation input validation (Property 4)
    - **Property 4: User creation input validation rejects all invalid payloads** — any payload missing a required field or using an invalid value returns HTTP 422 with field errors and creates no DB row
    - Use `fc.record` with required fields dropped or set to invalid types via `fc.oneof`
    - Tag: `// Feature: user-account-management, Property 4`
    - **Validates: Requirements 3.8**

  - [ ]* 5.6 Write property test for temp-password lifecycle flags on create (Property 3)
    - **Property 3: Temporary password activation sets lifecycle flags** — after `POST /api/users`, the created user record has `must_change_password = TRUE` and `password_changed_at = NULL`
    - Mock `pool.execute` to capture INSERT params; assert flag values
    - Tag: `// Feature: user-account-management, Property 3`
    - **Validates: Requirements 3.4**

  - [ ]* 5.7 Write property test for no `password_hash` in responses (Property 11)
    - **Property 11: API responses never expose password fields** — for any response from user routes, the body does not contain `password_hash` or any bcrypt hash string
    - Snapshot response objects across all user route handlers
    - Tag: `// Feature: user-account-management, Property 11`
    - **Validates: Requirements 7.2, 7.3**

  - [ ] 5.8 Implement `PUT /api/users/:id` — edit user
    - Accept partial updates for `full_name`, `role`, `status`, `employee_id`; validate with zod
    - Set `updated_at = NOW()`; return updated user row (no `password_hash`)
    - _Requirements: 9.1_

  - [ ] 5.9 Implement `POST /api/users/:id/reset-password` — Admin password reset
    - Call `generateTempPassword()`, hash with bcrypt (cost 10)
    - Update `password_hash`, set `must_change_password = TRUE`, `password_changed_at = NULL`
    - Call `logAuditEvent` with action `"password_reset"`
    - Return `{ tempPassword }` — never persist or log the plaintext
    - _Requirements: 5.3, 5.6, 7.2, 7.4_

  - [ ]* 5.10 Write property test for temp-password lifecycle flags on reset (Property 3 — reset branch)
    - **Property 3 (reset branch): Temporary password activation sets lifecycle flags** — after `POST /api/users/:id/reset-password`, the user record has `must_change_password = TRUE` and `password_changed_at = NULL`
    - Mock `pool.execute` to capture UPDATE params; assert flag values
    - Tag: `// Feature: user-account-management, Property 3`
    - **Validates: Requirements 5.3**

  - [ ] 5.11 Implement `POST /api/users/:id/deactivate` — deactivate account
    - Update `status = 'Inactive'`, `updated_at = NOW()`
    - Call `logAuditEvent` with action `"account_deactivated"`
    - Return 200 with the updated user row (no `password_hash`)
    - _Requirements: 6.2, 6.4_

  - [ ]* 5.12 Write property test for deactivation fields (Property 9)
    - **Property 9: Account deactivation sets status and timestamp** — after deactivation, `status = 'Inactive'` and `updated_at` is non-null, persisted in DB
    - Mock `pool.execute` to capture UPDATE params; assert values
    - Tag: `// Feature: user-account-management, Property 9`
    - **Validates: Requirements 6.2**

  - [ ] 5.13 Implement `POST /api/users/:id/change-password` — employee changes temp password
    - Accept the restricted JWT (`mustChangePassword: true`) as well as a full-access JWT via the `authenticate` middleware (no Admin role check; enforce that `req.user.id === parseInt(req.params.id)`)
    - Validate body: `currentPassword`, `newPassword`, `confirmPassword`
    - Verify `currentPassword` against stored hash; return 422 on mismatch
    - Enforce new password complexity (≥8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special char) and confirm match; return 422 with per-field errors on failure
    - Hash new password (bcrypt cost 10), update `password_hash`, set `must_change_password = FALSE`, `password_changed_at = NOW()`
    - Call `logAuditEvent` with action `"password_changed"`
    - Issue and return a new full-access JWT (role-based expiry using `rememberMe = false`)
    - _Requirements: 4.6, 4.7, 4.8, 4.10_

  - [ ]* 5.14 Write property test for password complexity validation (Property 6)
    - **Property 6: Password change validation enforces all complexity rules** — the endpoint returns 422 if and only if any of: current password mismatch, new password < 8 chars, new password missing a required character class, or new/confirm mismatch
    - Use `fc.string()` with `fc.oneof` for valid and invalid inputs per rule
    - Tag: `// Feature: user-account-management, Property 6`
    - **Validates: Requirements 4.6, 4.7**

  - [ ]* 5.15 Write property test for lifecycle fields after password change (Property 7)
    - **Property 7: Successful password change updates all lifecycle fields** — after a valid change, `password_hash` is updated (bcrypt of new password), `must_change_password = FALSE`, `password_changed_at` is non-null
    - Use `fc.string` filtered by complexity requirements
    - Tag: `// Feature: user-account-management, Property 7`
    - **Validates: Requirements 4.8**

- [ ] 6. Implement `server/routes/auditLogs.ts`
  - Scaffold router with `authenticate` + `requireAdmin`
  - Implement `GET /api/audit-logs` — paginated list (`page`, `pageSize` query params); query `audit_logs` ordered by `created_at DESC`; return `{ entries, total, page, pageSize }`
  - _Requirements: 8.4_

  - [ ]* 6.1 Write property test for audit log timestamp accuracy (Property 13)
    - **Property 13: Audit log timestamps are server-side UTC** — for any `logAuditEvent` call, the `created_at` written to DB is within 5 seconds of `Date.now()` at call time
    - Mock `pool.execute` to capture INSERT params; compare timestamp
    - Tag: `// Feature: user-account-management, Property 13`
    - **Validates: Requirements 8.3**

- [ ] 7. Mount new routes in `server/index.ts`
  - Import `usersRoutes` from `./routes/users.js` and `auditLogsRoutes` from `./routes/auditLogs.js`
  - Mount `app.use("/api/users", usersRoutes)` and `app.use("/api/audit-logs", auditLogsRoutes)` before the static file handler
  - _Requirements: 9.1, 8.4_

- [ ] 8. Checkpoint — verify server is functional
  - Ensure all TypeScript server files compile without errors
  - Ensure all server-side tests pass
  - Ask the user if any questions arise before proceeding to the client.

- [ ] 9. Client — extend auth utilities and context
  - [ ] 9.1 Extend `client/src/shared/utils/auth.ts`
    - Add `mustChangePassword?: boolean` to `AuthUser` interface
    - Update `getUserFromToken` to extract `mustChangePassword` from the decoded payload
    - Update `getRedirectPath` to return `"/change-password"` when `user.mustChangePassword === true`; keep all existing role paths unchanged
    - _Requirements: 4.2, 4.9_

  - [ ]* 9.2 Write property test for `getRedirectPath` (Property 8)
    - **Property 8: Role-based redirect path is correct for every role** — `getRedirectPath` returns `"/"` for Admin, `"/clerk/dashboard"` for Inventory Clerk, `"/cashier"` for Cashier when `mustChangePassword` is absent/false; returns `"/change-password"` when `mustChangePassword === true`
    - Use `fc.constantFrom("Admin", "Inventory Clerk", "Cashier")` combined with `fc.boolean()` for `mustChangePassword`
    - Tag: `// Feature: user-account-management, Property 8`
    - **Validates: Requirements 4.9**

  - [ ] 9.3 Update `client/src/shared/contexts/AuthContext.tsx`
    - In the mount rehydration `useEffect`, if the decoded token has `mustChangePassword: true`, set `user` with that flag so guards can enforce the redirect
    - No change needed to `login()` — it calls `getRedirectPath` which will now handle the `mustChangePassword` case
    - _Requirements: 4.2_

- [ ] 10. Client API layer
  - [ ] 10.1 Create `client/src/shared/api/usersApi.ts`
    - Export `UserRecord`, `CreateUserPayload`, `CreateUserResponse` interfaces (see design)
    - Implement `getUsers`, `createUser`, `updateUser`, `resetPassword`, `deactivateUser`, `changePassword` using axios
    - Read the JWT from `loadToken()` and set `Authorization: Bearer <token>` on every request
    - _Requirements: 9.1, 3.5, 5.4, 6.2_

  - [ ] 10.2 Create `client/src/shared/api/auditLogsApi.ts`
    - Export `AuditLogEntry` and `AuditLogsResponse` interfaces
    - Implement `getAuditLogs(page?, pageSize?)` using axios with the auth header
    - _Requirements: 8.4_

- [ ] 11. Client — `PasswordChangeGuard` component
  - Create `client/src/shared/components/PasswordChangeGuard.tsx`
  - Reads `user` from `useAuth()`
  - If `user.mustChangePassword === true` and the current path is NOT `/change-password`, redirect to `/change-password` (using `useLocation` from wouter)
  - If `user.mustChangePassword !== true`, render `children` normally
  - _Requirements: 4.2, 10.6_

- [ ] 12. Client — `ChangePassword` page
  - Create `client/src/pages/ChangePassword.tsx` as a standalone full-page component (no Admin or Clerk layout wrapper)
  - Display the application logo (`IH` monogram + "Isra Hardware POS" title, matching `Login.tsx`)
  - Display the mandatory change notice: `"Welcome! For security reasons, you must change your temporary password before using the POS."`
  - Render three password fields: Current Password, New Password, Confirm Password — each with a show/hide toggle and an accessible `aria-label` describing current state (e.g., `"Show current password"` / `"Hide current password"`)
  - Implement a real-time password strength indicator: Weak / Fair / Strong (Weak: length < 8 or missing ≥2 classes; Fair: length ≥8, missing exactly 1 class; Strong: length ≥8, all 4 classes present)
  - Mark all three fields as `required`; display per-field inline validation messages from 422 responses
  - Call `changePassword(user.id, { currentPassword, newPassword, confirmPassword })` from `usersApi.ts` on submit
  - On success: save the returned token, update `AuthContext` state, redirect to `getRedirectPath(user.role)` (which will now be the role dashboard since `mustChangePassword` will be absent from the new token)
  - Disable the submit button while in-flight
  - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.9, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 13. Client — add `/change-password` route in `App.tsx`
  - Import `ChangePassword` from `@/pages/ChangePassword`
  - Import `PasswordChangeGuard` from `@/shared/components/PasswordChangeGuard`
  - Add a `<Route path="/change-password">` block wrapping `<ChangePasswordGuard><ChangePassword /></ChangePasswordGuard>` **before** the catch-all Admin route
  - Update the existing Admin and Clerk `ProtectedRoute` wrappers to also redirect to `/change-password` if `user.mustChangePassword === true` (can delegate to `PasswordChangeGuard` or inline the check)
  - _Requirements: 4.2, 10.6_

- [ ] 14. Client — replace mock data in `Users.tsx` with real API
  - [ ] 14.1 Replace static `users` array with `getUsers()` from `usersApi.ts`
    - Use `useState` + `useEffect` to load users on mount
    - Show a loading spinner while in-flight; disable action buttons
    - Display an inline error banner if `getUsers()` fails (without navigating away)
    - Render real fields: Full Name, Username, Role, Status, Last Login (`password_changed_at` or `"Never"`), actions
    - Render status badge: green (`bg-green-100 text-green-800`) for `Active`, gray (`bg-gray-100 text-gray-800`) for `Inactive`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 14.2 Write property test for status badge rendering (Property 14)
    - **Property 14: Status badge renders correctly for any user status** — `Active` renders green classes, `Inactive` renders gray classes
    - Use React Testing Library + `fc.constantFrom("Active", "Inactive")`
    - Tag: `// Feature: user-account-management, Property 14`
    - **Validates: Requirements 9.2**

  - [ ] 14.3 Implement Create User modal
    - Open on "Add User" button click
    - Fields: Full Name (required), Employee ID (optional), Username (required), Role (required, `Cashier` | `Inventory Clerk`), Status (required, `Active` | `Inactive`, default `Active`)
    - No password field
    - On submit: call `createUser()`; show loading state; handle 422 field errors and 409 username error inline
    - On success: display temp password in a read-only field + "Copy Password" + "Print Credentials" buttons; refresh user list
    - On modal close: clear the displayed temp password from state; do not re-display it
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8_

  - [ ] 14.4 Implement Reset Password dialog
    - Triggered by the Reset Password action button on each row
    - Confirmation dialog: names the employee and requires explicit confirm
    - On confirm: call `resetPassword(id)`; show loading; on success display new temp password in read-only field + "Copy" + "Print" + "Done" buttons
    - On close: clear temp password from state; do not re-display it
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 14.5 Implement Deactivate confirmation dialog
    - Triggered by the Deactivate action button on each row (shown only for `Active` accounts)
    - Confirmation dialog before applying; on confirm call `deactivateUser(id)`; refresh user list
    - _Requirements: 6.1, 6.2_

- [ ] 15. Final checkpoint — ensure everything is wired and tests pass
  - Ensure all TypeScript files (client and server) compile without errors (`tsc --noEmit`)
  - Ensure all tests pass
  - Verify the `/change-password` route is unreachable from a full-access JWT (guard redirects to dashboard)
  - Verify the Admin, Cashier, and Inventory Clerk protected routes redirect to `/change-password` when the restricted JWT is present
  - Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) with ≥100 iterations per property
- Each property test must be tagged: `// Feature: user-account-management, Property N: <property_text>`
- Checkpoints (tasks 8 and 15) validate end-to-end integration before moving to the next layer
- The migration SQL file (`migrations/001_add_password_lifecycle.sql`) must be applied to the database manually before running the server
- Never persist or log the plaintext temporary password beyond the single API response
- The restricted JWT (15 min) naturally expires the change-password session if the employee abandons the flow

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3"] },
    { "id": 3, "tasks": ["4", "5.1"] },
    { "id": 4, "tasks": ["4.1", "4.2", "5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4", "5.8"] },
    { "id": 6, "tasks": ["5.5", "5.6", "5.7", "5.9", "5.11"] },
    { "id": 7, "tasks": ["5.10", "5.12", "5.13", "6"] },
    { "id": 8, "tasks": ["5.14", "5.15", "6.1"] },
    { "id": 9, "tasks": ["7"] },
    { "id": 10, "tasks": ["9.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "10.1", "10.2"] },
    { "id": 12, "tasks": ["11"] },
    { "id": 13, "tasks": ["12"] },
    { "id": 14, "tasks": ["13"] },
    { "id": 15, "tasks": ["14.1"] },
    { "id": 16, "tasks": ["14.2", "14.3"] },
    { "id": 17, "tasks": ["14.4", "14.5"] }
  ]
}
```
