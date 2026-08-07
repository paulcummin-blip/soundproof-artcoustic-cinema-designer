/**
 * selectClientNonScreenDynamicRange
 * ---------------------------------
 * Pure selector for the Non-Screen Speakers SPL Capability client Visual Report.
 *
 * RP22 Parameter 13 — Non-Screen Speakers SPL Capability at RSP.
 * P13 is a ROOM parameter, measured at the Reference Seating Position.
 *
 * ── Target-basis authority ──
 * The active target basis is the SAME authority that drives the App compliance
 * panel (RP22CompliancePanel) and the Technical Report (RP22ReportParameterGrid):
 *   appState.splConfig.p13Mode  →  "minimum" | "recommended"  (default "minimum")
 *
 * The threshold tables below mirror those two authorities EXACTLY. Keep in sync.
 * The achieved SPL (gradedParameters.primary[13].value) does NOT change with the
 * target basis. The RP22 level DOES, because the level is re-graded from the
 * achieved value using the active thresholds.
 *
 * ── Canonical P13 result ──
 *   analysisResult.gradedParameters.primary[13].value       → achieved minimum SPL
 *   allSeatSplMetrics.get("mlp").spl.surrounds / .uppers      → individual channel SPL
 *
 * Returns:
 *   {
 *     seats: [{ id, x, y }],
 *     rsp,
 *     speakerSplValues: [{ role, formatted }] | [],  // non-screen channels at RSP
 *     minimum: { value, formatted } | null,
 *     level: "L4"|"L3"|"L2"|"L1"|"FAIL"|null,
 *     targetBasis, targetBasisLabel,
 *     resultHeading, resultExplanation,
 *     hasAny: boolean
 *   }
 */

// ── P13 target-basis thresholds (mirror RP22CompliancePanel / RP22ReportParameterGrid) ──
const P13_THRESHOLDS_MINIMUM = { direction: ">=", L1: 96, L2: 99, L3: 102, L4: 105 };
const P13_THRESHOLDS_RECOMMENDED = { direction: ">=", L1: 99, L2: 102, L3: 105, L4: 108 };

function resolveP13Thresholds(p13Mode) {
  return p13Mode === "recommended" ? P13_THRESHOLDS_RECOMMENDED : P13_THRESHOLDS_MINIMUM;
}

function gradeP13ForBasis(value, p13Mode) {
  if (!Number.isFinite(value)) return null;
  const t = resolveP13Thresholds(p13Mode);
  if (value >= t.L4) return "L4";
  if (value >= t.L3) return "L3";
  if (value >= t.L2) return "L2";
  if (value >= t.L1) return "L1";
  return "FAIL";
}

const RESULT_HEADINGS = {
  L4: "Exceptional surround capability",
  L3: "Strong surround capability",
  L2: "Good surround capability",
  L1: "Basic surround capability",
  FAIL: "Additional surround capability recommended",
};

const RESULT_EXPLANATION =
  "The surround and overhead speakers maintain consistent impact and clarity across the listening area, preserving the immersion of demanding movie soundtracks at the reference seating position.";

function ceilDb(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.ceil(n);
  return { value: c, formatted: `${c} dB` };
}

function normalizeSeatGeometry(seat) {
  if (!seat) return null;
  const x = Number(seat.x ?? seat.position?.x);
  const y = Number(seat.y ?? seat.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { id: seat.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`, x, y };
}

// Role display order for the card (surrounds first, then overheads)
const ROLE_ORDER = ["SL", "SR", "SBL", "SBR", "LW", "RW", "TFL", "TFR", "TML", "TMR", "TBL", "TBR", "TFM", "TRM"];

function roleOrderIndex(role) {
  const idx = ROLE_ORDER.indexOf(String(role).toUpperCase());
  return idx === -1 ? 999 : idx;
}

export function selectClientNonScreenDynamicRange({
  analysisResult,
  allSeatSplMetrics,
  seatingPositions,
  rsp,
  p13Mode = "minimum",
}) {
  const targetBasis = p13Mode === "recommended" ? "recommended" : "minimum";
  const targetBasisLabel = p13Mode === "recommended" ? "Recommended" : "Minimum";

  // Seat geometry for drawing only
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map(normalizeSeatGeometry)
    .filter(Boolean);

  // Non-screen speaker SPL values at MLP (surrounds + overheads)
  const speakerSplValues = [];
  if (allSeatSplMetrics && typeof allSeatSplMetrics.get === "function") {
    const entry = allSeatSplMetrics.get("mlp");
    const surrounds = entry?.spl?.surrounds || {};
    const uppers = entry?.spl?.uppers || {};
    for (const [role, data] of Object.entries({ ...surrounds, ...uppers })) {
      if (data && Number.isFinite(data.value)) {
        const c = ceilDb(data.value);
        if (c) speakerSplValues.push({ role: String(role).toUpperCase(), formatted: c.formatted });
      }
    }
  }
  speakerSplValues.sort((a, b) => roleOrderIndex(a.role) - roleOrderIndex(b.role));

  // Canonical P13 achieved value (room-scope) — does NOT change with basis
  const p13 = analysisResult?.gradedParameters?.primary?.[13] ?? null;
  let minimum = null;
  if (p13 && Number.isFinite(p13.value)) {
    minimum = { value: p13.value, formatted: p13.formatted || `${p13.value} dB` };
  }

  // Achieved level — re-graded from the canonical value using the active basis
  const level = minimum ? gradeP13ForBasis(minimum.value, targetBasis) : null;
  const resultHeading = level ? RESULT_HEADINGS[level] || "" : "";

  const hasAny = speakerSplValues.length > 0 || !!(minimum && level);

  return {
    seats,
    rsp,
    speakerSplValues,
    minimum,
    level,
    targetBasis,
    targetBasisLabel,
    resultHeading,
    resultExplanation: RESULT_EXPLANATION,
    hasAny,
  };
}

export default selectClientNonScreenDynamicRange;