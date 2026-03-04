import { escapeHtml } from "../domain/utils.js";

export function renderSidebar({
  state,
  elements,
  maxAlternatives,
  getPromptMeta,
  getSlotResponseState,
  setSelectedAlternative,
  deleteAlternative,
  updateProgress,
  renderMadlib,
  savePersistedState,
}) {
  const slotId = state.activeSlotId;
  const container = elements.slotDetails;

  if (!slotId) {
    container.innerHTML = `
      <p class="rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
        Click any blank in the document to edit it inline and view details here.
      </p>
    `;
    return;
  }

  const meta = getPromptMeta(slotId);
  const slotResponses = getSlotResponseState(slotId);
  const noteValue = String(state.notes[slotId] || "");
  const examplesMarkup = meta.examples.length
    ? `<ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">${meta.examples
        .map((example) => `<li>${escapeHtml(example)}</li>`)
        .join("")}</ul>`
    : '<p class="text-sm text-slate-500">No examples provided yet.</p>';

  const alternativesMarkup = slotResponses.alternatives.length
    ? slotResponses.alternatives
        .map((alt, idx) => {
          const preview = alt.text.trim() || "(empty response)";
          return `<div class="alt-row ${slotResponses.selectedId === alt.id ? "is-selected" : ""}">
            <button
              type="button"
              data-alt-id="${escapeHtml(alt.id)}"
              class="alt-row-select"
            >
              <span class="alt-row-index">Alt ${idx + 1}</span>
              <span class="alt-row-preview">${escapeHtml(preview)}</span>
            </button>
            <button
              type="button"
              data-delete-alt-id="${escapeHtml(alt.id)}"
              class="alt-row-delete"
              aria-label="Delete alternative ${idx + 1}"
            >
              Delete
            </button>
          </div>`;
        })
        .join("")
    : '<p class="text-sm text-slate-500">No saved alternatives yet. Start typing in the document.</p>';

  container.innerHTML = `
    <div class="space-y-4">
      <div class="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="prompt-short-header">${escapeHtml(meta.shortPrompt)}</h3>
          </div>
        </div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
        <p class="mt-1 text-sm text-slate-800">${escapeHtml(meta.sentenceLength)}</p>
      </div>
      <div>
        <div class="mb-2 flex items-center justify-between">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Alternatives</p>
          <span class="text-xs text-slate-500">${slotResponses.alternatives.length}/${maxAlternatives}</span>
        </div>
        <div id="altList" class="space-y-2">${alternativesMarkup}</div>
      </div>
      <div>
        <p id="sidebarMsg" class="mt-2 text-xs ${
          state.ui.sidebarMessageTone === "success" ? "text-emerald-600" : "text-amber-600"
        }">${escapeHtml(
          state.ui.sidebarMessage || ""
        )}</p>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Detailed Guidance</p>
        <p class="mt-1 text-sm text-slate-800">${escapeHtml(meta.description)}</p>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Examples</p>
        <div class="mt-1">${examplesMarkup}</div>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
        <textarea
          id="slotNoteInput"
          class="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          rows="4"
          placeholder="Add notes for this prompt..."
        >${escapeHtml(noteValue)}</textarea>
      </div>
    </div>
  `;

  const altButtons = document.querySelectorAll("#altList [data-alt-id]");
  const deleteButtons = document.querySelectorAll("#altList [data-delete-alt-id]");

  altButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const altId = button.getAttribute("data-alt-id");
      if (!altId) return;
      setSelectedAlternative(slotId, altId);
      updateProgress();
      renderSidebar({
        state,
        elements,
        maxAlternatives,
        getPromptMeta,
        getSlotResponseState,
        setSelectedAlternative,
        deleteAlternative,
        updateProgress,
        renderMadlib,
        savePersistedState,
      });
      renderMadlib();
    });
  });

  deleteButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const altId = button.getAttribute("data-delete-alt-id");
      if (!altId) return;
      const deleted = deleteAlternative(slotId, altId);
      if (!deleted) return;
      updateProgress();
      renderSidebar({
        state,
        elements,
        maxAlternatives,
        getPromptMeta,
        getSlotResponseState,
        setSelectedAlternative,
        deleteAlternative,
        updateProgress,
        renderMadlib,
        savePersistedState,
      });
      renderMadlib();
    });
  });

  const slotNoteInput = document.querySelector("#slotNoteInput");
  slotNoteInput?.addEventListener("input", () => {
    state.notes[slotId] = slotNoteInput.value;
    savePersistedState();
  });
}
