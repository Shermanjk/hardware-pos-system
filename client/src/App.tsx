import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import AdminLayout from "./modules/admin/layout/AdminLayout";
import ErrorBoundary from "./shared/components/ErrorBoundary";
import PasswordChangeGuard from "./shared/components/PasswordChangeGuard";
import ProtectedRoute from "./shared/components/ProtectedRoute";
import PageSkeleton from "./shared/components/PageSkeleton";
import { AuthProvider } from "./shared/contexts/AuthContext";
import { DisplayModeProvider } from "@/shared/contexts/DisplayModeContext";
import { ThemeProvider } from "./shared/contexts/ThemeContext";

// Lazy-loaded admin pages
const AuthorizationHistory = lazy(() => import("./modules/admin/pages/AuthorizationHistory"));
const CashReconciliation = lazy(() => import("./modules/admin/pages/CashReconciliation"));
const Categories = lazy(() => import("./modules/admin/pages/Categories"));
const CommodityPrices = lazy(() => import("./modules/admin/pages/CommodityPrices"));
const Dashboard = lazy(() => import("./modules/admin/pages/Dashboard"));
const DiscountManagement = lazy(() => import("./modules/admin/pages/DiscountManagement"));
const ExternalProcessing = lazy(() => import("./modules/admin/pages/ExternalProcessing"));
const Inventory = lazy(() => import("./modules/admin/pages/Inventory"));
const Products = lazy(() => import("./modules/admin/pages/Products"));
const Reports = lazy(() => import("./modules/admin/pages/Reports"));
const Requests = lazy(() => import("./modules/admin/pages/Requests"));
const Sales = lazy(() => import("./modules/admin/pages/Sales"));
const Settings = lazy(() => import("./modules/admin/pages/Settings"));
const Suppliers = lazy(() => import("./modules/admin/pages/Suppliers"));
const Users = lazy(() => import("./modules/admin/pages/Users"));

// Lazy-loaded cashier page
const Cashier = lazy(() => import("./modules/cashier/pages/Cashier"));

// Lazy-loaded public pages
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Login = lazy(() => import("./pages/Login"));

// Lazy-loaded clerk module
const ClerkLayout = lazy(() => import("./modules/clerk/layout/ClerkLayout"));
const ClerkBarcodePrinting = lazy(() => import("./modules/clerk/pages/ClerkBarcodePrinting"));
const ClerkDashboard = lazy(() => import("./modules/clerk/pages/ClerkDashboard"));
const ClerkInventory = lazy(() => import("./modules/clerk/pages/ClerkInventory"));
const ClerkLowStock = lazy(() => import("./modules/clerk/pages/ClerkLowStock"));
const ClerkStockAdjustment = lazy(() => import("./modules/clerk/pages/ClerkStockAdjustment"));
const ClerkStockCount = lazy(() => import("./modules/clerk/pages/ClerkStockCount"));
const ClerkStockIn = lazy(() => import("./modules/clerk/pages/ClerkStockIn"));

// ─── Clerk router ─────────────────────────────────────────────────────────────

function ClerkRouter() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClerkLayout>
        <Switch>
          <Route path="/clerk/dashboard"        component={ClerkDashboard}       />
          <Route path="/clerk/inventory"        component={ClerkInventory}       />
          <Route path="/clerk/stock-in"         component={ClerkStockIn}         />
          <Route path="/clerk/stock-adjustment" component={ClerkStockAdjustment} />
          <Route path="/clerk/stock-count"      component={ClerkStockCount}      />
          <Route path="/clerk/barcode-printing" component={ClerkBarcodePrinting} />
          <Route path="/clerk/low-stock"        component={ClerkLowStock}        />
          <Route component={NotFound} />
        </Switch>
      </ClerkLayout>
    </Suspense>
  );
}

// ─── Admin router ─────────────────────────────────────────────────────────────

function AdminRouter() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminLayout>
        <Switch>
          <Route path="/"                component={Dashboard}      />
          <Route path="/products"        component={Products}       />
          <Route path="/categories"      component={Categories}     />
          <Route path="/inventory"       component={Inventory}      />
          <Route path="/suppliers"       component={Suppliers}      />
          <Route path="/sales"           component={Sales}          />
          <Route path="/reports"         component={Reports}        />
          <Route path="/users"           component={Users}          />
          <Route path="/settings"        component={Settings}       />
          <Route path="/commodity-prices" component={CommodityPrices} />
          <Route path="/external-processing" component={ExternalProcessing} />
          <Route path="/requests"        component={Requests}       />
          <Route path="/discounts"       component={DiscountManagement} />
          <Route path="/authorization-history" component={AuthorizationHistory} />
          <Route path="/cash-reconciliation"   component={CashReconciliation} />
          <Route path="/404"             component={NotFound}       />
          <Route component={NotFound} />
        </Switch>
      </AdminLayout>
    </Suspense>
  );
}

// ─── Root router ──────────────────────────────────────────────────────────────

function Router() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        {/* Public route */}
        <Route path="/login" component={Login} />

        {/* Mandatory password-change — accessible with the restricted JWT */}
        <Route path="/change-password" component={ChangePassword} />

        {/* Cashier terminal — Cashier role only */}
        <Route path="/cashier">
          <ProtectedRoute allowedRoles={["Cashier"]}>
            <PasswordChangeGuard>
              <Cashier />
            </PasswordChangeGuard>
          </ProtectedRoute>
        </Route>

        {/* Inventory Clerk module */}
        <Route path="/clerk/:rest*">
          <ProtectedRoute allowedRoles={["Inventory Clerk"]}>
            <PasswordChangeGuard>
              <ClerkRouter />
            </PasswordChangeGuard>
          </ProtectedRoute>
        </Route>

        {/* Admin module — catches everything else */}
        <Route>
          <ProtectedRoute allowedRoles={["Admin"]}>
            <PasswordChangeGuard>
              <AdminRouter />
            </PasswordChangeGuard>
          </ProtectedRoute>
        </Route>
      </Switch>
    </Suspense>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <DisplayModeProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </DisplayModeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
