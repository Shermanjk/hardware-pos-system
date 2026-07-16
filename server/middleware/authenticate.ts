import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  id: number;
  full_name: string;
  username: string;
  role: "Admin" | "Inventory Clerk" | "Cashier";
  employee_id: string | null;
  /** Present (and true) only in the restricted 15-min token issued at first login */
  mustChangePassword?: boolean;
}

// Extend Express Request to carry the decoded user
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7); // remove "Bearer "

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: "Server configuration error." });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}
