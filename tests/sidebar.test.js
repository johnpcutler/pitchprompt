import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderSidebar } from "../src/ui/sidebar.js";

describe("renderSidebar", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="slotDetails"></div><div id="madlibContainer"></div>';
  });

  it("renders empty state when no active slot", () => {
    const state = { activeSlotId: null, notes: {}, ui: { sidebarMessageTone: "warning", sidebarMessage: "" } };
    renderSidebar({
      state,
      elements: { slotDetails: document.querySelector("#slotDetails") },
      maxAlternatives: 5,
      getPromptMeta: () => ({ shortPrompt: "x", sentenceLength: "", description: "", examples: [] }),
      getSlotResponseState: () => ({ alternatives: [], selectedId: null }),
      setSelectedAlternative: vi.fn(),
      deleteAlternative: vi.fn(),
      updateProgress: vi.fn(),
      renderMadlib: vi.fn(),
      savePersistedState: vi.fn(),
    });
    expect(document.querySelector("#slotDetails").textContent).toContain("Click any blank");
  });

  it("renders slot metadata and alternatives", () => {
    const state = {
      activeSlotId: "S1",
      notes: { S1: "note" },
      ui: { sidebarMessageTone: "success", sidebarMessage: "Updated" },
    };
    renderSidebar({
      state,
      elements: { slotDetails: document.querySelector("#slotDetails") },
      maxAlternatives: 5,
      getPromptMeta: () => ({
        shortPrompt: "first name",
        sentenceLength: "1 sentence",
        description: "Guidance",
        examples: ["Alice", "Bob"],
      }),
      getSlotResponseState: () => ({
        alternatives: [{ id: "a1", text: "Alice" }],
        selectedId: "a1",
      }),
      setSelectedAlternative: vi.fn(),
      deleteAlternative: vi.fn(),
      updateProgress: vi.fn(),
      renderMadlib: vi.fn(),
      savePersistedState: vi.fn(),
    });
    const text = document.querySelector("#slotDetails").textContent;
    expect(text).toContain("first name");
    expect(text).toContain("Alternatives");
    expect(text).toContain("Updated");
  });
});
