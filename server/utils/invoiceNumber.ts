import { PoolConnection } from "mysql2/promise";

/**
 * Generates the next invoice number using a concurrency-safe row-locked sequence.
 * Must be called inside an active transaction using the same connection.
 *
 * Format: {PREFIX}-{NNNNNN}  e.g. INV-000001
 *
 * Two simultaneous cashiers will NEVER receive the same number because
 * SELECT ... FOR UPDATE holds a row lock until the transaction commits.
 */
export async function generateInvoiceNumber(conn: PoolConnection): Promise<string> {
  // Lock the sequence row for this prefix
  const [rows] = await conn.execute<any[]>(
    `SELECT id, prefix, current_number FROM invoice_sequences WHERE prefix = 'INV' LIMIT 1 FOR UPDATE`
  );

  if (!rows[0]) {
    throw new Error("Invoice sequence row not found. Run migration 010.");
  }

  const next: number = (rows[0].current_number as number) + 1;
  const prefix: string = rows[0].prefix as string;

  await conn.execute(
    `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
    [next, rows[0].id]
  );

  return `${prefix}-${String(next).padStart(6, "0")}`;
}

/**
 * Generates the next return number using the same concurrency-safe mechanism.
 * Must be called inside an active transaction using the same connection.
 */
export async function generateReturnNumber(conn: PoolConnection): Promise<string> {
  const [rows] = await conn.execute<any[]>(
    `SELECT id, prefix, current_number FROM invoice_sequences WHERE prefix = 'RTN' LIMIT 1 FOR UPDATE`
  );

  if (!rows[0]) {
    throw new Error("Return sequence row not found. Run migration 010.");
  }

  const next: number = (rows[0].current_number as number) + 1;
  const prefix: string = rows[0].prefix as string;

  await conn.execute(
    `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
    [next, rows[0].id]
  );

  return `${prefix}-${String(next).padStart(6, "0")}`;
}
