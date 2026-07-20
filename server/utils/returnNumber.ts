import { PoolConnection } from "mysql2/promise";

/**
 * Generates the next return number for today in the format RTN-YYYYMMDD-XXXX.
 * Must be called inside an active transaction using the same connection.
 */
export async function generateReturnNumber(conn: PoolConnection): Promise<string> {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm   = String(today.getMonth() + 1).padStart(2, "0");
  const dd   = String(today.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;

  const [rows] = await conn.execute<any[]>(
    `SELECT COUNT(*) AS cnt FROM returns WHERE DATE(created_at) = CURDATE()`
  );
  const count: number = (rows[0]?.cnt ?? 0) + 1;
  const seq = String(count).padStart(4, "0");

  return `RTN-${dateStr}-${seq}`;
}
