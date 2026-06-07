// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { WorkspaceProvider, useWorkspace } from "./useWorkspace.js";

const wrapper = ({ children }) => <WorkspaceProvider>{children}</WorkspaceProvider>;
const setup = () => renderHook(() => useWorkspace(), { wrapper });

describe("useWorkspace", () => {
  beforeEach(() => localStorage.clear());

  it("saves items and notes", () => {
    const { result } = setup();
    act(() => { result.current.saveItem({ type: "compare", title: "A vs B", payload: { a: "x", b: "y" } }); });
    act(() => { result.current.addNote({ title: "finding", body: "interesting" }); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].type).toBe("compare");
    expect(result.current.notes[0].title).toBe("finding");
  });

  it("dedupes an identical save and bumps it to the top", () => {
    const { result } = setup();
    act(() => { result.current.saveItem({ type: "occ", title: "نور", payload: { lookup: "نور", mode: "exact" } }); });
    act(() => { result.current.saveItem({ type: "dist", title: "x", payload: { lookup: "x" } }); });
    act(() => { result.current.saveItem({ type: "occ", title: "نور (again)", payload: { lookup: "نور", mode: "exact" } }); });
    expect(result.current.items).toHaveLength(2); // not 3 — the occ was deduped
    expect(result.current.items[0].type).toBe("occ"); // bumped to top
  });

  it("updates, removes, and reorders items", () => {
    const { result } = setup();
    let id;
    act(() => { result.current.saveItem({ type: "graph", title: "g1", payload: { url: "#a" } }); });
    act(() => { id = result.current.saveItem({ type: "graph", title: "g2", payload: { url: "#b" } }); });
    act(() => { result.current.updateItem(id, { title: "renamed" }); });
    expect(result.current.items.find((x) => x.id === id).title).toBe("renamed");
    // g2 is at index 0 (saved last); move it down → index 1.
    act(() => { result.current.moveItem(id, 1); });
    expect(result.current.items[1].id).toBe(id);
    act(() => { result.current.removeItem(id); });
    expect(result.current.items.find((x) => x.id === id)).toBeUndefined();
  });

  it("exports and imports JSON (replace and merge)", () => {
    const { result } = setup();
    act(() => { result.current.saveItem({ type: "verse", title: "2:255", payload: { surah: 2, ayah: 255 } }); });
    let json;
    act(() => { json = result.current.exportJSON(); });
    act(() => { result.current.clearAll(); });
    expect(result.current.items).toHaveLength(0);
    act(() => { result.current.importJSON(json); });
    expect(result.current.items).toHaveLength(1);
    act(() => { result.current.importJSON(json, { merge: true }); });
    expect(result.current.items).toHaveLength(2);
    act(() => { expect(result.current.importJSON("not json")).toBe(false); });
  });

  it("persists across remounts via localStorage", () => {
    const first = setup();
    act(() => { first.result.current.saveItem({ type: "word", title: "w", payload: { key: "k" } }); });
    first.unmount();
    const second = setup();
    expect(second.result.current.items).toHaveLength(1);
  });
});
