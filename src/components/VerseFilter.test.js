import { describe, it, expect } from "vitest";
import { filterVerseKeys } from "./VerseFilter.jsx";

const keys = ["2:1", "2:5", "2:10", "3:1", "3:7", "114:3"];

describe("filterVerseKeys", () => {
  it("returns all when no filter", () => {
    expect(filterVerseKeys(keys, { surah: 0, aya: "" })).toEqual(keys);
  });
  it("filters by sūra", () => {
    expect(filterVerseKeys(keys, { surah: 2, aya: "" })).toEqual(["2:1", "2:5", "2:10"]);
  });
  it("filters by exact āya", () => {
    expect(filterVerseKeys(keys, { surah: 0, aya: "1" })).toEqual(["2:1", "3:1"]);
  });
  it("filters by āya range", () => {
    expect(filterVerseKeys(keys, { surah: 2, aya: "1-5" })).toEqual(["2:1", "2:5"]);
  });
  it("normalises a reversed range", () => {
    expect(filterVerseKeys(keys, { surah: 2, aya: "5-1" })).toEqual(["2:1", "2:5"]);
  });
  it("combines sūra + āya", () => {
    expect(filterVerseKeys(keys, { surah: 3, aya: "7" })).toEqual(["3:7"]);
  });
  it("ignores a malformed āya filter", () => {
    expect(filterVerseKeys(keys, { surah: 0, aya: "abc" })).toEqual(keys);
  });
});
