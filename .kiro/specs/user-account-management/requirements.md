# Requirements Document

## Introduction

This feature implements a secure user account management workflow for the Isra Hardware POS system. It covers the full lifecycle of employee accounts (Cashier and Inventory Clerk roles): administrator-controlled account creation with auto-generated temporary passwords, a mandatory first-login password change flow, and administrator-initiated password resets. The feature also introduces an audit log for all account-related actions.

Only administrators can create or reset employee accounts. Employees cannot self-service a forgotten password — they must contact an administrator. The existing authentication logic (JWT, role-based access, account status checks) is extended rather than replaced.

## Glossary

- **POS_System**: The Isra Hardware Point of Sale and Inventory Management application.
- **Administrator**: A user with the `Admin` role who manages employee accounts via the Admin panel.
- **Employee**: A user with the `Cashier` or `Inventory Clerk` role.
- **Temporary_Password**: A system-generated, one-time password issued at account creation or password reset, valid for the employee's first login only.
- **Password_Generator**: The server-side module responsible for generating cryptographically secure temporary passwords.
- **Bcrypt_Hasher**: The server-side module responsible for hashing passwords using bcrypt before storage.
- **Change_Password_Page**: The client-side page that forces an employee to set a permanent password before accessing the POS dashboard.
- **User_Management_Panel**: The admin-facing page at `/users` that lists all employee accounts and exposes management actions.
- **Audit_Log**: A persistent, append-only record of account-related actions stored in the database.
- **Auth_Service**: The server-side authentication service (`/api/auth`) that validates credentials and issues JWTs.
- **User_API**: The server-side REST API (`/api/users`) that handles account creation, updates, and password resets.
- **must_change_password**: A boolean column on the `users` table that, when `TRUE`, requires the employee to change their password before accessing the system.
- **password_changed_at**: A `DATETIME` column on the `users` table that records when the employee last changed their password; `NULL` when a temporary password is active.

---

## Requirements

### Requirement 1: Database Schema Extension

**User Story:** As a system architect, I want the `users` table to carry password lifecycle metadata, so that the authentication flow can enforce mandatory password changes without altering existing columns.

#### Acceptance Criteria

1. THE POS_System SHALL add the column `must_change_password` (`BOOLEAN`, `DEFAULT TRUE`, `NOT NULL`) to the `users` table if it does not already exist.
2. THE POS_System SHALL add the column `password_changed_at` (`DATETIME`, `NULL`) to the `users` table if it does not already exist.
3. THE POS_System SHALL add the column `updated_at` (`DATETIME`, `NULL`) to the `users` table if it does not already exist.
4. THE POS_System SHALL NOT remove, rename, or alter the type of any existing column in the `users` table.
5. WHEN the schema migration runs, THE POS_System SHALL apply the changes using `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements to preserve idempotency.

---

### Requirement 2: Temporary Password Generation

**User Story:** As an administrator, I want the system to automatically generate a secure temporary password when I create an employee account, so that I never have to invent or know the employee's initial credential.

#### Acceptance Criteria

1. WHEN an account creation request is received, THE Password_Generator SHALL produce a temporary password that is between 10 and 12 characters in length.
2. THE Password_Generator SHALL include at least one uppercase letter, at least one lowercase letter, at least one digit, and at least one special character (drawn from `!@#$%^&*`) in every generated password.
3. THE Password_Generator SHALL use a cryptographically secure random source (e.g., `crypto.randomBytes`) to produce each password.
4. THE Bcrypt_Hasher SHALL hash the temporary password with a minimum bcrypt cost factor of 10 before any database write.
5. THE User_API SHALL store only the bcrypt hash in `password_hash`; the plain-text temporary password SHALL NOT be persisted to any database column, log file, or server response beyond the single account-creation API response.
6. FOR ALL generated passwords, THE Password_Generator SHALL produce a password that satisfies criteria 1–2 every time (round-trip property: generate → validate constraints → pass).

---

### Requirement 3: Administrator Account Creation

**User Story:** As an administrator, I want to create employee accounts from the User Management Panel, so that new employees can be onboarded securely without knowing their initial password.

#### Acceptance Criteria

1. THE User_Management_Panel SHALL display a "Add User" button that, when clicked, opens a Create User modal.
2. THE Create User modal SHALL contain input fields for: Full Name (required), Employee ID (optional), Username (required), Role (required; options: `Cashier`, `Inventory Clerk`), and Status (required; options: `Active`, `Inactive`; default: `Active`).
3. THE Create User modal SHALL NOT present a password input field to the administrator.
4. WHEN the administrator submits the Create User form with valid data, THE User_API SHALL create the account, set `must_change_password = TRUE`, set `password_changed_at = NULL`, and return the plain-text temporary password in the response body exactly once.
5. WHEN the User_API returns the temporary password, THE Create User modal SHALL display the password in a read-only field and provide "Copy Password" and "Print Credentials" buttons.
6. WHEN the administrator closes the Create User modal after account creation, THE POS_System SHALL NOT display or transmit the temporary password again.
7. IF a submitted username already exists, THEN THE User_API SHALL return a 409 Conflict response with the message `"Username already exists."` and SHALL NOT create a duplicate account.
8. IF any required field is missing or invalid, THEN THE User_API SHALL return a 422 Unprocessable Entity response with field-level validation messages.
9. WHEN a new account is created, THE Audit_Log SHALL record: action `"account_created"`, the administrator's user ID and username, the new employee's user ID and username, and the UTC timestamp.

---

### Requirement 4: First-Login Mandatory Password Change

**User Story:** As an employee logging in for the first time (or after a password reset), I want the system to guide me through changing my temporary password before I can use the POS, so that I establish a credential only I know.

#### Acceptance Criteria

1. WHEN an employee's credentials are verified and `must_change_password = TRUE`, THE Auth_Service SHALL return a response with HTTP status 200, a short-lived JWT (valid for 15 minutes) with claim `mustChangePassword: true`, and SHALL NOT return a redirect to the POS dashboard.
2. WHEN the client receives a JWT with `mustChangePassword: true`, THE POS_System SHALL redirect the employee to the Change_Password_Page and SHALL NOT render any other protected page.
3. THE Change_Password_Page SHALL display the message: `"Welcome! For security reasons, you must change your temporary password before using the POS."`
4. THE Change_Password_Page SHALL present three fields: Current Password, New Password, and Confirm Password, each with a show/hide toggle.
5. THE Change_Password_Page SHALL display a password strength indicator that updates in real time as the employee types the new password.
6. WHEN the employee submits the Change Password form, THE User_API SHALL validate that: the current password matches the stored hash, the new password is at least 8 characters long, the new password contains at least one uppercase letter, one lowercase letter, one digit, and one special character, and the new password matches the confirm password field.
7. IF any validation check in criterion 6 fails, THEN THE User_API SHALL return a 422 response with a descriptive error message for each failing rule, and SHALL NOT update the password.
8. WHEN all validations pass, THE User_API SHALL update `password_hash` with the bcrypt hash of the new password, set `must_change_password = FALSE`, set `password_changed_at = CURRENT_TIMESTAMP`, and return a new full-access JWT.
9. WHEN the User_API returns the full-access JWT, THE POS_System SHALL redirect the employee to the appropriate dashboard based on their role (`/cashier` for Cashier, `/clerk/dashboard` for Inventory Clerk).
10. WHEN an employee changes their password successfully, THE Audit_Log SHALL record: action `"password_changed"`, the employee's user ID and username, and the UTC timestamp.

---

### Requirement 5: Administrator Password Reset

**User Story:** As an administrator, I want to reset an employee's password from the User Management Panel, so that an employee who has forgotten their password can regain access without self-service recovery.

#### Acceptance Criteria

1. THE User_Management_Panel SHALL display, for each employee row, the actions: Edit, Reset Password, and Deactivate.
2. WHEN the administrator clicks "Reset Password" for an employee, THE POS_System SHALL open a confirmation dialog that names the employee and requires explicit confirmation before proceeding.
3. WHEN the administrator confirms the reset, THE User_API SHALL: generate a new temporary password using the Password_Generator, hash it with the Bcrypt_Hasher, update `password_hash`, set `must_change_password = TRUE`, set `password_changed_at = NULL`, and return the plain-text temporary password in the response body exactly once.
4. WHEN the User_API returns the new temporary password, THE Reset Password modal SHALL display it in a read-only field and provide "Copy" and "Print" buttons, followed by a "Done" button.
5. WHEN the administrator closes the Reset Password modal, THE POS_System SHALL NOT display or transmit the temporary password again.
6. WHEN a password reset is performed, THE Audit_Log SHALL record: action `"password_reset"`, the administrator's user ID and username, the affected employee's user ID and username, and the UTC timestamp.

---

### Requirement 6: Account Deactivation

**User Story:** As an administrator, I want to deactivate an employee account from the User Management Panel, so that former employees cannot log in without deleting their records.

#### Acceptance Criteria

1. WHEN the administrator clicks "Deactivate" for an active employee, THE POS_System SHALL open a confirmation dialog before applying the change.
2. WHEN the administrator confirms deactivation, THE User_API SHALL set `status = 'Inactive'` and `updated_at = CURRENT_TIMESTAMP` for the target employee.
3. WHILE `status = 'Inactive'`, THE Auth_Service SHALL reject login attempts for that account with HTTP 403 and the message `"Your account has been deactivated. Please contact your administrator."` (existing behavior preserved).
4. WHEN an account is deactivated, THE Audit_Log SHALL record: action `"account_deactivated"`, the administrator's user ID and username, the affected employee's user ID and username, and the UTC timestamp.

---

### Requirement 7: Security Constraints

**User Story:** As a security officer, I want all password handling to follow secure coding practices, so that plain-text credentials are never exposed beyond their single authorized disclosure point.

#### Acceptance Criteria

1. THE Bcrypt_Hasher SHALL use a minimum cost factor of 10 for all bcrypt operations.
2. THE User_API SHALL never include `password_hash` or any plain-text password in any API response other than the single temporary-password disclosure after account creation or password reset.
3. THE Auth_Service SHALL never include `password_hash` in any JWT payload or API response.
4. THE POS_System SHALL never write any plain-text password or password hash to application logs, browser console, or server-side logs.
5. IF a request to any protected User_API endpoint is made without a valid JWT carrying the `Admin` role, THEN THE User_API SHALL return HTTP 403 and SHALL NOT process the request.
6. THE Auth_Service SHALL enforce account status checks before issuing any JWT (existing behavior preserved).

---

### Requirement 8: Audit Log

**User Story:** As a compliance officer, I want a tamper-evident audit log of all account lifecycle events, so that I can trace who created, reset, or modified accounts and when.

#### Acceptance Criteria

1. THE POS_System SHALL maintain an `audit_logs` table with columns: `id` (auto-increment PK), `action` (VARCHAR), `performed_by_id` (INT, FK to `users.id`), `performed_by_username` (VARCHAR), `target_user_id` (INT, FK to `users.id`, nullable), `target_username` (VARCHAR, nullable), `metadata` (JSON, nullable), `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP).
2. THE Audit_Log SHALL record an entry for each of the following actions: `"account_created"`, `"password_reset"`, `"password_changed"`, `"account_deactivated"`.
3. WHEN a new audit entry is inserted, THE POS_System SHALL set `created_at` to the server's UTC timestamp.
4. THE User_API SHALL expose a `GET /api/audit-logs` endpoint that returns a paginated list of audit entries, accessible only to users with the `Admin` role.
5. IF the audit log insert fails, THEN THE POS_System SHALL log the failure to the server error log and SHALL NOT roll back the primary operation (account creation, reset, or deactivation).

---

### Requirement 9: User Management Panel UI

**User Story:** As an administrator, I want the User Management Panel to reflect real data from the database and provide all account management actions in a clear, accessible interface.

#### Acceptance Criteria

1. WHEN the User Management Panel loads, THE User_Management_Panel SHALL fetch and display all users from `GET /api/users`, showing: Full Name, Username, Role, Status, Last Login, and available actions per row.
2. THE User_Management_Panel SHALL display a status badge: green for `Active`, gray for `Inactive`.
3. THE User_Management_Panel SHALL restrict the "Add User" button and row actions to sessions where the JWT carries the `Admin` role.
4. WHEN an API request is in-flight, THE User_Management_Panel SHALL display a loading indicator and disable action buttons to prevent duplicate submissions.
5. IF an API call fails, THEN THE User_Management_Panel SHALL display an inline error message describing the failure without navigating away from the page.

---

### Requirement 10: Change Password Page — UI and Accessibility

**User Story:** As an employee forced to change their password, I want a clear, accessible interface, so that I can complete the change without confusion.

#### Acceptance Criteria

1. THE Change_Password_Page SHALL be visually distinct from the main Login page and include the application logo and the mandatory change notice (see Requirement 4, criterion 3).
2. THE Change_Password_Page SHALL mark all three password fields as required and display inline validation messages that identify the specific rule that failed.
3. THE Change_Password_Page SHALL provide a show/hide password toggle on each password field, implemented with an accessible `aria-label` that describes the current state.
4. THE Change_Password_Page SHALL display a password strength indicator (e.g., Weak / Fair / Strong) that updates on every keystroke.
5. THE Change_Password_Page SHALL disable the "Change Password" submit button while a submission is in-flight to prevent duplicate requests.
6. WHILE the employee is on the Change_Password_Page, THE POS_System SHALL prevent navigation to any other protected route until the password change is completed or the session expires.
