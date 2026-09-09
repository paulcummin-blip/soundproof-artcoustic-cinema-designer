// rp22LevelDisplay.js — Canonical RP22 level display normalizer.
//
// Ensures numeric 0 (FAIL) is never treated as falsy by JavaScript's `||`
// operator. The `|| "—"` pattern was replacing valid calculated FAIL levels
// with "—" because `0 || "—"` evaluates to "—".
//
// This helper is the single authority for converting raw metric levels
// (numeric or string) into display-safe strings:
//   0        → "FAIL"
//   1–4      → "L1"–"L4"
//   "L1"     → "L1"  (pass-through)
//   "FAIL"   → "FAIL" (pass-through)
//   "N/A"    → "N/A"  (pass-through)
//   null/undefined/"" /"—"/"-" → "—"

export function normalizeLevelForDisplay(level) {
  if (level == null) return "—";
  if (typeof level === "number") {
    return level === 0 ? "FAIL" : `L${level}`;
  }
  const str = String(level).trim();
  if (str === "" || str === "-" || str === "—") return "—";
  return str;
}