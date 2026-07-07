require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");

const menuRoutes = require("./routes/menu");
const chatRoutes = require("./routes/chat");
const orderRoutes = require("./routes/orders");
const inventoryRoutes = require("./routes/inventory");

const app = express();

// Vercel/Neon sit behind a proxy — this makes rate-limiting and logging
// see the visitor's real IP instead of the proxy's IP.
app.set("trust proxy", 1);

// ---- Security & performance middleware ----
// helmet: sets a batch of protective HTTP headers (stops clickjacking,
// MIME-sniffing, etc). CSP is relaxed slightly so Google Fonts still load.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(compression()); // gzip responses — faster pages under heavy load

// CORS: by default only the site itself may call the API. Set
// ALLOWED_ORIGIN in your .env / Vercel settings if the frontend is
// ever hosted on a different domain than the backend.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

app.use(express.json({ limit: "10kb" })); // blocks oversized/malicious payloads

// Rate limiting: caps how many requests one visitor can make, so a
// single bot or attacker can't hammer the server or the database.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // requests per IP per window across the whole API
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again shortly." },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // chat messages / orders placed per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You're going a bit fast — please wait a moment and try again." },
});
app.use("/api", apiLimiter);
app.use("/api/chat", writeLimiter);
app.use("/api/orders", writeLimiter);

// ---- Health check (useful for uptime monitoring once deployed) ----
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---- API routes ----
app.use("/api/menu", menuRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/inventory", inventoryRoutes);

// Serve the frontend (public folder) so the whole app runs from one server
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    maxAge: process.env.VERCEL ? "1h" : 0, // no caching in local dev, so you always see your latest changes
  })
);

// ---- Central error handler ----
// Any route that calls next(err) ends up here. Keeps internal error
// details out of the response (don't leak stack traces to visitors).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end. Please try again." });
});

const PORT = process.env.PORT || 5000;

// When running on Vercel, the platform handles listening for us via the export below.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`AI Restaurant server running at http://localhost:${PORT}`);
  });
}

module.exports = app;