/**
 * selectClientFrontSoundstageDynamicRange
 * ---------------------------------------
 * Pure selector for the Front Soundstage Dynamic Capability client Visual Report.
 *
 * RP22 Parameter 12 — Screen Speakers SPL Capability at RSP.
 * P12 is a ROOM parameter, measured at the Reference Seating Position.
 *
 * ── Target-basis authority ──
 * The active target basis is the SAME authority that drives the App compliance
 * panel (RP22CompliancePanel) and the Technical Report (RP22ReportParameterGrid):
 *   appState.p12Mode  →  "minimum" | "recommended"  (default "minimum")
 *
 * The threshold tables below mirror those two authorities EXACTLY. Keep in sync.
 * The achieved SPL (gradedParameters.primary[12].value) does NOT change with the
 * target basis. The RP22 level and band thresholds DO change, because the level
 * is re-graded from the achieved value using the active thresholds — the same
 * re-grading the App and Technical Report perform. The component never grades.
 *
 * ── Canonical P12 result ──
 *   analysisResult.gradedParameters.primary[12].value   → achieved minimum SPL
 *   allSeatSplMetrics.get("mlp").spl.screen.{FL,FC,FR}  → individual channel SPL
 *
 * Returns:
 *   {
 *     seats: [{ id, x, y }],                 // geometry only, for drawing
 *     rsp,
 *     fl: { value, formatted } | null,        // RSP SPL — does NOT change with basis
 *     fc: { value, formatted } | null,
 *     fr: { value, formatted } | null,
 *     minimum: { value, formatted } | null,   // achieved min SPL (canonical)
 *     level: "L4"|"L3"|"L2"|"L1"|"FAIL"|null,  // re-graded from value + active basis
 *     targetBasis: "minimum"|"recommended",
 *     targetBasisLabel: "Minimum"|"Recommended",
 *     thresholds: { L1, L2, L3, L4 },          // active thresholds
 *     bandLabels: [{ key, label, fill }],       // 5 items, active-threshold-based
 *     resultHeading: string,                    // dynamic by level
 *     resultExplanation: string,                // client-facing, concise
 *     hasAny: boolean
 *   }
 */

// ── P12 target-basis thresholds (mirror RP22CompliancePanel / RP22ReportParameterGrid) ──
const P12_THRESHOLDS_MINIMUM = { direction: ">=", L1: 99, L2: 102, L3: 105, L4: 108 };
const P12_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 102, L2: 105, L3: 108, L4: 111 };

function resolveP12Thresholds(p12Mode) {
  return p12Mode === "recommended" ? P12_THRESHOLDS_RECOMMENDED : P12_THRESHOLDS_MINIMUM;
}

// Re-grade from the achieved value using the active basis — same logic as App/Tech.
function gradeP12ForBasis(value, p12Mode) {
  if (!Number.isFinite(value)) return null;
  const t = resolveP12Thresholds(p12Mode);
  if (value >= t.L4) return "L4";
  if (value >= t.L3) return "L3";
  if (value >= t.L2) return "L2";
  if (value >= t.L1) return "L1";
  return "FAIL";
}

function p12TargetBasisLabel(p12Mode) {
  return p12Mode === "recommended" ? "Recommended" : "Minimum";
}

// Brand-aligned band fills (lightest at L4 → darkest at FAIL).
const BAND_FILLS = [
  "rgba(33, 52, 40, 0.02)", // L4
  "rgba(33, 52, 40, 0.05)", // L3
  "rgba(98, 81, 67, 0.08)", // L2
  "rgba(98, 81, 67, 0.14)", // L1
  "rgba(74, 35, 15, 0.20)", // FAIL
];

function buildP12BandLabels(p12Mode) {
  const t = resolveP12Thresholds(p12Mode);
  return [
    { key: "l4",   label: `≥ ${t.L4} dB · L4`,      fill: BAND_FILLS[0] },
    { key: "l3",   label: `${t.L3}–${t.L4} dB · L3`, fill: BAND_FILLS[1] },
    { key: "l2",   label: `${t.L2}–${t.L3} dB · L2`, fill: BAND_FILLS[2] },
    { key: "l1",   label: `${t.L1}–${t.L2} dB · L1`, fill: BAND_FILLS[3] },
    { key: "fail", label: `< ${t.L1} dB`,           fill: BAND_FILLS[4] },
  ];
}

const RESULT_HEADINGS = {
  L4: "Exceptional dynamic capability",
  L3: "Strong cinema-level dynamic capability",
  L2: "Good dynamic capability",
  L1: "Basic dynamic capability",
  FAIL: "Additional dynamic capability recommended",
};

const RESULT_EXPLANATION =
  "The left, centre and right speakers operate together as a single acoustic system, maintaining clear dialogue and preserving the impact of demanding movie soundtracks at the reference seating position.";

function ceilDb(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.ceil(n); // whole dB, matches engine P12 rounding
  return { value: c, formatted: `${c} dB` };
}

function normalizeSeatGeometry(seat) {
  if (!seat) return null;
  const x = Number(seat.x ?? seat.position?.x);
  const y = Number(seat.y ?? seat.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { id: seat.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`, x, y };
}

export function selectClientFrontSoundstageDynamicRange({
  analysisResult,
  allSeatSplMetrics,
  seatingPositions,
  rsp,
  p12Mode = "minimum",
}) {
  const targetBasis = p12Mode === "recommended" ? "recommended" : "minimum";
  const targetBasisLabel = p12TargetBasisLabel(targetBasis);
  const thresholds = resolveP12Thresholds(targetBasis);
  const bandLabels = buildP12BandLabels(targetBasis);

  // Seat geometry for drawing only (no SPL/level)
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map(normalizeSeatGeometry)
    .filter(Boolean);

  // RSP screen-channel SPL values (canonical authority) — do NOT change with basis
  let fl = null;
  let fc = null;
  let fr = null;
  if (allSeatSplMetrics && typeof allSeatSplMetrics.get === "function") {
    const entry = allSeatSplMetrics.get("mlp");
    const screen = entry?.spl?.screen;
    if (screen) {
      const flRaw = Number.isFinite(screen.FL?.value) ? Number(screen.FL.value)
        : (Number.isFinite(screen.L?.value) ? Number(screen.L.value) : null);
      const fcRaw = Number.isFinite(screen.FC?.value) ? Number(screen.FC.value)
        : (Number.isFinite(screen.C?.value) ? Number(screen.C.value) : null);
      const frRaw = Number.isFinite(screen.FR?.value) ? Number(screen.FR.value)
        : (Number.isFinite(screen.R?.value) ? Number(screen.R.value) : null);
      if (flRaw !== null) fl = ceilDb(flRaw);
      if (fcRaw !== null) fc = ceilDb(fcRaw);
      if (frRaw !== null) fr = ceilDb(frRaw);
    }
  }

  // Canonical P12 achieved value (room-scope) — does NOT change with basis
  const p12 = analysisResult?.gradedParameters?.primary?.[12] ?? null;
  let minimum = null;
  if (p12 && Number.isFinite(p12.value)) {
    minimum = { value: p12.value, formatted: p12.formatted || `${p12.value} dB` };
  }

  // Achieved level — re-graded from the canonical value using the active basis
  const level = minimum ? gradeP12ForBasis(minimum.value, targetBasis) : null;
  const resultHeading = level ? RESULT_HEADINGS[level] || "" : "";

  const hasAny = !!(fl || fc || fr) || !!(minimum && level);

  return {
    seats,
    rsp,
    fl,
    fc,
    fr,
    minimum,
    level,
    targetBasis,
    targetBasisLabel,
    thresholds,
    bandLabels,
    resultHeading,
    resultExplanation: RESULT_EXPLANATION,
    hasAny,
  };
}

export default selectClientFrontSoundstageDynamicRange;