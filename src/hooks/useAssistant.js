import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistedState } from "./usePersistedState.js";
import { PROVIDERS, PROVIDER_ORDER, DEFAULT_PROVIDER, isKnownProvider, resolveEndpoint } from "../ai/cloudModels.js";
import { buildSystemPrompt } from "../ai/systemPrompt.js";
import { stripThinking } from "../ai/actions.js";

/* ═══ Assistant engine hook (cloud) ═══
 *
 * Owns the assistant lifecycle for the AssistantPanel. The model now lives in the CLOUD, not
 * the browser, so there's no WebGPU probe, no multi-GB download, and no per-device model
 * picker — just a provider choice (the shared free tier, or bring-your-own-key) and the chat.
 *
 * Two paths, one OpenAI-compatible client (see cloudClient.js):
 *   • free  — POSTs to our same-origin /api proxy, which injects the project's key + rate-limits.
 *   • BYOK  — calls the provider (Gemini / OpenRouter / Groq) directly with the user's key,
 *             which never touches our server.
 *
 * The panel assembles the grounded context block (assembleContext) and passes it to `send()`,
 * which rebuilds the strict system prompt fresh each turn so the rules + the currently-attached
 * data always travel together.
 */
export function useAssistant() {
  const [enabled, setEnabled] = usePersistedState("qg.ai.enabled", false, (v) => !!v);
  const [provider, setProviderRaw] = usePersistedState("qg.ai.provider", DEFAULT_PROVIDER,
    (v, f) => (typeof v === "string" && isKnownProvider(v) ? v : f));
  // Per-provider BYOK keys, stored in this browser only (the user's own keys; never sent to us).
  const [keys, setKeys] = usePersistedState("qg.ai.keys", {}, (v) => (v && typeof v === "object" ? v : {}));
  // Free-text model id for BYOK (ignored on the free tier — the proxy chooses the model).
  const [model, setModelRaw] = usePersistedState("qg.ai.model", "", (v) => (typeof v === "string" ? v : ""));

  const [messages, setMessages] = useState([]); // [{ role, content }]
  const [streaming, setStreaming] = useState(false);
  const [quota, setQuota] = useState(null); // free tier: { limit, remaining, resetAt } | null

  // Ad-hoc context pushed in from elsewhere in the app (a modal's "Ask AI", the verse
  // multi-select). `injected` is a list of attachable items the panel merges + auto-selects.
  const [injected, setInjected] = useState([]);
  // Open-request subscription — a STABLE pub/sub so heavy consumers (QuranGraph, the modals)
  // can be told to open the panel WITHOUT subscribing to this hook's volatile state. Subscribing
  // them to the chat state would re-render the whole app on every streaming token (a 3 GB-class
  // memory blowup). analyze() sets the injected context, then fires the listeners.
  const openListeners = useRef(new Set());
  const analyze = useCallback((items) => {
    setInjected(Array.isArray(items) ? items : (items ? [items] : []));
    openListeners.current.forEach((fn) => { try { fn(); } catch { /* noop */ } });
  }, []);
  const onOpenRequest = useCallback((fn) => { openListeners.current.add(fn); return () => openListeners.current.delete(fn); }, []);
  const clearInjected = useCallback(() => setInjected([]), []);
  // The stable surface exposed via a SEPARATE context (see AssistantContext) for components that
  // only need to TRIGGER the assistant — never changes identity, so they don't re-render on chat.
  const control = useMemo(() => ({ analyze, onOpenRequest }), [analyze, onOpenRequest]);

  const clientRef = useRef(null);
  const abortRef = useRef(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; clientRef.current?.terminate?.(); }, []);

  const meta = PROVIDERS[provider] || PROVIDERS[DEFAULT_PROVIDER];
  const needsKey = !!meta.needsKey;
  const hasKey = !needsKey || !!(keys[provider] || "").trim();
  const ready = enabled && hasKey;
  const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

  // Lazily create the (tiny, pure) cloud client.
  const ensureClient = useCallback(async () => {
    if (clientRef.current) return clientRef.current;
    const mod = await import("../ai/cloudClient.js");
    clientRef.current = mod.createCloudClient();
    return clientRef.current;
  }, []);

  // Free-tier quota indicator. Best-effort: the proxy reports remaining requests for this IP;
  // any failure (BYOK, no proxy, offline) just clears it.
  const refreshQuota = useCallback(async () => {
    if (provider !== "free") { if (aliveRef.current) setQuota(null); return; }
    try {
      const r = await fetch(base + (PROVIDERS.free.quotaPath), { method: "GET" });
      if (!r.ok) throw new Error("no quota");
      const j = await r.json();
      if (aliveRef.current) setQuota({ limit: j.limit, remaining: j.remaining, resetAt: j.resetAt });
    } catch { if (aliveRef.current) setQuota(null); }
  }, [provider, base]);

  const enable = useCallback(() => { setEnabled(true); refreshQuota(); }, [setEnabled, refreshQuota]);
  const setProvider = useCallback((id) => { setProviderRaw(id); }, [setProviderRaw]);
  const setApiKey = useCallback((val) => { setKeys((k) => ({ ...k, [provider]: val })); }, [setKeys, provider]);
  const setModel = useCallback((val) => { setModelRaw(val); }, [setModelRaw]);

  // Send a question. `contextBlock` is the assembled grounded context; `lang` is ar|en.
  const send = useCallback(async ({ question, contextBlock, lang }) => {
    const q = (question || "").trim();
    if (!q || !ready || streaming) return;
    const client = await ensureClient();
    const endpoint = resolveEndpoint(provider, model, keys, base);

    // Don't feed prior chain-of-thought back into the next turn — strip <think> from history.
    const history = messages.map((m) => ({ role: m.role, content: m.role === "assistant" ? stripThinking(m.content) : m.content }));
    const sys = { role: "system", content: buildSystemPrompt(lang, contextBlock) };
    const user = { role: "user", content: q };

    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await client.chatStream([sys, ...history, user], {
        endpoint,
        signal: ac.signal,
        temperature: 0.3,
        onToken: (_delta, full) => {
          if (!aliveRef.current) return;
          setMessages((m) => { const c = m.slice(); const last = c[c.length - 1]; c[c.length - 1] = { ...last, role: "assistant", content: full }; return c; });
        },
        // Token counts arrive in one final frame (free tier + BYOK); attach to the answer.
        onUsage: (usage) => {
          if (!aliveRef.current) return;
          setMessages((m) => { const c = m.slice(); const last = c[c.length - 1]; if (last?.role === "assistant") c[c.length - 1] = { ...last, usage }; return c; });
        },
      });
    } catch (e) {
      if (aliveRef.current) setMessages((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", content: (c[c.length - 1].content || "") + `\n⚠ ${String(e?.message || e)}` }; return c; });
    } finally {
      if (aliveRef.current) setStreaming(false);
      abortRef.current = null;
      refreshQuota();
    }
  }, [ready, streaming, ensureClient, provider, model, keys, base, messages, refreshQuota]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);
  const clear = useCallback(() => { if (!streaming) setMessages([]); }, [streaming]);

  return {
    enabled, enable,
    provider, setProvider, providers: PROVIDERS, providerOrder: PROVIDER_ORDER,
    needsKey, apiKey: keys[provider] || "", setApiKey,
    model, setModel, models: meta.models || [], keyUrl: meta.keyUrl,
    ready, quota, refreshQuota,
    injected, analyze, clearInjected, control,
    messages, streaming, send, stop, clear,
  };
}
