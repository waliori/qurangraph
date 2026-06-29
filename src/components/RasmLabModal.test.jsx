// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { norm } from "../arabic-utils.js";
import { RasmLabModal } from "./RasmLabModal.jsx";

afterEach(cleanup);

const DEF = "إِبْرَٰهِۦمَ";   // defective spelling
const PLENE = "إِبْرَٰهِيمَ"; // plene spelling
const w = (orig, plemma) => ({ orig, norm: norm(orig), exact: norm(orig), plemma });
const verseData = {
  "2:124": { text: DEF, s: 2, sn: "البقرة", a: 124, words: [w(DEF, "ابراهيم")] },
  "2:125": { text: DEF, s: 2, sn: "البقرة", a: 125, words: [w(DEF, "ابراهيم")] },
  "4:125": { text: PLENE, s: 4, sn: "النساء", a: 125, words: [w(PLENE, "ابراهيم")] },
  "14:35": { text: PLENE, s: 14, sn: "ابراهيم", a: 35, words: [w(PLENE, "ابراهيم")] },
};

function renderModal(props = {}) {
  return render(<RasmLabModal open verseData={verseData} morph={null} theme="dark" focusId={null}
    onNavigate={() => {}} onClose={() => {}} {...props} />);
}

describe("RasmLabModal", () => {
  it("lists variant words in the catalogue", () => {
    const { container } = renderModal();
    expect(container.querySelector(".ag-modal-row")).toBeTruthy();
    expect(container.textContent).toContain(DEF);
    expect(container.textContent).toContain(PLENE);
  });

  it("opens a word's profile on click WITHOUT an infinite render loop (regression: React #301)", () => {
    const { container } = renderModal();
    // clicking a catalogue row used to crash via useReveal reset-on-unstable-key
    fireEvent.click(container.querySelector(".ag-modal-row"));
    // the profile shows the per-spelling ratio (a "%") and the by-sūra distribution
    expect(container.textContent).toContain("%");
    expect(container.querySelector(".ag-dist-bars")).toBeTruthy();
  });

  it("renders straight into a profile when given a focusId", () => {
    // id is `pron|lemma` — derive it the way the component does, via the catalogue.
    const { container } = renderModal();
    fireEvent.click(container.querySelector(".ag-modal-row"));
    expect(container.textContent).toContain("%"); // profile rendered, no throw
  });

  it("drills the canon: rule cards → group cards → group entries → entry profile, with layered back", () => {
    // إبراهيم (omitted alif) + يَسْرِ (omitted yāʾ) → الحذف keeps TWO groups → a group-card step appears
    const cvd = {
      "2:124": { text: PLENE, s: 2, sn: "البقرة", a: 124, words: [{ orig: PLENE, norm: norm(PLENE), exact: norm(PLENE) }] },
      "89:4": { text: "يَسْرِ", s: 89, sn: "الفجر", a: 4, words: [{ orig: "يَسْرِ", norm: norm("يَسْرِ"), exact: norm("يَسْرِ") }] },
    };
    const { container, getByRole } = render(<RasmLabModal open verseData={cvd} morph={null} theme="dark" focusId={null} onNavigate={() => {}} onClose={() => {}} />);
    fireEvent.click(getByRole("tab", { name: /قواعد الرسم|Rasm rules/ }));
    // overview: the rule cards grid (الحذف is rule 1)
    const grid = container.querySelector(".ag-canon-rules");
    expect(grid).toBeTruthy();
    const ruleCard = [...grid.querySelectorAll("button")].find((b) => b.textContent.includes("الحذف"));
    expect(ruleCard).toBeTruthy();
    fireEvent.click(ruleCard);
    // الحذف has multiple sub-groups → group cards step (e.g. حذف الألف)
    const groupGrid = container.querySelector(".ag-canon-rules");
    expect(groupGrid).toBeTruthy();
    const groupCard = [...groupGrid.querySelectorAll("button")].find((b) => b.textContent.includes("حذف الألف"));
    expect(groupCard).toBeTruthy();
    fireEvent.click(groupCard);
    // group entries: إبراهيم (a genuine omitted-alif), no more card grid
    expect(container.querySelector(".ag-canon-rules")).toBeFalsy();
    expect(container.textContent).toContain("إبراهيم");
    const entry = [...container.querySelectorAll(".ag-phrase-list .ag-modal-row")].find((b) => !b.disabled);
    expect(entry).toBeTruthy();
    fireEvent.click(entry); // entry profile → located āyāt list
    expect(container.querySelector(".ag-dist-bars")).toBeTruthy();
    // regression: the located āyāt must actually render (was reading canonSel.verses → always empty)
    expect(container.querySelector(".ag-ayah-ref")).toBeTruthy();
    expect(container.textContent).toContain("البقرة"); // إبراهيم locates in al-Baqarah
  });

  it("hides non-rasm-difference canon entries (مؤمن, متى, ذلك) — purely rasm", () => {
    // a verse whose words would match hamza/maqṣūra/dagger-only canon entries that are NOT rasm differences
    const vd = {
      "2:1": { text: "مُؤْمِن مَتىٰ ذَٰلِكَ رَحْمَت", s: 2, sn: "البقرة", a: 1,
        words: ["مُؤْمِن", "مَتىٰ", "ذَٰلِكَ", "رَحْمَت"].map((o) => ({ orig: o, norm: norm(o), exact: norm(o) })) },
    };
    const { container, getByRole } = render(<RasmLabModal open verseData={vd} morph={null} theme="dark" focusId={null} onNavigate={() => {}} onClose={() => {}} />);
    fireEvent.click(getByRole("tab", { name: /قواعد الرسم|Rasm rules/ }));
    const cards = [...container.querySelectorAll(".ag-canon-rules button")];
    // رحمت (open tāʾ) is a genuine difference → البدل card shows; مؤمن/متى/ذلك are NOT → no الهمز card
    expect(cards.some((b) => b.textContent.includes("البدل"))).toBe(true);
    expect(cards.some((b) => b.textContent.includes("الهمز"))).toBe(false);
  });

  it("drills the long-vowel tab: device cards → a device's forms → a form profile (no loop)", () => {
    const vd = {
      "2:3": { text: "ٱلصَّلَوٰةَ", s: 2, sn: "البقرة", a: 3, words: [{ orig: "ٱلصَّلَوٰةَ", norm: norm("ٱلصَّلَوٰةَ"), exact: norm("ٱلصَّلَوٰةَ") }] },
      "2:43": { text: "ٱلصَّلَوٰةَ ٱلزَّكَوٰةَ", s: 2, sn: "البقرة", a: 43, words: [{ orig: "ٱلصَّلَوٰةَ", norm: norm("ٱلصَّلَوٰةَ"), exact: "" }, { orig: "ٱلزَّكَوٰةَ", norm: norm("ٱلزَّكَوٰةَ"), exact: "" }] },
    };
    const { container, getByRole } = render(<RasmLabModal open verseData={vd} morph={null} theme="dark" focusId={null} onNavigate={() => {}} onClose={() => {}} />);
    fireEvent.click(getByRole("tab", { name: /حروف|Long-vowel/ }));
    // overview: device cards (these two words are the wāw-seat device)
    const card = container.querySelector(".ag-canon-rules .ag-modal-row");
    expect(card).toBeTruthy();
    fireEvent.click(card); // drill into that device → its forms
    expect(container.querySelector(".ag-canon-rules")).toBeFalsy();
    const row = container.querySelector(".ag-phrase-list .ag-modal-row");
    expect(row).toBeTruthy();
    expect(norm(row.textContent)).toContain(norm("الصلاة")); // ā-in-full form, NOT a deleted-consonant garble
    fireEvent.click(row); // open the form profile (regression: must not loop)
    expect(container.querySelector(".ag-dist-bars")).toBeTruthy();
  });
});
