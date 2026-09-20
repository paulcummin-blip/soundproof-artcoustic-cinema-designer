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
 * The achieved value and RP22 level are read directly from the published
 * engineering summary. This selector never grades them.
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

const RESULT_HEADINGS = {
  L4: "Level 4",
  L3: "Level 3",
  L2: "Level 2",
  L1: "Level 1",
  FAIL: "Does not achieve Level 1",
};

const RESULT_EXPLANATION =
  "Minimum SPL capability of the surround and overhead speakers at the reference seating position.";

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
  engineeringSummary,
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

  // Direct reads from the canonical publication. No report-side grading.
  const p13 = engineeringSummary?.roomResultsByParameter?.[13] ?? null;
  const minimum = p13 && Number.isFinite(Number(p13.value))
    ? { value: Number(p13.value), formatted: p13.formatted || `${p13.value} dB` }
    : null;
  const level = engineeringSummary?.parameterSummaries?.project?.p13?.level
    ?? engineeringSummary?.parameterSummaries?.project?.[13]?.level
    ?? p13?.level
    ?? null;
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