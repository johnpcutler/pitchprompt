export function getSlotExportLabel(slotId, getPromptMeta) {
  const shortPrompt = String(getPromptMeta(slotId).shortPrompt || "").trim();
  return shortPrompt || slotId;
}

export function getSlotAlternativeTexts(slotId, getSlotResponseState) {
  const slotState = getSlotResponseState(slotId);
  return slotState.alternatives
    .map((alternative) => String(alternative?.text || "").trim())
    .filter((value) => value.length > 0);
}

export function getMadlibText({
  compiled,
  answersBySlot,
  getPromptMeta,
  getSlotResponseState,
  companyName,
  replaceDotworkWithCompany,
  withAlternativesInline = false,
}) {
  if (!compiled || !Array.isArray(compiled.segments)) return "";

  return compiled.segments
    .map((segment) => {
      if (segment.type === "text") {
        return replaceDotworkWithCompany(segment.value, companyName);
      }
      const slotId = String(segment.id || "");
      const value = String(answersBySlot?.[slotId] || "").trim();
      const shortPrompt = getSlotExportLabel(slotId, getPromptMeta);

      if (!withAlternativesInline) {
        return value || `[${shortPrompt}]`;
      }

      const alternatives = getSlotAlternativeTexts(slotId, getSlotResponseState);
      const arrayValues = [];
      if (value) arrayValues.push(value);
      alternatives.forEach((altText) => {
        if (!arrayValues.includes(altText)) arrayValues.push(altText);
      });
      if (!arrayValues.length) return `[${shortPrompt}]`;
      return `[${shortPrompt}: ${JSON.stringify(arrayValues)}]`;
    })
    .join("");
}

export function getResolvedMadlibText(input) {
  return getMadlibText({ ...input, withAlternativesInline: false });
}

export function getMadlibTextWithAlternativesInline(input) {
  return getMadlibText({ ...input, withAlternativesInline: true });
}
