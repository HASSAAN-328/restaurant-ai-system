// Generates a branded PDF invoice/bill for a placed order — with a
// drawn restaurant logo (no image file needed, so there's nothing to
// go missing when you move/zip/deploy this project), matching the
// site's gold-and-espresso premium look.
const PDFDocument = require("pdfkit");

// Same palette as public/style.css, so the invoice matches the website.
const COLORS = {
  bgDeep: "#0b0805",
  panel: "#1c140f",
  gold: "#c9a24c",
  goldBright: "#f0cf7c",
  goldDim: "#8a733c",
  burgundy: "#7a2438",
  cream: "#f5ecdb",
  muted: "#7d6f5a",
};

// A small hand-drawn vector emblem — a plate with a fork & knife inside
// a gold ring, and "DK" monogram underneath. Pure vector shapes, so it
// prints crisp at any size and needs no logo file to be uploaded.
function drawLogo(doc, x, y, size = 46) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;

  doc.save();
  doc.circle(cx, cy, r).lineWidth(1.6).stroke(COLORS.gold);
  doc.circle(cx, cy, r - 5).lineWidth(0.6).stroke(COLORS.goldDim);

  // Fork (left tines) — three short vertical lines + a stem
  const forkX = cx - r * 0.32;
  doc
    .moveTo(forkX - 4, cy - r * 0.5)
    .lineTo(forkX - 4, cy - r * 0.05)
    .moveTo(forkX, cy - r * 0.5)
    .lineTo(forkX, cy - r * 0.05)
    .moveTo(forkX + 4, cy - r * 0.5)
    .lineTo(forkX + 4, cy - r * 0.05)
    .lineWidth(1.1)
    .stroke(COLORS.goldBright);
  doc
    .moveTo(forkX - 4, cy - r * 0.05)
    .lineTo(forkX + 4, cy - r * 0.05)
    .lineTo(forkX, cy + r * 0.55)
    .lineWidth(1.1)
    .stroke(COLORS.goldBright);

  // Knife (right blade)
  const knifeX = cx + r * 0.32;
  doc
    .moveTo(knifeX, cy - r * 0.5)
    .lineTo(knifeX, cy + r * 0.55)
    .lineWidth(1.4)
    .stroke(COLORS.goldBright);
  doc
    .moveTo(knifeX - 3, cy - r * 0.5)
    .quadraticCurveTo(knifeX + 4, cy - r * 0.25, knifeX, cy - r * 0.02)
    .lineWidth(1.4)
    .stroke(COLORS.goldBright);

  doc.restore();

  doc
    .fillColor(COLORS.gold)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("DK", x, y + size + 4, { width: size, align: "center" });
}

function money(n) {
  return "Rs " + Number(n || 0).toLocaleString("en-PK");
}

// order: { id, customer_name, status, subtotal, tax, total, created_at, items: [{name, price, quantity}] }
function buildInvoicePDF(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ---- Header band ----
    doc.rect(0, 0, doc.page.width, 120).fill(COLORS.bgDeep);
    drawLogo(doc, 50, 32, 46);

    doc
      .fillColor(COLORS.goldBright)
      .font("Helvetica-Bold")
      .fontSize(26)
      .text("DASTARKHWAN", 112, 34);
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text("Fine ordering, powered by agentic AI", 112, 64);

    doc
      .fillColor(COLORS.gold)
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("INVOICE", 0, 40, { align: "right" });
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(9)
      .text(`Order #${order.id}`, { align: "right" })
      .text(new Date(order.created_at).toLocaleString("en-PK"), { align: "right" });

    // ---- Body ----
    doc.fillColor("#000000");
    let y = 150;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333");
    doc.text("Billed to:", 50, y);
    doc.font("Helvetica").fillColor("#555555");
    doc.text(order.customer_name || "Guest", 50, y + 14);

    doc.font("Helvetica-Bold").fillColor("#333333");
    doc.text("Status:", 350, y, { width: 195, align: "right" });
    doc.font("Helvetica").fillColor("#555555");
    doc.text(order.status || "Preparing", 350, y + 14, { width: 195, align: "right" });

    y += 50;

    // Table header
    doc.rect(50, y, 495, 24).fill(COLORS.burgundy);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
    doc.text("Item", 60, y + 7);
    doc.text("Qty", 330, y + 7, { width: 50, align: "right" });
    doc.text("Price", 390, y + 7, { width: 70, align: "right" });
    doc.text("Total", 465, y + 7, { width: 70, align: "right" });
    y += 24;

    // Table rows
    doc.font("Helvetica").fontSize(10);
    (order.items || []).forEach((item, idx) => {
      const rowH = 22;
      if (idx % 2 === 0) {
        doc.rect(50, y, 495, rowH).fill("#f7f2ea");
      }
      doc.fillColor("#2a2a2a");
      doc.text(item.name, 60, y + 6, { width: 260 });
      doc.text(String(item.quantity), 330, y + 6, { width: 50, align: "right" });
      doc.text(money(item.price), 390, y + 6, { width: 70, align: "right" });
      doc.text(money(item.price * item.quantity), 465, y + 6, { width: 70, align: "right" });
      y += rowH;
    });

    y += 12;
    doc.moveTo(330, y).lineTo(545, y).lineWidth(0.5).stroke("#cccccc");
    y += 10;

    doc.font("Helvetica").fillColor("#555555").fontSize(10);
    doc.text("Subtotal", 330, y, { width: 145, align: "left" });
    doc.text(money(order.subtotal), 390, y, { width: 145, align: "right" });
    y += 16;
    doc.text("Tax (5%)", 330, y, { width: 145, align: "left" });
    doc.text(money(order.tax), 390, y, { width: 145, align: "right" });
    y += 20;

    doc.rect(330, y, 215, 28).fill(COLORS.gold);
    doc.fillColor("#0b0805").font("Helvetica-Bold").fontSize(12);
    doc.text("TOTAL", 342, y + 8);
    doc.text(money(order.total), 390, y + 8, { width: 145, align: "right" });

    // ---- Footer ----
    const footerY = doc.page.height - 90;
    doc.moveTo(50, footerY).lineTo(545, footerY).lineWidth(0.5).stroke("#dddddd");
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#999999")
      .text(
        "Thank you for dining with Dastarkhwan. This is a system-generated invoice and needs no signature.",
        50,
        footerY + 12,
        { width: 495, align: "center" }
      );

    doc.end();
  });
}

module.exports = { buildInvoicePDF };
