/* ═══ Cloud-LLM provider registry ═══
 *
 * The assistant no longer runs a model in the browser. It talks to a hosted LLM over an
 * OpenAI-compatible /chat/completions endpoint (see cloudClient.js). Two ways in:
 *
 *   • "free"  — the shared free tier: the browser POSTs to our OWN same-origin /api/chat,
 *               and a tiny server-side proxy (see proxy/) injects the project's Gemini key
 *               and rate-limits per IP. No key needed from the user; data transits our server.
 *   • BYOK    — the user pastes their own provider key; the browser calls the provider
 *               DIRECTLY (key never touches our server). Gemini, OpenRouter and Groq all
 *               expose the same OpenAI-compatible surface, so one client speaks to all of them.
 *
 * Pure data + helpers — no network here. `baseUrl` is the OpenAI-compatible root (ending in a
 * slash); cloudClient appends "chat/completions". `models` are SUGGESTIONS surfaced in a
 * free-text field (model ids churn fast upstream — the input stays editable so a renamed model
 * never bricks the picker). `keyUrl` is where the user gets a key.
 */

export const PROVIDERS = {
  // Free shared tier — routed through our proxy; the proxy chooses the real Gemini model
  // (GEMINI_MODEL env), so no model id or key is sent from the browser.
  free: {
    id: "free", needsKey: false, viaProxy: true,
    proxyPath: "api/chat", quotaPath: "api/quota",
  },
  // BYOK — the browser calls the provider directly with the user's key.
  gemini: {
    id: "gemini", needsKey: true,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  openrouter: {
    id: "openrouter", needsKey: true,
    baseUrl: "https://openrouter.ai/api/v1/",
    keyUrl: "https://openrouter.ai/settings/keys",
    defaultModel: "google/gemini-2.0-flash-exp:free",
    models: ["google/gemini-2.0-flash-exp:free", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-72b-instruct"],
  },
  groq: {
    id: "groq", needsKey: true,
    baseUrl: "https://api.groq.com/openai/v1/",
    keyUrl: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "qwen-2.5-32b", "gemma2-9b-it"],
  },
};

// Display order in the provider picker — free first.
export const PROVIDER_ORDER = ["free", "gemini", "openrouter", "groq"];

export const DEFAULT_PROVIDER = "free";

export function isKnownProvider(id) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id);
}

// The model id a provider should use given the user's (possibly empty) choice.
export function effectiveModel(providerId, model) {
  const p = PROVIDERS[providerId];
  if (!p || p.viaProxy) return undefined; // proxy decides the model server-side
  return (model && model.trim()) || p.defaultModel;
}

/* Resolve everything cloudClient needs to make one request:
 *   { url, apiKey?, model } — for the free tier, url is our same-origin proxy and there's no
 *   key/model; for BYOK it's the provider's endpoint with the user's key + chosen model.
 * `base` is import.meta.env.BASE_URL (so the proxy path is correct under a sub-path deploy);
 * `keys` is the persisted { providerId: key } map. */
export function resolveEndpoint(providerId, model, keys = {}, base = "/") {
  const p = PROVIDERS[providerId] || PROVIDERS[DEFAULT_PROVIDER];
  if (p.viaProxy) return { url: base + p.proxyPath, model: undefined };
  return {
    url: p.baseUrl + "chat/completions",
    apiKey: (keys[p.id] || "").trim(),
    model: effectiveModel(p.id, model),
    // Disable Gemini's "thinking" for direct BYOK calls too (the free-tier proxy does this
    // server-side). Only Gemini's OpenAI layer is known to accept reasoning_effort:"none".
    reasoningEffort: p.id === "gemini" ? "none" : undefined,
  };
}
