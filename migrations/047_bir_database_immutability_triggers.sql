-- Migration 047: BIR Database-Level Immutability and Anti-Tampering Triggers
-- Enforces hard delete prohibition and immutable sales records directly at MySQL engine level.

-- 1. Prevent Hard Deletes on sales table
DROP TRIGGER IF EXISTS trg_prevent_sales_delete;
CREATE TRIGGER trg_prevent_sales_delete
BEFORE DELETE ON sales
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'BIR Compliance Error: HARD DELETES are prohibited on the sales table. Use void workflow instead.';
END;

-- 2. Prevent Hard Deletes on sale_items table
DROP TRIGGER IF EXISTS trg_prevent_sale_items_delete;
CREATE TRIGGER trg_prevent_sale_items_delete
BEFORE DELETE ON sale_items
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'BIR Compliance Error: HARD DELETES are prohibited on the sale_items table.';
END;

-- 3. Prevent Backdoor Alterations to Financial Columns on Completed Sales
DROP TRIGGER IF EXISTS trg_protect_sales_financial_data;
CREATE TRIGGER trg_protect_sales_financial_data
BEFORE UPDATE ON sales
FOR EACH ROW
BEGIN
  -- Disallow modifying invoice number once generated
  IF (OLD.invoice_number IS NOT NULL AND NEW.invoice_number != OLD.invoice_number) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'BIR Compliance Error: invoice_number cannot be modified.';
  END IF;

  -- Disallow modifying financial amounts, discounts, VAT, or timestamp on completed sales
  IF (OLD.payment_status = 'completed' AND (
      NEW.subtotal != OLD.subtotal OR
      NEW.vat_amount != OLD.vat_amount OR
      NEW.total_amount != OLD.total_amount OR
      NEW.discount != OLD.discount OR
      NEW.created_at != OLD.created_at
  )) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'BIR Compliance Error: Alteration of recorded sales amounts or dates on finalized sales is strictly prohibited.';
  END IF;
END;
