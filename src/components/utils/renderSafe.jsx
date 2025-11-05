// components/utils/renderSafe.js
export function renderPrimitive(v) {
  if (v == null) return "—";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return String(v);

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