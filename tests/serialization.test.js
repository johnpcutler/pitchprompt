import { describe, expect, it } from "vitest";
import {
  getResolvedMadlibText,
  getMadlibTextWithAlternativesInline,
} from "../src/domain/serialization.js";
import { replaceDotworkWithCompany } from "../src/domain/utils.js";

describe("serialization", () => {
  const compiled = {
    segments: [
      { type: "text", value: "Hello Dotwork " },
      { type: "slot", id: "A1" },
      { type: "text", value: "." },
    ],
  };
  const prompts = { A1: { shortPrompt: "first name" } };
  const responsesBySlot = {
    A1: {
      alternatives: [{ id: "x", text: "Alicia" }, { id: "y", text: "Ali" }],
      selectedId: "x",
    },
  };
  const getPromptMeta = (slotId) => prompts[slotId] || { shortPrompt: slotId };
  const getSlotResponseState = (slotId) => responsesBySlot[slotId] || { alternatives: [], selectedId: null };

  it("serializes resolved text with short prompt fallback", () => {
    const text = getResolvedMadlibText({
      compiled,
      answersBySlot: { A1: "" },
      getPromptMeta,
      getSlotResponseState,
      companyName: "ACME",
      replaceDotworkWithCompany,
    });
    expect(text).toBe("Hello ACME [first name].");
  });

  it("serializes text with inline alternatives", () => {
    const text = getMadlibTextWithAlternativesInline({
      compiled,
      answersBySlot: { A1: "Alicia" },
      getPromptMeta,
      getSlotResponseState,
      companyName: "ACME",
      replaceDotworkWithCompany,
    });
    expect(text).toBe('Hello ACME [first name: ["Alicia","Ali"]].');
  });
});
