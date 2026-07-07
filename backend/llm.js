// AI brain of the app — talks to OpenRouter (a service that gives one
// simple API key access to many different AI models, including several
// good free ones). This file tries a LIST of free models in order, one
// after another, until one of them replies. This is what makes the chat
// "agentic" and resilient: free models sometimes get busy or rate
// limited, so if the first one fails, the code quietly tries the next
// one instead of showing the visitor an error.

// The fallback order below goes from strongest/most-capable models
// first, down to smaller/faster backup models.
const MODELS = [
  "nex-agi/nex-n2-pro:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "cohere/north-mini-code:free",
  "nvidia/llama-nemotron-rerank-vl-1b-v2:free",
  "nvidia/nemotron-3.5-content-safety:free",
  "poolside/laguna-xs.2:free",
  "google/gemma-4-26b-a4b-it:free",
  "liquid/lfm-2.5-1.2b-thinking:free",
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-coder:free",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// One timed attempt against a single model, so a hung/slow free model
// can't freeze the whole chat for the visitor.
async function callOneModel(model, messages, jsonMode, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        // OpenRouter asks for these two headers as good practice —
        // they show up in your OpenRouter dashboard, nothing sensitive.
        "HTTP-Referer": process.env.ALLOWED_ORIGIN || "http://localhost:5000",
        "X-Title": "Dastarkhwan AI Restaurant",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 400,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Model "${model}" replied with HTTP ${res.status}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || !content.trim()) {
      throw new Error(`Model "${model}" returned an empty reply`);
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// Tries every model in MODELS, in order, until one succeeds.
// Returns { content, modelUsed }. Throws only if EVERY model failed.
async function askAI(messages, { jsonMode = false } = {}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  let lastError = null;
  for (const model of MODELS) {
    try {
      const content = await callOneModel(model, messages, jsonMode);
      return { content, modelUsed: model };
    } catch (err) {
      lastError = err;
      // Quietly move on to the next model in the fallback list.
      continue;
    }
  }
  throw new Error(
    `All AI models failed. Last error: ${lastError ? lastError.message : "unknown"}`
  );
}

module.exports = { askAI, MODELS };
