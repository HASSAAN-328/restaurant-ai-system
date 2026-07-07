// One-time setup script: creates tables (if missing) and seeds
// starter menu/inventory data (only if the tables are empty).
//
// Run with:  npm run setup-db
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

if (!process.env.DATABASE_URL) {
  console.error(
    "\nERROR: DATABASE_URL is not set.\n" +
      "Create a file called .env inside the backend folder and add a line like:\n" +
      "DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require\n"
  );
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const CATEGORIES_ORDER = ["Pizza", "Karahi", "Fast Food", "Rice & Lentils", "Sides", "Drinks", "Desserts"];

const MENU_ITEMS = [
  { name: "Chicken Pizza (Large)", category: "Pizza", price: 1400, is_available: true },
  { name: "Chicken Karahi (Full)", category: "Karahi", price: 1800, is_available: true },
  { name: "Chicken Shawarma", category: "Fast Food", price: 350, is_available: true },
  { name: "Zinger Burger", category: "Fast Food", price: 650, is_available: true },
  { name: "Chicken Biryani", category: "Rice & Lentils", price: 450, is_available: false },
  { name: "Dal Chawal", category: "Rice & Lentils", price: 300, is_available: true },
  { name: "Naan", category: "Sides", price: 40, is_available: true },
  { name: "Garlic Bread", category: "Sides", price: 250, is_available: true },
  { name: "Fries", category: "Sides", price: 250, is_available: true },
  { name: "Raita", category: "Sides", price: 100, is_available: true },
  { name: "Coca-Cola", category: "Drinks", price: 120, is_available: true },
  { name: "Pepsi", category: "Drinks", price: 120, is_available: true },
  { name: "Chocolate Cake", category: "Desserts", price: 400, is_available: true },
];

const INVENTORY = [
  { ingredient_name: "Cheese", quantity: 50, threshold: 10, unit: "kg" },
  { ingredient_name: "Chicken", quantity: 60, threshold: 15, unit: "kg" },
  { ingredient_name: "Flour", quantity: 40, threshold: 10, unit: "kg" },
  { ingredient_name: "Tomatoes", quantity: 30, threshold: 8, unit: "kg" },
  { ingredient_name: "Coke Syrup", quantity: 20, threshold: 5, unit: "l" },
  { ingredient_name: "Cooking Oil", quantity: 25, threshold: 5, unit: "l" },
];

// menu item name -> [{ ingredient name, amount consumed per single unit sold }]
const RECIPE_LINKS = {
  "Chicken Pizza (Large)": [
    { ingredient: "Cheese", amount: 1 },
    { ingredient: "Flour", amount: 1 },
    { ingredient: "Chicken", amount: 0.5 },
  ],
  "Chicken Karahi (Full)": [
    { ingredient: "Chicken", amount: 1 },
    { ingredient: "Tomatoes", amount: 0.5 },
  ],
  "Coca-Cola": [{ ingredient: "Coke Syrup", amount: 0.3 }],
};

async function main() {
  console.log("Reading schema.sql ...");
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf-8");

  console.log("Creating tables (safe to re-run) ...");
  // neon() only sends one statement per call, so split on semicolons.
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await sql(statement);
  }

  const existing = await sql`SELECT COUNT(*)::int AS count FROM menu_items`;
  if (existing[0].count > 0) {
    console.log("Menu already has data — skipping seed. Setup complete.");
    return;
  }

  console.log("Seeding menu items ...");
  const nameToId = {};
  for (const item of MENU_ITEMS) {
    const [row] = await sql`
      INSERT INTO menu_items (name, category, price, is_available)
      VALUES (${item.name}, ${item.category}, ${item.price}, ${item.is_available})
      RETURNING id, name
    `;
    nameToId[row.name] = row.id;
  }

  console.log("Seeding inventory ...");
  const ingredientToId = {};
  for (const row of INVENTORY) {
    const [inserted] = await sql`
      INSERT INTO inventory (ingredient_name, quantity, threshold, unit)
      VALUES (${row.ingredient_name}, ${row.quantity}, ${row.threshold}, ${row.unit})
      RETURNING id, ingredient_name
    `;
    ingredientToId[inserted.ingredient_name] = inserted.id;
  }

  console.log("Linking recipes to inventory ...");
  for (const [itemName, links] of Object.entries(RECIPE_LINKS)) {
    const menuItemId = nameToId[itemName];
    for (const link of links) {
      const inventoryId = ingredientToId[link.ingredient];
      if (!menuItemId || !inventoryId) continue;
      await sql`
        INSERT INTO menu_item_ingredients (menu_item_id, inventory_id, amount)
        VALUES (${menuItemId}, ${inventoryId}, ${link.amount})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  console.log("\nAll done! Your database now has the full starter menu and inventory.");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
