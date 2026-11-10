const key = "medora-language";
export const language = localStorage.getItem(key) === "en" ? "en" : "fa";
const english = language === "en" ? (await import("./english.js")).default : {};
export const locale = language === "en" ? "en-US" : "fa-IR";
export const defaultCalendar = language === "en" ? "gregory" : "persian";
const weekStart = language === "en" ? 0 : 6;
export const shortWeek = language === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["ش", "ی", "د", "س", "چ", "پ", "ج"];
export const weekIndex = day => (new Date(day * 86_400_000).getUTCDay() - weekStart + 7) % 7;
export const listSeparator = language === "en" ? ", " : "، ";

export function t(message, ...values) {
  const copy = language === "en" && Object.hasOwn(english, message) ? english[message] : message;
  return copy.replace(/\{(\d+)\}/g, (placeholder, index) => values[index] ?? placeholder);
}

export function localDigits(value) {
  const text = String(value);
  return language === "en" ? text : text.replace(/[0-9.]/g, char => char === "." ? "٫" : "۰۱۲۳۴۵۶۷۸۹"[Number(char)]);
}

export function selectLanguage(next) {
  if (next !== language && (next === "fa" || next === "en")) {
    localStorage.setItem(key, next);
    location.reload();
  }
}

export function localizeMarkup() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "en" ? "ltr" : "rtl";
  if (language === "fa") return;
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = "/manifest.en.webmanifest";
  const attributes = ["aria-label", "placeholder", "title", "alt", "value", "label"];
  function translate(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.data.trim();
      if (Object.hasOwn(english, text)) node.data = node.data.replace(text, english[text]);
    } else if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (const attr of attributes) {
        const text = node.getAttribute?.(attr);
        if (Object.hasOwn(english, text)) node.setAttribute(attr, english[text]);
      }
      const source = node instanceof HTMLTemplateElement ? node.content : node;
      for (const child of source.childNodes) translate(child);
    }
  }
  translate(document.documentElement);
}
