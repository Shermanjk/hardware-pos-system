// Re-exported from invoiceNumber.ts — both sequences now use the same
// concurrency-safe row-locking mechanism via the invoice_sequences table.
export { generateReturnNumber } from "./invoiceNumber.js";
