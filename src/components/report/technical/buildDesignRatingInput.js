/**
 * buildDesignRatingInput.js
 * --------------------------------
 * Pure bridge between the existing canonical analysis data and the
 * Artcoustic System Design Rating adapter.
 *
 * Extracts RAW values from:
 *   - analysisResult.gradedParameters.primary  (room-scope)
 *   - reportSeatHudById                        (seat-scope)
 *   - completedBassPresentation                (bass, with publication guard)
 *
 * Returns the input object expected by buildArtcousticDesignRatingAuthority().
 *
 * The UI layer supplies ONLY existing canonical authority inputs.
 * No thresholds, FAIL rules, or bass scoring are reimplemented here.
 */

import { isBassPublicationVerified } from "./artcousticSystemDesignRating";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Count the number of distinct zonal speaker categories that have at least
 * one placed speaker. P11 is only meaningful when 2+ categories are present.
 *
 * Categories: side-surround, rear-surround, front-wide,
 *             overhead-front, overhead-mid, overhead-rear
 */
function countP11ApplicableCategories(placedSpeakers) {
  if (!Array.isArray(placedSpeakers)) return 0;
  const cats = new Set();
  for (const s of placedSpeakers) {
    const r = String(s?.role || "").toUpperCase();
    if (r === "SL" || r === "SR") cats.add("side-surround");
    else if (r === "SBL" || r === "SBR") cats.add("rear-surround");
    else if (r === "LW" || r === "RW") cats.add("front-wide");
    else if (r === "TFL" || r === "TFR") cats.add("overhead-front");
    else if (r === "TML" || r === "TMR") cats.add("overhead-mid");
    else if (r === "TBL" || r === "TBR" || r === "TRL" || r === "TRR") cats.add("overhead-rear");
  }
  return cats.size;
}

/**
 * Extract a numeric raw value from a seat HUD metric, checking common field names.
 */
function extractRawValue(metric) {
  if (!metric || typeof metric !== "object") return null;
  for (const key of ["value", "valueM", "valueDb", "valueDeg", "valueHz"]) {
    if (isNum(metric[key])) return Number(metric[key]);
  }
  return null;
}

/**
 * Check if a metric is genuinely N/A (not applicable to this layout).
 */
function isMetricNa(metric) {
  if (!metric || typeof metric !== "object") return false;
  const status = String(metric.status || "").toLowerCase();
  const formatted = String(metric.formatted || "").toUpperCase().trim();
  return status === "not_applicable" || formatted === "N/A";
}

/**
 * Build the Artcoustic System Design Rating adapter input from existing data.
 *
 * @param {Object} params
 * @param {Array}  params.seats                    - Array of seat objects with .id
 * @param {Object} params.analysisResult           - From useRP22AnalysisEngine
 * @param {Object} params.reportSeatHudById         - Map of seatId → HUD snapshot
 * @param {Object} params.completedBassAuthority    - From useCompletedBassAuthority
 * @param {Object} params.completedBassPresentation - From buildComplianceBassPresentation
 * @param {string} params.reportP12Mode             - "minimum" | "recommended"
 * @param {string} params.reportP13Mode             - "minimum" | "recommended"
 * @param {string} params.reportP14Mode             - "minimum" | "recommended"
 * @param {boolean} params.hasFrontWides            - Whether layout includes front wide speakers
 * @returns {Object} Input for buildArtcousticDesignRatingAuthority()
 */
export function buildDesignRatingInput({
  seats,
  analysisResult,
  reportSeatHudById,
  completedBassAuthority,
  completedBassPresentation,
  reportP12Mode = "minimum",
  reportP13Mode = "minimum",
  reportP14Mode = "minimum",
  hasFrontWides = false,
  placedSpeakers = [],
}) {
  const bassVerified = isBassPublicationVerified(completedBassAuthority);
  const seatIds = (Array.isArray(seats) ? seats : []).map((s) => s?.id).filter(Boolean);
  const room = analysisResult?.gradedParameters?.primary || {};

  // ── Room-scope parameters ──────────────────────────────────────────

  // P2: Number of screen wall speakers (bed count from canonical layout)
  const p2 = isNum(room[2]?.value) ? { rawValue: room[2].value } : null;

  // P3: Screen wall speakers outside zones (fail count: 0 = L4, >0 = FAIL)
  const p3 = isNum(room[3]?.value) ? { rawValue: room[3].value } : null;

  // P7: Front wide angular deviation — N/A if layout has no front wides
  let p7;
  if (!hasFrontWides) {
    p7 = { na: true };
  } else if (room[7] && isNum(room[7].value)) {
    p7 = { rawValue: room[7].value };
  } else {
    p7 = null; // provisional (front wides exist but no data yet)
  }

  // P11: Speaker zone compliance — only applicable when 2+ zonal speaker
  // categories are present (meaningful zonal comparison). The canonical P11
  // authority itself is preserved — this is a topology applicability gate only.
  const p11Applicable = countP11ApplicableCategories(placedSpeakers) >= 2;
  const p11 = (!p11Applicable || !room[11])
    ? null
    : {
        outsideCount: room[11].value,
        level: room[11].level,
        indeterminate: room[11].status === "indeterminate",
      };

  // P12: Screen speakers SPL capability at RSP
  const p12 = isNum(room[12]?.value)
    ? { rawValue: room[12].value, mode: reportP12Mode }
    : null;

  // P13: Non-screen speakers SPL capability at RSP
  const p13 = isNum(room[13]?.value)
    ? { rawValue: room[13].value, mode: reportP13Mode }
    : null;

  // P14: Bass SPL capability — from completed bass authority (publication-verified)
  const p14Raw = completedBassPresentation?.parameters?.p14?.rawValue;
  const p14 =
    bassVerified && isNum(p14Raw)
      ? { rawValue: p14Raw, verified: true, mode: reportP14Mode }
      : null;

  // P18: Bass extension — from completed bass authority (publication-verified)
  const p18Raw = completedBassPresentation?.parameters?.p18?.rawValue;
  const p18 =
    bassVerified && isNum(p18Raw)
      ? { rawValue: p18Raw, verified: true }
      : null;

  // ── Seat-scope parameters ─────────────────────────────────────────

  const seatParamKeys = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p19", "p20"];
  const seatScope = {};

  for (const key of seatParamKeys) {
    seatScope[key] = {};
    for (const seatId of seatIds) {
      const hud = reportSeatHudById?.[seatId];
      if (!hud) {
        seatScope[key][seatId] = null;
        continue;
      }

      const metric = hud.rp22?.[key];
      if (!metric) {
        seatScope[key][seatId] = null;
        continue;
      }

      // N/A check (e.g. P9/P10 when no overheads)
      if (isMetricNa(metric)) {
        seatScope[key][seatId] = "na";
        continue;
      }

      const rawValue = extractRawValue(metric);

      if (key === "p19" || key === "p20") {
        // Bass seat-scope: only pass with verified: true when publication is verified
        seatScope[key][seatId] =
          bassVerified && isNum(rawValue)
            ? { rawValue, verified: true }
            : null;
      } else {
        seatScope[key][seatId] = isNum(rawValue) ? rawValue : null;
      }
    }
  }

  // Screen / viewing geometry — RP23 horizontal viewing angle per seat
  const screenInput = {};
  for (const seatId of seatIds) {
    const hud = reportSeatHudById?.[seatId];
    const angle = hud?.rp23?.angleDeg;
    screenInput[seatId] = isNum(angle) ? Number(angle) : null;
  }

  return {
    seats: seatIds.map((id) => ({ id })),
    // Room-scope
    p2,
    p3,
    p7,
    p11,
    p12,
    p13,
    p14,
    p18,
    // Seat-scope
    p1: seatScope.p1,
    p4: seatScope.p4,
    p5: seatScope.p5,
    p6: seatScope.p6,
    p9: seatScope.p9,
    p10: seatScope.p10,
    p16: seatScope.p16,
    p17: seatScope.p17,
    p19: seatScope.p19,
    p20: seatScope.p20,
    screen: screenInput,
  };
}