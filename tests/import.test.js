import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { normalizeLoadedResponses } from "../src/domain/alternatives.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "sample-export.json");
const hasFixture = existsSync(fixturePath);
const fixture = hasFixture ? JSON.parse(readFileSync(fixturePath, "utf8")) : null;

const MAX_ALTERNATIVES = 5;
let altIdCounter = 0;
const createAlternativeId = () => `test-alt-${++altIdCounter}`;
const nowIso = () => "2026-01-01T00:00:00.000Z";

// ─── Always-on: validation logic with synthetic payloads ──────────────────────

describe("import validation — synthetic", () => {
  it("rejects null payload", () => {
    expect(isValidPayload(null)).toBe(false);
  });

  it("rejects non-object payload (string)", () => {
    expect(isValidPayload("not an object")).toBe(false);
  });

  it("rejects array payload", () => {
    expect(isValidPayload([])).toBe(false);
  });

  it("rejects payload missing responsesBySlot", () => {
    expect(isValidPayload({ notes: {}, companyName: "ACME" })).toBe(false);
  });

  it("accepts minimal valid payload", () => {
    expect(isValidPayload({ responsesBySlot: {} })).toBe(true);
  });

  it("normalizeLoadedResponses handles empty responsesBySlot", () => {
    const result = normalizeLoadedResponses({}, { createAlternativeId, nowIso, maxAlternatives: MAX_ALTERNATIVES });
    expect(result).toEqual({});
  });

  it("normalizeLoadedResponses coerces missing id to a generated value", () => {
    const raw = {
      S1: {
        alternatives: [{ text: "hello" }],
        selectedId: null,
      },
    };
    const result = normalizeLoadedResponses(raw, { createAlternativeId, nowIso, maxAlternatives: MAX_ALTERNATIVES });
    expect(result.S1.alternatives[0].id).toMatch(/^test-alt-/);
    expect(result.S1.alternatives[0].text).toBe("hello");
  });

  it("normalizeLoadedResponses enforces MAX_ALTERNATIVES cap", () => {
    const alternatives = Array.from({ length: 8 }, (_, i) => ({
      id: `id-${i}`,
      text: `option ${i}`,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
    const raw = { S1: { alternatives, selectedId: "id-0" } };
    const result = normalizeLoadedResponses(raw, { createAlternativeId, nowIso, maxAlternatives: MAX_ALTERNATIVES });
    expect(result.S1.alternatives.length).toBe(MAX_ALTERNATIVES);
  });

  it("normalizeLoadedResponses falls back selectedId to first alternative when invalid", () => {
    const raw = {
      S1: {
        alternatives: [{ id: "alt-a", text: "Alpha", createdAt: nowIso(), updatedAt: nowIso() }],
        selectedId: "non-existent-id",
      },
    };
    const result = normalizeLoadedResponses(raw, { createAlternativeId, nowIso, maxAlternatives: MAX_ALTERNATIVES });
    expect(result.S1.selectedId).toBe("alt-a");
  });

  it("normalizeLoadedResponses ignores non-object slot entries", () => {
    const raw = { S1: null, S2: "bad", S3: { alternatives: [], selectedId: null } };
    const result = normalizeLoadedResponses(raw, { createAlternativeId, nowIso, maxAlternatives: MAX_ALTERNATIVES });
    expect(result.S1).toBeUndefined();
    expect(result.S2).toBeUndefined();
    expect(result.S3).toBeDefined();
  });

  it("notes normalization coerces values to strings", () => {
    const notes = applyNotesFromPayload({ notes: { S1: 42, S2: null, S3: "real note" } });
    expect(notes.S1).toBe("42");
    expect(notes.S2).toBe("");
    expect(notes.S3).toBe("real note");
  });

  it("notes normalization skips array payload", () => {
    const notes = applyNotesFromPayload({ notes: ["bad"] });
    expect(notes).toEqual({});
  });
});

// ─── Fixture-gated: real export data ─────────────────────────────────────────

describe.skipIf(!hasFixture)("import — real fixture (sample-export.json)", () => {
  it("fixture has all required top-level keys", () => {
    expect(fixture).toHaveProperty("generatedAt");
    expect(fixture).toHaveProperty("companyName");
    expect(fixture).toHaveProperty("slotOrder");
    expect(fixture).toHaveProperty("responsesBySlot");
    expect(fixture).toHaveProperty("notes");
  });

  it("isValidPayload returns true for the fixture", () => {
    expect(isValidPayload(fixture)).toBe(true);
  });

  it("slotOrder contains 96 entries", () => {
    expect(fixture.slotOrder).toHaveLength(96);
  });

  it("companyName is ACME", () => {
    expect(fixture.companyName).toBe("ACME");
  });

  it("normalizeLoadedResponses preserves all filled slots", () => {
    const result = normalizeLoadedResponses(fixture.responsesBySlot, {
      createAlternativeId,
      nowIso,
      maxAlternatives: MAX_ALTERNATIVES,
    });
    const filledSlots = Object.keys(result).filter(
      (id) => result[id].alternatives.length > 0
    );
    expect(filledSlots.length).toBeGreaterThan(0);
  });

  it("every slot's selectedId exists in its alternatives array", () => {
    const result = normalizeLoadedResponses(fixture.responsesBySlot, {
      createAlternativeId,
      nowIso,
      maxAlternatives: MAX_ALTERNATIVES,
    });
    Object.entries(result).forEach(([slotId, slotState]) => {
      if (slotState.alternatives.length === 0) return;
      const ids = slotState.alternatives.map((a) => a.id);
      expect(ids, `slot ${slotId} selectedId not in alternatives`).toContain(slotState.selectedId);
    });
  });

  it("SHKLX2 (First Name) has multiple alternatives", () => {
    const result = normalizeLoadedResponses(fixture.responsesBySlot, {
      createAlternativeId,
      nowIso,
      maxAlternatives: MAX_ALTERNATIVES,
    });
    expect(result["SHKLX2"].alternatives.length).toBeGreaterThanOrEqual(2);
  });

  it("all alternatives have non-empty id, text, createdAt, updatedAt", () => {
    const result = normalizeLoadedResponses(fixture.responsesBySlot, {
      createAlternativeId,
      nowIso,
      maxAlternatives: MAX_ALTERNATIVES,
    });
    Object.values(result).forEach((slotState) => {
      slotState.alternatives.forEach((alt) => {
        expect(alt.id).toBeTruthy();
        expect(typeof alt.text).toBe("string");
        expect(alt.createdAt).toBeTruthy();
        expect(alt.updatedAt).toBeTruthy();
      });
    });
  });
});

// ─── Helpers (mirror the logic in importFromJson) ────────────────────────────

function isValidPayload(payload) {
  return (
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "responsesBySlot" in payload
  );
}

function applyNotesFromPayload(payload) {
  const notes = {};
  if (
    payload.notes &&
    typeof payload.notes === "object" &&
    !Array.isArray(payload.notes)
  ) {
    Object.entries(payload.notes).forEach(([slotId, note]) => {
      notes[String(slotId)] = String(note || "");
    });
  }
  return notes;
}
