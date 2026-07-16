import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "./modules/admin/layout/AdminLayout";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./shared/components/ErrorBoundary";
import { ThemeProvider } from "./shared/contexts/ThemeContext";
import { ClerkAuthProvider } from "./shared/contexts/ClerkAuthContext";

// Admin pages
import Dashboard from "./modules/admin/pages/Dashboard";
import Products from "./modules/admin/pages/Products";
import Categories from "./modules/admin/pages/Categories";
import Inventory from "./modules/admin/pages/Inventory";
import Suppliers from "./modules/admin/pages/Suppliers";
import PurchaseOrders from "./modules/admin/pages/PurchaseOrders";
import StockIn from "./modules/admin/pages/StockIn";
import Sales from "./modules/admin/pages/Sales";
import Returns from "./modules/admin/pages/Returns";
import Reports from "./modules/admin/pages/Reports";
import Users from "./modules/admin/pages/Users";
import Settings from "./modules/admin/pages/Settings";
import Login from "./pages/Login";
import Cashier from "./modules/cashier/pages/Cashier";

// Clerk module
import ClerkLayout from "./modules/clerk/layout/ClerkLayout";
import ClerkDashboard from "./modules/clerk/pages/ClerkDashboard";
import ClerkInventory from "./modules/clerk/pages/ClerkInventory";
import ClerkStockIn from "./modules/clerk/pages/ClerkStockIn";
import ClerkStockAdjustment from "./modules/clerk/pages/ClerkStockAdjustment";
import ClerkStockCount from "./modules/clerk/pages/ClerkStockCount";
import ClerkBarcodePrinting from "./modules/clerk/pages/ClerkBarcodePrinting";
import ClerkLowStock from "./modules/clerk/pages/ClerkLowStock";
import ClerkProfile from "./modules/clerk/pages/ClerkProfile";

// ─── Clerk router ─────────────────────────────────────────────────────────────

function ClerkRouter() {
  return (
    <ClerkLayout>
      <Switch>
        <Route path="/clerk/dashboard"        component={ClerkDashboard}      />
        <Route path="/clerk/inventory"        component={ClerkInventory}      />
        <Route path="/clerk/stock-in"         component={ClerkStockIn}        />
        <Route path="/clerk/stock-adjustment" component={ClerkStockAdjustment}/>
        <Route path="/clerk/stock-count"      component={ClerkStockCount}     />
        <Route path="/clerk/barcode-printing" component={ClerkBarcodePrinting}/>
        <Route path="/clerk/low-stock"        component={ClerkLowStock}       />
        <Route path="/clerk/profile"          component={ClerkProfile}        />
        <Route component={NotFound} />
      </Switch>
    </ClerkLayout>
  );
}

// ─── Admin router ─────────────────────────────────────────────────────────────

function DashboardRouter() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/"                component={Dashboard}      />
        <Route path="/products"        component={Products}       />
        <Route path="/categories"      component={Categories}     />
        <Route path="/inventory"       component={Inventory}      />
        <Route path="/suppliers"       component={Suppliers}      />
        <Route path="/purchase-orders" component={PurchaseOrders} />
        <Route path="/stock-in"        component={StockIn}        />
        <Route path="/sales"           component={Sales}          />
        <Route path="/returns"         component={Returns}        />
        <Route path="/reports"         component={Reports}        />
        <Route path="/users"           component={Users}          />
        <Route path="/settings"        component={Settings}       />
        <Route path="/404"             component={NotFound}       />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// ─── Root router ──────────────────────────────────────────────────────────────

function Router() {
  return (
    <Switch>
      <Route path="/login"      component={Login}         />
      <Route path="/cashier"    component={Cashier}       />
      <Route path="/clerk/:rest*" component={ClerkRouter} />
      <Route component={DashboardRouter} />
    </Switch>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <ClerkAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ClerkAuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
