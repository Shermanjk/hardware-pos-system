import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import AdminLayout from "./modules/admin/layout/AdminLayout";
// ClerkLayout is eagerly imported so the sidebar/topnav shell is always
// present during clerk navigation — only page content chunks are deferred.
import { DisplayModeProvider } from "@/shared/contexts/DisplayModeContext";
import ClerkLayout from "./modules/clerk/layout/ClerkLayout";
import ErrorBoundary from "./shared/components/ErrorBoundary";
import PageSkeleton from "./shared/components/PageSkeleton";
import PanelSkeleton from "./shared/components/PanelSkeleton";
import PasswordChangeGuard from "./shared/components/PasswordChangeGuard";
import ProtectedRoute from "./shared/components/ProtectedRoute";
import { AuthProvider } from "./shared/contexts/AuthContext";
import { ThemeProvider } from "./shared/contexts/ThemeContext";

// ─── Lazy-loaded admin pages ──────────────────────────────────────────────────
const AuthorizationHistory = lazy(() => import("./modules/admin/pages/AuthorizationHistory"));
const CashReconciliation   = lazy(() => import("./modules/admin/pages/CashReconciliation"));
const Categories           = lazy(() => import("./modules/admin/pages/Categories"));
const CommodityPrices      = lazy(() => import("./modules/admin/pages/CommodityPrices"));
const Customers            = lazy(() => import("./modules/admin/pages/Customers"));
const CreditLedger         = lazy(() => import("./modules/admin/pages/CreditLedger"));
const Dashboard            = lazy(() => import("./modules/admin/pages/Dashboard"));
const DiscountManagement   = lazy(() => import("./modules/admin/pages/DiscountManagement"));
const ExternalProcessing   = lazy(() => import("./modules/admin/pages/ExternalProcessing"));
const Inventory            = lazy(() => import("./modules/admin/pages/Inventory"));
const Products             = lazy(() => import("./modules/admin/pages/Products"));
const Reports              = lazy(() => import("./modules/admin/pages/Reports"));
const Requests             = lazy(() => import("./modules/admin/pages/Requests"));
const Sales                = lazy(() => import("./modules/admin/pages/Sales"));
const Settings             = lazy(() => import("./modules/admin/pages/Settings"));
const Suppliers            = lazy(() => import("./modules/admin/pages/Suppliers"));
const Users                = lazy(() => import("./modules/admin/pages/Users"));

// ─── Lazy-loaded cashier page ─────────────────────────────────────────────────
const Cashier = lazy(() => import("./modules/cashier/pages/Cashier"));

// ─── Eagerly-loaded public pages (prevents kiosk screen flicker/blink on logout) ───
import ChangePassword from "./pages/ChangePassword";
import Login from "./pages/Login";

// ─── Lazy-loaded clerk pages (layout is eager — see import above) ─────────────
const ClerkBarcodePrinting  = lazy(() => import("./modules/clerk/pages/ClerkBarcodePrinting"));
const ClerkDashboard        = lazy(() => import("./modules/clerk/pages/ClerkDashboard"));
const ClerkInventory        = lazy(() => import("./modules/clerk/pages/ClerkInventory"));
const ClerkLowStock         = lazy(() => import("./modules/clerk/pages/ClerkLowStock"));
const ClerkStockAdjustment  = lazy(() => import("./modules/clerk/pages/ClerkStockAdjustment"));
const ClerkStockCount       = lazy(() => import("./modules/clerk/pages/ClerkStockCount"));
const ClerkStockIn          = lazy(() => import("./modules/clerk/pages/ClerkStockIn"));

// ─── Clerk router ─────────────────────────────────────────────────────────────

function ClerkRouter() {
  return (
    <ClerkLayout>
      {/*
       * Per-panel Suspense boundary: ClerkLayout (sidebar + topnav) is eagerly
       * loaded so it stays visible during navigation. Only the page content
       * chunk is deferred — showing PanelSkeleton instead of a full-page blink.
       */}
      <Suspense fallback={<PanelSkeleton />}>
        <Switch>
          <Route path="/clerk/dashboard"        component={ClerkDashboard}      />
          <Route path="/clerk/inventory"        component={ClerkInventory}      />
          <Route path="/clerk/stock-in"         component={ClerkStockIn}        />
          <Route path="/clerk/stock-adjustment" component={ClerkStockAdjustment}/>
          <Route path="/clerk/stock-count"      component={ClerkStockCount}     />
          <Route path="/clerk/barcode-printing" component={ClerkBarcodePrinting}/>
          <Route path="/clerk/low-stock"        component={ClerkLowStock}       />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ClerkLayout>
  );
}

// ─── Admin router ─────────────────────────────────────────────────────────────

function AdminRouter() {
  return (
    <AdminLayout>
      {/*
       * Per-panel Suspense boundary: AdminLayout (sidebar + topnav) is eagerly
       * loaded so it stays visible during navigation. Only the page content
       * chunk is deferred — showing PanelSkeleton instead of a full-page blink.
       */}
      <Suspense fallback={<PanelSkeleton />}>
        <Switch>
          <Route path="/"                          component={Dashboard}           />
          <Route path="/customers"                 component={Customers}           />
          <Route path="/customers/:id/ledger"      component={CreditLedger}        />
          <Route path="/products"                  component={Products}            />
          <Route path="/categories"                component={Categories}          />
          <Route path="/inventory"                 component={Inventory}           />
          <Route path="/suppliers"                 component={Suppliers}           />
          <Route path="/sales"                     component={Sales}               />
          <Route path="/reports"                   component={Reports}             />
          <Route path="/users"                     component={Users}               />
          <Route path="/settings"                  component={Settings}            />
          <Route path="/commodity-prices"          component={CommodityPrices}     />
          <Route path="/external-processing"       component={ExternalProcessing}  />
          <Route path="/requests"                  component={Requests}            />
          <Route path="/discounts"                 component={DiscountManagement}  />
          <Route path="/authorization-history"     component={AuthorizationHistory}/>
          <Route path="/cash-reconciliation"       component={CashReconciliation}  />
          <Route path="/404"                       component={NotFound}            />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AdminLayout>
  );
}

// ─── Root router ──────────────────────────────────────────────────────────────

function Router() {
  return (
    <Switch>
      {/* Public routes — eager loaded, zero fallback flash on login/logout */}
      <Route path="/login"           component={Login}          />
      <Route path="/change-password" component={ChangePassword} />

      {/* Cashier terminal — Cashier role only */}
      <Route path="/cashier">
        <Suspense fallback={<PageSkeleton />}>
          <ProtectedRoute allowedRoles={["Cashier"]}>
            <PasswordChangeGuard>
              <Cashier />
            </PasswordChangeGuard>
          </ProtectedRoute>
        </Suspense>
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
