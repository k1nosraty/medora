const maxDepth = 10;
const maxNodes = 300_000;
const maxEntries = 45_000;
const maxText = 16_384;
const maxEnvelopeText = 131_072;
const legacyMaxText = 16 * 1024 * 1024;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function recordObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Validate resource usage and JSON shape before domain-specific validation.
 * @param {unknown} input
 * @param {boolean} [legacy]
 */
export function boundedCarePayload(input, legacy = false) {
  const depthLimit = legacy ? 24 : maxDepth;
  const nodeLimit = legacy ? 600_000 : maxNodes;
  const entryLimit = legacy ? 100_000 : maxEntries;
  let nodes = 0;
  /** @param {unknown} value @param {number} depth @param {string} [field] @returns {boolean} */
  function bounded(value, depth, field) {
    if (++nodes > nodeLimit || depth > depthLimit) return false;
    if (typeof value === "string") {
      const limit = legacy ? legacyMaxText : field === "data" ? maxEnvelopeText : maxText;
      return value.length <= limit;
    }
    if (typeof value === "number") return Number.isFinite(value);
    if (value == null || typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.length <= entryLimit && value.every(item => bounded(item, depth + 1));
    if (!recordObject(value)) return false;
    const keys = Object.keys(value);
    return keys.length <= entryLimit && keys.every(key => key.length <= 550 &&
      key !== "__proto__" && key !== "prototype" && key !== "constructor" && bounded(value[key], depth + 1, key));
  }
  return recordObject(input) && bounded(input, 0);
}

/** @param {unknown} value @param {number} limit */
export function boundedText(value, limit) {
  return typeof value === "string" && value.length <= limit;
}

/** @param {unknown} left @param {unknown} right @returns {boolean} */
export function equalCareValues(left, right) {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => equalCareValues(value, right[index]));
  }
  if (!recordObject(left) || !recordObject(right)) return false;
  const keys = Object.keys(left).filter(key => left[key] !== undefined);
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length &&
    keys.every(key => Object.hasOwn(right, key) && equalCareValues(left[key], right[key]));
}
