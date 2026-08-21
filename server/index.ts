import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { maintenanceGate } from "./middleware/maintenanceGate.js";
import auditLogsRoutes from "./routes/auditLogs.js";
import authRoutes from "./routes/auth.js";
import authorizationHistoryRoutes from "./routes/authorizationHistory.js";
import backupRoutes from "./routes/backup.js";
import birRoutes from "./routes/bir.js";
import cashReconciliationRoutes from "./routes/cashReconciliation.js";
import categoriesRoutes from "./routes/categories.js";
import commodityPricesRoutes from "./routes/commodityPrices.js";
import creditLimitOverridesRoutes from "./routes/creditLimitOverrides.js";
import customersRoutes from "./routes/customers.js";
import dashboardRoutes from "./routes/dashboard.js";
import discountApprovalsRoutes from "./routes/discountApprovals.js";
import discountsRoutes from "./routes/discounts.js";
import externalProcessingRoutes from "./routes/externalProcessing.js";
import inventoryRoutes from "./routes/inventory.js";
import notificationsRoutes from "./routes/notifications.js";
import productsRoutes from "./routes/products.js";
import reportsRoutes from "./routes/reports.js";
import requestsRoutes from "./routes/requests.js";
import returnsRoutes from "./routes/returns.js";
import salesRoutes from "./routes/sales.js";
import settingsRoutes from "./routes/settings.js";
import suppliersRoutes from "./routes/suppliers.js";
import suspendedSalesRoutes from "./routes/suspendedSales.js";
import systemUpdateRoutes from "./routes/systemUpdate.js";
import unitsRoutes from "./routes/units.js";
import usersRoutes from "./routes/users.js";
import { initWebSocket } from "./ws.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── Body parsing ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: "100kb" }));
  
  // ─── CORS ────────────────────────────────────────────────────────────────────
  app.use(cors({
    origin: true, // Allow all origins for development
    credentials: true
  }));
  
  app.use(maintenanceGate);

  // ─── Health check (unauthenticated liveness probe) ───────────────────────────
  // Placed before all other routes so it's always reachable. The Cashier
  // terminal polls this every 15 s to detect server unreachability early.
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // ─── API routes (must come before static file handler) ───────────────────────
  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/audit-logs", auditLogsRoutes);
  app.use("/api/sales", salesRoutes);
  app.use("/api/returns", returnsRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/categories", categoriesRoutes);
  app.use("/api/suppliers", suppliersRoutes);
  app.use("/api/units", unitsRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports",   reportsRoutes);
  app.use("/api/settings",  settingsRoutes);
  app.use("/api/commodity-prices", commodityPricesRoutes);
  app.use("/api/external-processing", externalProcessingRoutes);
  app.use("/api/suspended-sales", suspendedSalesRoutes);
  app.use("/api/requests", requestsRoutes);
  app.use("/api/system-update", systemUpdateRoutes);
  app.use("/api/backup", backupRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/discounts", discountsRoutes);
  app.use("/api/discount-approvals", discountApprovalsRoutes);
  app.use("/api/authorization-history", authorizationHistoryRoutes);
  app.use("/api/cash-reconciliation", cashReconciliationRoutes);
  app.use("/api/customers", customersRoutes);
  app.use("/api/credit-limit-overrides", creditLimitOverridesRoutes);
  app.use("/api/bir", birRoutes);

  // ─── Static files (production only) ──────────────────────────────────────────
  // When bundled to server-dist/index.js, static files are at ../dist/public
  const staticPath = fs.existsSync(path.resolve(__dirname, "../dist/public"))
    ? path.resolve(__dirname, "../dist/public")
    : path.resolve(__dirname, "public");
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3001;

  initWebSocket(server);

  // ─── Auto-run pending database migrations on startup ─────────────────────────
  try {
    const { executePendingMigrations } = await import("./services/migrationService.js");
    const migResult = await executePendingMigrations(1);
    if (migResult.executed.length > 0) {
      console.log(`[Database] Successfully applied migrations on startup: ${migResult.executed.join(", ")}`);
    }
  } catch (migErr) {
    console.error("[Database] Migration startup check:", migErr);
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
