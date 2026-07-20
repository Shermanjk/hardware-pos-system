import "dotenv/config";
import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import auditLogsRoutes from "./routes/auditLogs.js";
import salesRoutes from "./routes/sales.js";
import returnsRoutes from "./routes/returns.js";
import productsRoutes from "./routes/products.js";
import categoriesRoutes from "./routes/categories.js";
import suppliersRoutes from "./routes/suppliers.js";
import unitsRoutes from "./routes/units.js";
import inventoryRoutes from "./routes/inventory.js";
import reorderAlertsRoutes from "./routes/reorderAlerts.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportsRoutes from "./routes/reports.js";
import settingsRoutes from "./routes/settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── Body parsing ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: "100kb" }));

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
  app.use("/api/reorder-alerts", reorderAlertsRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports",   reportsRoutes);
  app.use("/api/settings",  settingsRoutes);

  // ─── Static files (production only) ──────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    const staticPath = path.resolve(__dirname, "public");
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  const port = process.env.PORT || 3001;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
