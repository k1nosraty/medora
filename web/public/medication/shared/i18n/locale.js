import messagesFa from "./messages-fa.js";
const key = "medora-language";
const previewLanguage = location.pathname.startsWith("/design/") && new URLSearchParams(location.search).get("lang");
function savedLanguage() {
  try { return localStorage.getItem(key); } catch { return null; }
}
export const language = (previewLanguage || savedLanguage()) === "en" ? "en" : "fa";
const messages = language === "en" ? (await import("./messages-en.js")).default : messagesFa;
const english = language === "en" ? {
  ...(await import("./english.js")).default,
  ...Object.fromEntries(Object.entries(messagesFa).map(([key, text]) => [text, messages[key]]))
} : {};
export const locale = language === "en" ? "en-US" : "fa-IR";
export const defaultCalendar = language === "en" ? "gregory" : "persian";
const weekStart = language === "en" ? 0 : 6;
export const shortWeek = language === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["ش", "ی", "د", "س", "چ", "پ", "ج"];
export const weekIndex = day => (new Date(day * 86_400_000).getUTCDay() - weekStart + 7) % 7;
export const listSeparator = language === "en" ? ", " : "، ";

export function t(message, ...values) {
  const copy = messages[message] ?? english[message] ?? message;
  return copy.replace(/\{(\d+)\}/g, (placeholder, index) => values[index] ?? placeholder);
}

export function localDigits(value) {
  const text = String(value);
  return language === "en" ? text : text.replace(/[0-9.]/g, char => char === "." ? "٫" : "۰۱۲۳۴۵۶۷۸۹"[Number(char)]);
}

export function selectLanguage(next) {
  if (next !== language && (next === "fa" || next === "en")) {
    try { localStorage.setItem(key, next); } catch { return; }
    location.reload();
  }
}

export function localizeMarkup({ manifest: updateManifest = true } = {}) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
  if (language === "fa") return;
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest && updateManifest) manifest.href = "/manifest.en.webmanifest";
  const attributes = ["aria-label", "placeholder", "title", "alt", "value", "label"];
  function translate(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.data.trim();
      const key = node.previousSibling?.nodeType === Node.COMMENT_NODE && node.previousSibling.data.startsWith("msg:")
        ? node.previousSibling.data.slice(4) : null;
      const translated = key ? messages[key] : english[text];
      if (translated) node.data = node.data.replace(text, translated);
    } else if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (const attr of attributes) {
        const text = node.getAttribute?.(attr);
        const key = node.getAttribute?.("data-msg-" + attr);
        const translated = key ? messages[key] : english[text];
        if (translated) node.setAttribute(attr, translated);
      }
      const source = node instanceof HTMLTemplateElement ? node.content : node;
      for (const child of source.childNodes) translate(child);
    }
  }
  translate(document.documentElement);
}
