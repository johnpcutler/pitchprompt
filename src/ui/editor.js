export function withPreservedViewport(action) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const result = action();
  window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
  requestAnimationFrame(() => {
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
  });
  return result;
}

export function getSlotIdFromEventTarget(target) {
  if (target instanceof Element) {
    return target.closest("[data-slot-id]")?.getAttribute("data-slot-id") || null;
  }
  if (target instanceof Node && target.parentElement) {
    return target.parentElement.closest("[data-slot-id]")?.getAttribute("data-slot-id") || null;
  }
  return null;
}

export function isEventInsideSlotContent(target) {
  if (target instanceof Element) {
    return Boolean(target.closest("[data-slot-content]"));
  }
  if (target instanceof Node && target.parentElement) {
    return Boolean(target.parentElement.closest("[data-slot-content]"));
  }
  return false;
}

export function isSelectionInsideSlot(view) {
  const selection = view?.state?.selection;
  if (!selection) return false;
  let depth = selection.$from.depth;
  while (depth >= 0) {
    const node = selection.$from.node(depth);
    if (node?.type?.name === "slot") return true;
    depth -= 1;
  }
  return false;
}

export function shouldBlockNonSlotKeydown(event) {
  const usesMeta = event.metaKey || event.ctrlKey || event.altKey;
  if (usesMeta) return false;
  if (event.key === "Backspace" || event.key === "Delete" || event.key === "Enter") return true;
  return event.key.length === 1;
}

export function focusEditorSlot(containerEl, slotId) {
  if (!slotId || !containerEl) return;
  requestAnimationFrame(() => {
    const target = containerEl.querySelector(`[data-slot-content="${slotId}"]`);
    if (!target) return;
    target.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}
