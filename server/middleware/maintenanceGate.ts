import { NextFunction, Request, Response } from "express";
import { maintenanceService } from "../services/maintenanceService.js";

const SAFE_PATHS = new Set(["/api/health"]);

function isMutatingApiRequest(req: Request): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.path.startsWith("/api/") &&
    !req.path.startsWith("/api/system-update") &&
    !req.path.startsWith("/api/auth") &&
    !SAFE_PATHS.has(req.path);
}

/**
 * Blocks all new state-changing work during maintenance and tracks in-flight
 * work so an update cannot advance until cashiers, clerks, and admins finish.
 */
export function maintenanceGate(req: Request, res: Response, next: NextFunction): void {
  if (!isMutatingApiRequest(req)) {
    next();
    return;
  }

  const operationId = maintenanceService.beginCriticalOperation();
  if (!operationId) {
    res.status(503).json({
      message: "System maintenance is in progress. New transactions are temporarily unavailable.",
      code: "MAINTENANCE_MODE",
    });
    return;
  }

  const finish = () => maintenanceService.finishCriticalOperation(operationId);
  res.once("finish", finish);
  res.once("close", finish);
  next();
}
