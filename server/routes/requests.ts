import bcrypt from "bcryptjs";
import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticate } from "../middleware/authenticate";
import { logAuditEvent } from "../utils/auditLogger";
import { sendVoidDecision, broadcastEntityUpdate, broadcastRequestDecision } from "../ws.js";
import { z } from "zod";

const router = Router();
router.use(authenticate);

function requireAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

function requireAdminOrClerk(req: Request, res: Response): boolean {
  const role = req.user?.role;
  if (role !== "Admin" && role !== "Inventory Clerk") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

// ─── GET /api/requests/pending ───────────────────────────────────────────────
router.get("/pending", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    // Fetch all pending requests from different tables
    const [stockCountStandard] = await pool.execute<any[]>(`
      SELECT
        'STOCK_COUNT_STANDARD' as type,
        scar.id,
        scar.reference,
        p.product_name,
        p.barcode,
        COALESCE(u.full_name, '—') AS requested_by_name,
        scar.prepared_at,
        scar.difference,
        scar.reason,
        scar.remarks,
        scar.status,
        scar.system_quantity,
        scar.physical_quantity,
        p.quantity_type,
        COALESCE(units.allow_decimal, 0) AS unit_allow_decimal
      FROM stock_count_adjustment_requests scar
      JOIN products p ON p.id = scar.product_id
      LEFT JOIN users u ON u.id = scar.prepared_by
      LEFT JOIN units ON units.id = p.unit_id
      WHERE scar.status = 'PENDING_APPROVAL'
    `);

    const [stockCountMarket] = await pool.execute<any[]>(`
      SELECT
        'STOCK_COUNT_MARKET' as type,
        mbar.id,
        mbar.reference,
        p.product_name,
        p.barcode,
        COALESCE(u.full_name, '—') AS requested_by_name,
        mbar.prepared_at,
        mbar.difference,
        mbar.reason,
        mbar.remarks,
        mbar.status,
        mbar.system_quantity,
        mbar.physical_quantity,
        p.quantity_type,
        COALESCE(units.allow_decimal, 0) AS unit_allow_decimal
      FROM market_based_adjustment_requests mbar
      JOIN products p ON p.id = mbar.product_id
      LEFT JOIN users u ON u.id = mbar.prepared_by
      LEFT JOIN units ON units.id = p.unit_id
      WHERE mbar.status = 'PENDING_APPROVAL'
    `);

    const [voids] = await pool.execute<any[]>(`
      SELECT
        'VOID' as type,
        sv.id,
        s.invoice_number as reference,
        '' as product_name,
        '' as barcode,
        COALESCE(u.full_name, '—') AS requested_by_name,
        sv.created_at as prepared_at,
        0 as difference,
        sv.reason,
        '' as remarks,
        sv.status,
        0 as system_quantity,
        0 as physical_quantity
      FROM sale_voids sv
      JOIN sales s ON s.id = sv.sale_id
      LEFT JOIN users u ON u.id = sv.requested_by
      WHERE sv.status = 'pending'
    `);

    const [returns] = await pool.execute<any[]>(`
      SELECT
        'RETURN' as type,
        r.id,
        r.return_number as reference,
        COALESCE(p.product_name, 'Multiple Items') as product_name,
        COALESCE(p.barcode, '—') as barcode,
        COALESCE(u.full_name, '—') AS requested_by_name,
        r.created_at as prepared_at,
        COALESCE(ri.quantity_returned, 0) as difference,
        r.return_reason as reason,
        '' as remarks,
        r.status,
        0 as system_quantity,
        COALESCE(ri.quantity_returned, 0) as physical_quantity,
        s.invoice_number,
        COALESCE(r.refund_amount, 0) as amount,
        COALESCE(s.customer_name, c.full_name, 'Walk-in') as customer_name,
        s.customer_id as customer_id
      FROM returns r
      LEFT JOIN (
        SELECT return_id, MIN(product_id) as product_id, SUM(quantity_returned) as quantity_returned
        FROM return_items
        GROUP BY return_id
      ) ri ON ri.return_id = r.id
      LEFT JOIN products p ON p.id = ri.product_id
      LEFT JOIN users u ON u.id = r.processed_by
      LEFT JOIN sales s ON s.id = r.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE r.status = 'pending'
    `);

    res.status(200).json([
      ...stockCountStandard,
      ...stockCountMarket,
      ...voids,
      ...returns
    ]);
  } catch (err) {
    console.error("[requests/GET /pending]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/requests/history ─────────────────────────────────────────────────
router.get("/history", async (req: Request, res: Response) => {
  const { type, status, date_from, date_to, search, limit, offset } = req.query;

  let where = "WHERE 1=1";
  const params: any[] = [];

  if (type && type !== "all") {
    // Type filtering handled per query below
  }
  if (status && status !== "all") {
    where += " AND status = ?";
    params.push(status);
  }
  if (date_from) {
    where += " AND prepared_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND prepared_at <= ?";
    params.push(date_to);
  }

  const limitVal = Math.min(100, Math.max(1, parseInt((limit as string) || "50", 10)));
  const offsetVal = Math.max(0, parseInt((offset as string) || "0", 10));

  try {
    let allRequests: any[] = [];

    // Stock Count Standard
    if (!type || type === "all" || type === "STOCK_COUNT_STANDARD") {
      let stockWhere = where;
      const stockParams = [...params];
      if (status && status !== "all") {
        // Map frontend status to stock count table status
        const statusMap: Record<string, string> = {
          "pending": "PENDING_APPROVAL",
          "approved": "APPROVED",
          "rejected": "REJECTED",
        };
        const statusStr = String(status).toLowerCase();
        const mappedStatus = statusMap[statusStr] || String(status);
        stockWhere = "WHERE 1=1 AND scar.status = ?";
        stockParams[0] = mappedStatus;
      }
      
      const [rows] = await pool.execute<any[]>(`
        SELECT
          'STOCK_COUNT_STANDARD' as type,
          scar.id,
          scar.reference,
          p.product_name,
          p.barcode,
          COALESCE(cat.category_name, '—') AS category_name,
          COALESCE(units.abbreviation, '') AS unit_abbreviation,
          COALESCE(u.full_name, '—') AS requested_by_name,
          scar.prepared_at,
          scar.approved_at,
          COALESCE(u_app.full_name, '—') AS approved_by_name,
          scar.rejection_reason,
          scar.difference,
          scar.reason,
          scar.remarks,
          scar.status,
          scar.system_quantity,
          scar.physical_quantity,
          p.quantity_type,
          COALESCE(units.allow_decimal, 0) AS unit_allow_decimal
        FROM stock_count_adjustment_requests scar
        JOIN products p ON p.id = scar.product_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN users u ON u.id = scar.prepared_by
        LEFT JOIN users u_app ON u_app.id = scar.approved_by
        LEFT JOIN units ON units.id = p.unit_id
        ${stockWhere}
        ${search ? "AND (p.product_name LIKE ? OR p.barcode LIKE ? OR scar.reference LIKE ?)" : ""}
        ORDER BY scar.prepared_at DESC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `, [...stockParams, ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])]);
      allRequests.push(...rows);
    }

    // Stock Count Market
    if (!type || type === "all" || type === "STOCK_COUNT_MARKET") {
      let stockWhere = where;
      const stockParams = [...params];
      if (status && status !== "all") {
        const statusMap: Record<string, string> = {
          "pending": "PENDING_APPROVAL",
          "approved": "APPROVED",
          "rejected": "REJECTED",
        };
        const statusStr = String(status).toLowerCase();
        const mappedStatus = statusMap[statusStr] || String(status);
        stockWhere = "WHERE 1=1 AND mbar.status = ?";
        stockParams[0] = mappedStatus;
      }
      
      const [rows] = await pool.execute<any[]>(`
        SELECT
          'STOCK_COUNT_MARKET' as type,
          mbar.id,
          mbar.reference,
          p.product_name,
          p.barcode,
          COALESCE(cat.category_name, '—') AS category_name,
          COALESCE(units.abbreviation, '') AS unit_abbreviation,
          COALESCE(u.full_name, '—') AS requested_by_name,
          mbar.prepared_at,
          mbar.approved_at,
          COALESCE(u_app.full_name, '—') AS approved_by_name,
          mbar.rejection_reason,
          mbar.difference,
          mbar.reason,
          mbar.remarks,
          mbar.status,
          mbar.system_quantity,
          mbar.physical_quantity,
          p.quantity_type,
          COALESCE(units.allow_decimal, 0) AS unit_allow_decimal
        FROM market_based_adjustment_requests mbar
        JOIN products p ON p.id = mbar.product_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN users u ON u.id = mbar.prepared_by
        LEFT JOIN users u_app ON u_app.id = mbar.approved_by
        LEFT JOIN units ON units.id = p.unit_id
        ${stockWhere}
        ${search ? "AND (p.product_name LIKE ? OR p.barcode LIKE ? OR mbar.reference LIKE ?)" : ""}
        ORDER BY mbar.prepared_at DESC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `, [...stockParams, ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])]);
      allRequests.push(...rows);
    }

    // Void Requests
    if (!type || type === "all" || type === "VOID") {
      let voidWhere = where;
      const voidParams = [...params];
      if (status && status !== "all") {
        // Void table uses lowercase status
        const statusMap: Record<string, string> = {
          "PENDING_APPROVAL": "pending",
          "APPROVED": "approved",
          "REJECTED": "rejected",
        };
        const statusStr = String(status);
        const mappedStatus = statusMap[statusStr] || statusStr.toLowerCase();
        voidWhere = "WHERE 1=1 AND sv.status = ?";
        voidParams[0] = mappedStatus;
      }
      
      const [rows] = await pool.execute<any[]>(`
        SELECT
          'VOID' as type,
          sv.id,
          s.invoice_number as reference,
          '' as product_name,
          '' as barcode,
          COALESCE(u.full_name, '—') AS requested_by_name,
          sv.created_at as prepared_at,
          0 as difference,
          sv.reason,
          '' as remarks,
          sv.status,
          0 as system_quantity,
          0 as physical_quantity
        FROM sale_voids sv
        JOIN sales s ON s.id = sv.sale_id
        LEFT JOIN users u ON u.id = sv.requested_by
        ${voidWhere}
        ${search ? "AND (s.invoice_number LIKE ?)" : ""}
        ORDER BY sv.created_at DESC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `, [...voidParams, ...(search ? [`%${search}%`] : [])]);
      allRequests.push(...rows);
    }

    // Return Requests
    if (!type || type === "all" || type === "RETURN") {
      let returnWhere = where;
      const returnParams = [...params];
      if (status && status !== "all") {
        // Return table uses lowercase status
        const statusMap: Record<string, string> = {
          "PENDING_APPROVAL": "pending",
          "APPROVED": "waiting_for_cashier",
          "REJECTED": "rejected",
          "COMPLETED": "completed",
        };
        const statusStr = String(status);
        const mappedStatus = statusMap[statusStr] || statusStr.toLowerCase();
        returnWhere = "WHERE 1=1 AND r.status = ?";
        returnParams[0] = mappedStatus;
      }
      
      const [rows] = await pool.execute<any[]>(`
        SELECT
          'RETURN' as type,
          r.id,
          r.return_number as reference,
          COALESCE(p.product_name, 'Multiple Items') as product_name,
          COALESCE(p.barcode, '—') as barcode,
          COALESCE(u.full_name, '—') AS requested_by_name,
          r.created_at as prepared_at,
          COALESCE(ri.quantity_returned, 0) as difference,
          r.return_reason as reason,
          '' as remarks,
          r.status,
          0 as system_quantity,
          COALESCE(ri.quantity_returned, 0) as physical_quantity,
          s.invoice_number,
          COALESCE(r.refund_amount, 0) as amount,
          COALESCE(s.customer_name, c.full_name, 'Walk-in') as customer_name,
          s.customer_id as customer_id
        FROM returns r
        LEFT JOIN (
          SELECT return_id, MIN(product_id) as product_id, SUM(quantity_returned) as quantity_returned
          FROM return_items
          GROUP BY return_id
        ) ri ON ri.return_id = r.id
        LEFT JOIN products p ON p.id = ri.product_id
        LEFT JOIN users u ON u.id = r.processed_by
        LEFT JOIN sales s ON s.id = r.sale_id
        LEFT JOIN customers c ON c.id = s.customer_id
        ${returnWhere}
        ${search ? "AND (r.return_number LIKE ? OR s.invoice_number LIKE ? OR p.product_name LIKE ?)" : ""}
        ORDER BY r.created_at DESC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `, [...returnParams, ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])]);
      allRequests.push(...rows);
    }

    // Sort by date
    allRequests.sort((a, b) => new Date(b.prepared_at).getTime() - new Date(a.prepared_at).getTime());

    res.status(200).json(allRequests);
  } catch (err) {
    console.error("[requests/GET /history]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/requests/kpi ─────────────────────────────────────────────────────
router.get("/kpi", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const today = new Date().toISOString().split('T')[0];

    const [pendingStandard] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM stock_count_adjustment_requests WHERE status = 'PENDING_APPROVAL'"
    );
    const [pendingMarket] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM market_based_adjustment_requests WHERE status = 'PENDING_APPROVAL'"
    );
    const [pendingVoid] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM sale_voids WHERE status = 'pending'"
    );
    const [pendingReturn] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM returns WHERE status = 'pending' AND resolution IS NULL"
    );

    const [approvedTodayStandard] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM stock_count_adjustment_requests WHERE status = 'APPROVED' AND DATE(approved_at) = ?",
      [today]
    );
    const [approvedTodayMarket] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM market_based_adjustment_requests WHERE status = 'APPROVED' AND DATE(approved_at) = ?",
      [today]
    );
    const [approvedTodayVoid] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM sale_voids WHERE status = 'approved' AND DATE(resolved_at) = ?",
      [today]
    );
    const [approvedTodayReturn] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM returns WHERE status = 'waiting_for_cashier' AND DATE(resolved_at) = ?",
      [today]
    );

    const [rejectedTodayStandard] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM stock_count_adjustment_requests WHERE status = 'REJECTED' AND DATE(approved_at) = ?",
      [today]
    );
    const [rejectedTodayMarket] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM market_based_adjustment_requests WHERE status = 'REJECTED' AND DATE(approved_at) = ?",
      [today]
    );
    const [rejectedTodayVoid] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM sale_voids WHERE status = 'rejected' AND DATE(resolved_at) = ?",
      [today]
    );
    const [rejectedTodayReturn] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM returns WHERE status = 'rejected' AND DATE(resolved_at) = ?",
      [today]
    );

    const pendingRequests =
      Number(pendingStandard[0]?.count || 0) +
      Number(pendingMarket[0]?.count || 0) +
      Number(pendingVoid[0]?.count || 0) +
      Number(pendingReturn[0]?.count || 0);

    const approvedToday =
      Number(approvedTodayStandard[0]?.count || 0) +
      Number(approvedTodayMarket[0]?.count || 0) +
      Number(approvedTodayVoid[0]?.count || 0) +
      Number(approvedTodayReturn[0]?.count || 0);

    const rejectedToday =
      Number(rejectedTodayStandard[0]?.count || 0) +
      Number(rejectedTodayMarket[0]?.count || 0) +
      Number(rejectedTodayVoid[0]?.count || 0) +
      Number(rejectedTodayReturn[0]?.count || 0);

    res.status(200).json({
      pending_requests: pendingRequests,
      approved_today: approvedToday,
      rejected_today: rejectedToday,
      awaiting_review: pendingRequests,
    });
  } catch (err) {
    console.error("[requests/GET /kpi]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── Standard reason sanitizer ────────────────────────────────────────────────
const VALID_STANDARD_REASONS = [
  "Inventory Miscount",
  "Damaged Items",
  "Lost Items",
  "Newly Found Stock",
  "Encoding Error",
  "Other",
] as const;

function sanitizeStandardReason(input?: string | null): string {
  if (!input) return "Other";
  if ((VALID_STANDARD_REASONS as readonly string[]).includes(input)) return input;
  const lower = input.toLowerCase();
  if (lower.includes("miscount") || lower.includes("count") || lower.includes("correction")) return "Inventory Miscount";
  if (lower.includes("damag")) return "Damaged Items";
  if (lower.includes("lost") || lower.includes("loss") || lower.includes("missing") || lower.includes("expired")) return "Lost Items";
  if (lower.includes("found") || lower.includes("new")) return "Newly Found Stock";
  if (lower.includes("encod") || lower.includes("error")) return "Encoding Error";
  return "Other";
}

// ─── Batch stock count schemas ────────────────────────────────────────────────
const stockCountBatchItemSchema = z.object({
  product_id: z.number().int().positive(),
  system_quantity: z.number(),
  physical_quantity: z.number(),
  reason: z.string().min(1, "Reason is required"),
  remarks: z.string().optional().nullable(),
  is_market_based: z.boolean().optional(),
});

const createStockCountBatchSchema = z.object({
  items: z.array(stockCountBatchItemSchema).min(1, "At least one item is required"),
});

const authorizeStockCountBatchSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  items: z.array(stockCountBatchItemSchema).min(1, "At least one item is required"),
});

const batchDecisionSchema = z.object({
  reference: z.string().optional().nullable(),
  decisions: z.array(z.object({
    id: z.number().int().positive(),
    type: z.enum(["stock-count-standard", "stock-count-market", "STOCK_COUNT_STANDARD", "STOCK_COUNT_MARKET"]),
    action: z.enum(["approve", "reject"]),
    rejection_reason: z.string().optional().nullable(),
  })).min(1, "At least one decision is required"),
});

// ─── POST /api/requests/stock-count/batch — Remote multi-item request ─────────
router.post("/stock-count/batch", async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = createStockCountBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path.join(".")), message: i.message })) });
    return;
  }

  const { items } = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Generate single reference sequence for the whole batch
    const [seqResult] = await conn.execute<any[]>(
      "SELECT id, current_number FROM invoice_sequences WHERE document_type = 'STOCK COUNT ADJUSTMENT REQUEST' LIMIT 1 FOR UPDATE"
    );
    const seq = seqResult[0];
    const nextNum = (seq?.current_number || 0) + 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const reference = `SCAR-${dateStr}-${String(nextNum).padStart(6, '0')}`;

    if (seq) {
      await conn.execute(
        "UPDATE invoice_sequences SET current_number = ? WHERE id = ?",
        [nextNum, seq.id]
      );
    }

    const insertedItems: { id: number; product_id: number; is_market: boolean }[] = [];

    for (const item of items) {
      if (item.is_market_based) {
        const diff = item.physical_quantity - item.system_quantity;
        const [result] = await conn.execute<any>(
          `INSERT INTO market_based_adjustment_requests 
           (product_id, system_quantity, physical_quantity, difference, reason, remarks, prepared_by, reference)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.product_id, item.system_quantity, item.physical_quantity, diff, item.reason, item.remarks || null, userId, reference]
        );
        insertedItems.push({ id: result.insertId, product_id: item.product_id, is_market: true });
      } else {
        const safeReason = sanitizeStandardReason(item.reason);
        const combinedRemarks = item.remarks?.trim()
          ? (item.reason !== safeReason ? `${item.reason} — ${item.remarks.trim()}` : item.remarks.trim())
          : (item.reason !== safeReason ? item.reason : null);

        const [result] = await conn.execute<any>(
          `INSERT INTO stock_count_adjustment_requests 
           (product_id, system_quantity, physical_quantity, reason, remarks, prepared_by, reference)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [item.product_id, item.system_quantity, item.physical_quantity, safeReason, combinedRemarks, userId, reference]
        );
        insertedItems.push({ id: result.insertId, product_id: item.product_id, is_market: false });
      }
    }

    await conn.commit();

    await logAuditEvent({
      action: "STOCK_COUNT_BATCH_REQUEST_CREATED",
      performedById: userId,
      performedByUsername: (req as any).user?.username || "Unknown",
      entityType: "stock_count_batch",
      entityId: insertedItems[0]?.id || 0,
      metadata: { reference, count: items.length },
    });

    broadcastEntityUpdate({ entity: "requests", action: "created" });

    res.status(201).json({
      reference,
      count: items.length,
      items: insertedItems,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[requests/POST /stock-count/batch]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/requests/stock-count/batch/authorize — In-terminal manager override ──
router.post("/stock-count/batch/authorize", async (req: Request, res: Response) => {
  const parsed = authorizeStockCountBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path.join(".")), message: i.message })) });
    return;
  }

  const { username, password, items } = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify manager credentials
    const [userRows] = await conn.execute<any[]>(
      `SELECT id, username, full_name, password_hash, role, status FROM users WHERE username = ? LIMIT 1`,
      [username]
    );
    const manager = userRows[0];
    if (!manager || manager.status !== "Active") {
      await conn.rollback();
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, manager.password_hash);
    if (!passwordMatch) {
      await conn.rollback();
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }
    if (manager.role !== "Admin") {
      await conn.rollback();
      res.status(403).json({ message: "Only an Admin can authorize adjustment requests." });
      return;
    }

    // 2. Generate reference
    const [seqResult] = await conn.execute<any[]>(
      "SELECT id, current_number FROM invoice_sequences WHERE document_type = 'STOCK COUNT ADJUSTMENT REQUEST' LIMIT 1 FOR UPDATE"
    );
    const seq = seqResult[0];
    const nextNum = (seq?.current_number || 0) + 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const reference = `SCAR-${dateStr}-${String(nextNum).padStart(6, '0')}`;

    if (seq) {
      await conn.execute(
        "UPDATE invoice_sequences SET current_number = ? WHERE id = ?",
        [nextNum, seq.id]
      );
    }

    const insertedIds: number[] = [];

    for (const item of items) {
      // Validate product
      const [pRows] = await conn.execute<any[]>(
        "SELECT id, quantity FROM products WHERE id = ? FOR UPDATE",
        [item.product_id]
      );
      if (!pRows[0]) continue;
      const currentQty = Number(pRows[0].quantity);
      const newQty = Number(item.physical_quantity);
      const quantityChange = newQty - currentQty;

      // Update product quantity
      await conn.execute("UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?", [newQty, item.product_id]);

      if (item.is_market_based) {
        const [res] = await conn.execute<any>(
          `INSERT INTO market_based_adjustment_requests 
           (product_id, system_quantity, physical_quantity, difference, reason, remarks, prepared_by, approved_by, approved_at, status, reference)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'APPROVED', ?)`,
          [item.product_id, item.system_quantity, item.physical_quantity, quantityChange, item.reason, item.remarks || null, req.user?.id || manager.id, manager.id, reference]
        );
        insertedIds.push(res.insertId);
      } else {
        const safeReason = sanitizeStandardReason(item.reason);
        const combinedRemarks = item.remarks?.trim()
          ? (item.reason !== safeReason ? `${item.reason} — ${item.remarks.trim()}` : item.remarks.trim())
          : (item.reason !== safeReason ? item.reason : null);

        const [res] = await conn.execute<any>(
          `INSERT INTO stock_count_adjustment_requests 
           (product_id, system_quantity, physical_quantity, reason, remarks, prepared_by, approved_by, approved_at, status, reference)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'APPROVED', ?)`,
          [item.product_id, item.system_quantity, item.physical_quantity, safeReason, combinedRemarks, req.user?.id || manager.id, manager.id, reference]
        );
        insertedIds.push(res.insertId);
      }

      // Insert inventory log
      await conn.execute(
        `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
         VALUES (?, 'Adjustment', 'Stock Adjustment Authorized', ?, ?, ?, ?, ?)`,
        [item.product_id, quantityChange, currentQty, newQty, reference, manager.id]
      );
    }

    await conn.commit();

    broadcastRequestDecision({
      type: "request_decision",
      request_type: "stock_count_standard",
      id: insertedIds[0] || 0,
      reference,
      decision: "approved",
      admin_name: manager.full_name || manager.username,
    });

    broadcastEntityUpdate({ entity: "requests", action: "approved" });
    broadcastEntityUpdate({ entity: "inventory", action: "adjusted" });
    broadcastEntityUpdate({ entity: "dashboard" });

    res.status(200).json({
      message: "Batch adjustments authorized and inventory updated",
      reference,
      count: items.length,
      admin_name: manager.full_name || manager.username,
      admin_id: manager.id,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[requests/POST /stock-count/batch/authorize]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/requests/stock-count/batch/decide — Granular admin approve/reject ───
router.post("/stock-count/batch/decide", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const adminId = (req as any).user?.id;
  const adminUsername = (req as any).user?.full_name || (req as any).user?.username || "Admin";

  const parsed = batchDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path.join(".")), message: i.message })) });
    return;
  }

  const { reference, decisions } = parsed.data;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    let approvedCount = 0;
    let rejectedCount = 0;
    const results: any[] = [];

    for (const d of decisions) {
      const isMarket = d.type.toLowerCase().includes("market");
      const table = isMarket ? "market_based_adjustment_requests" : "stock_count_adjustment_requests";

      const [rows] = await conn.execute<any[]>(
        `SELECT * FROM ${table} WHERE id = ? AND status = 'PENDING_APPROVAL' FOR UPDATE`,
        [d.id]
      );

      if (rows.length === 0) {
        continue;
      }
      const request = rows[0];

      if (d.action === "approve") {
        // Fetch current product quantity
        const [productRows] = await conn.execute<any[]>(
          "SELECT id, quantity FROM products WHERE id = ? FOR UPDATE",
          [request.product_id]
        );
        const currentQty = Number(productRows[0]?.quantity ?? 0);
        const newQty = Number(request.physical_quantity);
        const quantityChange = newQty - currentQty;

        // Update product quantity
        await conn.execute(
          "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
          [newQty, request.product_id]
        );

        // Inventory log
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
           VALUES (?, 'Adjustment', ?, ?, ?, ?, ?, ?)`,
          [request.product_id, isMarket ? "Market-Based Adjustment Approved" : "Stock Count Adjustment Approved", quantityChange, currentQty, newQty, request.reference, adminId]
        );

        // Update request status
        await conn.execute(
          `UPDATE ${table} SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?`,
          [adminId, d.id]
        );

        approvedCount++;
        results.push({ id: d.id, status: "APPROVED", product_id: request.product_id, action: "approve" });

        await logAuditEvent({
          action: isMarket ? "MARKET_BASED_ADJUSTMENT_REQUEST_APPROVED" : "STOCK_COUNT_ADJUSTMENT_REQUEST_APPROVED",
          performedById: adminId,
          performedByUsername: adminUsername,
          entityType: table,
          entityId: d.id,
          metadata: { reference: request.reference, product_id: request.product_id },
          previousValues: { quantity: currentQty },
          newValues: { quantity: newQty },
        });
      } else {
        // Reject
        const reason = d.rejection_reason?.trim() || "Rejected by Administrator";
        await conn.execute(
          `UPDATE ${table} SET status = 'REJECTED', approved_by = ?, approved_at = NOW(), rejection_reason = ? WHERE id = ?`,
          [adminId, reason, d.id]
        );

        rejectedCount++;
        results.push({ id: d.id, status: "REJECTED", reason, action: "reject" });

        await logAuditEvent({
          action: isMarket ? "MARKET_BASED_ADJUSTMENT_REQUEST_REJECTED" : "STOCK_COUNT_ADJUSTMENT_REQUEST_REJECTED",
          performedById: adminId,
          performedByUsername: adminUsername,
          entityType: table,
          entityId: d.id,
          reason,
        });
      }
    }

    await conn.commit();

    // Broadcast decision to all clients
    broadcastRequestDecision({
      type: "request_decision",
      request_type: "stock_count_standard",
      id: decisions[0]?.id || 0,
      reference: reference || undefined,
      decision: rejectedCount === 0 ? "approved" : approvedCount === 0 ? "rejected" : "approved",
      admin_name: adminUsername,
      rejection_reason: rejectedCount > 0 ? `${rejectedCount} item(s) rejected` : null,
    });

    broadcastEntityUpdate({ entity: "requests", action: "approved" });
    broadcastEntityUpdate({ entity: "inventory", action: "adjusted" });
    broadcastEntityUpdate({ entity: "dashboard" });

    res.status(200).json({
      message: `Batch decision processed: ${approvedCount} approved, ${rejectedCount} rejected.`,
      approved_count: approvedCount,
      rejected_count: rejectedCount,
      results,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[requests/POST /stock-count/batch/decide]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/requests/batch/:reference — Fetch all items in a batch request ──
router.get("/batch/:reference", async (req: Request, res: Response) => {
  const { reference } = req.params;
  if (!reference) {
    res.status(400).json({ message: "Reference is required." });
    return;
  }

  try {
    const [standardRows] = await pool.execute<any[]>(`
      SELECT
        'STOCK_COUNT_STANDARD' as type,
        scar.id,
        scar.reference,
        p.id as product_id,
        p.product_name,
        p.barcode,
        COALESCE(cat.category_name, '—') AS category_name,
        COALESCE(units.abbreviation, '') AS unit_abbreviation,
        COALESCE(u.full_name, '—') AS requested_by_name,
        scar.prepared_at,
        scar.approved_at,
        COALESCE(u_app.full_name, '—') AS approved_by_name,
        scar.rejection_reason,
        scar.difference,
        scar.reason,
        scar.remarks,
        scar.status,
        scar.system_quantity,
        scar.physical_quantity,
        p.quantity_type,
        COALESCE(units.allow_decimal, 0) AS unit_allow_decimal
      FROM stock_count_adjustment_requests scar
      JOIN products p ON p.id = scar.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      LEFT JOIN users u ON u.id = scar.prepared_by
      LEFT JOIN users u_app ON u_app.id = scar.approved_by
      LEFT JOIN units ON units.id = p.unit_id
      WHERE scar.reference = ?
      ORDER BY scar.id ASC
    `, [reference]);

    const [marketRows] = await pool.execute<any[]>(`
      SELECT
        'STOCK_COUNT_MARKET' as type,
        mbar.id,
        mbar.reference,
        p.id as product_id,
        p.product_name,
        p.barcode,
        COALESCE(cat.category_name, '—') AS category_name,
        COALESCE(units.abbreviation, '') AS unit_abbreviation,
        COALESCE(u.full_name, '—') AS requested_by_name,
        mbar.prepared_at,
        mbar.approved_at,
        COALESCE(u_app.full_name, '—') AS approved_by_name,
        mbar.rejection_reason,
        mbar.difference,
        mbar.reason,
        mbar.remarks,
        mbar.status,
        mbar.system_quantity,
        mbar.physical_quantity,
        p.quantity_type,
        COALESCE(units.allow_decimal, 0) AS unit_allow_decimal
      FROM market_based_adjustment_requests mbar
      JOIN products p ON p.id = mbar.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      LEFT JOIN users u ON u.id = mbar.prepared_by
      LEFT JOIN users u_app ON u_app.id = mbar.approved_by
      LEFT JOIN units ON units.id = p.unit_id
      WHERE mbar.reference = ?
      ORDER BY mbar.id ASC
    `, [reference]);

    const items = [...standardRows, ...marketRows];
    if (items.length === 0) {
      res.status(404).json({ message: "No items found for this batch reference." });
      return;
    }

    res.status(200).json({
      reference,
      items_count: items.length,
      requested_by_name: items[0]?.requested_by_name || "—",
      prepared_at: items[0]?.prepared_at,
      status: items.every(i => i.status === "APPROVED")
        ? "APPROVED"
        : items.every(i => i.status === "REJECTED")
        ? "REJECTED"
        : items.some(i => i.status === "PENDING_APPROVAL")
        ? "PENDING_APPROVAL"
        : "PARTIALLY_APPROVED",
      items,
    });
  } catch (err) {
    console.error("[requests/GET /batch/:reference]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/requests/stock-count-standard ───────────────────────────────────
const createStockCountRequestSchema = z.object({
  product_id: z.number().int().positive(),
  system_quantity: z.number(),
  physical_quantity: z.number(),
  reason: z.string().min(1, "Reason is required"),
  remarks: z.string().optional().nullable(),
});

router.post("/stock-count-standard", async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    const data = createStockCountRequestSchema.parse(req.body);

    await conn.beginTransaction();

    // BUG-09 FIX: Use FOR UPDATE to prevent race condition on sequence number
    const [seqResult] = await conn.execute<any[]>(
      "SELECT id, current_number FROM invoice_sequences WHERE document_type = 'STOCK COUNT ADJUSTMENT REQUEST' LIMIT 1 FOR UPDATE"
    );
    const seq = seqResult[0];
    const nextNum = (seq?.current_number || 0) + 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const reference = `SCAR-${dateStr}-${String(nextNum).padStart(6, '0')}`;

    // Update sequence first (inside transaction)
    if (seq) {
      await conn.execute(
        "UPDATE invoice_sequences SET current_number = ? WHERE id = ?",
        [nextNum, seq.id]
      );
    }

    const safeReason = sanitizeStandardReason(data.reason);
    const combinedRemarks = data.remarks?.trim()
      ? (data.reason !== safeReason ? `${data.reason} — ${data.remarks.trim()}` : data.remarks.trim())
      : (data.reason !== safeReason ? data.reason : null);

    // Insert request
    const [insertResult] = await conn.execute<any>(
      `INSERT INTO stock_count_adjustment_requests 
       (product_id, system_quantity, physical_quantity, reason, remarks, prepared_by, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.product_id, data.system_quantity, data.physical_quantity, safeReason, combinedRemarks, userId, reference]
    );

    const requestId = insertResult.insertId;

    await conn.commit();

    // Log audit outside transaction
    await logAuditEvent({
      action: "STOCK_COUNT_ADJUSTMENT_REQUEST_CREATED",
      performedById: userId,
      performedByUsername: (req as any).user?.username || "Unknown",
      entityType: "stock_count_adjustment_request",
      entityId: requestId,
      metadata: { reference, product_id: data.product_id },
    });

    res.status(201).json({ id: requestId, reference });
  } catch (err) {
    await conn.rollback();
    console.error("[requests/POST /stock-count-standard]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/requests/stock-count-standard/authorize — Create + approve on terminal ─
const authorizeStockCountSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  product_id: z.number().int().positive(),
  system_quantity: z.number(),
  physical_quantity: z.number(),
  reason: z.string().min(1, "Reason is required"),
  remarks: z.string().optional().nullable(),
});

router.post("/stock-count-standard/authorize", async (req: Request, res: Response) => {
  const parsed = authorizeStockCountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { username, password, product_id, system_quantity, physical_quantity, reason, remarks } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify manager credentials
    const [userRows] = await conn.execute<any[]>(
      `SELECT id, username, full_name, password_hash, role, status FROM users WHERE username = ? LIMIT 1`,
      [username]
    );
    const manager = userRows[0];
    if (!manager || manager.status !== "Active") {
      await conn.rollback();
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, manager.password_hash);
    if (!passwordMatch) {
      await conn.rollback();
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }
    if (manager.role !== "Admin") {
      await conn.rollback();
      res.status(403).json({ message: "Only an Admin can authorize adjustment requests." });
      return;
    }

    // 2. Validate product
    const [productRows] = await conn.execute<any[]>(
      `SELECT id, product_name, quantity, status FROM products WHERE id = ? FOR UPDATE`,
      [product_id]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const product = productRows[0];
    const currentQty = Number(product.quantity);
    const newQty = Number(physical_quantity);
    const quantityChange = newQty - currentQty;

    // 3. Generate reference
    const [seqResult] = await conn.execute<any[]>(
      "SELECT id, current_number FROM invoice_sequences WHERE document_type = 'STOCK COUNT ADJUSTMENT REQUEST' LIMIT 1 FOR UPDATE"
    );
    const seq = seqResult[0];
    const nextNum = (seq?.current_number || 0) + 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const reference = `SCAR-${dateStr}-${String(nextNum).padStart(6, '0')}`;

    if (seq) {
      await conn.execute(
        "UPDATE invoice_sequences SET current_number = ? WHERE id = ?",
        [nextNum, seq.id]
      );
    }

    // 4. Update product quantity
    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQty, product_id]
    );

    const safeReason = sanitizeStandardReason(reason);
    const combinedRemarks = remarks?.trim()
      ? (reason !== safeReason ? `${reason} — ${remarks.trim()}` : remarks.trim())
      : (reason !== safeReason ? reason : null);

    // 5. Insert request as APPROVED
    const [insertResult] = await conn.execute<any>(
      `INSERT INTO stock_count_adjustment_requests 
       (product_id, system_quantity, physical_quantity, reason, remarks, prepared_by, approved_by, approved_at, status, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'APPROVED', ?)`,
      [product_id, system_quantity, physical_quantity, safeReason, combinedRemarks, req.user?.id || manager.id, manager.id, reference]
    );

    const requestId = insertResult.insertId;

    // 6. Create inventory log
    await conn.execute(
      `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
       VALUES (?, 'Adjustment', 'Stock Adjustment Authorized', ?, ?, ?, ?, ?)`,
      [product_id, quantityChange, currentQty, newQty, reference, manager.id]
    );

    await conn.commit();

    await logAuditEvent({
      action: "STOCK_COUNT_ADJUSTMENT_REQUEST_APPROVED",
      performedById: manager.id,
      performedByUsername: manager.username,
      entityType: "stock_count_adjustment_request",
      entityId: requestId,
      metadata: { reference, product_id, authorized_on_terminal: true },
      previousValues: { quantity: currentQty },
      newValues: { quantity: newQty },
    });

    broadcastEntityUpdate({ entity: "requests", action: "approved" });
    broadcastEntityUpdate({ entity: "inventory" });
    broadcastEntityUpdate({ entity: "products", id: product_id });
    broadcastEntityUpdate({ entity: "dashboard" });

    res.status(200).json({
      message: "Adjustment authorized and inventory updated",
      id: requestId,
      reference,
      new_quantity: newQty,
      admin_name: manager.full_name,
      admin_id: manager.id,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[requests/POST /stock-count-standard/authorize]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/requests/stock-count-standard/:id/local-override ────────────────
router.post("/stock-count-standard/:id/local-override", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid request ID." });
    return;
  }

  const { username, password } = req.body;
  if (!username || !password) {
    res.status(422).json({ message: "Username and password are required." });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify manager credentials
    const [userRows] = await conn.execute<any[]>(
      `SELECT id, username, full_name, password_hash, role, status FROM users WHERE username = ? LIMIT 1`,
      [username]
    );
    const manager = userRows[0];
    if (!manager || manager.status !== "Active") {
      await conn.rollback();
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, manager.password_hash);
    if (!passwordMatch) {
      await conn.rollback();
      res.status(401).json({ message: "Invalid credentials." });
      return;
    }
    if (manager.role !== "Admin") {
      await conn.rollback();
      res.status(403).json({ message: "Only an Admin can authorize adjustment requests." });
      return;
    }

    // 2. Fetch pending request
    const [rows] = await conn.execute<any[]>(
      "SELECT * FROM stock_count_adjustment_requests WHERE id = ? AND status = 'PENDING_APPROVAL' FOR UPDATE",
      [id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Request not found or already processed." });
      return;
    }
    const request = rows[0];

    // 3. Update product
    const [productRows] = await conn.execute<any[]>(
      "SELECT id, quantity FROM products WHERE id = ? FOR UPDATE",
      [request.product_id]
    );
    const currentQty = Number(productRows[0]?.quantity ?? 0);
    const newQty = Number(request.physical_quantity);
    const quantityChange = newQty - currentQty;

    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQty, request.product_id]
    );

    // 4. Update request status
    await conn.execute(
      "UPDATE stock_count_adjustment_requests SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?",
      [manager.id, id]
    );

    // 5. Inventory logs
    await conn.execute(
      `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
       VALUES (?, 'Adjustment', 'Stock Adjustment Authorized', ?, ?, ?, ?, ?)`,
      [request.product_id, quantityChange, currentQty, newQty, request.reference, manager.id]
    );

    await conn.commit();

    await logAuditEvent({
      action: "STOCK_COUNT_ADJUSTMENT_REQUEST_APPROVED",
      performedById: manager.id,
      performedByUsername: manager.username,
      entityType: "stock_count_adjustment_request",
      entityId: id,
      metadata: { reference: request.reference, product_id: request.product_id, local_override: true },
      previousValues: { quantity: currentQty },
      newValues: { quantity: newQty },
    });

    broadcastEntityUpdate({ entity: "requests", action: "approved" });
    broadcastEntityUpdate({ entity: "inventory" });
    broadcastEntityUpdate({ entity: "products", id: request.product_id });
    broadcastEntityUpdate({ entity: "dashboard" });

    res.status(200).json({
      message: "Adjustment authorized and inventory updated",
      reference: request.reference,
      new_quantity: newQty,
      admin_name: manager.full_name,
      admin_id: manager.id,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[requests/POST /stock-count-standard/:id/local-override]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/requests/:type/:id/approve ───────────────────────────────────────
router.post("/:type/:id/approve", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { type, id } = req.params;
  const adminId = (req as any).user?.id;
  const adminUsername = (req as any).user?.username;

  try {
    const requestId = parseInt(id, 10);
    if (isNaN(requestId)) {
      res.status(400).json({ message: "Invalid request ID." });
      return;
    }

    if (type === "stock-count-standard") {
      // BUG-01 FIX: Actually apply the physical_quantity to the product's stock
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [rows] = await conn.execute<any[]>(
          "SELECT * FROM stock_count_adjustment_requests WHERE id = ? AND status = 'PENDING_APPROVAL' FOR UPDATE",
          [requestId]
        );
        if (rows.length === 0) {
          await conn.rollback();
          res.status(404).json({ message: "Request not found or already processed." });
          return;
        }

        const request = rows[0];

        // Fetch current product quantity for log
        const [productRows] = await conn.execute<any[]>(
          "SELECT id, quantity FROM products WHERE id = ? FOR UPDATE",
          [request.product_id]
        );
        const currentQty = Number(productRows[0]?.quantity ?? 0);
        const newQty = Number(request.physical_quantity);
        const quantityChange = newQty - currentQty;

        // Actually update product quantity to physical_quantity
        await conn.execute(
          "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
          [newQty, request.product_id]
        );

        // Create inventory log with correct columns
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
           VALUES (?, 'Adjustment', 'Stock Count Adjustment Approved', ?, ?, ?, ?, ?)`,
          [request.product_id, quantityChange, currentQty, newQty, request.reference, adminId]
        );

        // Update request status
        await conn.execute(
          "UPDATE stock_count_adjustment_requests SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?",
          [adminId, requestId]
        );

        await conn.commit();

        await logAuditEvent({
          action: "STOCK_COUNT_ADJUSTMENT_REQUEST_APPROVED",
          performedById: adminId,
          performedByUsername: adminUsername || "Unknown",
          entityType: "stock_count_adjustment_request",
          entityId: requestId,
          metadata: { reference: request.reference, product_id: request.product_id },
          previousValues: { quantity: currentQty },
          newValues: { quantity: newQty },
        });

        broadcastRequestDecision({
          type: "request_decision",
          request_type: "stock_count_standard",
          id: requestId,
          reference: request.reference,
          decision: "approved",
          admin_name: adminUsername || "Admin",
        });

        broadcastEntityUpdate({ entity: "requests", action: "approved", id: requestId });
        broadcastEntityUpdate({ entity: "inventory", action: "adjusted" });
        broadcastEntityUpdate({ entity: "products", id: request.product_id });
        broadcastEntityUpdate({ entity: "dashboard" });

        res.status(200).json({ message: "Request approved." });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } else if (type === "stock-count-market") {
      // BUG-01 FIX: Actually apply the physical_quantity to the product's stock
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [rows] = await conn.execute<any[]>(
          "SELECT * FROM market_based_adjustment_requests WHERE id = ? AND status = 'PENDING_APPROVAL' FOR UPDATE",
          [requestId]
        );
        if (rows.length === 0) {
          await conn.rollback();
          res.status(404).json({ message: "Request not found or already processed." });
          return;
        }

        const request = rows[0];

        // Fetch current product quantity for log
        const [productRows] = await conn.execute<any[]>(
          "SELECT id, quantity FROM products WHERE id = ? FOR UPDATE",
          [request.product_id]
        );
        const currentQty = Number(productRows[0]?.quantity ?? 0);
        const newQty = Number(request.physical_quantity);
        const quantityChange = newQty - currentQty;

        // Actually update product quantity to physical_quantity
        await conn.execute(
          "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
          [newQty, request.product_id]
        );

        // Create inventory log with correct columns
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
           VALUES (?, 'Adjustment', 'Market-Based Adjustment Approved', ?, ?, ?, ?, ?)`,
          [request.product_id, quantityChange, currentQty, newQty, request.reference, adminId]
        );

        // Update request status
        await conn.execute(
          "UPDATE market_based_adjustment_requests SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?",
          [adminId, requestId]
        );

        await conn.commit();

        await logAuditEvent({
          action: "MARKET_BASED_ADJUSTMENT_REQUEST_APPROVED",
          performedById: adminId,
          performedByUsername: adminUsername || "Unknown",
          entityType: "market_based_adjustment_request",
          entityId: requestId,
          metadata: { reference: request.reference, product_id: request.product_id },
          previousValues: { quantity: currentQty },
          newValues: { quantity: newQty },
        });

        broadcastRequestDecision({
          type: "request_decision",
          request_type: "stock_count_market",
          id: requestId,
          reference: request.reference,
          decision: "approved",
          admin_name: adminUsername || "Admin",
        });

        broadcastEntityUpdate({ entity: "requests", action: "approved", id: requestId });
        broadcastEntityUpdate({ entity: "inventory", action: "adjusted" });
        broadcastEntityUpdate({ entity: "products", id: request.product_id });
        broadcastEntityUpdate({ entity: "dashboard" });

        res.status(200).json({ message: "Request approved." });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } else if (type === "void") {
      // BUG-03 FIX: Implement void approval (was returning 501)
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [voidRows] = await conn.execute<any[]>(
          `SELECT sv.id, sv.sale_id, sv.status, sv.reason, s.invoice_number
           FROM sale_voids sv JOIN sales s ON s.id = sv.sale_id
           WHERE sv.id = ? FOR UPDATE`,
          [requestId]
        );
        const voidRow = voidRows[0];
        if (!voidRow) {
          await conn.rollback();
          res.status(404).json({ message: "Void request not found." });
          return;
        }
        if (voidRow.status !== "pending") {
          await conn.rollback();
          res.status(422).json({ message: "Only pending void requests can be approved." });
          return;
        }

        // Restore inventory for each sold item
        const [saleItems] = await conn.execute<any[]>(
          "SELECT product_id, quantity FROM sale_items WHERE sale_id = ?",
          [voidRow.sale_id]
        );
        for (const item of saleItems) {
          await conn.execute(
            "UPDATE products SET quantity = quantity + ? WHERE id = ?",
            [item.quantity, item.product_id]
          );
          await conn.execute(
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Void', 'void_restore', ?, ?, ?)`,
            [item.product_id, item.quantity, voidRow.invoice_number, adminId]
          );
        }

        await conn.execute(
          "UPDATE sale_voids SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?",
          [adminId, requestId]
        );
        await conn.execute(
          "UPDATE sales SET void_status = 'voided' WHERE id = ?",
          [voidRow.sale_id]
        );

        await conn.commit();

        await logAuditEvent({
          action: "SALE_VOIDED",
          performedById: adminId,
          performedByUsername: adminUsername || "Unknown",
          entityType: "sales",
          entityId: voidRow.sale_id,
          reason: voidRow.reason,
          newValues: { invoice_number: voidRow.invoice_number, void_request_id: requestId },
        });

        // Notify the cashier via WebSocket
        const [cashierRow] = await pool.execute<any[]>(
          "SELECT s.cashier_id, s.total_amount FROM sales s WHERE s.id = ?",
          [voidRow.sale_id]
        );
        if ((cashierRow as any[])[0]) {
          const { cashier_id, total_amount } = (cashierRow as any[])[0];
          sendVoidDecision({
            type: "void_decision",
            void_id: requestId,
            sale_id: voidRow.sale_id,
            invoice_number: voidRow.invoice_number,
            total_amount: Number(total_amount),
            decision: "approved",
            admin_name: adminUsername || "Admin",
            rejection_reason: null,
            cashier_user_id: cashier_id,
          });
        }

        broadcastEntityUpdate({ entity: "requests", action: "approved", id: requestId });
        broadcastEntityUpdate({ entity: "sales", action: "voided", id: voidRow.sale_id });
        broadcastEntityUpdate({ entity: "inventory", action: "adjusted" });
        broadcastEntityUpdate({ entity: "dashboard" });

        res.status(200).json({ message: "Sale voided successfully." });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } else if (type === "return") {
      await pool.execute(
        "UPDATE returns SET status = 'waiting_for_cashier', approved_by = ?, resolved_at = NOW() WHERE id = ?",
        [adminId, requestId]
      );

      await logAuditEvent({
        action: "RETURN_APPROVED",
        performedById: adminId,
        performedByUsername: adminUsername || "Unknown",
        entityType: "return",
        entityId: requestId,
      });

      broadcastEntityUpdate({ entity: "requests", action: "approved", id: requestId });
      broadcastEntityUpdate({ entity: "returns", action: "approved", id: requestId });
      broadcastEntityUpdate({ entity: "dashboard" });

      res.status(200).json({ message: "Request approved." });
    } else {
      res.status(400).json({ message: "Invalid request type." });
    }
  } catch (err) {
    console.error("[requests/POST /:type/:id/approve]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/requests/:type/:id/reject ───────────────────────────────────────
router.post("/:type/:id/reject", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { type, id } = req.params;
  const adminId = (req as any).user?.id;
  const adminUsername = (req as any).user?.username;
  const { rejection_reason } = req.body;

  if (!rejection_reason || !rejection_reason.trim()) {
    res.status(400).json({ message: "Rejection reason is required." });
    return;
  }

  try {
    const requestId = parseInt(id, 10);
    if (isNaN(requestId)) {
      res.status(400).json({ message: "Invalid request ID." });
      return;
    }

    if (type === "stock-count-standard") {
      await pool.execute(
        "UPDATE stock_count_adjustment_requests SET status = 'REJECTED', approved_by = ?, approved_at = NOW(), rejection_reason = ? WHERE id = ?",
        [adminId, rejection_reason, requestId]
      );

      await logAuditEvent({
        action: "STOCK_COUNT_ADJUSTMENT_REQUEST_REJECTED",
        performedById: adminId,
        performedByUsername: adminUsername || "Unknown",
        entityType: "stock_count_adjustment_request",
        entityId: requestId,
        reason: rejection_reason,
      });

      broadcastRequestDecision({
        type: "request_decision",
        request_type: "stock_count_standard",
        id: requestId,
        decision: "rejected",
        admin_name: adminUsername || "Admin",
        rejection_reason,
      });

      broadcastEntityUpdate({ entity: "requests", action: "rejected", id: requestId });
      broadcastEntityUpdate({ entity: "inventory" });
      broadcastEntityUpdate({ entity: "dashboard" });

      res.status(200).json({ message: "Request rejected." });
    } else if (type === "stock-count-market") {
      await pool.execute(
        "UPDATE market_based_adjustment_requests SET status = 'REJECTED', approved_by = ?, approved_at = NOW(), rejection_reason = ? WHERE id = ?",
        [adminId, rejection_reason, requestId]
      );

      await logAuditEvent({
        action: "MARKET_BASED_ADJUSTMENT_REQUEST_REJECTED",
        performedById: adminId,
        performedByUsername: adminUsername || "Unknown",
        entityType: "market_based_adjustment_request",
        entityId: requestId,
        reason: rejection_reason,
      });

      broadcastRequestDecision({
        type: "request_decision",
        request_type: "stock_count_market",
        id: requestId,
        decision: "rejected",
        admin_name: adminUsername || "Admin",
        rejection_reason,
      });

      broadcastEntityUpdate({ entity: "requests", action: "rejected", id: requestId });
      broadcastEntityUpdate({ entity: "inventory" });
      broadcastEntityUpdate({ entity: "dashboard" });

      res.status(200).json({ message: "Request rejected." });
    } else if (type === "void") {
      // BUG-03 FIX: Implement void rejection (was returning 501)
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [voidRows] = await conn.execute<any[]>(
          `SELECT sv.id, sv.sale_id, sv.status, s.invoice_number
           FROM sale_voids sv JOIN sales s ON s.id = sv.sale_id
           WHERE sv.id = ? FOR UPDATE`,
          [requestId]
        );
        const voidRow = voidRows[0];
        if (!voidRow) {
          await conn.rollback();
          res.status(404).json({ message: "Void request not found." });
          return;
        }
        if (voidRow.status !== "pending") {
          await conn.rollback();
          res.status(422).json({ message: "Only pending void requests can be rejected." });
          return;
        }

        await conn.execute(
          "UPDATE sale_voids SET status = 'rejected', approved_by = ?, resolved_at = NOW(), rejection_reason = ? WHERE id = ?",
          [adminId, rejection_reason, requestId]
        );
        await conn.execute(
          "UPDATE sales SET void_status = 'active' WHERE id = ?",
          [voidRow.sale_id]
        );

        await conn.commit();

        await logAuditEvent({
          action: "SALE_CANCELLATION_REJECTED",
          performedById: adminId,
          performedByUsername: adminUsername || "Unknown",
          entityType: "sales",
          entityId: voidRow.sale_id,
          reason: rejection_reason,
          newValues: { invoice_number: voidRow.invoice_number, void_request_id: requestId },
        });

        // Notify the cashier via WebSocket
        const [cashierRow] = await pool.execute<any[]>(
          "SELECT s.cashier_id, s.total_amount FROM sales s WHERE s.id = ?",
          [voidRow.sale_id]
        );
        if ((cashierRow as any[])[0]) {
          const { cashier_id, total_amount } = (cashierRow as any[])[0];
          sendVoidDecision({
            type: "void_decision",
            void_id: requestId,
            sale_id: voidRow.sale_id,
            invoice_number: voidRow.invoice_number,
            total_amount: Number(total_amount),
            decision: "rejected",
            admin_name: adminUsername || "Admin",
            rejection_reason: rejection_reason ?? null,
            cashier_user_id: cashier_id,
          });
        }

        broadcastEntityUpdate({ entity: "requests", action: "rejected" });
        broadcastEntityUpdate({ entity: "sales", action: "updated", id: voidRow.sale_id });

        res.status(200).json({ message: "Void request rejected." });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } else if (type === "return") {
      await pool.execute(
        "UPDATE returns SET status = 'rejected', approved_by = ?, resolved_at = NOW(), return_reason = ? WHERE id = ?",
        [adminId, rejection_reason, requestId]
      );

      await logAuditEvent({
        action: "RETURN_REJECTED",
        performedById: adminId,
        performedByUsername: adminUsername || "Unknown",
        entityType: "return",
        entityId: requestId,
        reason: rejection_reason,
      });

      broadcastEntityUpdate({ entity: "requests", action: "rejected" });
      broadcastEntityUpdate({ entity: "returns", action: "rejected", id: requestId });

      res.status(200).json({ message: "Request rejected." });
    } else {
      res.status(400).json({ message: "Invalid request type." });
    }
  } catch (err) {
    console.error("[requests/POST /:type/:id/reject]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
