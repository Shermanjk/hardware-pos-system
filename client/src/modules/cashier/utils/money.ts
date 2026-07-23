/** Convert a peso float to integer centavos, avoiding float drift. */
export const toCentavos = (peso: number) => Math.round(peso * 100);

/** Format integer centavos to a display string like "1,234.56". */
export const fmtCents = (centavos: number) =>
  (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Parse a display string that may contain commas (e.g. "1,000.50")
 * into integer centavos. Returns 0 if blank/invalid.
 */
export const parseCashInput = (raw: string): number => {
  const cleaned = raw.replace(/,/g, "");
  const pesos = parseFloat(cleaned);
  return isNaN(pesos) ? 0 : Math.round(pesos * 100);
};

/**
 * Format a raw user input string to show thousand separators while the
 * user is still typing. Preserves a trailing decimal point and up to 2
 * decimal digits so the user can type "1000.5" naturally.
 */
export const formatCashDisplay = (raw: string): string => {
  if (!raw) return "";
  const stripped = raw.replace(/,/g, "");
  const [intPart, decPart] = stripped.split(".");
  const intFormatted = parseInt(intPart || "0", 10).toLocaleString("en-PH");
  if (decPart !== undefined) {
    return `${intFormatted}.${decPart.slice(0, 2)}`;
  }
  return intFormatted;
};
