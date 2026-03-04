export function computeProgress(slotOrder, answersBySlot) {
  const total = Array.isArray(slotOrder) ? slotOrder.length : 0;
  const filled = total
    ? slotOrder.filter((slotId) => String(answersBySlot?.[slotId] || "").trim().length > 0).length
    : 0;
  const percent = total ? Math.round((filled / total) * 100) : 0;
  return { total, filled, percent };
}
