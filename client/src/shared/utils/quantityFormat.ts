/**
 * Format quantity for display based on unit properties
 * - allow_decimal = true: Display with decimals (e.g., "37.500 kg")
 * - allow_decimal = false: Display as whole number (e.g., "37 pcs")
 * Falls back to quantity_type for backward compatibility
 */

export type QuantityType = "WHOLE_UNIT" | "WEIGHTED";

export function formatQuantity(
  quantity: number | string,
  unit?: string,
  quantityType?: QuantityType,
  allowDecimal?: boolean
): string {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(qty)) {
    return unit ? `0 ${unit}` : "0";
  }
  
  // Prefer unit.allow_decimal, fall back to quantity_type
  const useDecimal = allowDecimal !== undefined ? allowDecimal : quantityType === "WEIGHTED";
  
  if (useDecimal) {
    // Display with up to 3 decimal places for decimal items
    const formatted = qty.toFixed(3).replace(/\.?0+$/, "");
    return unit ? `${formatted} ${unit}` : formatted;
  } else {
    // Display as whole number for whole-unit items
    const formatted = Math.round(qty).toString();
    return unit ? `${formatted} ${unit}` : formatted;
  }
}

export function formatQuantityForTable(
  quantity: number | string,
  unit?: string,
  quantityType?: QuantityType,
  allowDecimal?: boolean
): string {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(qty)) {
    return "0";
  }
  
  // Prefer unit.allow_decimal, fall back to quantity_type
  const useDecimal = allowDecimal !== undefined ? allowDecimal : quantityType === "WEIGHTED";
  
  if (useDecimal) {
    // Display with up to 3 decimal places for decimal items
    return qty.toFixed(3);
  } else {
    // Display as whole number for whole-unit items
    return Math.round(qty).toString();
  }
}

export function formatQuantityParts(
  quantity: number | string,
  unit?: string,
  quantityType?: QuantityType,
  allowDecimal?: boolean
): { number: string; unit: string } {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(qty)) {
    return { number: "0", unit: unit || "" };
  }
  
  // Prefer unit.allow_decimal, fall back to quantity_type
  const useDecimal = allowDecimal !== undefined ? allowDecimal : quantityType === "WEIGHTED";
  
  if (useDecimal) {
    const formatted = qty.toFixed(3).replace(/\.?0+$/, "");
    return { number: formatted, unit: unit || "" };
  } else {
    const formatted = Math.round(qty).toString();
    return { number: formatted, unit: unit || "" };
  }
}
