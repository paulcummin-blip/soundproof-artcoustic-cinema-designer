// components/utils/renderSafe.js

// A report value is stated only when it is genuinely present. Numeric zero and
// the string "0" are valid; null, undefined, blank strings and NaN are not.
export function isStatedPrimitive(v) {
  if (v == null) return false;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed !== "" && trimmed.toLowerCase() !== "nan";
  }
  return typeof v === "boolean";
}

export function firstStatedPrimitive(values, fallback = "—") {
  const list = Array.isArray(values) ? values : [values];
  const stated = list.find(isStatedPrimitive);
  return stated === undefined ? fallback : renderPrimitive(stated);
}

export function renderPrimitive(v) {
  if (v == null) return "—";
  const t = typeof v;
  if (t === "number") return Number.isFinite(v) ? String(v) : "—";
  if (t === "string") {
    const trimmed = v.trim();
    return trimmed && trimmed.toLowerCase() !== "nan" ? v : "—";
  }
  if (t === "boolean") return String(v);

  // Special-case our RP22 angle-level objects
  if (t === "object" && ("angleDeg" in v || "levelKey" in v || "range" in v)) {
    const lvl = v.levelKey ?? "";
    const ang = Number.isFinite(v.angleDeg) ? `${v.angleDeg.toFixed(1)}°` : "";
    const rng = Array.isArray(v.range) && v.range.length === 2
      ? ` (${v.range[0]}–${v.range[1]}°)`
      : "";
    return `${lvl}${lvl && (ang || rng) ? " — " : ""}${ang}${rng}`.trim() || "[angle]";
  }

  // Fallback – never return a raw object to JSX
  try { return JSON.stringify(v); } catch { return String(v); }
}