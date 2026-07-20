import { PoolConnection } from "mysql2/promise";

export interface ReturnItemPayload {
  sale_item_id: number;
  product_id: number;
  quantity_returned: number;
  unit_price: number;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; message: string; status: number };

export async function validateReturnItems(
  conn: PoolConnection,
  saleId: number,
  items: ReturnItemPayload[],
  currentDate: Date
): Promise<ValidationResult> {
  // 1. Check sale exists and get created_at
  const [saleRows] = await conn.execute<any[]>(
    `SELECT id, created_at FROM sales WHERE id = ?`,
    [saleId]
  );
  if (!saleRows[0]) {
    return { valid: false, message: "Invoice not found.", status: 404 };
  }

  // 2. Return window check (7 calendar days)
  const saleDate = new Date(saleRows[0].created_at);
  const expiryDate = new Date(saleDate);
  expiryDate.setDate(expiryDate.getDate() + 7);
  if (currentDate > expiryDate) {
    const expStr = expiryDate.toLocaleDateString("en-PH");
    return {
      valid: false,
      message: `Return window has expired. Expiry: ${expStr}.`,
      status: 422,
    };
  }

  // 3. Validate each item
  for (const item of items) {
    // Check sale_item belongs to this sale
    const [siRows] = await conn.execute<any[]>(
      `SELECT si.id, si.quantity, p.name, p.is_returnable
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.id = ? AND si.sale_id = ?`,
      [item.sale_item_id, saleId]
    );
    const si = siRows[0];
    if (!si) {
      return {
        valid: false,
        message: `Item ID ${item.sale_item_id} does not belong to this invoice.`,
        status: 422,
      };
    }

    // Check is_returnable
    if (!si.is_returnable) {
      return {
        valid: false,
        message: `This product is not eligible for return: ${si.name}.`,
        status: 422,
      };
    }

    // Check for duplicate in-progress return
    const [dupRows] = await conn.execute<any[]>(
      `SELECT ri.id FROM return_items ri
       JOIN returns r ON ri.return_id = r.id
       WHERE ri.sale_item_id = ? AND r.status IN ('pending', 'approved')`,
      [item.sale_item_id]
    );
    if (dupRows.length > 0) {
      return {
        valid: false,
        message: `A return for this item is already in progress: ${si.name}.`,
        status: 409,
      };
    }

    // Check quantity
    const [retRows] = await conn.execute<any[]>(
      `SELECT COALESCE(SUM(ri.quantity_returned), 0) AS already_returned
       FROM return_items ri
       JOIN returns r ON ri.return_id = r.id
       WHERE ri.sale_item_id = ? AND r.status NOT IN ('rejected')`,
      [item.sale_item_id]
    );
    const alreadyReturned: number = Number(retRows[0]?.already_returned ?? 0);
    const remainingReturnable = si.quantity - alreadyReturned;

    if (item.quantity_returned < 1 || item.quantity_returned > remainingReturnable) {
      return {
        valid: false,
        message: `Return quantity exceeds the eligible quantity for: ${si.name}.`,
        status: 422,
      };
    }
  }

  return { valid: true };
}
