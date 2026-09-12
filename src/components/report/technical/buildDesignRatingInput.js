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
import { normalizeAssumedLevel } from "@/components/utils/assumedParameterAuthority";

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
 * Check if a metric is genuinely N/A or otherwise ineligible (not calculated,
 * calculating, updating, missing, etc.). Ineligible metrics must be EXCLUDED
 * from the design rating floor — never converted to FAIL, L1, 0, or any
 * fallback grade.
 *
 * Ineligible states: N/A, NOT APPLICABLE, NOT CALCULATED, UNCALCULATED,
 * CALCULATING, UPDATING, missing, undefined, null.
 */
function isMetricIneligible(metric) {
  if (!metric || typeof metric !== "object") return true; // missing → ineligible
  const status = String(metric.status || "").toLowerCase();
  const formatted = String(metric.formatted || "").toUpperCase().trim();

  // Explicit N/A or not-applicable
  if (status === "not_applicable" || status === "na") return true;
  if (formatted === "N/A" || formatted === "NOT APPLICABLE") return true;

  // Not-calculated family — applicable but not yet computed
  if (/not.?calculated|uncalculated|calculating|updating|no.?data|incomplete/.test(status)) return true;
  if (/^not.?calculated$/i.test(formatted) || formatted === "CALCULATING" || formatted === "UPDATING") return true;

  // Dash / empty formatted with no real value
  if (formatted === "—" || formatted === "-" || formatted === "") {
    // Check if there's a genuine numeric value field
    const hasRealNum = ["value", "valueM", "valueDb", "valueDeg", "valueHz"].some(
      (k) => typeof metric[k] === "number" && Number.isFinite(metric[k])
    );
    if (!hasRealNum) return true;
  }

  // Level is explicitly N/A or dash (no genuine calculated grade)
  const lvl = metric.level;
  if (lvl === "N/A" || lvl === "—" || lvl === "-" || lvl === "NO DATA") return true;

  return false;
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
 * @param {string} params.reportP18Mode             - "minimum" | "recommended"
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
  reportP18Mode = "minimum",
  hasFrontWides = false,
  placedSpeakers = [],
  assumedP15Level = null,
  assumedP21Level = null,
  retainedBass = null,
}) {
  const bassVerified = isBassPublicationVerified(completedBassAuthority);
  // Retained bass: previously verified same-fingerprint bass inputs, used when
  // current bass publication is temporarily unavailable (e.g. during a refresh).
  // Only bass parameters (P14/P18/P19/P20) may be retained; non-bass parameters
  // always come from the current analysis.
  const retainedBassActive = !bassVerified && retainedBass != null && retainedBass.fingerprint != null;
  const effectiveBassVerified = bassVerified || retainedBassActive;
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

  // P14: Bass SPL capability — from completed bass authority (publication-verified),
  // or retained same-fingerprint bass when current publication is temporarily
  // unavailable. Only bass parameters may be retained.
  const p14Raw = bassVerified
    ? completedBassPresentation?.parameters?.p14?.rawValue
    : (retainedBassActive ? retainedBass.p14Raw : null);
  const p14Mode = bassVerified
    ? reportP14Mode
    : (retainedBassActive ? (retainedBass.p14Mode || reportP14Mode) : reportP14Mode);
  const p14 =
    effectiveBassVerified && isNum(p14Raw)
      ? { rawValue: p14Raw, verified: true, mode: p14Mode }
      : null;

  // P18: Bass extension — from completed bass authority (publication-verified),
  // or retained same-fingerprint bass (see P14 above).
  const p18Raw = bassVerified
    ? completedBassPresentation?.parameters?.p18?.rawValue
    : (retainedBassActive ? retainedBass.p18Raw : null);
  const p18Mode = bassVerified
    ? reportP18Mode
    : (retainedBassActive ? (retainedBass.p18Mode || reportP18Mode) : reportP18Mode);
  const p18Qualified = bassVerified
    ? completedBassPresentation?.parameters?.p18?.qualifiedAtSelectedP14Output !== false
    : (retainedBassActive ? retainedBass.p18Qualified !== false : true);
  const p18 =
    effectiveBassVerified && isNum(p18Raw)
      ? {
          rawValue: p18Raw,
          verified: true,
          mode: p18Mode,
          qualified: p18Qualified,
        }
      : null;

  // ── Seat-scope parameters ─────────────────────────────────────────

  const seatParamKeys = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p19", "p20"];
  const seatScope = {};

  // Room-level guard: some seat-scope parameters also have a room-level
  // evaluation in gradedParameters.primary (currently P5). When the room-level
  // evaluation is null (Not calculated), the per-seat values must also be
  // excluded — the Compliance Report and the rating engine must consume the
  // same canonical status/applicability semantics. This is a general rule:
  // for any seat-scope key with a numeric ID present in gradedParameters.primary
  // as null, ALL per-seat values are treated as na (excluded from the floor).
  const roomLevelNullSeatKeys = new Set();
  for (const key of seatParamKeys) {
    const pid = Number(key.replace("p", ""));
    if (Number.isFinite(pid) && pid in room && room[pid] == null) {
      roomLevelNullSeatKeys.add(key);
    }
  }

  for (const key of seatParamKeys) {
    seatScope[key] = {};

    // If the room-level evaluation for this seat-scope parameter is null
    // (Not calculated), exclude ALL per-seat values.
    if (roomLevelNullSeatKeys.has(key)) {
      for (const seatId of seatIds) {
        seatScope[key][seatId] = "na";
      }
      continue;
    }

    for (const seatId of seatIds) {
      const hud = reportSeatHudById?.[seatId];
      if (!hud) {
        seatScope[key][seatId] = null;
        continue;
      }

      const metric = hud.rp22?.[key];
      if (!metric) {
        // Bass seat-scope (P19/P20): fall back to retained same-fingerprint bass
        // when current publication is temporarily unavailable.
        if ((key === "p19" || key === "p20") && retainedBassActive) {
          const retainedMap = key === 'p19' ? retainedBass.p19BySeat : retainedBass.p20BySeat;
          const retainedVal = retainedMap?.[seatId];
          seatScope[key][seatId] = isNum(retainedVal) ? { rawValue: retainedVal, verified: true } : null;
        } else {
          seatScope[key][seatId] = null;
        }
        continue;
      }

      // Ineligible check (N/A, Not calculated, calculating, updating, etc.)
      if (isMetricIneligible(metric)) {
        seatScope[key][seatId] = "na";
        continue;
      }

      const rawValue = extractRawValue(metric);

      if (key === "p19" || key === "p20") {
        // Bass seat-scope: use current verified bass, or retained same-fingerprint
        // bass when current publication is temporarily unavailable.
        if (bassVerified && isNum(rawValue)) {
          seatScope[key][seatId] = { rawValue, verified: true };
        } else if (retainedBassActive) {
          const retainedMap = key === 'p19' ? retainedBass.p19BySeat : retainedBass.p20BySeat;
          const retainedVal = retainedMap?.[seatId];
          seatScope[key][seatId] = isNum(retainedVal) ? { rawValue: retainedVal, verified: true } : null;
        } else {
          seatScope[key][seatId] = null;
        }
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
    // P15: pass the RAW assumed level (null or "L1"–"L4"). The rating
    // authority treats null as provisional (NOT CALCULATED → excluded from
    // floor). Only a genuine designer selection is scored.
    p15: normalizeAssumedLevel(assumedP15Level),
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
    // P21: pass the RAW assumed level (null or "L1"–"L4"). The rating
    // authority treats null as provisional (NOT CALCULATED → excluded from
    // floor). Only a genuine designer selection is scored. This ensures
    // Compliance and Design Rating agree: null = not calculated for both.
    p21: normalizeAssumedLevel(assumedP21Level),
    screen: screenInput,
  };
}