// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { CompareModal } from "./CompareModal.jsx";

afterEach(cleanup);

const w = (s) => ({ orig: s, norm: s, exact: s });
const verseData = {
  "1:1": { s: 1, sn: "س1", a: 1, words: [w("نور"), w("سماء")] },
  "2:3": { s: 2, sn: "س2", a: 3, words: [w("نور"), w("ارض")] },
  "2:9": { s: 2, sn: "س2", a: 9, words: [w("ظلمة"), w("سماء")] },
  "3:1": { s: 3, sn: "س3", a: 1, words: [w("ظلمة"), w("بحر")] },
};
const w2v = { نور: ["1:1", "2:3"], ظلمة: ["2:9", "3:1"], سماء: ["1:1", "2:9"], ارض: ["2:3"], بحر: ["3:1"] };
const indices = { exact: w2v, root: {}, lemma: {} };
const surahList = [{ id: 1, name: "س1" }, { id: 2, name: "س2" }, { id: 3, name: "س3" }];

function renderModal(props = {}) {
  const cmp = { A: { lookup: "نور", label: "نور", mode: "exact" }, B: { lookup: "ظلمة", label: "ظلمة", mode: "exact" } };
  return render(
    <CompareModal cmp={cmp} indices={indices} verseData={verseData} surahList={surahList} stopSet={new Set()}
      precision="loose" onNavigate={() => {}} onPick={() => {}} onClose={() => {}} {...props} />,
  );
}

describe("CompareModal", () => {
  it("renders both terms and splits collocates into shared vs. distinct", () => {
    const { container, getAllByText } = renderModal();
    // Both term labels appear (in the slot headers).
    expect(getAllByText("نور").length).toBeGreaterThan(0);
    expect(getAllByText("ظلمة").length).toBeGreaterThan(0);
    // سماء co-occurs with both → shared; ارض only with نور, بحر only with ظلمة.
    const heads = [...container.querySelectorAll(".ag-cmp-coll-h")].map((e) => e.textContent);
    expect(heads.some((t) => t.startsWith("مشتركة"))).toBe(true);
    // The shared section lists سماء.
    expect(container.textContent).toContain("سماء");
    expect(container.textContent).toContain("ارض");
    expect(container.textContent).toContain("بحر");
  });

  it("does not render the comparison when a slot is empty", () => {
    const { container } = renderModal({ cmp: { A: { lookup: "نور", label: "نور", mode: "exact" }, B: null } });
    expect(container.querySelector(".ag-dist-body")).toBeNull();
    expect(container.querySelector(".ag-hint")).not.toBeNull(); // the "pick two terms" prompt
  });

  it("opens a collocate's occurrences via onPick", () => {
    const onPick = vi.fn();
    const { container } = renderModal({ onPick });
    const tag = [...container.querySelectorAll(".ag-tag-btn")].find((b) => b.textContent.includes("سماء"));
    expect(tag).toBeTruthy();
    fireEvent.click(tag);
    expect(onPick).toHaveBeenCalled();
    expect(onPick.mock.calls[0][0]).toBe("سماء"); // key
  });
});
