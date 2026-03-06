import { Editor, Node } from "https://esm.sh/@tiptap/core@2.11.5";
import StarterKit from "https://esm.sh/@tiptap/starter-kit@2.11.5";
import {
  DATA_PATHS,
  STORAGE_KEYS,
  MAX_ALTERNATIVES,
  TEXT_SIZES,
  SIDEBAR_DRAFT_REFRESH_MS,
  createInitialState,
} from "./src/state/store.js";
import { savePersistedState as savePersistedStateImpl, loadPersistedState as loadPersistedStateImpl } from "./src/state/persistence.js";
import {
  nowIso,
  createAlternativeId,
  normalizeCompanyName,
  replaceDotworkWithCompany as replaceDotworkWithCompanyBase,
  normalizeTabCommitText,
} from "./src/domain/utils.js";
import {
  ensureSlotResponseState,
  getSelectedAlternative as getSelectedAlternativeBySlot,
  syncAnswerForSlot as syncAnswerForSlotImpl,
  syncAllAnswersFromResponses as syncAllAnswersFromResponsesImpl,
  setSelectedAlternativeId,
  createAlternativeRecord,
  upsertSelectedAlternativeRecord,
  deleteAlternativeRecord,
  cycleAlternativeSelection as cycleAlternativeSelectionImpl,
} from "./src/domain/alternatives.js";
import { computeProgress } from "./src/domain/progress.js";
import {
  getMadlibText as getMadlibTextImpl,
  getResolvedMadlibText as getResolvedMadlibTextImpl,
  getMadlibTextWithAlternativesInline as getMadlibTextWithAlternativesInlineImpl,
} from "./src/domain/serialization.js";
import {
  copyTextToClipboard as copyTextToClipboardImpl,
  downloadTextFile as downloadTextFileImpl,
} from "./src/ui/actions.js";
import { renderSidebar as renderSidebarImpl } from "./src/ui/sidebar.js";
import {
  withPreservedViewport as withPreservedViewportImpl,
  getSlotIdFromEventTarget as getSlotIdFromEventTargetImpl,
  isEventInsideSlotContent as isEventInsideSlotContentImpl,
  isSelectionInsideSlot as isSelectionInsideSlotImpl,
  shouldBlockNonSlotKeydown as shouldBlockNonSlotKeydownImpl,
  focusEditorSlot as focusEditorSlotImpl,
} from "./src/ui/editor.js";

const DEBUG =
  typeof window !== "undefined" &&
  (window.location.search.includes("debug=1") || window.location.search.includes("madlibDebug=1"));

let sidebarMessageTimer = null;
let sidebarDraftRefreshTimer = null;
let slotVisualSyncRafId = null;

const state = createInitialState();

const elements = {
  madlibContainer: document.querySelector("#madlibContainer"),
  slotDetails: document.querySelector("#slotDetails"),
  progressText: document.querySelector("#progressText"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  clearBtn: document.querySelector("#clearBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  exportMenuBtn: document.querySelector("#exportMenuBtn"),
  exportMenu: document.querySelector("#exportMenu"),
  exportMarkdownBtn: document.querySelector("#exportMarkdownBtn"),
  exportCopyBtn: document.querySelector("#exportCopyBtn"),
  exportCopyWithAlternativesBtn: document.querySelector("#exportCopyWithAlternativesBtn"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  loadJsonBtn: document.querySelector("#loadJsonBtn"),
  loadJsonInput: document.querySelector("#loadJsonInput"),
  textSizeControls: document.querySelector("#textSizeControls"),
  companyNameBtn: document.querySelector("#companyNameBtn"),
};

function debugLog(eventName, payload = {}) {
  if (!DEBUG) return;
  console.log(`[madlib-debug] ${eventName}`, payload);
}

function setActiveSlot(slotId) {
  debugLog("setActiveSlot:start", {
    nextSlotId: slotId,
    previousSlotId: state.activeSlotId,
    selectedAlternativeId: getSelectedAlternative(slotId)?.id || null,
  });
  state.activeSlotId = slotId;
  state.ui.sidebarMessage = "";
  state.ui.sidebarMessageTone = "warning";
  state.ui.editorMode = "selected";
  const existingDraft = getInlineDraft(slotId);
  if (existingDraft === null) {
    setInlineDraft(slotId, getSelectedAlternative(slotId)?.text || "");
  }
  renderSidebar();
  if (state.editor) {
    scheduleSlotVisualSync();
    if (state.ui.inlineFocusSlotId) {
      const focusSlotId = state.ui.inlineFocusSlotId;
      state.ui.inlineFocusSlotId = null;
      focusEditorSlot(focusSlotId);
    }
  } else {
    renderMadlib();
  }
  debugLog("setActiveSlot:end", {
    activeSlotId: state.activeSlotId,
    inlineDraftLength: (getInlineDraft(slotId) || "").length,
  });
}

function setSidebarMessage(message, tone = "warning", flashMs = 0) {
  state.ui.sidebarMessage = message;
  state.ui.sidebarMessageTone = tone;
  if (sidebarMessageTimer) {
    clearTimeout(sidebarMessageTimer);
    sidebarMessageTimer = null;
  }
  if (flashMs > 0 && message) {
    sidebarMessageTimer = setTimeout(() => {
      state.ui.sidebarMessage = "";
      state.ui.sidebarMessageTone = "warning";
      if (state.activeSlotId) renderSidebar();
    }, flashMs);
  }
}

function scheduleSlotVisualSync() {
  if (slotVisualSyncRafId) {
    cancelAnimationFrame(slotVisualSyncRafId);
  }
  slotVisualSyncRafId = requestAnimationFrame(() => {
    slotVisualSyncRafId = null;
    syncSlotVisualState();
  });
}

function moveTabDirection(slotId, direction) {
  const draftText = normalizeTabCommitText(getBestDraftForSlot(slotId));
  const saved = commitInlineSlot(slotId, draftText, { render: false });
  if (!saved) return true;
  const nextSlotId = getAdjacentSlotId(slotId, direction);
  state.ui.inlineFocusSlotId = nextSlotId || slotId;
  if (nextSlotId) {
    setActiveSlot(nextSlotId);
  } else {
    renderSidebar();
    renderMadlib();
  }
  return true;
}

function scheduleSidebarDraftRefresh(slotId = state.activeSlotId) {
  if (!slotId || slotId !== state.activeSlotId) return;
  if (sidebarDraftRefreshTimer) return;
  sidebarDraftRefreshTimer = setTimeout(() => {
    sidebarDraftRefreshTimer = null;
    if (!state.activeSlotId || state.activeSlotId !== slotId) return;
    renderSidebar();
  }, SIDEBAR_DRAFT_REFRESH_MS);
}

function applyTextSize() {
  const selected = TEXT_SIZES.includes(state.ui.textSize) ? state.ui.textSize : "m";
  elements.madlibContainer.classList.remove(
    "madlib-size-s",
    "madlib-size-m",
    "madlib-size-l",
    "madlib-size-xl"
  );
  elements.madlibContainer.classList.add(`madlib-size-${selected}`);
}

function getCompanyName() {
  return normalizeCompanyName(state.ui.companyName);
}

function replaceDotworkWithCompany(value) {
  return replaceDotworkWithCompanyBase(value, getCompanyName());
}

function renderCompanyNameControl() {
  if (!elements.companyNameBtn) return;
  const companyName = getCompanyName();
  elements.companyNameBtn.textContent = companyName;
  elements.companyNameBtn.setAttribute("aria-label", `Change company name (currently ${companyName})`);
}

function getInlineDraft(slotId) {
  if (!Object.prototype.hasOwnProperty.call(state.ui.inlineDraftBySlot, slotId)) return null;
  return state.ui.inlineDraftBySlot[slotId];
}

function setInlineDraft(slotId, value) {
  state.ui.inlineDraftBySlot[slotId] = String(value || "");
}

function getEditorSlotText(slotId) {
  if (!state.editor || !slotId) return null;
  let text = null;
  state.editor.state.doc.descendants((node) => {
    if (node.type?.name !== "slot") return true;
    if (String(node.attrs?.slotId || "") !== slotId) return true;
    text = node.textContent || "";
    return false;
  });
  return text;
}

function getBestDraftForSlot(slotId) {
  const inlineDraft = getInlineDraft(slotId);
  if (inlineDraft !== null) return inlineDraft;
  const editorText = getEditorSlotText(slotId);
  if (editorText !== null) return editorText;
  return getSelectedAlternative(slotId)?.text || "";
}

function syncInlineDraftsFromEditor() {
  if (!state.editor || !state.compiled?.slotOrder) return;
  state.compiled.slotOrder.forEach((slotId) => {
    const editorText = getEditorSlotText(slotId);
    if (editorText === null) return;
    if ((getInlineDraft(slotId) ?? "") === editorText) return;
    setInlineDraft(slotId, editorText);
    persistInlineDraft(slotId, editorText);
  });
}

function setInlineComposing(slotId, isComposing) {
  state.ui.inlineComposingBySlot[slotId] = Boolean(isComposing);
}

function isInlineComposing(slotId) {
  return Boolean(state.ui.inlineComposingBySlot[slotId]);
}

function renderTextSizeControls() {
  const controls = elements.textSizeControls;
  if (!controls) return;
  const active = TEXT_SIZES.includes(state.ui.textSize) ? state.ui.textSize : "m";
  controls.querySelectorAll("[data-size]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-size") === active);
  });
}

function autoSizeInlineEditor(editor) {
  editor.style.height = "auto";
  editor.style.height = `${Math.max(editor.scrollHeight, 28)}px`;
}

function withPreservedViewport(action) {
  return withPreservedViewportImpl(action);
}

function focusEditorSlot(slotId) {
  return focusEditorSlotImpl(elements.madlibContainer, slotId);
}

function persistInlineDraft(slotId, text) {
  const normalizedText = String(text || "");
  const selected = getSelectedAlternative(slotId);
  debugLog("persistInlineDraft:start", {
    slotId,
    draftLength: normalizedText.length,
    hasSelectedAlternative: Boolean(selected),
    selectedAlternativeId: selected?.id || null,
  });
  if (!selected) {
    if (!normalizedText.trim()) return;
    const created = createAlternativeWithDraft(slotId, normalizedText);
    if (!created) return;
    // Avoid noisy flashes while typing in editor mode.
    setSidebarMessage("", "warning");
  } else {
    selected.text = normalizedText;
    selected.updatedAt = nowIso();
    syncAnswerForSlot(slotId);
    savePersistedState();
  }
  updateProgress();
  if (slotId === state.activeSlotId) {
    scheduleSidebarDraftRefresh(slotId);
  }
  debugLog("persistInlineDraft:end", {
    slotId,
    selectedAlternativeId: getSelectedAlternative(slotId)?.id || null,
    savedAnswerLength: (state.answers[slotId] || "").length,
  });
}

function getSlotIdFromEventTarget(target) {
  return getSlotIdFromEventTargetImpl(target);
}

function isEventInsideSlotContent(target) {
  return isEventInsideSlotContentImpl(target);
}

function isSelectionInsideSlot(view) {
  return isSelectionInsideSlotImpl(view);
}

function getDefaultEditableSlotId() {
  if (state.activeSlotId) return state.activeSlotId;
  const slotOrder = Array.isArray(state.compiled?.slotOrder) ? state.compiled.slotOrder : [];
  return slotOrder[0] || null;
}

function redirectFocusToEditableSlot(preferredSlotId = null) {
  const slotId = preferredSlotId || getDefaultEditableSlotId();
  if (!slotId) return false;
  state.ui.inlineFocusSlotId = slotId;
  if (state.activeSlotId !== slotId) {
    setActiveSlot(slotId);
  } else {
    focusEditorSlot(slotId);
  }
  return true;
}

function shouldBlockNonSlotKeydown(event) {
  return shouldBlockNonSlotKeydownImpl(event);
}

function logSlotVisualDebug(slotId, source = "unknown") {
  if (!DEBUG || !slotId || !elements.madlibContainer) return;
  const chipEls = Array.from(elements.madlibContainer.querySelectorAll(`[data-slot-id="${slotId}"]`));
  const contentEls = Array.from(
    elements.madlibContainer.querySelectorAll(`[data-slot-content="${slotId}"]`)
  );
  const chipEl = chipEls[0] || null;
  const contentEl = contentEls[0] || null;
  if (!chipEl || !contentEl) {
    debugLog("slot:visual:missing", {
      source,
      slotId,
      hasChip: Boolean(chipEl),
      hasContent: Boolean(contentEl),
      chipCount: chipEls.length,
      contentCount: contentEls.length,
    });
    return;
  }
  const computed = window.getComputedStyle(contentEl);
  debugLog("slot:visual", {
    source,
    slotId,
    activeSlotId: state.activeSlotId,
    chipClasses: chipEl.className,
    contentClasses: contentEl.className,
    chipFocusWithin: chipEl.matches(":focus-within"),
    contentHasFocus: document.activeElement === contentEl,
    chipCount: chipEls.length,
    contentCount: contentEls.length,
    allChipClasses: chipEls.map((el) => el.className),
    allContentClasses: contentEls.map((el) => el.className),
    contentBg: computed.backgroundColor,
    contentBoxShadow: computed.boxShadow,
    contentOutline: computed.outline,
  });
}

function createSlotExtension() {
  return Node.create({
    name: "slot",
    group: "inline",
    inline: true,
    content: "text*",
    selectable: false,
    draggable: false,
    addAttributes() {
      return {
        slotId: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-slot-id"),
          renderHTML: (attributes) => ({ "data-slot-id": attributes.slotId }),
        },
      };
    },
    parseHTML() {
      return [{ tag: "span[data-slot-id]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["span", HTMLAttributes, 0];
    },
    addNodeView() {
      return ({ node }) => {
        const slotId = String(node.attrs.slotId || "");
        const meta = getPromptMeta(slotId);
        const dom = document.createElement("span");
        dom.className = "slot-chip tiptap-slot";
        dom.dataset.slotId = slotId;

        const leftBracket = document.createElement("span");
        leftBracket.className = "slot-bracket";
        leftBracket.textContent = "[";
        leftBracket.contentEditable = "false";
        leftBracket.setAttribute("aria-hidden", "true");

        const contentDOM = document.createElement("span");
        contentDOM.className = "tiptap-slot-content";
        contentDOM.dataset.slotContent = slotId;
        contentDOM.dataset.placeholder = meta.shortPrompt;

        const rightBracket = document.createElement("span");
        rightBracket.className = "slot-bracket";
        rightBracket.textContent = "]";
        rightBracket.contentEditable = "false";
        rightBracket.setAttribute("aria-hidden", "true");

        const syncDraft = () => {
          const text = contentDOM.textContent || "";
          debugLog("slot:input", {
            slotId,
            textLength: text.length,
            activeSlotId: state.activeSlotId,
          });
          setInlineDraft(slotId, text);
          persistInlineDraft(slotId, text);
          const isFilled = Boolean(text.trim());
          dom.classList.toggle("is-filled", isFilled);
          contentDOM.classList.toggle("is-filled", isFilled);
        };

        const activateSlot = () => {
          if (state.activeSlotId === slotId) {
            // Ensure caret is placed inside the editable span even on re-click.
            focusEditorSlot(slotId);
            return;
          }
          const previousSlotId = state.activeSlotId;
          if (previousSlotId) {
            const previousDraft = getBestDraftForSlot(previousSlotId);
            commitInlineSlot(previousSlotId, previousDraft, { render: false });
          }
          state.ui.inlineFocusSlotId = slotId;
          setActiveSlot(slotId);
        };

        dom.addEventListener("click", () => {
          activateSlot();
        });

        dom.addEventListener("mousedown", (event) => {
          if (event.target === contentDOM) return;
          // Keep the caret inside contentDOM; otherwise typing can occur between bracket spans.
          event.preventDefault();
          activateSlot();
          focusEditorSlot(slotId);
        });

        contentDOM.addEventListener("focus", () => {
          activateSlot();
          logSlotVisualDebug(slotId, "content-focus");
        });

        contentDOM.addEventListener("input", () => {
          syncDraft();
        });

        contentDOM.addEventListener("keydown", (event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            state.ui.inlineSkipBlurCommitSlotId = slotId;
            const direction = event.shiftKey ? -1 : 1;
            withPreservedViewport(() => moveTabDirection(slotId, direction));
          }
        });

        contentDOM.addEventListener("blur", () => {
          debugLog("slot:blur", {
            slotId,
            skipBlurCommit: state.ui.inlineSkipBlurCommitSlotId === slotId,
            isComposing: isInlineComposing(slotId),
          });
          if (state.ui.inlineSkipBlurCommitSlotId === slotId) {
            state.ui.inlineSkipBlurCommitSlotId = null;
            return;
          }
          const text = contentDOM.textContent || "";
          commitInlineSlot(slotId, text);
          requestAnimationFrame(() => {
            logSlotVisualDebug(slotId, "content-blur");
          });
        });

        dom.append(leftBracket, contentDOM, rightBracket);
        return { dom, contentDOM };
      };
    },
  });
}

function inlinePartsToEditorContent(lineParts, options = {}) {
  const { leadingStripRegex = null } = options;
  const content = [];
  lineParts.forEach((part, index) => {
    if (part.type === "text") {
      let value = String(part.value || "");
      value = replaceDotworkWithCompany(value);
      if (leadingStripRegex && index === 0) {
        value = value.replace(leadingStripRegex, "");
      }
      if (value) {
        content.push({ type: "text", text: value });
      }
      return;
    }
    const slotId = part.id;
    const draftValue = getInlineDraft(slotId);
    const selectedValue = getSelectedAlternative(slotId)?.text || "";
    const slotText = draftValue !== null ? draftValue : selectedValue;
    const slotNode = {
      type: "slot",
      attrs: { slotId },
    };
    if (slotText) {
      slotNode.content = [{ type: "text", text: slotText }];
    }
    content.push(slotNode);
  });
  return content;
}

function buildEditorDoc() {
  const lines = segmentLines(state.compiled.segments);
  const blocks = [];
  let index = 0;

  const pushParagraph = (content) => {
    blocks.push({
      type: "paragraph",
      content: content.length ? content : [{ type: "text", text: "" }],
    });
  };

  while (index < lines.length) {
    const current = lines[index];
    const currentText = lineToText(current);

    if (!currentText) {
      index += 1;
      continue;
    }

    const headingMatch = currentText.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(6, headingMatch[1].length);
      const content = inlinePartsToEditorContent(current, { leadingStripRegex: /^#{1,6}\s+/ });
      blocks.push({
        type: "heading",
        attrs: { level },
        content: content.length ? content : [{ type: "text", text: "" }],
      });
      index += 1;
      continue;
    }

    const explicitBullet = currentText.match(/^[-*]\s+(.*)$/);
    const explicitNumber = currentText.match(/^\d+\.\s+(.*)$/);
    if (explicitBullet || explicitNumber) {
      const listItems = [];
      const listStripRegex = /^([-*]|\d+\.)\s+/;
      while (index < lines.length) {
        const txt = lineToText(lines[index]);
        const bullet = txt.match(/^[-*]\s+(.*)$/);
        const number = txt.match(/^\d+\.\s+(.*)$/);
        if ((!bullet && !number) || !txt) break;
        const itemContent = inlinePartsToEditorContent(lines[index], { leadingStripRegex: listStripRegex });
        listItems.push({
          type: "listItem",
          content: [{ type: "paragraph", content: itemContent.length ? itemContent : [{ type: "text", text: "" }] }],
        });
        index += 1;
      }
      blocks.push({
        type: explicitNumber ? "orderedList" : "bulletList",
        content: listItems,
      });
      continue;
    }

    // Render each non-empty source line as its own paragraph.
    // We avoid auto-merging adjacent lines so paragraph intent stays explicit in madlib.md.
    pushParagraph(inlinePartsToEditorContent(current));
    index += 1;
  }

  return {
    type: "doc",
    content: blocks.length ? blocks : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
  };
}

function createSlotField(slotId) {
  const meta = getPromptMeta(slotId);
  const chip = document.createElement("span");
  chip.className = "slot-chip";
  chip.dataset.slotId = slotId;
  chip.classList.toggle("is-active", state.activeSlotId === slotId);

  const leftBracket = document.createElement("span");
  leftBracket.textContent = "[";
  leftBracket.className = "slot-bracket";

  const rightBracket = document.createElement("span");
  rightBracket.textContent = "]";
  rightBracket.className = "slot-bracket";

  const displayText = getInlineDraft(slotId) !== null ? getInlineDraft(slotId) : getSelectedText(slotId);

  if (state.activeSlotId === slotId) {
    const editor = document.createElement("textarea");
    editor.className = "slot-inline-input";
    editor.value = displayText || "";
    editor.rows = 1;
    editor.dataset.inlineSlot = slotId;
    editor.setAttribute("aria-label", `Inline editor for ${meta.shortPrompt}`);
    editor.placeholder = meta.shortPrompt;
    chip.classList.toggle("is-filled", Boolean(editor.value.trim()));
    autoSizeInlineEditor(editor);

    editor.addEventListener("input", () => {
      setInlineDraft(slotId, editor.value);
      chip.classList.toggle("is-filled", Boolean(editor.value.trim()));
      autoSizeInlineEditor(editor);
    });

    editor.addEventListener("compositionstart", () => setInlineComposing(slotId, true));
    editor.addEventListener("compositionend", () => setInlineComposing(slotId, false));

    editor.addEventListener("blur", () => {
      if (state.ui.inlineSkipBlurCommitSlotId === slotId) {
        state.ui.inlineSkipBlurCommitSlotId = null;
        return;
      }
      if (isInlineComposing(slotId)) return;
      commitInlineSlot(slotId, editor.value);
    });

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && !event.shiftKey) {
        event.preventDefault();
        state.ui.inlineSkipBlurCommitSlotId = slotId;
        const saved = commitInlineSlot(slotId, editor.value, { render: false });
        if (!saved) return;
        const nextSlotId = getAdjacentSlotId(slotId, 1);
        if (!nextSlotId) {
          state.ui.inlineFocusSlotId = slotId;
          renderSidebar();
          renderMadlib();
          return;
        }
        state.ui.inlineFocusSlotId = nextSlotId;
        setActiveSlot(nextSlotId);
      }
    });

    chip.append(leftBracket, editor, rightBracket);
  } else {
    const button = document.createElement("button");
    button.className = "slot-symbol";
    button.type = "button";
    button.title = meta.shortPrompt;
    button.textContent = displayText || meta.shortPrompt;
    button.classList.toggle("is-filled", Boolean((displayText || "").trim()));
    button.classList.toggle("is-active", state.activeSlotId === slotId);
    button.setAttribute("aria-label", `Blank prompt: ${meta.shortPrompt}`);

    button.addEventListener("click", () => {
      state.ui.inlineFocusSlotId = slotId;
      setActiveSlot(slotId);
    });
    button.addEventListener("focus", () => {
      if (state.activeSlotId !== slotId) {
        state.ui.inlineFocusSlotId = slotId;
        setActiveSlot(slotId);
      }
    });

    chip.append(leftBracket, button, rightBracket);
  }

  return chip;
}

function segmentLines(segments) {
  const lines = [[]];
  segments.forEach((segment) => {
    if (segment.type === "slot") {
      lines[lines.length - 1].push({ type: "slot", id: segment.id });
      return;
    }

    const chunks = String(segment.value).split("\n");
    chunks.forEach((chunk, index) => {
      if (chunk) {
        lines[lines.length - 1].push({ type: "text", value: chunk });
      }
      if (index < chunks.length - 1) {
        lines.push([]);
      }
    });
  });
  return lines;
}

function lineToText(lineParts) {
  return lineParts
    .map((part) => (part.type === "text" ? part.value : "[slot]"))
    .join("")
    .trim();
}

function appendInlineParts(parent, lineParts) {
  lineParts.forEach((part) => {
    if (part.type === "text") {
      parent.append(document.createTextNode(part.value));
    } else if (part.type === "slot") {
      parent.append(createSlotField(part.id));
    }
  });
}

function getPromptMeta(slotId) {
  const prompt = state.prompts[slotId] || {};
  return {
    shortPrompt: prompt.shortPrompt || slotId,
    sentenceLength: prompt.sentenceLength || "1 sentence",
    description: prompt.description || "Add a value that best fits this part of the story.",
    examples: Array.isArray(prompt.examples) ? prompt.examples : [],
  };
}

function getSlotResponseState(slotId) {
  return ensureSlotResponseState(state.responsesBySlot, slotId);
}

function getSelectedAlternative(slotId) {
  return getSelectedAlternativeBySlot(state.responsesBySlot, slotId);
}

function getSelectedText(slotId) {
  return (getSelectedAlternative(slotId)?.text || "").trim();
}

function syncAnswerForSlot(slotId) {
  syncAnswerForSlotImpl(state, slotId);
}

function syncAllAnswersFromResponses() {
  const slotOrder = Array.isArray(state.compiled?.slotOrder) ? state.compiled.slotOrder : [];
  syncAllAnswersFromResponsesImpl(state, slotOrder);
}

function savePersistedState() {
  savePersistedStateImpl({
    localStorageObj: localStorage,
    storageKeys: STORAGE_KEYS,
    state,
    getCompanyName,
    debugLog,
  });
}

function parseJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function loadPersistedState() {
  loadPersistedStateImpl({
    localStorageObj: localStorage,
    storageKeys: STORAGE_KEYS,
    state,
    textSizes: TEXT_SIZES,
    maxAlternatives: MAX_ALTERNATIVES,
    normalizeCompanyName,
    nowIso,
    createAlternativeId,
  });
  setSidebarMessage("", "warning");

  syncAllAnswersFromResponses();
}

function getAdjacentSlotId(currentSlotId, direction) {
  const slotOrder = Array.isArray(state.compiled?.slotOrder) ? state.compiled.slotOrder : [];
  const index = slotOrder.indexOf(currentSlotId);
  if (index < 0) return null;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= slotOrder.length) return null;
  return slotOrder[nextIndex];
}

function cycleAlternativeSelection(slotId, direction) {
  const nextId = cycleAlternativeSelectionImpl(state.responsesBySlot, slotId, direction);
  if (!nextId) return false;
  setSelectedAlternative(slotId, nextId);
  setSidebarMessage("Alternative selected", "success", 900);
  renderSidebar();
  renderMadlib();
  return true;
}

function createAlternativeFromCurrent(slotId) {
  const draftText = getBestDraftForSlot(slotId);
  const committed = commitInlineSlot(slotId, draftText, { render: false });
  if (!committed) return false;
  const created = createAlternative(slotId, "");
  if (!created) return false;
  state.ui.inlineFocusSlotId = slotId;
  setSidebarMessage("Alternative created", "success", 1000);
  renderSidebar();
  renderMadlib();
  return true;
}

function commitInlineSlot(slotId, draftText, options = {}) {
  const shouldRender = options.render !== false;
  const selected = getSelectedAlternative(slotId);
  const normalizedText = String(draftText || "");
  debugLog("commitInlineSlot:start", {
    slotId,
    shouldRender,
    hasSelectedAlternative: Boolean(selected),
    selectedAlternativeId: selected?.id || null,
    draftLength: normalizedText.length,
  });
  if (!selected && normalizedText.trim().length === 0) {
    setInlineDraft(slotId, normalizedText);
    if (shouldRender) {
      renderSidebar();
      renderMadlib();
    }
    debugLog("commitInlineSlot:skip-empty", { slotId });
    return true;
  }
  const saved = selected
    ? upsertSelectedAlternative(slotId, normalizedText)
    : createAlternativeWithDraft(slotId, normalizedText);
  if (!saved) return false;
  setInlineDraft(slotId, normalizedText);
  updateProgress();
  if (shouldRender) {
    renderSidebar();
    renderMadlib();
  }
  debugLog("commitInlineSlot:end", {
    slotId,
    selectedAlternativeId: getSelectedAlternative(slotId)?.id || null,
    answerLength: (state.answers[slotId] || "").length,
  });
  return true;
}

function setSelectedAlternative(slotId, altId) {
  const didSelect = setSelectedAlternativeId(state.responsesBySlot, slotId, altId);
  if (!didSelect) return;
  state.ui.editorMode = "selected";
  setInlineDraft(slotId, getSelectedAlternative(slotId)?.text || "");
  setSidebarMessage("", "warning");
  syncAnswerForSlot(slotId);
  savePersistedState();
}

function createAlternative(slotId, initialText = "") {
  const result = createAlternativeRecord({
    responsesBySlot: state.responsesBySlot,
    slotId,
    initialText,
    maxAlternatives: MAX_ALTERNATIVES,
    createAlternativeId,
    nowIso,
  });
  if (!result.ok) {
    setSidebarMessage(`You can add up to ${MAX_ALTERNATIVES} alternatives per prompt.`, "warning");
    return false;
  }
  setInlineDraft(slotId, result.alternative.text);
  syncAnswerForSlot(slotId);
  setSidebarMessage("", "warning");
  savePersistedState();
  updateProgress();
  return true;
}

function upsertSelectedAlternative(slotId, draftText) {
  const text = String(draftText || "");
  const result = upsertSelectedAlternativeRecord({
    responsesBySlot: state.responsesBySlot,
    slotId,
    draftText: text,
    maxAlternatives: MAX_ALTERNATIVES,
    createAlternativeId,
    nowIso,
  });
  if (!result.ok) {
    setSidebarMessage(`You can add up to ${MAX_ALTERNATIVES} alternatives per prompt.`, "warning");
    return false;
  }

  setInlineDraft(slotId, text);
  setSidebarMessage("Updated", "success", 1200);
  syncAnswerForSlot(slotId);
  savePersistedState();
  return true;
}

function createAlternativeWithDraft(slotId, draftText) {
  const created = createAlternative(slotId, draftText);
  if (!created) return false;
  state.ui.editorMode = "selected";
  setSidebarMessage("Created", "success", 1200);
  return true;
}

function deleteAlternative(slotId, altId) {
  const deleted = deleteAlternativeRecord(state.responsesBySlot, slotId, altId);
  if (!deleted) return false;

  const selected = getSelectedAlternative(slotId);
  state.ui.editorMode = "selected";
  setInlineDraft(slotId, selected?.text || "");
  syncAnswerForSlot(slotId);
  setSidebarMessage("Deleted", "success", 1200);
  savePersistedState();
  return true;
}

function clearCurrentSlot(slotId) {
  state.responsesBySlot[slotId] = {
    alternatives: [],
    selectedId: null,
  };
  state.answers[slotId] = "";
  state.notes[slotId] = "";
  state.ui.editorMode = "selected";
  setSidebarMessage("Cleared", "success", 1200);
  setInlineDraft(slotId, "");
  savePersistedState();
}

function renderSidebar() {
  renderSidebarImpl({
    state,
    elements,
    maxAlternatives: MAX_ALTERNATIVES,
    getPromptMeta,
    getSlotResponseState,
    setSelectedAlternative,
    deleteAlternative,
    updateProgress,
    renderMadlib,
    savePersistedState,
  });
}

function setExportMenuOpen(isOpen) {
  if (!elements.exportMenu || !elements.exportMenuBtn) return;
  elements.exportMenu.classList.toggle("hidden", !isOpen);
  elements.exportMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function syncSlotVisualState() {
  const container = elements.madlibContainer;
  if (!container) return;
  const slotEls = container.querySelectorAll("[data-slot-id]");
  slotEls.forEach((el) => {
    const slotId = el.getAttribute("data-slot-id") || "";
    const isCurrent = slotId === state.activeSlotId;
    el.classList.toggle("is-active", isCurrent);
    const slotText = (getInlineDraft(slotId) ?? getSelectedAlternative(slotId)?.text ?? "").trim();
    const isFilled = Boolean(slotText);
    el.classList.toggle("is-filled", isFilled);
    const contentEl = el.querySelector("[data-slot-content]");
    if (contentEl) {
      contentEl.classList.toggle("is-filled", isFilled);
      contentEl.classList.toggle("is-current", isCurrent);
      if (DEBUG && isCurrent) {
        logSlotVisualDebug(slotId, "syncSlotVisualState");
      }
    }
  });
}

function renderMadlib() {
  const container = elements.madlibContainer;

  if (!state.compiled || !Array.isArray(state.compiled.segments)) {
    container.innerHTML = "No madlib content available yet.";
    return;
  }
  const docContent = buildEditorDoc();
  const previousScrollY = window.scrollY;
  if (!state.editor) {
    container.innerHTML = "";
    state.editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        createSlotExtension(),
      ],
      content: docContent,
      onUpdate: () => {
        syncInlineDraftsFromEditor();
        scheduleSlotVisualSync();
      },
      editorProps: {
        attributes: {
          class: "madlib-editor",
        },
        handleTextInput: (view) => {
          if (isSelectionInsideSlot(view)) return false;
          redirectFocusToEditableSlot();
          return true;
        },
        handlePaste: (view, event) => {
          if (isSelectionInsideSlot(view)) return false;
          event?.preventDefault();
          redirectFocusToEditableSlot();
          return true;
        },
        handleDOMEvents: {
          mousedown: (_view, event) => {
            if (isEventInsideSlotContent(event.target)) return false;
            const clickedSlotId = getSlotIdFromEventTarget(event.target);
            event.preventDefault();
            redirectFocusToEditableSlot(clickedSlotId);
            return true;
          },
        },
        handleKeyDown: (_view, event) => {
          const slotId = state.activeSlotId || getSlotIdFromEventTarget(event.target);
          const usesMeta = event.metaKey || event.ctrlKey;
          const inSlotContext =
            isEventInsideSlotContent(event.target) || isSelectionInsideSlot(_view);
          if (usesMeta && event.shiftKey && event.key === "Enter") {
            if (!slotId) return false;
            event.preventDefault();
            return withPreservedViewport(() => createAlternativeFromCurrent(slotId));
          }
          if (usesMeta && !event.shiftKey && event.key === "]") {
            if (!slotId) return false;
            event.preventDefault();
            return withPreservedViewport(() => cycleAlternativeSelection(slotId, 1));
          }
          if (usesMeta && !event.shiftKey && event.key === "[") {
            if (!slotId) return false;
            event.preventDefault();
            return withPreservedViewport(() => cycleAlternativeSelection(slotId, -1));
          }
          if (!inSlotContext && shouldBlockNonSlotKeydown(event)) {
            event.preventDefault();
            return redirectFocusToEditableSlot(slotId);
          }
          if (event.key !== "Tab") return false;
          if (!slotId) return false;
          event.preventDefault();
          const direction = event.shiftKey ? -1 : 1;
          return withPreservedViewport(() => moveTabDirection(slotId, direction));
        },
      },
    });
  } else {
    state.editor.commands.setContent(docContent, false);
  }
  window.scrollTo({ top: previousScrollY, behavior: "auto" });

  scheduleSlotVisualSync();

  if (state.ui.inlineFocusSlotId) {
    const focusSlotId = state.ui.inlineFocusSlotId;
    state.ui.inlineFocusSlotId = null;
    focusEditorSlot(focusSlotId);
  }
}

function updateProgress() {
  const { total, filled, percent } = computeProgress(state.compiled?.slotOrder, state.answers);

  elements.progressText.textContent = `${filled} / ${total} complete`;
  elements.progressPercent.textContent = `${percent}%`;
  if (elements.progressBar) {
    elements.progressBar.style.width = `${percent}%`;
  }
}

function getSlotExportLabel(slotId) {
  const shortPrompt = String(getPromptMeta(slotId).shortPrompt || "").trim();
  return shortPrompt || slotId;
}

function getSlotAlternativeTexts(slotId) {
  const slotState = getSlotResponseState(slotId);
  return slotState.alternatives
    .map((alternative) => String(alternative?.text || "").trim())
    .filter((value) => value.length > 0);
}

function getMadlibText({ withAlternativesInline = false } = {}) {
  return getMadlibTextImpl({
    compiled: state.compiled,
    answersBySlot: state.answers,
    getPromptMeta,
    getSlotResponseState,
    companyName: getCompanyName(),
    replaceDotworkWithCompany: replaceDotworkWithCompanyBase,
    withAlternativesInline,
  });
}

function getResolvedMadlibText() {
  return getResolvedMadlibTextImpl({
    compiled: state.compiled,
    answersBySlot: state.answers,
    getPromptMeta,
    getSlotResponseState,
    companyName: getCompanyName(),
    replaceDotworkWithCompany: replaceDotworkWithCompanyBase,
  });
}

function getMadlibTextWithAlternativesInline() {
  return getMadlibTextWithAlternativesInlineImpl({
    compiled: state.compiled,
    answersBySlot: state.answers,
    getPromptMeta,
    getSlotResponseState,
    companyName: getCompanyName(),
    replaceDotworkWithCompany: replaceDotworkWithCompanyBase,
  });
}

function downloadTextFile(text, fileName, mimeType) {
  return downloadTextFileImpl(text, fileName, mimeType);
}

async function copyTextToClipboard(text) {
  return copyTextToClipboardImpl(text);
}

async function copyResolvedText() {
  const didCopy = await copyTextToClipboard(getResolvedMadlibText());
  setSidebarMessage(didCopy ? "Copied story text." : "Copy failed. Check browser clipboard permissions.", didCopy ? "success" : "warning", 1500);
  if (state.activeSlotId) renderSidebar();
}

async function copyTextWithAlternatives() {
  const didCopy = await copyTextToClipboard(getMadlibTextWithAlternativesInline());
  setSidebarMessage(
    didCopy ? "Copied story text with alternatives." : "Copy failed. Check browser clipboard permissions.",
    didCopy ? "success" : "warning",
    1600
  );
  if (state.activeSlotId) renderSidebar();
}

function exportMarkdown() {
  const madlibText = getResolvedMadlibText();
  const notesEntries = Object.entries(state.notes).filter(([, value]) => value.trim().length > 0);
  const timestamp = new Date().toISOString();

  const notesSection = notesEntries.length
    ? `\n\n## Notes\n${notesEntries
        .map(([slotId, note]) => {
          const label = getPromptMeta(slotId).shortPrompt;
          return `- **${label}**: ${note.replace(/\n/g, " ")}`;
        })
        .join("\n")}`
    : "";

  const markdown = `# Completed Madlib\n\nGenerated: ${timestamp}\n\n## Story\n\n${madlibText}${notesSection}\n`;
  downloadTextFile(markdown, "Markdown.md", "text/markdown;charset=utf-8");
}

function exportAllAlternativesJson() {
  const slotOrder = Array.isArray(state.compiled?.slotOrder) ? state.compiled.slotOrder : [];
  const promptsBySlot = {};
  slotOrder.forEach((slotId) => {
    promptsBySlot[slotId] = getPromptMeta(slotId);
  });

  const payload = {
    generatedAt: nowIso(),
    sourceFile: state.compiled?.sourceFile || null,
    companyName: getCompanyName(),
    slotOrder,
    storyResolved: getResolvedMadlibText(),
    storyWithAlternatives: getMadlibTextWithAlternativesInline(),
    responsesBySlot: state.responsesBySlot,
    notes: state.notes,
    promptsBySlot,
  };

  downloadTextFile(JSON.stringify(payload, null, 2), "madlib-all-alternatives.json", "application/json;charset=utf-8");
}

function clearAll() {
  state.answers = {};
  state.responsesBySlot = {};
  state.notes = {};
  setSidebarMessage("", "warning");
  state.ui.editorMode = "selected";
  state.ui.inlineDraftBySlot = {};
  state.ui.inlineFocusSlotId = null;
  state.ui.inlineComposingBySlot = {};
  state.ui.inlineSkipBlurCommitSlotId = null;
  state.activeSlotId = null;
  savePersistedState();
  renderMadlib();
  renderSidebar();
  updateProgress();
}

function importFromJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const payload = JSON.parse(e.target.result);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload.responsesBySlot) {
        alert("Invalid PitchPrompt JSON file.");
        return;
      }

      state.answers = {};
      state.responsesBySlot = {};
      state.notes = {};
      state.activeSlotId = null;
      state.ui.inlineDraftBySlot = {};
      state.ui.inlineFocusSlotId = null;
      state.ui.inlineComposingBySlot = {};
      state.ui.inlineSkipBlurCommitSlotId = null;

      state.responsesBySlot = normalizeLoadedResponses(payload.responsesBySlot, {
        createAlternativeId,
        nowIso,
        maxAlternatives: MAX_ALTERNATIVES,
      });

      if (payload.notes && typeof payload.notes === "object" && !Array.isArray(payload.notes)) {
        Object.entries(payload.notes).forEach(([slotId, note]) => {
          state.notes[String(slotId)] = String(note || "");
        });
      }

      if (payload.companyName) {
        state.ui.companyName = normalizeCompanyName(payload.companyName);
      }

      syncAllAnswersFromResponses();
      savePersistedState();
      renderMadlib();
      renderSidebar();
      updateProgress();
      renderCompanyNameControl();
    } catch (_) {
      alert("Could not read file. Make sure it is a valid PitchPrompt JSON export.");
    }
  };
  reader.readAsText(file);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadData() {
  const cacheBust = `?v=${Date.now()}`;
  const [compiledRes, promptsRes] = await Promise.all([
    fetch(`${DATA_PATHS.compiled}${cacheBust}`),
    fetch(`${DATA_PATHS.prompts}${cacheBust}`),
  ]);

  if (!compiledRes.ok) {
    throw new Error("Unable to load compiled madlib JSON.");
  }
  if (!promptsRes.ok) {
    throw new Error("Unable to load prompts JSON.");
  }

  const compiled = await compiledRes.json();
  const prompts = await promptsRes.json();
  state.compiled = compiled;
  state.prompts = prompts;
}

function attachEvents() {
  elements.clearBtn.addEventListener("click", clearAll);
  elements.copyBtn?.addEventListener("click", () => {
    void copyResolvedText();
  });
  elements.exportMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !elements.exportMenu?.classList.contains("hidden");
    setExportMenuOpen(!isOpen);
  });
  elements.exportMarkdownBtn?.addEventListener("click", () => {
    setExportMenuOpen(false);
    exportMarkdown();
  });
  elements.exportCopyBtn?.addEventListener("click", () => {
    setExportMenuOpen(false);
    void copyResolvedText();
  });
  elements.exportCopyWithAlternativesBtn?.addEventListener("click", () => {
    setExportMenuOpen(false);
    void copyTextWithAlternatives();
  });
  elements.exportJsonBtn?.addEventListener("click", () => {
    setExportMenuOpen(false);
    exportAllAlternativesJson();
  });
  elements.loadJsonBtn?.addEventListener("click", () => {
    elements.loadJsonInput.value = "";
    elements.loadJsonInput.click();
  });
  elements.loadJsonInput?.addEventListener("change", (e) => {
    if (e.target.files[0]) importFromJson(e.target.files[0]);
  });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const insideMenu = event.target.closest(".export-menu-wrapper");
    if (!insideMenu) setExportMenuOpen(false);
  });
  elements.companyNameBtn?.addEventListener("click", () => {
    const nextValue = window.prompt("Company name", getCompanyName());
    if (nextValue === null) return;
    const normalized = normalizeCompanyName(nextValue);
    if (normalized === getCompanyName()) return;
    state.ui.companyName = normalized;
    savePersistedState();
    renderCompanyNameControl();
    withPreservedViewport(() => {
      renderMadlib();
      renderSidebar();
    });
  });
  elements.textSizeControls?.querySelectorAll("[data-size]").forEach((button) => {
    button.addEventListener("click", () => {
      const size = button.getAttribute("data-size");
      if (!TEXT_SIZES.includes(size)) return;
      state.ui.textSize = size;
      applyTextSize();
      renderTextSizeControls();
      savePersistedState();
    });
  });
}

export async function init() {
  try {
    await loadData();
    loadPersistedState();
    attachEvents();
    applyTextSize();
    renderCompanyNameControl();
    renderTextSizeControls();
    renderMadlib();
    renderSidebar();
    updateProgress();
    debugLog("init:ready", {
      compiledSlotCount: Array.isArray(state.compiled?.slotOrder) ? state.compiled.slotOrder.length : 0,
      responsesSlotCount: Object.keys(state.responsesBySlot || {}).length,
    });
    if (DEBUG && typeof window !== "undefined") {
      window.__madlibDebug = {
        state,
        logState() {
          console.log("[madlib-debug] snapshot", {
            activeSlotId: state.activeSlotId,
            answers: state.answers,
            responsesBySlot: state.responsesBySlot,
            inlineDraftBySlot: state.ui.inlineDraftBySlot,
          });
        },
        inspectSlot(slotId = state.activeSlotId) {
          logSlotVisualDebug(slotId, "manual-inspect");
        },
      };
      console.info(
        "[madlib-debug] enabled via ?debug=1. Use window.__madlibDebug.logState() and window.__madlibDebug.inspectSlot()"
      );
    }
  } catch (error) {
    elements.madlibContainer.innerHTML = `<p class="rounded-lg bg-red-50 p-3 text-sm text-red-700">${
      error?.message || "Failed to initialize app."
    }</p>`;
  }
}
