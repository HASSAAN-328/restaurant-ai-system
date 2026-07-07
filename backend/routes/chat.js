const express = require("express");
const router = express.Router();
const {
  parseOrder,
  understandWithAI,
  containsUrduScript,
  translateToEnglish,
  checkAvailability,
  suggestSubstitute,
  getRecommendations,
  supportReply,
} = require("../agents");

// POST /api/chat  body: { message: string }
// This is the full agent pipeline:
//   Translation Agent (only runs if the message is in Urdu/Arabic
//   script — e.g. from the mic button's Urdu speech recognition)
//     -> AI Agent (OpenRouter, many free models with automatic fallback)
//     -> Menu Agent -> Recommendation Agent
//   and if the AI Agent is unreachable (no API key set, or every free
//   model is down at once), it falls back to the offline rule-based
//   Order Agent below, so the chat never simply breaks for a visitor.
router.post("/", async (req, res, next) => {
  try {
    const { message } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ reply: "Please type something to order or ask." });
    }
    if (message.length > 300) {
      return res.status(400).json({ reply: "That message is too long — please keep it short." });
    }

    // ---- Translation Agent ----
    // If the visitor spoke/typed in Urdu script, translate it to
    // English first so both the AI agent and the offline fallback
    // (which only knows English/Roman Urdu keywords) can handle it.
    let workingMessage = message;
    let translatedFrom = null;
    if (containsUrduScript(message)) {
      try {
        workingMessage = await translateToEnglish(message);
        translatedFrom = message;
      } catch (translateErr) {
        // Translation model unreachable — fall through and let the AI
        // agent try to understand the original Urdu text directly.
        console.warn("Translation agent unavailable:", translateErr.message);
      }
    }

    let parsed = [];
    let aiReply = "";
    let usedAI = false;

    try {
      const result = await understandWithAI(workingMessage);
      parsed = result.items;
      aiReply = result.reply;
      usedAI = true;
    } catch (aiErr) {
      // Free AI models can occasionally all be busy/rate-limited at
      // once, or OPENROUTER_API_KEY may not be set yet — quietly drop
      // back to the offline keyword-based Order Agent instead of
      // showing the visitor an error.
      console.warn("AI agent unavailable, using offline fallback:", aiErr.message);
      parsed = await parseOrder(workingMessage);
    }

    if (parsed.length === 0) {
      const support = supportReply(workingMessage);
      return res.json({
        reply:
          aiReply ||
          support ||
          "I couldn't find that on our menu. Try naming a dish, e.g. 'chicken pizza' or 'zinger burger'. Ask me to show the menu any time.",
        cartAdditions: [],
        recommendations: [],
        unavailable: [],
        translatedFrom,
        understoodAs: translatedFrom ? workingMessage : null,
      });
    }

    const { available, unavailable } = checkAvailability(parsed);

    let reply = usedAI && aiReply ? aiReply + " " : "";
    if (!usedAI && available.length > 0) {
      reply +=
        "Added to your order: " +
        available.map((i) => `${i.quantity} x ${i.name}`).join(", ") +
        ". ";
    }
    const substituteMsgs = [];
    for (const u of unavailable) {
      const sub = await suggestSubstitute(u.name);
      if (sub) {
        substituteMsgs.push(`${u.name} is out of stock today, would you like ${sub} instead?`);
      } else {
        substituteMsgs.push(`${u.name} is unavailable today.`);
      }
    }
    reply += substituteMsgs.join(" ");

    const recs = await getRecommendations(available.map((i) => i.name));
    if (recs.length > 0) {
      reply += ` People often add: ${recs.map((r) => r.name).join(", ")}. Want to include any?`;
    }

    res.json({
      reply: reply.trim(),
      cartAdditions: available,
      recommendations: recs,
      unavailable: unavailable.map((u) => u.name),
      translatedFrom,
      understoodAs: translatedFrom ? workingMessage : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
