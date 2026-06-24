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

  it("codes verses with tags and tallies them", () => {
    const { result } = setup();
    let t1, t2;
    act(() => { t1 = result.current.addTag("شرك في الملك"); });
    act(() => { t2 = result.current.addTag("شرك في العبادة"); });
    act(() => { result.current.toggleTag("17:111", t1); });
    act(() => { result.current.toggleTag("10:18", t2); });
    act(() => { result.current.toggleTag("6:100", t1); });
    expect(result.current.tagsForVerse("17:111")).toEqual([t1]);
    expect(result.current.tagCounts()[t1]).toBe(2);
    act(() => { result.current.toggleTag("17:111", t1); }); // un-tag → drops the key
    expect(result.current.tagsForVerse("17:111")).toEqual([]);
    expect(result.current.tagCounts()[t1]).toBe(1);
    act(() => { result.current.removeTag(t1); }); // removing a tag scrubs its assignments
    expect(result.current.tagCounts()[t1]).toBeUndefined();
    expect(result.current.tags).toHaveLength(1);
  });

  it("builds a claim with supporting/opposing verses", () => {
    const { result } = setup();
    let id;
    act(() => { id = result.current.addClaim("الجنّ والجانّ جنس واحد"); });
    act(() => { result.current.addClaimRef(id, "support", "55:39", "إنسٌ ولا جانّ"); });
    act(() => { result.current.addClaimRef(id, "support", "55:39"); }); // dup → no-op
    act(() => { result.current.addClaimRef(id, "oppose", "18:50", "كان من الجنّ ففسق"); });
    const c = result.current.claims.find((x) => x.id === id);
    expect(c.support).toHaveLength(1);
    expect(c.support[0]).toMatchObject({ vk: "55:39", note: "إنسٌ ولا جانّ" });
    expect(c.oppose).toHaveLength(1);
    act(() => { result.current.removeClaimRef(id, "oppose", "18:50"); });
    expect(result.current.claims.find((x) => x.id === id).oppose).toHaveLength(0);
  });

  it("manages semantic fields (create, add/remove roots, rename)", () => {
    const { result } = setup();
    let f;
    act(() => { f = result.current.addField("نور/ظلمة"); });
    act(() => { result.current.addFieldRoot(f, "نور"); });
    act(() => { result.current.addFieldRoot(f, "ظلم"); });
    act(() => { result.current.addFieldRoot(f, "نور"); }); // dup → no-op
    expect(result.current.fields[0].roots).toEqual(["نور", "ظلم"]);
    act(() => { result.current.removeFieldRoot(f, "نور"); });
    expect(result.current.fields[0].roots).toEqual(["ظلم"]);
    act(() => { result.current.renameField(f, "تباين"); });
    expect(result.current.fields[0].name).toBe("تباين");
  });

  it("groups any artifact and cleans membership on group delete", () => {
    const { result } = setup();
    let g, item, fld;
    act(() => { g = result.current.addGroup("Light/Dark"); });
    act(() => { item = result.current.saveItem({ type: "occ", title: "نور", payload: { lookup: "نور" } }); });
    act(() => { fld = result.current.addField("contrast"); });
    act(() => { result.current.toggleGroupMember("items", item, g); });
    act(() => { result.current.toggleGroupMember("fields", fld, g); });
    expect(result.current.items[0].groups).toContain(g);
    expect(result.current.fields[0].groups).toContain(g);
    act(() => { result.current.toggleGroupMember("items", item, g); }); // toggle off
    expect(result.current.items[0].groups).not.toContain(g);
    act(() => { result.current.removeGroup(g); }); // delete group → scrub from all artifacts
    expect(result.current.groups).toHaveLength(0);
    expect(result.current.fields[0].groups).not.toContain(g);
  });

  it("migrates a legacy qg.fields store into the workspace once", () => {
    localStorage.setItem("qg.fields", JSON.stringify({ fields: [{ id: "old1", name: "legacy", roots: ["قول"], note: "" }] }));
    const { result } = setup();
    expect(result.current.fields.some((f) => f.id === "old1")).toBe(true);
    expect(localStorage.getItem("qg.fields.migrated")).toBe("1");
  });

  it("round-trips tags and claims through export/import", () => {
    const { result } = setup();
    act(() => { result.current.addTag("cat"); });
    act(() => { result.current.addClaim("thesis"); });
    let json;
    act(() => { json = result.current.exportJSON(); });
    act(() => { result.current.clearAll(); });
    expect(result.current.tags).toHaveLength(0);
    expect(result.current.claims).toHaveLength(0);
    act(() => { result.current.importJSON(json); });
    expect(result.current.tags).toHaveLength(1);
    expect(result.current.claims).toHaveLength(1);
  });
});
