-- Migration 038: End-of-Shift Cash Reconciliation
-- Creates the cash_sessions table to track shift open/close and reconciliation.

USE hardware_pos;

CREATE TABLE IF NOT EXISTS cash_sessions (
  id                INT AUTO_INCREMENT PRIMARY KEY,

  -- Who and when
  cashier_id        INT NOT NULL,
  shift_date        DATE NOT NULL,
  shift_label       VARCHAR(50) NOT NULL DEFAULT 'Day Shift',  -- 'Morning', 'Afternoon', 'Night', etc.

  -- Opening
  opened_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_cash      DECIMAL(12,2) NOT NULL DEFAULT 0.00,       -- opening float entered at shift start

  -- Closing (filled in when cashier submits End Shift)
  closed_at         DATETIME DEFAULT NULL,
  actual_cash       DECIMAL(12,2) DEFAULT NULL,                -- physically counted cash entered by cashier

  -- Calculated fields (set server-side at close time)
  cash_sales        DECIMAL(12,2) DEFAULT NULL,  -- sum of cash sales in this session
  cash_refunds      DECIMAL(12,2) DEFAULT NULL,  -- sum of cash refunds paid out
  cash_paid_out     DECIMAL(12,2) DEFAULT NULL,  -- petty cash disbursements (reserved, default 0)
  expected_cash     DECIMAL(12,2) DEFAULT NULL,  -- opening_cash + cash_sales - cash_refunds - cash_paid_out
  variance          DECIMAL(12,2) DEFAULT NULL,  -- actual_cash - expected_cash
  status            ENUM('Balanced','Short','Over') DEFAULT NULL,

  -- Review (admin)
  reviewed_by       INT DEFAULT NULL,
  reviewed_at       DATETIME DEFAULT NULL,
  review_notes      TEXT DEFAULT NULL,

  -- Session state
  session_status    ENUM('open','closed') NOT NULL DEFAULT 'open',

  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_cashier_date  (cashier_id, shift_date),
  INDEX idx_session_status (session_status),
  INDEX idx_shift_date     (shift_date),
  INDEX idx_status         (status),

  CONSTRAINT fk_cs_cashier  FOREIGN KEY (cashier_id)  REFERENCES users (id),
  CONSTRAINT fk_cs_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
