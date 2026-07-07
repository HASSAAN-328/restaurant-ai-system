// Database layer — PostgreSQL (works with Neon, Supabase, Railway, or
// any standard Postgres connection string).
//
// Security note: every query below uses the `sql` tagged template from
// @neondatabase/serverless. Values are NEVER glued into the query text —
// they are sent to Postgres as separate parameters. This is what stops
// SQL-injection attacks; it is not optional, and every new query you add
// should follow the same `sql\`... ${value} ...\`` pattern.
//
// Why @neondatabase/serverless instead of a normal connection pool: on
// Vercel your server code runs as short-lived serverless functions, and
// a traditional pool can exhaust the database's connection limit under
// heavy traffic. This driver talks to Neon over HTTP, so every request
// is independent and safely scales to a large number of concurrent
// visitors.
const { neon } = require("@neondatabase/serverless");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to backend/.env locally, or to your " +
      "Vercel project's Environment Variables when deploying."
  );
}

const sql = neon(process.env.DATABASE_URL);

// ---- Menu ----

async function getMenu() {
  return sql`
    SELECT id, name, category, price, is_available
    FROM menu_items
    ORDER BY category ASC, name ASC
  `;
}

// ---- Inventory ----

async function getInventory() {
  return sql`
    SELECT id, ingredient_name, quantity, threshold, unit
    FROM inventory
    ORDER BY ingredient_name ASC
  `;
}

async function updateInventoryQuantity(id, quantity) {
  const rows = await sql`
    UPDATE inventory
    SET quantity = ${quantity}
    WHERE id = ${id}
    RETURNING id, ingredient_name, quantity, threshold, unit
  `;
  return rows[0] || null;
}

// items: [{ id, quantity }] — the menu items that were just sold.
// Deducts the linked ingredients and returns any rows that are now
// at or below their restock threshold (used for the "staff alert").
async function deductInventoryForOrderItems(items) {
  for (const item of items) {
    await sql`
      UPDATE inventory i
      SET quantity = i.quantity - (mii.amount * ${item.quantity})
      FROM menu_item_ingredients mii
      WHERE mii.inventory_id = i.id
        AND mii.menu_item_id = ${item.id}
    `;
  }
  return sql`
    SELECT id, ingredient_name, quantity, threshold, unit
    FROM inventory
    WHERE quantity <= threshold
  `;
}

// ---- Orders ----

async function createOrder({ customerName, items, subtotal, tax, total }) {
  const [order] = await sql`
    INSERT INTO orders (customer_name, status, subtotal, tax, total)
    VALUES (${customerName || "Guest"}, 'Preparing', ${subtotal}, ${tax}, ${total})
    RETURNING id, customer_name, status, subtotal, tax, total, created_at
  `;

  for (const item of items) {
    await sql`
      INSERT INTO order_items (order_id, menu_item_id, name, price, quantity)
      VALUES (${order.id}, ${item.id}, ${item.name}, ${item.price}, ${item.quantity})
    `;
  }

  return { ...order, items };
}

async function getOrderById(id) {
  const orders = await sql`
    SELECT id, customer_name, status, subtotal, tax, total, created_at
    FROM orders
    WHERE id = ${id}
  `;
  if (orders.length === 0) return null;

  const items = await sql`
    SELECT menu_item_id AS id, name, price, quantity
    FROM order_items
    WHERE order_id = ${id}
  `;

  return { ...orders[0], items };
}

async function updateOrderStatus(id, status) {
  const rows = await sql`
    UPDATE orders
    SET status = ${status}
    WHERE id = ${id}
    RETURNING id, status
  `;
  return rows[0] || null;
}

module.exports = {
  getMenu,
  getInventory,
  updateInventoryQuantity,
  deductInventoryForOrderItems,
  createOrder,
  getOrderById,
  updateOrderStatus,
};
