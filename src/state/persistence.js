import { normalizeLoadedResponses } from "../domain/alternatives.js";

export function parseJsonStorage(localStorageObj, key, fallback) {
  try {
    const raw = localStorageObj.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

export function savePersistedState({
  localStorageObj,
  storageKeys,
  state,
  getCompanyName,
  debugLog = () => {},
}) {
  try {
    debugLog("savePersistedState", {
      responseSlotCount: Object.keys(state.responsesBySlot || {}).length,
      noteSlotCount: Object.keys(state.notes || {}).length,
      activeSlotId: state.activeSlotId,
    });
    localStorageObj.setItem(storageKeys.responses, JSON.stringify(state.responsesBySlot));
    localStorageObj.setItem(storageKeys.notes, JSON.stringify(state.notes));
    localStorageObj.setItem(
      storageKeys.ui,
      JSON.stringify({
        textSize: state.ui.textSize,
        companyName: getCompanyName(),
      })
    );
  } catch (error) {
    debugLog("savePersistedState:error", { message: error?.message || String(error) });
  }
}

export function loadPersistedState({
  localStorageObj,
  storageKeys,
  state,
  textSizes,
  maxAlternatives,
  normalizeCompanyName,
  nowIso,
  createAlternativeId,
}) {
  const rawResponses = parseJsonStorage(localStorageObj, storageKeys.responses, {});
  const rawNotes = parseJsonStorage(localStorageObj, storageKeys.notes, {});
  const rawUi = parseJsonStorage(localStorageObj, storageKeys.ui, {});

  state.responsesBySlot = normalizeLoadedResponses(rawResponses, {
    createAlternativeId,
    nowIso,
    maxAlternatives,
  });

  const normalizedNotes = {};
  if (rawNotes && typeof rawNotes === "object" && !Array.isArray(rawNotes)) {
    Object.entries(rawNotes).forEach(([slotId, note]) => {
      normalizedNotes[String(slotId)] = String(note || "");
    });
  }
  state.notes = normalizedNotes;

  state.ui.textSize =
    rawUi && typeof rawUi === "object" && textSizes.includes(rawUi.textSize) ? rawUi.textSize : "m";
  state.ui.companyName =
    rawUi && typeof rawUi === "object" ? normalizeCompanyName(rawUi.companyName) : "ACME";
}
