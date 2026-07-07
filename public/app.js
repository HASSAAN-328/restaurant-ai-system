const API = ""; // same origin

let cart = []; // { id, name, price, quantity }
let currentOrderId = null;
const STAGES = ["Preparing", "Cooking", "Ready", "Out for Delivery", "Delivered"];

function formatMoney(amount) {
  return "Rs " + Number(amount).toLocaleString("en-PK");
}

// ---- Text-to-speech (speaks bot replies aloud, in whatever language
// the text is actually in — the browser's speech engine picks a voice
// that matches the language tag we give it) ----
let speechEnabled = localStorage.getItem("dastarkhwan-speech") === "on";

function detectSpeechLang(text) {
  if (/[\u0600-\u06FF]/.test(text)) return "ur-PK"; // Urdu / Arabic script
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN"; // Devanagari (Hindi)
  if (/[\u4e00-\u9fff]/.test(text)) return "zh-CN"; // Chinese
  if (/[\u3040-\u30ff]/.test(text)) return "ja-JP"; // Japanese
  if (/[\uac00-\ud7af]/.test(text)) return "ko-KR"; // Korean
  return "en-US"; // default — covers English and Roman-Urdu text
}

function speak(text) {
  if (!speechEnabled || !("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel(); // don't overlap with a previous reply
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = detectSpeechLang(text);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

function updateSpeakerButton() {
  const btn = document.getElementById("speaker-toggle");
  if (!btn) return;
  btn.setAttribute("aria-pressed", speechEnabled ? "true" : "false");
  btn.title = speechEnabled ? "Spoken replies: on (click to mute)" : "Spoken replies: off (click to enable)";
}

document.getElementById("speaker-toggle").addEventListener("click", () => {
  speechEnabled = !speechEnabled;
  localStorage.setItem("dastarkhwan-speech", speechEnabled ? "on" : "off");
  if (!speechEnabled) window.speechSynthesis.cancel();
  updateSpeakerButton();
  showToast(speechEnabled ? "Spoken replies turned on." : "Spoken replies turned off.");
});
updateSpeakerButton();

// ---- Speech-to-text (mic button — speak your order in Urdu or English) ----
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = document.getElementById("btn-mic");
const micStatus = document.getElementById("mic-status");
let recognizer = null;
let isListening = false;

if (!SpeechRecognitionAPI) {
  micBtn.disabled = true;
  micBtn.title = "Voice input isn't supported in this browser — try Chrome or Edge.";
  micBtn.style.opacity = "0.4";
} else {
  recognizer = new SpeechRecognitionAPI();
  recognizer.continuous = false;
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;

  recognizer.onstart = () => {
    isListening = true;
    micBtn.classList.add("listening");
    micStatus.hidden = false;
    micStatus.textContent = "Listening… speak now.";
  };

  recognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("chat-input").value = transcript;
    micStatus.textContent = `Heard: "${transcript}" — sending…`;
    // Send it straight through, same as typing + pressing Enter.
    document.getElementById("chat-form").requestSubmit();
  };

  recognizer.onerror = (event) => {
    micStatus.textContent =
      event.error === "not-allowed"
        ? "Microphone permission was blocked — allow it in your browser's site settings."
        : "Couldn't catch that — please try again.";
  };

  recognizer.onend = () => {
    isListening = false;
    micBtn.classList.remove("listening");
    setTimeout(() => {
      if (!isListening) micStatus.hidden = true;
    }, 2500);
  };

  micBtn.addEventListener("click", () => {
    if (isListening) {
      recognizer.stop();
      return;
    }
    recognizer.lang = document.getElementById("mic-lang").value;
    try {
      recognizer.start();
    } catch {
      /* already running — ignore */
    }
  });
}

// ---- Toasts (replaces alert()) ----
function showToast(message, type = "info") {
  const stack = document.getElementById("toast-stack");
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " error" : ""}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---- Menu ----
async function loadMenu() {
  const container = document.getElementById("menu-list");
  try {
    const res = await fetch(`${API}/api/menu`);
    if (!res.ok) throw new Error("Failed to load menu");
    const items = await res.json();

    container.innerHTML = "";
    let lastCategory = "";
    items.forEach((item) => {
      if (item.category !== lastCategory) {
        const catEl = document.createElement("div");
        catEl.className = "menu-category";
        catEl.textContent = item.category || "Other";
        container.appendChild(catEl);
        lastCategory = item.category;
      }
      const el = document.createElement("div");
      el.className = "menu-item" + (item.is_available ? "" : " unavailable");
      el.innerHTML = `<span class="name">${escapeHtml(item.name)}</span><span class="price">${formatMoney(item.price)}</span>`;
      container.appendChild(el);
    });
  } catch (err) {
    container.innerHTML = `<p class="empty-note">Couldn't load the menu right now. Please refresh.</p>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Chat ----
function addBubble(text, sender) {
  const win = document.getElementById("chat-window");
  const bubble = document.createElement("div");
  bubble.className = `bubble ${sender}`;
  bubble.textContent = text;
  win.appendChild(bubble);
  win.scrollTop = win.scrollHeight;
  return bubble;
}

function showTypingIndicator() {
  const win = document.getElementById("chat-window");
  const bubble = document.createElement("div");
  bubble.className = "bubble bot typing";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  win.appendChild(bubble);
  win.scrollTop = win.scrollHeight;
  return bubble;
}

document.getElementById("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;
  addBubble(message, "user");
  input.value = "";

  const typingBubble = showTypingIndicator();

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    typingBubble.remove();
    if (data.translatedFrom && data.understoodAs) {
      addBubble(`Understood as: "${data.understoodAs}"`, "bot translation-note");
    }
    addBubble(data.reply, "bot");
    speak(data.reply);
    if (data.cartAdditions && data.cartAdditions.length > 0) {
      addToCart(data.cartAdditions);
    }
  } catch (err) {
    typingBubble.remove();
    addBubble("Sorry, I couldn't reach the kitchen just now. Please try again.", "bot");
  }
});

// ---- Cart ----
function renderCart() {
  const list = document.getElementById("cart-list");
  const totalEl = document.getElementById("cart-total");
  if (cart.length === 0) {
    list.innerHTML = `<p class="empty-note">Nothing added yet &mdash; your order will appear here.</p>`;
    totalEl.innerHTML = "";
    return;
  }
  list.innerHTML = "";
  let subtotal = 0;
  cart.forEach((i) => {
    subtotal += i.price * i.quantity;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `<span>${i.quantity} &times; ${escapeHtml(i.name)}</span><span class="price">${formatMoney(i.price * i.quantity)}</span>`;
    list.appendChild(row);
  });
  const tax = Math.round(subtotal * 0.05);
  totalEl.innerHTML = `
    <span>Subtotal &nbsp; ${formatMoney(subtotal)}</span>
    <span>Tax (5%) &nbsp; ${formatMoney(tax)}</span>
    <span class="grand">Total &nbsp; ${formatMoney(subtotal + tax)}</span>
  `;
}

function addToCart(items) {
  items.forEach((item) => {
    const existing = cart.find((c) => c.id === item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.push({ id: item.id, name: item.name, price: item.price, quantity: item.quantity });
    }
  });
  renderCart();
}

// ---- Placing an order ----
document.getElementById("place-order-btn").addEventListener("click", async (e) => {
  if (cart.length === 0) {
    showToast("Your cart is empty — add something first.", "error");
    return;
  }
  const btn = e.currentTarget;
  const customerName = document.getElementById("customer-name").value.trim();

  btn.disabled = true;
  btn.textContent = "Placing order…";

  try {
    const res = await fetch(`${API}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName,
        items: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
      }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(data.error || "Something went wrong placing your order.", "error");
      return;
    }

    currentOrderId = data.orderId;
    const statusBox = document.getElementById("order-status");
    statusBox.hidden = false;
    document.getElementById("order-id").textContent = `#${data.orderId}`;
    document.getElementById("order-status-text").textContent = data.status;
    renderTracker(data.status);
    document.getElementById("bill").textContent =
      `Bill Summary\nSubtotal: ${formatMoney(data.subtotal)}\nTax: ${formatMoney(data.tax)}\nTotal: ${formatMoney(data.total)}` +
      (data.lowStockAlerts && data.lowStockAlerts.length ? `\n\nStaff alert: ${data.lowStockAlerts.join(", ")}` : "");

    const invoiceLink = document.getElementById("invoice-link");
    if (data.invoiceUrl) {
      invoiceLink.href = `${API}${data.invoiceUrl}`;
      invoiceLink.hidden = false;
    }

    showToast("Order placed — thank you!");

    cart = [];
    renderCart();
    statusBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    showToast("Couldn't reach the server. Please try again.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Place Order";
  }
});

function renderTracker(currentStatus) {
  const tracker = document.getElementById("tracker");
  tracker.innerHTML = "";
  const currentIdx = STAGES.indexOf(currentStatus);
  STAGES.forEach((stage, idx) => {
    const span = document.createElement("span");
    span.textContent = stage;
    if (idx === currentIdx) span.classList.add("active");
    else if (idx < currentIdx) span.classList.add("done");
    tracker.appendChild(span);
  });
}

document.getElementById("advance-status-btn").addEventListener("click", async (e) => {
  if (!currentOrderId) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/orders/${currentOrderId}`);
    const order = await res.json();
    const idx = STAGES.indexOf(order.status);
    const nextStatus = STAGES[Math.min(idx + 1, STAGES.length - 1)];
    const updateRes = await fetch(`${API}/api/orders/${currentOrderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const updated = await updateRes.json();
    document.getElementById("order-status-text").textContent = updated.status;
    renderTracker(updated.status);
  } catch (err) {
    showToast("Couldn't update the order status.", "error");
  } finally {
    btn.disabled = false;
  }
});

loadMenu();
