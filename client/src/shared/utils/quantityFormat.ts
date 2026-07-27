/**
 * Format quantity for display based on quantity_type
 * - WHOLE_UNIT: Display as whole number (e.g., "37 pcs")
 * - WEIGHTED: Display with decimals (e.g., "37.500 kg")
 */

export type QuantityType = "WHOLE_UNIT" | "WEIGHTED";

export function formatQuantity(
  quantity: number,
  unit?: string,
  quantityType: QuantityType = "WHOLE_UNIT"
): string {
  if (quantityType === "WEIGHTED") {
    // Display with up to 3 decimal places for weighted items
    const formatted = quantity.toFixed(3).replace(/\.?0+$/, "");
    return unit ? `${formatted} ${unit}` : formatted;
  } else {
    // Display as whole number for whole-unit items
    const formatted = Math.round(quantity).toString();
    return unit ? `${formatted} ${unit}` : formatted;
  }
}

export function formatQuantityForTable(
  quantity: number,
  unit?: string,
  quantityType: QuantityType = "WHOLE_UNIT"
): string {
  if (quantityType === "WEIGHTED") {
    // Display with up to 3 decimal places for weighted items
    return quantity.toFixed(3);
  } else {
    // Display as whole number for whole-unit items
    return Math.round(quantity).toString();
  }
}

export function formatQuantityParts(
  quantity: number,
  unit?: string,
  quantityType: QuantityType = "WHOLE_UNIT"
): { number: string; unit: string } {
  if (quantityType === "WEIGHTED") {
    const formatted = quantity.toFixed(3).replace(/\.?0+$/, "");
    return { number: formatted, unit: unit || "" };
  } else {
    const formatted = Math.round(quantity).toString();
    return { number: formatted, unit: unit || "" };
  }
}
