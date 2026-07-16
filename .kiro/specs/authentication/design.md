# Authentication & Login — Technical Design

## Architecture Overview

```
Client (React)                     Server (Express)               Database (MySQL)
─────────────────────────────────  ─────────────────────────────  ────────────────
Login.tsx                          POST /api/auth/login           users table
  └─ useAuth() hook           →    server/routes/auth.ts    →    SELECT by username
       └─ AuthContext              server/services/auth.ts        bcrypt.compare()
            └─ localStorage             └─ server/db.ts
                 "pos_token"        jwt.sign() → return token
```

---

## Backend

### New Files

| File | Purpose |
|---|---|
| `server/db.ts` | MySQL connection pool (mysql2/promise) |
| `server/routes/auth.ts` | POST /api/auth/login route handler |
| `server/middleware/authenticate.ts` | JWT verification middleware for protected routes |

### `server/db.ts`

```ts
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hardware_pos',
  waitForConnections: true,
  connectionLimit: 10,
});
```

### Login Endpoint — `POST /api/auth/login`

**Request body:**
```json
{ "username": "string", "password": "string", "role": "admin|inventory_clerk|cashier", "rememberMe": boolean }
```

**Logic flow:**
```
1. Validate body with zod: username (min 1), password (min 1), role (enum)
2. SELECT id, full_name, username, password_hash, role, employee_id, status
   FROM users WHERE username = ? LIMIT 1
3. If no row → 401 "Invalid username or password."
4. bcrypt.compare(password, row.password_hash) → if false → 401 same message
5. Map submitted role → DB role:
     "admin"            → "Admin"
     "inventory_clerk"  → "Inventory Clerk"
     "cashier"          → "Cashier"
   If mismatch → 403 "You are not authorized to log in as this role."
6. If row.status === "Inactive" → 403 "Your account has been deactivated. Please contact your administrator."
7. Sign JWT payload: { id, full_name, username, role, employee_id }
   Expiry: rememberMe ? "30d" : "8h"
8. Return 200: { token, user: { id, full_name, username, role, employee_id } }
```

**Error response shape (all errors):**
```json
{ "message": "Human-readable error string" }
```

### JWT Middleware — `server/middleware/authenticate.ts`

- Reads `Authorization: Bearer <token>` header
- Verifies with `jwt.verify(token, process.env.JWT_SECRET)`
- On success: attaches decoded payload to `req.user`
- On failure: returns 401 `{ message: "Unauthorized" }`

### Dependencies to Install

```bash
pnpm add mysql2 bcryptjs jsonwebtoken
pnpm add -D @types/bcryptjs @types/jsonwebtoken
```

### Updated `server/index.ts`

- Add `app.use(express.json())`
- Mount auth routes: `app.use('/api/auth', authRoutes)`
- All `/api/*` routes must be declared before the static file catch-all

---

## Frontend

### New / Modified Files

| File | Purpose |
|---|---|
| `client/src/shared/utils/auth.ts` | JWT decode, expiry check, token storage helpers |
| `client/src/shared/api/authApi.ts` | Axios POST /api/auth/login |
| `client/src/shared/contexts/AuthContext.tsx` | Unified auth context (replaces ClerkAuthContext) |
| `client/src/shared/hooks/useAuth.ts` | Convenience re-export hook |
| `client/src/shared/components/ProtectedRoute.tsx` | Route guard component |
| `client/src/pages/Login.tsx` | Wire form to API, add loading + error states |
| `client/src/App.tsx` | Swap to AuthProvider, wrap routers with ProtectedRoute |

### Auth Context Shape

```ts
interface AuthUser {
  id: number;
  full_name: string;
  username: string;
  role: 'Admin' | 'Inventory Clerk' | 'Cashier';
  employee_id: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, role: string, rememberMe: boolean) => Promise<void>;
  logout: () => void;
}
```

### Token Storage

- Key: `pos_token` in `localStorage`
- On app init: read token → decode → check expiry → populate context state
- On logout: `localStorage.removeItem('pos_token')` → redirect `/login`

### ProtectedRoute Logic

```tsx
// Redirect to /login if not authenticated
// Redirect to /login if authenticated but wrong role for this section
function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Redirect to="/login" />;
  return <>{children}</>;
}
```

### Updated App.tsx Router Structure

```tsx
<Route path="/login" component={Login} />

<ProtectedRoute allowedRoles={['Cashier']}>
  <Route path="/cashier" component={Cashier} />
</ProtectedRoute>

<ProtectedRoute allowedRoles={['Inventory Clerk']}>
  <Route path="/clerk/:rest*" component={ClerkRouter} />
</ProtectedRoute>

<ProtectedRoute allowedRoles={['Admin']}>
  <Route component={DashboardRouter} />
</ProtectedRoute>
```

### Login.tsx Changes

- Add `username`, `password` controlled state
- On submit: call `auth.login(username, password, selectedRole, rememberMe)`
- Button shows `"Signing in..."` + disabled during loading
- Error banner renders above submit button when `error` state is set
- On success: redirect handled inside `AuthContext.login()` based on role from JWT

### Backward Compatibility for Clerk Pages

`ClerkAuthContext.tsx` will be updated to re-export from `AuthContext` so existing clerk pages using `useClerkAuth()` continue to work without changes:

```ts
// ClerkAuthContext.tsx becomes a thin alias
export { useAuth as useClerkAuth } from './AuthContext';
```

---

## Environment Variables

**`e:\POS System\.env`**
```
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=hardware_pos
JWT_SECRET=change_this_to_a_strong_random_secret_32chars_min
PORT=3000
```

> `.env` must be added to `.gitignore`. It is never committed.

---

## Security Notes

- JWT secret: minimum 32 characters, randomly generated
- bcrypt: compare only — passwords are already hashed in the DB, never re-hash on login
- Never return `password_hash` in any API response
- `express.json()` body size limit: default 100kb is sufficient
- Role check happens server-side — client role selection is convenience only
