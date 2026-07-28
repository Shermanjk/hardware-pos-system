CREATE TABLE IF NOT EXISTS inventory_logs (
  id                  INT             NOT NULL AUTO_INCREMENT,
  product_id          INT             NOT NULL,
  transaction_type    VARCHAR(50)     NOT NULL,
  action              VARCHAR(50)     NULL,
  quantity_change     DECIMAL(12,3)   NULL,
  quantity            DECIMAL(12,3)   NULL,
  remaining_stock     DECIMAL(12,3)   NULL,
  reference           VARCHAR(50)     NULL,
  user_id             INT             NULL,
  commodity_purchase_id INT            NULL COMMENT "FK to commodity_purchases.id",
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_il_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_il_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_il_commodity_purchase FOREIGN KEY (commodity_purchase_id) REFERENCES commodity_purchases(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
