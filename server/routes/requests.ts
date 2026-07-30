import { Router, Request, Response } from "express";
import { pool } from "../db";
import { authenticate } from "../middleware/authenticate";
import { logAuditEvent } from "../utils/auditLogger";
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
        scar.physical_quantity
      FROM stock_count_adjustment_requests scar
      JOIN products p ON p.id = scar.product_id
      LEFT JOIN users u ON u.id = scar.prepared_by
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
        mbar.physical_quantity
      FROM market_based_adjustment_requests mbar
      JOIN products p ON p.id = mbar.product_id
      LEFT JOIN users u ON u.id = mbar.prepared_by
      WHERE mbar.status = 'PENDING_APPROVAL'
    `);

    const [voidRequests] = await pool.execute<any[]>(`
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
        0 as physical_quantity,
        s.invoice_number,
        s.customer_name,
        s.total_amount as amount
      FROM sale_voids sv
      JOIN sales s ON s.id = sv.sale_id
      LEFT JOIN users u ON u.id = sv.requested_by
      WHERE sv.status = 'pending'
    `);

    const [returnRequests] = await pool.execute<any[]>(`
      SELECT
        'RETURN' as type,
        r.id,
        r.return_number as reference,
        p.product_name,
        p.barcode,
        COALESCE(u.full_name, '—') AS requested_by_name,
        r.created_at as prepared_at,
        0 as difference,
        r.return_reason as reason,
        CONCAT('Resolution: ', COALESCE(r.resolution, 'N/A'), ', Condition: ', COALESCE(r.item_condition, 'N/A')) as remarks,
        r.status,
        0 as system_quantity,
        ri.quantity_returned as physical_quantity,
        s.invoice_number,
        s.customer_name,
        r.refund_amount as amount,
        ri.unit_price
      FROM returns r
      LEFT JOIN return_items ri ON ri.return_id = r.id
      LEFT JOIN sales s ON s.id = r.sale_id
      LEFT JOIN products p ON p.id = ri.product_id
      LEFT JOIN users u ON u.id = r.processed_by
      WHERE r.status = 'pending' AND r.resolution IS NULL
    `);

    // Combine and sort by date
    const allRequests = [
      ...stockCountStandard,
      ...stockCountMarket,
      ...voidRequests,
      ...returnRequests,
    ].sort((a, b) => new Date(b.prepared_at).getTime() - new Date(a.prepared_at).getTime());

    res.status(200).json(allRequests);
  } catch (err) {
    console.error("[requests/GET /pending]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/requests/history ─────────────────────────────────────────────────
router.get("/history", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

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
          COALESCE(u.full_name, '—') AS requested_by_name,
          scar.prepared_at,
          scar.difference,
          scar.reason,
          scar.remarks,
          scar.status,
          scar.system_quantity,
          scar.physical_quantity
        FROM stock_count_adjustment_requests scar
        JOIN products p ON p.id = scar.product_id
        LEFT JOIN users u ON u.id = scar.prepared_by
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
          COALESCE(u.full_name, '—') AS requested_by_name,
          mbar.prepared_at,
          mbar.difference,
          mbar.reason,
          mbar.remarks,
          mbar.status,
          mbar.system_quantity,
          mbar.physical_quantity
        FROM market_based_adjustment_requests mbar
        JOIN products p ON p.id = mbar.product_id
        LEFT JOIN users u ON u.id = mbar.prepared_by
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
          "APPROVED": "approved",
          "REJECTED": "rejected",
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
          '' as product_name,
          '' as barcode,
          COALESCE(u.full_name, '—') AS requested_by_name,
          r.created_at as prepared_at,
          0 as difference,
          r.return_reason as reason,
          '' as remarks,
          r.status,
          0 as system_quantity,
          0 as physical_quantity
        FROM returns r
        LEFT JOIN users u ON u.id = r.processed_by
        ${returnWhere}
        ${search ? "AND (r.return_number LIKE ?)" : ""}
        ORDER BY r.created_at DESC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `, [...returnParams, ...(search ? [`%${search}%`] : [])]);
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
      "SELECT COUNT(*) as count FROM returns WHERE status = 'approved' AND DATE(resolved_at) = ?",
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

// ─── POST /api/requests/stock-count-standard ───────────────────────────────────
const createStockCountRequestSchema = z.object({
  product_id: z.number(),
  system_quantity: z.number(),
  physical_quantity: z.number(),
  reason: z.enum(['Inventory Miscount', 'Damaged Items', 'Lost Items', 'Newly Found Stock', 'Encoding Error', 'Other']),
  remarks: z.string().optional(),
});

router.post("/stock-count-standard", async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const data = createStockCountRequestSchema.parse(req.body);

    // Generate reference number
    const [seqResult] = await pool.execute<any[]>(
      "SELECT current_number FROM invoice_sequences WHERE document_type = 'STOCK COUNT ADJUSTMENT REQUEST'"
    );
    const seq = seqResult[0];
    const nextNum = (seq?.current_number || 0) + 1;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const reference = `SCAR-${dateStr}-${String(nextNum).padStart(6, '0')}`;

    // Insert request
    await pool.execute(
      `INSERT INTO stock_count_adjustment_requests 
       (product_id, system_quantity, physical_quantity, reason, remarks, prepared_by, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.product_id, data.system_quantity, data.physical_quantity, data.reason, data.remarks || null, userId, reference]
    );

    // Update sequence
    await pool.execute(
      "UPDATE invoice_sequences SET current_number = ? WHERE document_type = 'STOCK COUNT ADJUSTMENT REQUEST'",
      [nextNum]
    );

    // Log audit
    await logAuditEvent({
      action: "STOCK_COUNT_ADJUSTMENT_REQUEST_CREATED",
      performedById: userId,
      performedByUsername: (req as any).user?.username || "Unknown",
      entityType: "stock_count_adjustment_request",
      entityId: undefined,
      metadata: { reference, product_id: data.product_id },
    });

    res.status(201).json({ reference });
  } catch (err) {
    console.error("[requests/POST /stock-count-standard]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
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
      // Approve standard stock count request
      const [rows] = await pool.execute<any[]>(
        "SELECT * FROM stock_count_adjustment_requests WHERE id = ? AND status = 'PENDING_APPROVAL'",
        [requestId]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "Request not found or already processed." });
        return;
      }

      const request = rows[0];

      // Update inventory
      await pool.execute(
        "UPDATE products SET quantity = quantity WHERE id = ?",
        [request.product_id]
      );

      // Create inventory log
      await pool.execute(
        `INSERT INTO inventory_logs (product_id, quantity, transaction_type, action, reference, user_id)
         VALUES (?, ?, 'Adjustment', 'Stock Count Adjustment Approved', ?, ?)`,
        [request.product_id, request.physical_quantity, request.reference, adminId]
      );

      // Update request status
      await pool.execute(
        "UPDATE stock_count_adjustment_requests SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?",
        [adminId, requestId]
      );

      // Log audit
      await logAuditEvent({
        action: "STOCK_COUNT_ADJUSTMENT_REQUEST_APPROVED",
        performedById: adminId,
        performedByUsername: adminUsername || "Unknown",
        entityType: "stock_count_adjustment_request",
        entityId: requestId,
        metadata: { reference: request.reference, product_id: request.product_id },
      });

      res.status(200).json({ message: "Request approved." });
    } else if (type === "stock-count-market") {
      // Approve market-based stock count request
      const [rows] = await pool.execute<any[]>(
        "SELECT * FROM market_based_adjustment_requests WHERE id = ? AND status = 'PENDING_APPROVAL'",
        [requestId]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "Request not found or already processed." });
        return;
      }

      const request = rows[0];

      // Update inventory
      await pool.execute(
        "UPDATE products SET quantity = quantity WHERE id = ?",
        [request.product_id]
      );

      // Create inventory log
      await pool.execute(
        `INSERT INTO inventory_logs (product_id, quantity, transaction_type, action, reference, user_id)
         VALUES (?, ?, 'Adjustment', 'Market-Based Adjustment Approved', ?, ?)`,
        [request.product_id, request.physical_quantity, request.reference, adminId]
      );

      // Update request status
      await pool.execute(
        "UPDATE market_based_adjustment_requests SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?",
        [adminId, requestId]
      );

      // Log audit
      await logAuditEvent({
        action: "MARKET_BASED_ADJUSTMENT_REQUEST_APPROVED",
        performedById: adminId,
        performedByUsername: adminUsername || "Unknown",
        entityType: "market_based_adjustment_request",
        entityId: requestId,
        metadata: { reference: request.reference, product_id: request.product_id },
      });

      res.status(200).json({ message: "Request approved." });
    } else if (type === "void") {
      res.status(501).json({ message: "Void approval not yet implemented in unified endpoint." });
    } else if (type === "return") {
      await pool.execute(
        "UPDATE returns SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?",
        [adminId, requestId]
      );

      await logAuditEvent({
        action: "RETURN_APPROVED",
        performedById: adminId,
        performedByUsername: adminUsername || "Unknown",
        entityType: "return",
        entityId: requestId,
      });

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

      res.status(200).json({ message: "Request rejected." });
    } else if (type === "void") {
      res.status(501).json({ message: "Void rejection not yet implemented in unified endpoint." });
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
