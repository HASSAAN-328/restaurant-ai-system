const express = require("express");
const router = express.Router();
const db = require("../db");
const { buildInvoicePDF } = require("../invoice");

const TAX_RATE = 0.05; // 5% demo tax
const STAGES = ["Preparing", "Cooking", "Ready", "Out for Delivery", "Delivered"];
const MAX_ITEM_QUANTITY = 50;

// POST /api/orders  body: { customerName, items: [{id, quantity}] }
//
// Security note: we only trust `id` and `quantity` from the browser.
// The real price and name always come from the database, never from
// the request body. Otherwise someone could open dev tools and submit
// a fake price for a real item.
router.post("/", async (req, res, next) => {
  try {
    const { customerName, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty." });
    }
    if (items.length > 40) {
      return res.status(400).json({ error: "Too many different items in one order." });
    }
    if (customerName !== undefined && (typeof customerName !== "string" || customerName.length > 80)) {
      return res.status(400).json({ error: "Invalid customer name." });
    }

    const menu = await db.getMenu();
    const menuById = new Map(menu.map((m) => [m.id, m]));

    const safeItems = [];
    for (const raw of items) {
      const id = Number(raw?.id);
      const quantity = Number(raw?.quantity);
      const menuItem = menuById.get(id);

      if (!menuItem) {
        return res.status(400).json({ error: `Item not found on menu (id ${raw?.id}).` });
      }
      if (!menuItem.is_available) {
        return res.status(400).json({ error: `${menuItem.name} is currently unavailable.` });
      }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
        return res.status(400).json({ error: `Invalid quantity for ${menuItem.name}.` });
      }

      safeItems.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, quantity });
    }

    const subtotal = safeItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const tax = Math.round(subtotal * TAX_RATE);
    const total = subtotal + tax;

    const order = await db.createOrder({ customerName, items: safeItems, subtotal, tax, total });

    // Inventory Agent: deduct stock for linked ingredients, return low-stock alerts
    const lowStockRows = await db.deductInventoryForOrderItems(safeItems);
    const lowStockAlerts = lowStockRows.map(
      (l) => `${l.ingredient_name} is running low (${l.quantity} ${l.unit} left)`
    );

    res.json({
      orderId: order.id,
      status: order.status,
      subtotal,
      tax,
      total,
      lowStockAlerts,
      invoiceUrl: `/api/orders/${order.id}/invoice.pdf`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id - order tracking + bill
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid order id." });
    }
    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id/invoice.pdf - auto-generated branded PDF bill
router.get("/:id/invoice.pdf", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid order id." });
    }
    const order = await db.getOrderById(id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    const pdfBuffer = await buildInvoicePDF(order);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Dastarkhwan-Invoice-${order.id}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// PUT /api/orders/:id/status  body: { status }
router.put("/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid order id." });
    }
    if (typeof status !== "string" || !STAGES.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }
    const order = await db.updateOrderStatus(id, status);
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json({ orderId: order.id, status: order.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
