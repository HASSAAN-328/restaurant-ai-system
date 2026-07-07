-- ============================================================
-- AI Restaurant — PostgreSQL schema (works on Neon, Supabase,
-- or any Postgres). Safe to run more than once.
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  price          INTEGER NOT NULL CHECK (price >= 0),
  is_available   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS inventory (
  id               SERIAL PRIMARY KEY,
  ingredient_name  TEXT NOT NULL,
  quantity         NUMERIC NOT NULL DEFAULT 0,
  threshold        NUMERIC NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_id  INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  amount        NUMERIC NOT NULL,
  PRIMARY KEY (menu_item_id, inventory_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  customer_name  TEXT NOT NULL DEFAULT 'Guest',
  status         TEXT NOT NULL DEFAULT 'Preparing',
  subtotal       NUMERIC NOT NULL,
  tax            NUMERIC NOT NULL,
  total          NUMERIC NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  INTEGER,
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL,
  quantity      INTEGER NOT NULL
);

-- Indexes that matter once traffic grows: fast menu look-ups,
-- fast "find my order", fast low-stock scans.
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON inventory(quantity, threshold);
