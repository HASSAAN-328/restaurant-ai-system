const db = require("./db");
const { askAI } = require("./llm");

// Recommendation Agent: simple rule-based combo map (mirrors the project proposal)
const COMBOS = {
  "Chicken Pizza (Large)": ["Coca-Cola", "Garlic Bread", "Chocolate Cake"],
  "Chicken Karahi (Full)": ["Naan", "Raita", "Pepsi"],
  "Chicken Shawarma": ["Fries", "Pepsi"],
  "Zinger Burger": ["Fries", "Coca-Cola"],
  "Dal Chawal": ["Raita"],
  "Chicken Biryani": ["Raita", "Coca-Cola"],
};

// number words -> digits, so "two cokes" is understood
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1,
};

// Everyday words people actually type, mapped to the exact menu item name.
// This lets "coke", "biryani", "burger" etc. all be understood, not just the full menu name.
const ALIASES = {
  "Chicken Pizza (Large)": ["pizza", "pizzas"],
  "Chicken Karahi (Full)": ["karahi"],
  "Chicken Shawarma": ["shawarma", "shawarmas"],
  "Zinger Burger": ["burger", "burgers", "zinger"],
  "Chicken Biryani": ["biryani"],
  "Dal Chawal": ["dal", "daal"],
  "Naan": ["naan", "naans"],
  "Garlic Bread": ["garlic bread"],
  "Fries": ["fries", "chips"],
  "Raita": ["raita"],
  "Coca-Cola": ["coke", "coca cola", "coca-cola"],
  "Pepsi": ["pepsi"],
  "Chocolate Cake": ["cake", "chocolate cake"],
};

function getMenu() {
  return db.getMenu();
}

// Order Agent: turns free text like "2 pizzas and one coke" into menu line items
async function parseOrder(message) {
  const menu = await getMenu();
  const text = message.toLowerCase();
  const found = [];

  for (const item of menu) {
    const nameLower = item.name.toLowerCase();
    const candidates = [nameLower, ...(ALIASES[item.name] || [])];

    let matchedKeyword = null;
    for (const kw of candidates) {
      if (text.includes(kw)) {
        matchedKeyword = kw;
        break;
      }
    }
    if (!matchedKeyword) continue;

    const regex = new RegExp(
      `(\\d+|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:[a-z]+\\s+){0,2}${matchedKeyword.replace(/[- ]/g, "[- ]?")}`
    );
    const match = text.match(regex);
    let qty = 1;
    if (match) {
      const token = match[1];
      qty = NUMBER_WORDS[token] || parseInt(token, 10) || 1;
    }
    if (!found.find((f) => f.id === item.id)) {
      found.push({ ...item, quantity: qty });
    }
  }
  return found;
}

// Menu Agent: filters out unavailable items and suggests substitutes
function checkAvailability(items) {
  const available = items.filter((i) => i.is_available);
  const unavailable = items.filter((i) => !i.is_available);
  return { available, unavailable };
}

async function suggestSubstitute(itemName) {
  const menu = await getMenu();
  const category = menu.find((m) => m.name === itemName)?.category;
  const alt = menu.find(
    (m) => m.category === category && m.name !== itemName && m.is_available
  );
  return alt ? alt.name : null;
}

// Recommendation Agent
async function getRecommendations(cartItemNames) {
  const recs = new Set();
  cartItemNames.forEach((name) => {
    (COMBOS[name] || []).forEach((r) => {
      if (!cartItemNames.includes(r)) recs.add(r);
    });
  });
  const menu = await getMenu();
  return [...recs]
    .map((name) => menu.find((m) => m.name === name))
    .filter((m) => m && m.is_available);
}

// AI Agent: sends the visitor's message + current live menu to the AI
// model (via OpenRouter, with the multi-model fallback chain in llm.js)
// and asks it to figure out, in one shot:
//   - which menu items (and how many) the visitor wants
//   - a short, friendly reply to show them
// This replaces simple keyword-matching with real language
// understanding, so things like "make that pizza large and add a coke"
// or "kuch bhi tez pakao, main jaldi mein hoon" are understood too, not
// just exact menu names.
//
// If OPENROUTER_API_KEY is missing, or every free model in the fallback
// list is down/rate-limited, this throws — and routes/chat.js falls
// back automatically to the offline rule-based agent below, so the app
// never breaks for the visitor.
async function understandWithAI(message, conversation = []) {
  const menu = await getMenu();
  const menuForPrompt = menu.map((m) => ({
    name: m.name,
    price: Number(m.price),
    available: !!m.is_available,
    category: m.category,
  }));

  const systemPrompt = [
    "You are the ordering assistant for a restaurant called Dastarkhwan.",
    "You will be given the LIVE menu as JSON, and the visitor's message.",
    "Reply with STRICT JSON ONLY, no markdown, no code fences, matching exactly this shape:",
    '{"items":[{"name":"<exact menu item name>","quantity":<number>}],"reply":"<short friendly reply, 1-2 sentences>"}',
    "Rules:",
    "- Only use item names that appear EXACTLY as given in the menu JSON below.",
    "- If the visitor didn't ask for any food/drink, return an empty items array and just answer or greet them in `reply`.",
    "- Understand casual phrasing, typos, Roman Urdu, and quantities written as words (e.g. 'do pizza', 'a coke').",
    "- Never invent an item name that isn't in the menu.",
    "- Keep `reply` warm and short — this is a chat bubble, not an essay.",
    `Menu JSON: ${JSON.stringify(menuForPrompt)}`,
  ].join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversation,
    { role: "user", content: message },
  ];

  const { content, modelUsed } = await askAI(messages, { jsonMode: true });

  let parsed;
  try {
    // Some free models ignore json_mode occasionally and wrap the JSON
    // in ```json fences — strip those out before parsing, just in case.
    const cleaned = content.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model "${modelUsed}" returned text that wasn't valid JSON`);
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const matched = [];
  for (const wanted of items) {
    const found = menu.find(
      (m) => m.name.toLowerCase() === String(wanted.name || "").toLowerCase()
    );
    if (found) {
      const qty = Math.max(1, parseInt(wanted.quantity, 10) || 1);
      matched.push({ ...found, quantity: qty });
    }
  }

  return {
    items: matched,
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    modelUsed,
  };
}

// Detects Urdu/Arabic script (used for voice orders spoken in Urdu).
// Roman Urdu typed in English letters ("do pizza dena") is already
// understood directly by the AI agent above, so this check only
// covers actual Urdu/Arabic script text.
function containsUrduScript(text) {
  return /[\u0600-\u06FF]/.test(text);
}

// Translation Agent: converts Urdu-script text to English BEFORE it's
// handed to the ordering pipeline. This means both the AI agent and
// the offline keyword-based fallback agent (which only understands
// English/Roman Urdu keywords) can reliably work on it either way.
async function translateToEnglish(text) {
  const messages = [
    {
      role: "system",
      content:
        "Translate the visitor's message to natural, simple English. " +
        "Reply with ONLY the translated sentence, nothing else — no quotes, no notes.",
    },
    { role: "user", content: text },
  ];
  const { content } = await askAI(messages);
  return content.trim();
}

// Support Agent: fallback answers for common FAQ-style messages
function supportReply(message) {
  const text = message.toLowerCase();
  if (text.includes("delivery time") || text.includes("how long")) {
    return "Typical delivery time is 30-45 minutes depending on your location.";
  }
  if (text.includes("payment") || text.includes("pay")) {
    return "We currently support Cash on Delivery in this demo. Card and wallet payments are listed as a future enhancement.";
  }
  if (text.includes("hi") || text.includes("hello") || text.includes("salam")) {
    return "Hello! Tell me what you'd like to eat, for example: '2 pizzas and one coke'.";
  }
  return null;
}

module.exports = {
  getMenu,
  parseOrder,
  understandWithAI,
  containsUrduScript,
  translateToEnglish,
  checkAvailability,
  suggestSubstitute,
  getRecommendations,
  supportReply,
};
