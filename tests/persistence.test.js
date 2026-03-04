import { describe, expect, it } from "vitest";
import { loadPersistedState, savePersistedState } from "../src/state/persistence.js";

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

describe("persistence", () => {
  it("loads persisted state safely", () => {
    const localStorageObj = createMemoryStorage({
      responses: JSON.stringify({
        SLOT1: { alternatives: [{ id: "a1", text: "hello" }], selectedId: "a1" },
      }),
      notes: JSON.stringify({ SLOT1: "note" }),
      ui: JSON.stringify({ textSize: "l", companyName: "Beta Co" }),
    });
    const state = {
      responsesBySlot: {},
      notes: {},
      ui: { textSize: "m", companyName: "ACME" },
    };
    loadPersistedState({
      localStorageObj,
      storageKeys: { responses: "responses", notes: "notes", ui: "ui" },
      state,
      textSizes: ["s", "m", "l", "xl"],
      maxAlternatives: 5,
      normalizeCompanyName: (v) => String(v || "").trim() || "ACME",
      nowIso: () => "2026-03-03T00:00:00.000Z",
      createAlternativeId: () => "generated",
    });
    expect(state.responsesBySlot.SLOT1.selectedId).toBe("a1");
    expect(state.notes.SLOT1).toBe("note");
    expect(state.ui.textSize).toBe("l");
    expect(state.ui.companyName).toBe("Beta Co");
  });

  it("saves state payloads", () => {
    const localStorageObj = createMemoryStorage();
    const state = {
      responsesBySlot: { SLOT1: { alternatives: [], selectedId: null } },
      notes: { SLOT1: "n" },
      activeSlotId: "SLOT1",
      ui: { textSize: "m" },
    };
    savePersistedState({
      localStorageObj,
      storageKeys: { responses: "responses", notes: "notes", ui: "ui" },
      state,
      getCompanyName: () => "ACME",
      debugLog: () => {},
    });
    const saved = localStorageObj.dump();
    expect(saved.responses).toContain("SLOT1");
    expect(saved.notes).toContain("SLOT1");
    expect(saved.ui).toContain("ACME");
  });
});
