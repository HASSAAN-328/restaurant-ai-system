const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/menu - full menu with availability flags, sorted by category
router.get("/", async (req, res, next) => {
  try {
    const items = await db.getMenu();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
