/**
 * Format quantity for display based on quantity_type
 * - WHOLE_UNIT: Display as whole number (e.g., "37 pcs")
 * - WEIGHTED: Display with decimals (e.g., "37.500 kg")
 */

export type QuantityType = "WHOLE_UNIT" | "WEIGHTED";

export function formatQuantity(
  quantity: number | string,
  unit?: string,
  quantityType: QuantityType = "WHOLE_UNIT"
): string {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(qty)) {
    return unit ? `0 ${unit}` : "0";
  }
  
  if (quantityType === "WEIGHTED") {
    // Display with up to 3 decimal places for weighted items
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
  quantityType: QuantityType = "WHOLE_UNIT"
): string {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(qty)) {
    return "0";
  }
  
  if (quantityType === "WEIGHTED") {
    // Display with up to 3 decimal places for weighted items
    return qty.toFixed(3);
  } else {
    // Display as whole number for whole-unit items
    return Math.round(qty).toString();
  }
}

export function formatQuantityParts(
  quantity: number | string,
  unit?: string,
  quantityType: QuantityType = "WHOLE_UNIT"
): { number: string; unit: string } {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(qty)) {
    return { number: "0", unit: unit || "" };
  }
  
  if (quantityType === "WEIGHTED") {
    const formatted = qty.toFixed(3).replace(/\.?0+$/, "");
    return { number: formatted, unit: unit || "" };
  } else {
    const formatted = Math.round(qty).toString();
    return { number: formatted, unit: unit || "" };
  }
}
