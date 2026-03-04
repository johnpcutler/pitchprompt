export function nowIso() {
  return new Date().toISOString();
}

export function createAlternativeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `alt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeCompanyName(value) {
  const normalized = String(value || "").trim().replace(/\s{2,}/g, " ");
  return normalized || "ACME";
}

export function replaceDotworkWithCompany(value, companyName) {
  return String(value || "").replace(/\bDotwork\b/gi, normalizeCompanyName(companyName));
}

export function normalizeTabCommitText(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
