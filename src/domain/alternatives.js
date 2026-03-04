export function ensureSlotResponseState(responsesBySlot, slotId) {
  if (!responsesBySlot[slotId]) {
    responsesBySlot[slotId] = { alternatives: [], selectedId: null };
  }
  return responsesBySlot[slotId];
}

export function getSelectedAlternative(responsesBySlot, slotId) {
  const slotState = ensureSlotResponseState(responsesBySlot, slotId);
  if (!slotState.selectedId) return null;
  return slotState.alternatives.find((alt) => alt.id === slotState.selectedId) || null;
}

export function syncAnswerForSlot(state, slotId) {
  state.answers[slotId] = getSelectedAlternative(state.responsesBySlot, slotId)?.text || "";
}

export function syncAllAnswersFromResponses(state, slotOrder) {
  state.answers = {};
  (Array.isArray(slotOrder) ? slotOrder : []).forEach((slotId) => {
    syncAnswerForSlot(state, slotId);
  });
}

export function setSelectedAlternativeId(responsesBySlot, slotId, altId) {
  const slotState = ensureSlotResponseState(responsesBySlot, slotId);
  if (!slotState.alternatives.some((alt) => alt.id === altId)) return false;
  slotState.selectedId = altId;
  return true;
}

export function createAlternativeRecord({
  responsesBySlot,
  slotId,
  initialText = "",
  maxAlternatives,
  createAlternativeId,
  nowIso,
}) {
  const slotState = ensureSlotResponseState(responsesBySlot, slotId);
  if (slotState.alternatives.length >= maxAlternatives) {
    return { ok: false, reason: "max_alternatives" };
  }
  const alternative = {
    id: createAlternativeId(),
    text: String(initialText || ""),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  slotState.alternatives.push(alternative);
  slotState.selectedId = alternative.id;
  return { ok: true, alternative };
}

export function upsertSelectedAlternativeRecord({
  responsesBySlot,
  slotId,
  draftText,
  maxAlternatives,
  createAlternativeId,
  nowIso,
}) {
  const slotState = ensureSlotResponseState(responsesBySlot, slotId);
  const selected = getSelectedAlternative(responsesBySlot, slotId);
  const text = String(draftText || "");

  if (selected) {
    selected.text = text;
    selected.updatedAt = nowIso();
    return { ok: true, created: false, selectedId: selected.id };
  }

  if (slotState.alternatives.length >= maxAlternatives) {
    return { ok: false, reason: "max_alternatives" };
  }

  const alternative = {
    id: createAlternativeId(),
    text,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  slotState.alternatives.push(alternative);
  slotState.selectedId = alternative.id;
  return { ok: true, created: true, selectedId: alternative.id };
}

export function deleteAlternativeRecord(responsesBySlot, slotId, altId) {
  const slotState = ensureSlotResponseState(responsesBySlot, slotId);
  const currentIndex = slotState.alternatives.findIndex((alt) => alt.id === altId);
  if (currentIndex < 0) return false;
  slotState.alternatives.splice(currentIndex, 1);
  const stillSelected = slotState.alternatives.some((alt) => alt.id === slotState.selectedId);
  if (!stillSelected) {
    slotState.selectedId = slotState.alternatives[0]?.id || null;
  }
  return true;
}

export function cycleAlternativeSelection(responsesBySlot, slotId, direction) {
  const slotState = ensureSlotResponseState(responsesBySlot, slotId);
  if (!slotState.alternatives.length) return null;
  const currentIndex = slotState.alternatives.findIndex((alt) => alt.id === slotState.selectedId);
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (startIndex + direction + slotState.alternatives.length) % slotState.alternatives.length;
  const nextAlternative = slotState.alternatives[nextIndex];
  if (!nextAlternative) return null;
  slotState.selectedId = nextAlternative.id;
  return nextAlternative.id;
}

export function normalizeLoadedResponses(rawResponses, { createAlternativeId, nowIso, maxAlternatives }) {
  const normalizedResponses = {};
  if (!rawResponses || typeof rawResponses !== "object" || Array.isArray(rawResponses)) {
    return normalizedResponses;
  }

  Object.entries(rawResponses).forEach(([slotId, slotState]) => {
    if (!slotState || typeof slotState !== "object") return;
    const alternativesRaw = Array.isArray(slotState.alternatives) ? slotState.alternatives : [];
    const alternatives = alternativesRaw
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id || createAlternativeId()),
        text: String(item.text || ""),
        createdAt: String(item.createdAt || nowIso()),
        updatedAt: String(item.updatedAt || nowIso()),
      }))
      .slice(0, maxAlternatives);

    const selectedId = String(slotState.selectedId || "");
    normalizedResponses[slotId] = {
      alternatives,
      selectedId: alternatives.some((alt) => alt.id === selectedId) ? selectedId : alternatives[0]?.id || null,
    };
  });

  return normalizedResponses;
}
