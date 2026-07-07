const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/inventory - staff/admin view of stock levels
router.get("/", async (req, res, next) => {
  try {
    res.json(await db.getInventory());
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/:id  body: { quantity }
router.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quantity = Number(req.body?.quantity);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid ingredient id." });
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      return res.status(400).json({ error: "Invalid quantity." });
    }

    const row = await db.updateInventoryQuantity(id, quantity);
    if (!row) return res.status(404).json({ error: "Ingredient not found." });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
