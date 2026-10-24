-- Group independently priced products under one scheduled program.
CREATE TABLE IF NOT EXISTS orders.flash_sale_campaign (
 id serial PRIMARY KEY,
 title varchar(200) NOT NULL,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ends_at > starts_at)
);
ALTER TABLE orders.flash_sale ADD COLUMN IF NOT EXISTS campaign_id integer REFERENCES orders.flash_sale_campaign(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS flash_sale_campaign_idx ON orders.flash_sale(campaign_id);
DO $$ DECLARE sale record; campaign integer;
BEGIN
 FOR sale IN SELECT * FROM orders.flash_sale WHERE campaign_id IS NULL LOOP
  INSERT INTO orders.flash_sale_campaign(title,starts_at,ends_at,enabled,created_at)
   VALUES(sale.title,sale.starts_at,sale.ends_at,sale.enabled,sale.created_at) RETURNING id INTO campaign;
  UPDATE orders.flash_sale SET campaign_id=campaign WHERE id=sale.id;
 END LOOP;
END $$;
