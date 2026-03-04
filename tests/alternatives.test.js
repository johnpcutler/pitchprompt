import { describe, expect, it } from "vitest";
import {
  ensureSlotResponseState,
  createAlternativeRecord,
  upsertSelectedAlternativeRecord,
  deleteAlternativeRecord,
  cycleAlternativeSelection,
  setSelectedAlternativeId,
  getSelectedAlternative,
} from "../src/domain/alternatives.js";

function fixedClock() {
  return "2026-03-03T00:00:00.000Z";
}

describe("alternatives domain", () => {
  it("creates and selects alternatives", () => {
    const responsesBySlot = {};
    const result = createAlternativeRecord({
      responsesBySlot,
      slotId: "S1",
      initialText: "alpha",
      maxAlternatives: 5,
      createAlternativeId: () => "alt-1",
      nowIso: fixedClock,
    });
    expect(result.ok).toBe(true);
    expect(getSelectedAlternative(responsesBySlot, "S1")?.text).toBe("alpha");
  });

  it("upserts selected alternative text", () => {
    const responsesBySlot = {
      S1: { alternatives: [{ id: "a1", text: "old", createdAt: fixedClock(), updatedAt: fixedClock() }], selectedId: "a1" },
    };
    const result = upsertSelectedAlternativeRecord({
      responsesBySlot,
      slotId: "S1",
      draftText: "new",
      maxAlternatives: 5,
      createAlternativeId: () => "a2",
      nowIso: fixedClock,
    });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
    expect(getSelectedAlternative(responsesBySlot, "S1")?.text).toBe("new");
  });

  it("cycles and deletes alternatives", () => {
    const responsesBySlot = {
      S1: {
        alternatives: [
          { id: "a1", text: "one", createdAt: fixedClock(), updatedAt: fixedClock() },
          { id: "a2", text: "two", createdAt: fixedClock(), updatedAt: fixedClock() },
        ],
        selectedId: "a1",
      },
    };
    expect(cycleAlternativeSelection(responsesBySlot, "S1", 1)).toBe("a2");
    expect(setSelectedAlternativeId(responsesBySlot, "S1", "a2")).toBe(true);
    expect(deleteAlternativeRecord(responsesBySlot, "S1", "a2")).toBe(true);
    expect(ensureSlotResponseState(responsesBySlot, "S1").selectedId).toBe("a1");
  });
});
