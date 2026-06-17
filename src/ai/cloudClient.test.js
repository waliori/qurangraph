import { describe, it, expect } from "vitest";
import { parseSSE, deltaFromEvent, usageFromEvent, describeApiError } from "./cloudClient.js";

describe("parseSSE", () => {
  it("splits complete data: lines and keeps the trailing partial", () => {
    const { events, rest } = parseSSE('data: {"a":1}\ndata: {"b":2}\ndata: {"c"');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"c"'); // incomplete line held back for the next chunk
  });

  it("ignores blank lines and comment keep-alives", () => {
    const { events } = parseSSE(": keep-alive\n\ndata: hello\n\n");
    expect(events).toEqual(["hello"]);
  });

  it("tolerates CRLF line endings", () => {
    const { events } = parseSSE("data: x\r\ndata: y\r\n");
    expect(events).toEqual(["x", "y"]);
  });

  it("returns the whole buffer as rest when no newline yet", () => {
    const { events, rest } = parseSSE("data: partial");
    expect(events).toEqual([]);
    expect(rest).toBe("data: partial");
  });
});

describe("deltaFromEvent", () => {
  it("extracts the content delta", () => {
    expect(deltaFromEvent('{"choices":[{"delta":{"content":"hi"}}]}')).toBe("hi");
  });

  it("returns null for the [DONE] sentinel", () => {
    expect(deltaFromEvent("[DONE]")).toBeNull();
  });

  it("returns empty string for role-opener / contentless frames", () => {
    expect(deltaFromEvent('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe("");
  });

  it("returns empty string for unparseable payloads", () => {
    expect(deltaFromEvent("not json")).toBe("");
  });

  it("reconstructs a full message from a stream of deltas", () => {
    const frames = [
      '{"choices":[{"delta":{"role":"assistant"}}]}',
      '{"choices":[{"delta":{"content":"ج"}}]}',
      '{"choices":[{"delta":{"content":"ذر"}}]}',
      "[DONE]",
    ];
    let full = "";
    for (const f of frames) {
      const d = deltaFromEvent(f);
      if (d === null) break;
      full += d;
    }
    expect(full).toBe("جذر");
  });
});

describe("usageFromEvent", () => {
  it("extracts token usage when present", () => {
    expect(usageFromEvent('{"choices":[{"delta":{}}],"usage":{"prompt_tokens":40,"completion_tokens":12,"total_tokens":52}}'))
      .toEqual({ prompt: 40, completion: 12, total: 52 });
  });

  it("returns null for content frames and [DONE]", () => {
    expect(usageFromEvent('{"choices":[{"delta":{"content":"x"}}]}')).toBeNull();
    expect(usageFromEvent("[DONE]")).toBeNull();
  });

  it("derives total when the provider omits it", () => {
    expect(usageFromEvent('{"usage":{"prompt_tokens":10,"completion_tokens":5}}').total).toBe(15);
  });
});

describe("describeApiError", () => {
  it("surfaces the provider error message", () => {
    expect(describeApiError(400, '{"error":{"message":"bad model"}}')).toBe("bad model");
  });

  it("handles the proxy's flat { error } shape", () => {
    expect(describeApiError(429, '{"error":"daily limit reached"}')).toBe("daily limit reached");
  });

  it("falls back to a status-specific message for auth failures", () => {
    expect(describeApiError(401, "")).toMatch(/key/i);
  });
});
