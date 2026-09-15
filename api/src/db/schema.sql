CREATE TABLE IF NOT EXISTS inventory_items (
  trgid TEXT PRIMARY KEY,

  has_putaway BOOLEAN NOT NULL DEFAULT FALSE,
  upc TEXT,
  title TEXT,
  program_name TEXT,
  master_program_name TEXT,
  category_name TEXT,
  manufacturer TEXT,
  location_not_listable BOOLEAN,
  product_status TEXT,
  mr_lmr_upc_average_category_retail NUMERIC,
  upc_retail NUMERIC,
  classification_physical_condition TEXT,
  classification_condition TEXT,
  classification_technical_functionality TEXT,
  pallet_location_id TEXT,
  rtv_type TEXT,
  tag_not_listed_reason TEXT,
  tag_venue_exclusivity TEXT,
  serialized TEXT,
  first_stored_on_listable_location_on DATE,
  facility TEXT,

  has_sold_upload BOOLEAN NOT NULL DEFAULT FALSE,
  program_name_sold TEXT,
  master_program_name_sold TEXT,
  category_name_sold TEXT,
  manufacturer_sold TEXT,
  classification_physical_condition_sold TEXT,
  classification_condition_sold TEXT,
  rtv_type_sold TEXT,
  order_number TEXT,
  sale_price NUMERIC,
  retail_price_on_sale_date NUMERIC,
  mr_lmr_upc_average_category_retail_sold NUMERIC,
  upc_retail_sold NUMERIC,
  order_type_sold_on TEXT,
  marketplace_sold_on TEXT,
  order_customer_name TEXT,
  order_customer_company_name TEXT,
  marketplace_po_number TEXT,
  sorting_index TEXT,
  location_id TEXT,
  order_created_date DATE,
  facility_sold TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_putaway_date
  ON inventory_items (first_stored_on_listable_location_on)
  WHERE has_putaway;

CREATE INDEX IF NOT EXISTS idx_items_sold_date
  ON inventory_items (order_created_date)
  WHERE sale_price IS NOT NULL AND sale_price > 0;

CREATE INDEX IF NOT EXISTS idx_items_facility
  ON inventory_items (facility);

CREATE INDEX IF NOT EXISTS idx_items_facility_sold
  ON inventory_items (facility_sold);

CREATE INDEX IF NOT EXISTS idx_items_master
  ON inventory_items (master_program_name);

CREATE INDEX IF NOT EXISTS idx_items_master_sold
  ON inventory_items (master_program_name_sold);

CREATE INDEX IF NOT EXISTS idx_items_program
  ON inventory_items (program_name);

CREATE INDEX IF NOT EXISTS idx_items_category
  ON inventory_items (category_name);

CREATE TABLE IF NOT EXISTS upload_history (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  upload_type TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_history_uploaded_at
  ON upload_history (uploaded_at DESC);

CREATE TABLE IF NOT EXISTS upload_jobs (
  id UUID PRIMARY KEY,
  upload_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  error TEXT,
  row_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION listable_retail(a NUMERIC, b NUMERIC) RETURNS NUMERIC
LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(a, 0) > 0 AND COALESCE(b, 0) > 0 THEN LEAST(a, b)
    WHEN COALESCE(a, 0) > 0 THEN a
    WHEN COALESCE(b, 0) > 0 THEN b
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION sold_retail_basis(
  sale_retail NUMERIC,
  mr NUMERIC,
  upc NUMERIC
) RETURNS NUMERIC
LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(sale_retail, 0) > 0 THEN sale_retail
    ELSE listable_retail(mr, upc)
  END
$$;

CREATE OR REPLACE FUNCTION is_rtv(rtv TEXT) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
  SELECT lower(btrim(COALESCE(rtv, ''))) IN (
    'research',
    'return to stock',
    'rtv',
    'rtv approved',
    'rtv destroy'
  )
$$;

CREATE OR REPLACE FUNCTION is_non_rtv(rtv TEXT) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
  SELECT lower(btrim(COALESCE(rtv, ''))) IN (
    '',
    'non rtv',
    'non-rtv',
    'rtv liquidate'
  )
$$;

CREATE OR REPLACE FUNCTION display_master(name TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN name IN (
      'Walmart Computer Parts (Finished)',
      'Walmart Computers Parts (Finished)',
      'Walmart Finished Goods Wide Sku (Finished)',
      'Walmart Headphones & Speakers (Not Apple) (Finished)',
      'Walmart Monitors (Finished)'
    ) THEN 'Walmart Inspect and Sell (Finished)'
    ELSE name
  END
$$;
