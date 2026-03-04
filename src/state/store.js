export const DATA_PATHS = {
  compiled: "./data/madlib.compiled.json",
  prompts: "./data/prompts.json",
};

export const STORAGE_KEYS = {
  responses: "madlib.responses.v1",
  notes: "madlib.notes.v1",
  ui: "madlib.ui.v1",
};

export const MAX_ALTERNATIVES = 5;
export const TEXT_SIZES = ["s", "m", "l", "xl"];
export const SIDEBAR_DRAFT_REFRESH_MS = 900;

export function createInitialState() {
  return {
    compiled: null,
    prompts: {},
    answers: {},
    notes: {},
    responsesBySlot: {},
    activeSlotId: null,
    ui: {
      sidebarMessage: "",
      sidebarMessageTone: "warning",
      editorMode: "selected",
      inlineDraftBySlot: {},
      inlineFocusSlotId: null,
      inlineComposingBySlot: {},
      inlineSkipBlurCommitSlotId: null,
      textSize: "m",
      companyName: "ACME",
    },
    editor: null,
  };
}
