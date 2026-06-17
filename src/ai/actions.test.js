import { describe, it, expect } from "vitest";
import { parseActions, actionLabel, stripThinking } from "./actions.js";

describe("stripThinking", () => {
  it("removes closed <think> blocks", () => {
    expect(stripThinking("<think>\nreasoning\n</think>\nHello")).toBe("Hello");
  });
  it("drops a dangling unclosed <think> mid-stream", () => {
    expect(stripThinking("answer <think>still thinking")).toBe("answer");
  });
  it("passes through text without thinking, trimmed", () => {
    expect(stripThinking("  plain  ")).toBe("plain");
    expect(stripThinking("")).toBe("");
  });
});

describe("parseActions", () => {
  it("extracts a fenced action block and strips it from the prose", () => {
    const text = 'Here are the verses you asked for.\n```action\n{"tool":"verses","term":"نفق","mode":"root"}\n```';
    const { clean, actions } = parseActions(text);
    expect(actions).toEqual([{ tool: "verses", term: "نفق", a: undefined, b: undefined, ref: undefined, mode: "root" }]);
    expect(clean).toBe("Here are the verses you asked for.");
  });

  it("accepts a ```json fence and normalizes occurrences→verses", () => {
    const { actions } = parseActions('```json\n{"tool":"occurrences","term":"رحم","mode":"root"}\n```');
    expect(actions[0].tool).toBe("verses");
    expect(actions[0].mode).toBe("root");
  });

  it("defaults an unknown/absent mode to exact", () => {
    const { actions } = parseActions('```action\n{"tool":"distribution","term":"الله"}\n```');
    expect(actions[0].mode).toBe("exact");
  });

  it("parses a bare {…\"tool\"…} object when unfenced", () => {
    const { actions } = parseActions('Sure. {"tool":"goto","ref":"2:255"}');
    expect(actions[0]).toMatchObject({ tool: "goto", ref: "2:255" });
  });

  it("ignores non-action JSON and malformed blocks", () => {
    expect(parseActions('```json\n{"foo":1}\n```').actions).toEqual([]);
    expect(parseActions('```action\n{not json}\n```').actions).toEqual([]);
  });

  it("dedupes identical actions", () => {
    const t = '```action\n{"tool":"goto","ref":"1:1"}\n```\n```action\n{"tool":"goto","ref":"1:1"}\n```';
    expect(parseActions(t).actions).toHaveLength(1);
  });

  it("handles empty / null input", () => {
    expect(parseActions("")).toEqual({ clean: "", actions: [] });
    expect(parseActions(null)).toEqual({ clean: "", actions: [] });
  });

  it("strips <think> reasoning before parsing/displaying", () => {
    const text = '<think>let me decide</think>\nHere you go.\n```action\n{"tool":"goto","ref":"1:1"}\n```';
    const { clean, actions } = parseActions(text);
    expect(clean).toBe("Here you go.");
    expect(actions[0]).toMatchObject({ tool: "goto", ref: "1:1" });
  });
});

describe("actionLabel", () => {
  it("labels each tool bilingually", () => {
    expect(actionLabel({ tool: "verses", term: "نفق", mode: "root" }, "en")).toContain("All verses");
    expect(actionLabel({ tool: "verses", term: "نفق", mode: "root" }, "ar")).toContain("كل آيات");
    expect(actionLabel({ tool: "goto", ref: "2:255" }, "en")).toContain("2:255");
    expect(actionLabel({ tool: "compare", a: "x", b: "y", mode: "root" }, "en")).toContain("Compare");
  });
});
