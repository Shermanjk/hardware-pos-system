/**
 * Real-Time Discount Cancellation & Synchronization Integration Test
 *
 * Tests:
 * 1. Cashier creates discount request -> Admin terminals receive WS "discount_request"
 * 2. Cashier cancels discount request -> Server updates DB to "cancelled" -> Admin terminals receive WS "discount_cancelled" without browser refresh
 * 3. Multiple requests isolation -> Cancelling one leaves other pending requests intact
 * 4. Race condition handling -> Server prevents invalid state transition when cancel and approve compete
 * 5. Reconnection & DB synchronization -> Disconnected admin resyncs authoritative state on reconnect
 * 6. Multi-Admin terminal synchronization -> All connected admin sockets receive real-time cancellation
 * 7. Audit log verification -> Cancellation audit event is properly logged
 */

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import { WebSocket } from "ws";
import { pool } from "../server/db.js";
import discountApprovalsRoutes from "../server/routes/discountApprovals.js";
import discountsRoutes from "../server/routes/discounts.js";
import { initWebSocket } from "../server/ws.js";

const TEST_PORT = 3988;
const JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

interface WSMessage {
  type: string;
  [key: string]: any;
}

function waitForWSMessage(ws: WebSocket, predicate: (msg: WSMessage) => boolean, timeoutMs = 5000): Promise<WSMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for WebSocket message`));
    }, timeoutMs);

    function onMsg(raw: Buffer | string) {
      try {
        const parsed = JSON.parse(raw.toString());
        if (predicate(parsed)) {
          clearTimeout(timer);
          ws.off("message", onMsg);
          resolve(parsed);
        }
      } catch {
        // ignore non-json
      }
    }

    ws.on("message", onMsg);
  });
}

async function runRealTimeTests() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("REAL-TIME DISCOUNT CANCELLATION & SYNCHRONIZATION TEST SUITE");
  console.log("══════════════════════════════════════════════════════════════\n");

  // ── 1. Setup Test Server ────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use("/api/discounts", discountsRoutes);
  app.use("/api/discount-approvals", discountApprovalsRoutes);

  const server = createServer(app);
  initWebSocket(server);

  await new Promise<void>((res) => server.listen(TEST_PORT, res));
  console.log(`✓ Test HTTP & WebSocket server listening on port ${TEST_PORT}`);

  try {
    // ── 2. Query / Setup DB Test Users & Discount ──────────────────────────────
    const [adminUsers] = await pool.execute<any[]>(
      `SELECT id, username, full_name, role FROM users WHERE role = 'Admin' AND status = 'Active' LIMIT 1`
    );
    const [cashierUsers] = await pool.execute<any[]>(
      `SELECT id, username, full_name, role FROM users WHERE role = 'Cashier' AND status = 'Active' LIMIT 1`
    );

    if (!adminUsers.length || !cashierUsers.length) {
      throw new Error("Missing active Admin or Cashier user in database for testing");
    }

    const admin = adminUsers[0];
    const cashier = cashierUsers[0];

    // Ensure an active discount with requires_admin_approval = 1 exists
    const [discountRows] = await pool.execute<any[]>(
      `SELECT id, discount_name, value FROM discounts WHERE requires_admin_approval = 1 AND status = 'Active' LIMIT 1`
    );

    let testDiscountId: number;
    let testDiscountName: string;

    if (discountRows.length > 0) {
      testDiscountId = discountRows[0].id;
      testDiscountName = discountRows[0].discount_name;
    } else {
      const [ins] = await pool.execute<any>(
        `INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, status)
         VALUES ('Test Special Discount', 'Percentage', 15.00, 1, 'Active')`
      );
      testDiscountId = ins.insertId;
      testDiscountName = "Test Special Discount";
    }

    // Clean up any stale pending requests for this discount and cashier to ensure clean test state
    await pool.execute(
      `UPDATE discount_requests SET status = 'cancelled' WHERE discount_id = ? AND cashier_id = ? AND status = 'pending'`,
      [testDiscountId, cashier.id]
    );

    // Create JWT tokens
    const adminToken = jwt.sign(
      { id: admin.id, username: admin.username, full_name: admin.full_name, role: admin.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const cashierToken = jwt.sign(
      { id: cashier.id, username: cashier.username, full_name: cashier.full_name, role: cashier.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ── 3. Connect WebSocket Terminals ─────────────────────────────────────────
    console.log("\nConnecting test WebSocket terminals (2 Admins, 1 Cashier)...");
    const adminWs1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws?token=${adminToken}`);
    const adminWs2 = new WebSocket(`ws://localhost:${TEST_PORT}/ws?token=${adminToken}`);
    const cashierWs = new WebSocket(`ws://localhost:${TEST_PORT}/ws?token=${cashierToken}`);

    await Promise.all([
      new Promise((res) => adminWs1.on("open", res)),
      new Promise((res) => adminWs2.on("open", res)),
      new Promise((res) => cashierWs.on("open", res)),
    ]);
    console.log("✓ All 3 terminals connected to WebSocket successfully.");

    // Helper for fetch calls
    const authHeaders = (token: string) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    });

    // ── TEST 1: Normal Request Creation Flow ───────────────────────────────────
    console.log("\n── TEST 1: Cashier creates discount request -> Admins receive real-time notification");
    let req1Id: number;
    {
      const admin1Promise = waitForWSMessage(adminWs1, (m) => m.type === "discount_request");
      const admin2Promise = waitForWSMessage(adminWs2, (m) => m.type === "discount_request");

      const res = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        method: "POST",
        headers: authHeaders(cashierToken),
        body: JSON.stringify({
          discount_id: testDiscountId,
          requested_percentage: 15,
          discount_amount: 150.0,
          reason: "Real-time sync test creation",
        }),
      });

      assert(res.status === 201, "POST /api/discount-approvals returns 201 Created");
      const body = await res.json();
      req1Id = body.id;
      assert(Number.isInteger(req1Id) && req1Id > 0, `Generated request ID is valid (#${req1Id})`);

      const [admin1Msg, admin2Msg] = await Promise.all([admin1Promise, admin2Promise]);
      assert(admin1Msg.type === "discount_request" && admin1Msg.request_id === req1Id, "Admin Terminal 1 received discount_request WS event");
      assert(admin2Msg.type === "discount_request" && admin2Msg.request_id === req1Id, "Admin Terminal 2 received discount_request WS event");

      // Verify Admin GET returns the pending request
      const listRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        headers: authHeaders(adminToken),
      });
      const list = await listRes.json();
      const found = list.find((r: any) => r.id === req1Id);
      assert(found && found.status === "pending", "Request is present in Admin pending list");
    }

    // ── TEST 2: Cashier Cancels Request -> Real-Time Removal on Admins ──────────
    console.log("\n── TEST 2: Cashier cancels request -> Admins receive discount_cancelled and request disappears without refresh");
    {
      const admin1CancelPromise = waitForWSMessage(adminWs1, (m) => m.type === "discount_cancelled" && m.request_id === req1Id);
      const admin2CancelPromise = waitForWSMessage(adminWs2, (m) => m.type === "discount_cancelled" && m.request_id === req1Id);

      const cancelRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${req1Id}`, {
        method: "DELETE",
        headers: authHeaders(cashierToken),
      });

      assert(cancelRes.status === 200, "DELETE /api/discount-approvals/:id returns 200 OK");

      const [admin1CancelMsg, admin2CancelMsg] = await Promise.all([admin1CancelPromise, admin2CancelPromise]);
      assert(admin1CancelMsg.type === "discount_cancelled", "Admin Terminal 1 received discount_cancelled WS event");
      assert(admin2CancelMsg.type === "discount_cancelled", "Admin Terminal 2 received discount_cancelled WS event");
      assert(admin1CancelMsg.request_id === req1Id, `Event payload contains correct request_id (#${req1Id})`);
      assert(Boolean(admin1CancelMsg.cashier_name), `Event payload contains cashier_name (${admin1CancelMsg.cashier_name})`);

      // Verify Database state
      const [dbRows] = await pool.execute<any[]>(`SELECT status FROM discount_requests WHERE id = ?`, [req1Id]);
      assert(dbRows[0]?.status === "cancelled", "Database status is authoritatively 'cancelled'");

      // Verify Admin pending list excludes the cancelled request
      const listRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        headers: authHeaders(adminToken),
      });
      const list = await listRes.json();
      const found = list.find((r: any) => r.id === req1Id);
      assert(!found, "Cancelled request is omitted from Admin pending list");
    }

    // ── TEST 3: Multiple Requests Isolation ─────────────────────────────────────
    console.log("\n── TEST 3: Multiple requests -> Cancelling one leaves others intact");
    let reqA_id: number;
    let reqB_id: number;
    {
      // Create request A
      const resA = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        method: "POST",
        headers: authHeaders(cashierToken),
        body: JSON.stringify({
          discount_id: testDiscountId,
          requested_percentage: 10,
          discount_amount: 100.0,
          reason: "Request A for isolation test",
        }),
      });
      reqA_id = (await resA.json()).id;

      // Create a second active discount for request B to test multiple pending
      const [insD2] = await pool.execute<any>(
        `INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, status)
         VALUES ('Secondary Test Discount', 'Percentage', 20.00, 1, 'Active')`
      );
      const discount2Id = insD2.insertId;

      const resB = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        method: "POST",
        headers: authHeaders(cashierToken),
        body: JSON.stringify({
          discount_id: discount2Id,
          requested_percentage: 20,
          discount_amount: 200.0,
          reason: "Request B for isolation test",
        }),
      });
      reqB_id = (await resB.json()).id;

      assert(reqA_id > 0 && reqB_id > 0, `Created Request A (#${reqA_id}) and Request B (#${reqB_id})`);

      // Now Cashier cancels Request A only
      const cancelPromise = waitForWSMessage(adminWs1, (m) => m.type === "discount_cancelled" && m.request_id === reqA_id);
      await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${reqA_id}`, {
        method: "DELETE",
        headers: authHeaders(cashierToken),
      });
      const cancelMsg = await cancelPromise;
      assert(cancelMsg.request_id === reqA_id, `Cancellation event received specifically for Request A (#${reqA_id})`);

      // Verify list: Request A is gone, Request B remains pending
      const listRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        headers: authHeaders(adminToken),
      });
      const list = await listRes.json();
      assert(!list.some((r: any) => r.id === reqA_id), "Request A is removed from pending list");
      assert(list.some((r: any) => r.id === reqB_id), "Request B is still pending in Admin list");

      // Clean up Request B
      await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${reqB_id}`, {
        method: "DELETE",
        headers: authHeaders(cashierToken),
      });
    }

    // ── TEST 4: Race Conditions Protection (Approve vs Cancel) ───────────────────
    console.log("\n── TEST 4: Concurrency & Race Conditions Protection");
    {
      // Case 4A: Admin approves -> Cashier tries to cancel
      const res4A = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        method: "POST",
        headers: authHeaders(cashierToken),
        body: JSON.stringify({
          discount_id: testDiscountId,
          requested_percentage: 15,
          discount_amount: 150.0,
          reason: "Race test 4A",
        }),
      });
      const req4A_id = (await res4A.json()).id;

      // Admin approves
      const approveRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${req4A_id}/approve`, {
        method: "PATCH",
        headers: authHeaders(adminToken),
      });
      assert(approveRes.status === 200, "Admin approves Request 4A (status: approved)");

      // Cashier subsequently attempts to cancel
      const cancelAttemptRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${req4A_id}`, {
        method: "DELETE",
        headers: authHeaders(cashierToken),
      });
      assert(cancelAttemptRes.status === 422, "Server rejects cancel on approved request with 422 Unprocessable Entity");

      const [db4A] = await pool.execute<any[]>(`SELECT status FROM discount_requests WHERE id = ?`, [req4A_id]);
      assert(db4A[0]?.status === "approved", "Authoritative DB state remains 'approved' and was not overwritten");

      // Case 4B: Cashier cancels -> Admin tries to approve
      const res4B = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        method: "POST",
        headers: authHeaders(cashierToken),
        body: JSON.stringify({
          discount_id: testDiscountId,
          requested_percentage: 15,
          discount_amount: 150.0,
          reason: "Race test 4B",
        }),
      });
      const req4B_id = (await res4B.json()).id;

      // Cashier cancels
      const cancel4BRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${req4B_id}`, {
        method: "DELETE",
        headers: authHeaders(cashierToken),
      });
      assert(cancel4BRes.status === 200, "Cashier cancels Request 4B (status: cancelled)");

      // Admin subsequently attempts to approve
      const approveAttemptRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${req4B_id}/approve`, {
        method: "PATCH",
        headers: authHeaders(adminToken),
      });
      assert(approveAttemptRes.status === 422, "Server rejects approve on cancelled request with 422 Unprocessable Entity");

      const [db4B] = await pool.execute<any[]>(`SELECT status FROM discount_requests WHERE id = ?`, [req4B_id]);
      assert(db4B[0]?.status === "cancelled", "Authoritative DB state remains 'cancelled' and was not overwritten");
    }

    // ── TEST 5: Reconnection & DB State Resynchronization ─────────────────────────
    console.log("\n── TEST 5: Disconnected Admin reconnects and synchronizes authoritative state");
    {
      // Create and cancel a request while Admin 3 is offline
      const res5 = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        method: "POST",
        headers: authHeaders(cashierToken),
        body: JSON.stringify({
          discount_id: testDiscountId,
          requested_percentage: 15,
          discount_amount: 150.0,
          reason: "Offline gap test",
        }),
      });
      const req5_id = (await res5.json()).id;

      await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals/${req5_id}`, {
        method: "DELETE",
        headers: authHeaders(cashierToken),
      });

      // Now Admin 3 connects
      const adminWs3 = new WebSocket(`ws://localhost:${TEST_PORT}/ws?token=${adminToken}`);
      await new Promise((res) => adminWs3.on("open", res));

      // Synchronize with server DB
      const listRes = await fetch(`http://localhost:${TEST_PORT}/api/discount-approvals`, {
        headers: authHeaders(adminToken),
      });
      const list = await listRes.json();
      assert(!list.some((r: any) => r.id === req5_id), "Reconnected Admin terminal does NOT see the request cancelled during disconnect");

      adminWs3.close();
    }

    // ── TEST 6: Audit Logging Verification ─────────────────────────────────────────
    console.log("\n── TEST 6: Audit Log records DISCOUNT_REQUEST_CANCELLED with metadata");
    {
      const [auditRows] = await pool.execute<any[]>(
        `SELECT action, performed_by_username, entity_type, entity_id
         FROM audit_logs
         WHERE action = 'DISCOUNT_REQUEST_CANCELLED' AND entity_id = ?
         ORDER BY id DESC LIMIT 1`,
        [req1Id]
      );
      assert(auditRows.length > 0, "Audit log record exists for DISCOUNT_REQUEST_CANCELLED");
      assert(auditRows[0]?.entity_id === req1Id, `Audit log matches request ID #${req1Id}`);
      assert(auditRows[0]?.performed_by_username === cashier.username, `Audit log recorded cashier (${cashier.username}) as actor`);
    }

    // Close sockets
    adminWs1.close();
    adminWs2.close();
    cashierWs.close();

  } finally {
    await new Promise<void>((res) => server.close(() => res()));
    console.log("\n✓ Test server closed.");
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("══════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRealTimeTests().catch((err) => {
  console.error("Test execution failed with unhandled error:", err);
  process.exit(1);
});
