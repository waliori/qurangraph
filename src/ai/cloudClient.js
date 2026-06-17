/* ═══ Cloud-LLM client (OpenAI-compatible SSE) ═══
 *
 * Replaces the old in-browser engines (web-llm / Transformers.js). It streams a chat
 * completion from any OpenAI-compatible /chat/completions endpoint — our free-tier proxy
 * (same-origin /api/chat) or, for BYOK, the provider directly (Gemini / OpenRouter / Groq).
 * One protocol covers all of them.
 *
 * Mirrors the command surface useAssistant expects from the old clients (load / chatStream /
 * interrupt / unload / terminate / getCurrentModel / isGenerating) so the hook barely changed.
 * `load` is a no-op now — there's no download; the model lives in the cloud.
 *
 * The SSE parsing is split into two pure, tested helpers (parseSSE / deltaFromEvent) so the
 * streaming logic is verifiable without a network.
 */

// Split a buffer of SSE text into complete `data:` payloads + the trailing partial line.
// Returns { events: string[], rest: string }. Blank lines and `:` comments (keep-alives)
// are skipped.
export function parseSSE(buffer) {
  const events = [];
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    let line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    line = line.trim();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("data:")) events.push(line.slice(5).trim());
  }
  return { events, rest: buffer };
}

// Pull the text delta out of one SSE data payload. Returns "" for non-content frames
// (role openers, keep-alives, unparseable), and null for the [DONE] sentinel.
export function deltaFromEvent(data) {
  if (data === "[DONE]") return null;
  let obj;
  try { obj = JSON.parse(data); } catch { return ""; }
  return obj?.choices?.[0]?.delta?.content || "";
}

// Pull the token usage out of an SSE payload, when present. With stream_options.include_usage
// the provider emits one final frame (before [DONE]) carrying { usage: { prompt_tokens,
// completion_tokens, total_tokens } }. Returns { prompt, completion, total } or null.
export function usageFromEvent(data) {
  if (data === "[DONE]") return null;
  let obj;
  try { obj = JSON.parse(data); } catch { return null; }
  const u = obj?.usage;
  if (!u) return null;
  const prompt = u.prompt_tokens ?? null;
  const completion = u.completion_tokens ?? null;
  const total = (u.total_tokens ?? ((prompt || 0) + (completion || 0))) || null;
  return { prompt, completion, total };
}

// Turn an HTTP failure into a short, user-facing message. The body is best-effort JSON
// ({ error: { message } } for OpenAI/Gemini/OpenRouter/Groq, or our proxy's { error }).
export function describeApiError(status, bodyText) {
  let msg = "";
  try { const j = JSON.parse(bodyText); msg = j?.error?.message || j?.error || j?.message || ""; } catch { /* plain text */ }
  if (!msg && bodyText) msg = bodyText.slice(0, 200);
  if (status === 401 || status === 403) return msg || "Authentication failed — check your API key.";
  if (status === 429) return msg || "Rate limit or quota reached. Try again later.";
  if (status >= 500) return msg || `Server error (${status}).`;
  return msg || `Request failed (${status}).`;
}

export function createCloudClient() {
  let generating = false;
  let currentModel = null;

  return {
    getCurrentModel() { return currentModel; },
    isGenerating() { return generating; },

    // No-op for cloud (no weights to download). Kept for interface parity with the old engines.
    async load(modelId) { currentModel = modelId || null; return currentModel; },

    /* Stream a chat completion. `messages` is OpenAI-style [{role, content}, …].
     * `endpoint` = { url, apiKey?, model } (see cloudModels.resolveEndpoint): for the free
     * tier `url` is our same-origin proxy with no key/model; for BYOK it's the provider with
     * the user's key. An AbortSignal stops generation cleanly (no error surfaced). */
    async chatStream(messages, { onToken, onUsage, signal, temperature = 0.3, maxTokens = 1536, endpoint } = {}) {
      if (!endpoint?.url) throw new Error("no endpoint configured");
      generating = true;
      let full = "";
      let usage = null;
      currentModel = endpoint.model || "cloud";
      try {
        const headers = { "Content-Type": "application/json" };
        if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`;
        // include_usage → one final frame carries the token counts (see usageFromEvent).
        const body = { messages, stream: true, stream_options: { include_usage: true }, temperature, max_tokens: maxTokens };
        if (endpoint.model) body.model = endpoint.model;
        // reasoning_effort:"none" disables Gemini 2.5's hidden "thinking" pass — for this terse
        // lexical use it only burned tokens and truncated answers. Only set for providers known
        // to accept it (Gemini); omitted for the free tier (the proxy sets it server-side).
        if (endpoint.reasoningEffort) body.reasoning_effort = endpoint.reasoningEffort;
        const res = await fetch(endpoint.url, { method: "POST", headers, body: JSON.stringify(body), signal });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(describeApiError(res.status, txt));
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let done = false;
        while (!done) {
          const r = await reader.read();
          if (r.done) break;
          buf += decoder.decode(r.value, { stream: true });
          const { events, rest } = parseSSE(buf);
          buf = rest;
          for (const data of events) {
            if (data === "[DONE]") { done = true; break; }
            const u = usageFromEvent(data); if (u) usage = u;
            const delta = deltaFromEvent(data);
            if (delta) { full += delta; onToken?.(delta, full); }
          }
        }
        if (usage) onUsage?.(usage);
        return full;
      } catch (e) {
        if (signal?.aborted) { if (usage) onUsage?.(usage); return full; } // user pressed stop — not an error
        throw e;
      } finally {
        generating = false;
      }
    },

    // Abort is driven by the caller's AbortSignal; nothing to tear down here.
    async interrupt() { /* noop — abort via signal */ },
    async unload() { currentModel = null; },
    terminate() { generating = false; currentModel = null; },
  };
}
