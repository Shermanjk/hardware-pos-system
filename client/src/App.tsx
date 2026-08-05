import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateNotification } from "@/components/UpdateNotification";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import AdminLayout from "./modules/admin/layout/AdminLayout";
import ErrorBoundary from "./shared/components/ErrorBoundary";
import PasswordChangeGuard from "./shared/components/PasswordChangeGuard";
import ProtectedRoute from "./shared/components/ProtectedRoute";
import { AuthProvider } from "./shared/contexts/AuthContext";
import { ThemeProvider } from "./shared/contexts/ThemeContext";

// Admin pages
import AuthorizationHistory from "./modules/admin/pages/AuthorizationHistory";
import CashReconciliation from "./modules/admin/pages/CashReconciliation";
import Categories from "./modules/admin/pages/Categories";
import CommodityPrices from "./modules/admin/pages/CommodityPrices";
import Dashboard from "./modules/admin/pages/Dashboard";
import DiscountManagement from "./modules/admin/pages/DiscountManagement";
import ExternalProcessing from "./modules/admin/pages/ExternalProcessing";
import Inventory from "./modules/admin/pages/Inventory";
import Products from "./modules/admin/pages/Products";
import Reports from "./modules/admin/pages/Reports";
import Requests from "./modules/admin/pages/Requests";
import Sales from "./modules/admin/pages/Sales";
import Settings from "./modules/admin/pages/Settings";
import Suppliers from "./modules/admin/pages/Suppliers";
import Users from "./modules/admin/pages/Users";
import Cashier from "./modules/cashier/pages/Cashier";
import ChangePassword from "./pages/ChangePassword";
import Login from "./pages/Login";

// Clerk module
import ClerkLayout from "./modules/clerk/layout/ClerkLayout";
import ClerkBarcodePrinting from "./modules/clerk/pages/ClerkBarcodePrinting";
import ClerkDashboard from "./modules/clerk/pages/ClerkDashboard";
import ClerkInventory from "./modules/clerk/pages/ClerkInventory";
import ClerkLowStock from "./modules/clerk/pages/ClerkLowStock";
import ClerkStockAdjustment from "./modules/clerk/pages/ClerkStockAdjustment";
import ClerkStockCount from "./modules/clerk/pages/ClerkStockCount";
import ClerkStockIn from "./modules/clerk/pages/ClerkStockIn";

// ─── Clerk router ─────────────────────────────────────────────────────────────

function ClerkRouter() {
  return (
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
  );
}

// ─── Admin router ─────────────────────────────────────────────────────────────

function AdminRouter() {
  return (
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
  );
}

// ─── Root router ──────────────────────────────────────────────────────────────

function Router() {
  return (
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
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <UpdateNotification />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
