CREATE TABLE IF NOT EXISTS orders.flash_sale (
 id serial PRIMARY KEY,
 product_id integer NOT NULL REFERENCES menu.san_pham(ma_san_pham),
 title varchar(200) NOT NULL,
 sale_price numeric(12,2) NOT NULL CHECK (sale_price > 0),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS flash_sale_product_time_idx ON orders.flash_sale(product_id, starts_at, ends_at) WHERE enabled;
CREATE TABLE IF NOT EXISTS orders.product_ranking_config (
 id integer PRIMARY KEY CHECK(id=1),
 weights jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO orders.product_ranking_config(id,weights) VALUES (1,'{"purchases":1,"orders":0.7,"rating":2,"reviews":0.5,"favorites":2.5,"vouchers":0.8}') ON CONFLICT DO NOTHING;
