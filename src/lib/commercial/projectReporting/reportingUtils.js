/**
 * reportingUtils.js
 * -----------------
 * Shared primitives for the Project Intelligence derivation layer.
 *
 * Pure: no React, no side effects.
 */

export const text = (value) => String(value ?? '').trim();

export function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function safeObject(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function timeOf(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * A usable reference instant in milliseconds, for age and window maths.
 *
 * An absent, empty or unparseable value means "now", and never the epoch — a
 * missing reference must not silently age every project to 1970.
 */
export function referenceTime(value) {
  if (value === null || value === undefined || value === '') return Date.now();
  const stamp = timeOf(value);
  return stamp === null ? Date.now() : stamp;
}

export function dayDiff(a, b) {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta === null || tb === null) return null;
  return Math.abs(ta - tb) / 86400000;
}

function bigramDice(a, b) {
  const grams = (value) => {
    const set = new Set();
    for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const gram of ga) if (gb.has(gram)) shared += 1;
  return (2 * shared) / (ga.size + gb.size);
}

/** Loose similarity: word overlap plus character pairs. Used only for advisory duplicate hints. */
export function similarity(a, b) {
  const left = slug(a);
  const right = slug(b);
  if (!left || !right) return 0;
  const setA = new Set(left.split(' '));
  const setB = new Set(right.split(' '));
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  const wordDice = (2 * shared) / (setA.size + setB.size);
  return Math.max(wordDice, bigramDice(left, right));
}