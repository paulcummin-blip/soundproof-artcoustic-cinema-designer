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
import {
  normalizeAssumedLevel,
  resolveAssumedP15Level,
  resolveAssumedP21Level,
} from "@/components/utils/assumedParameterAuthority";
import {
  OVERHEAD_ONLY_PARAMETER_NUMBERS,
  hasOverheadLayer,
  hasZonalSpeakerLayer,
} from "@/components/utils/rp22/overheadLayerAuthority";
// Pure helper for the ASDR continuous P17 off-axis improvement contribution.
// Computes the per-seat coverage-quality margin from the P17 HUD metric's
// per-speaker evidence; the rating adapter turns the margin into a bounded
// bonus on P17's multiplier. No RP22 level is changed here.
import { computeP17ContinuousMargin } from "./p17ContinuousCoverageBonus";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** RP22 seat-scope parameters that only exist with a height / overhead layer. */
const OVERHEAD_ONLY_SEAT_KEYS = new Set(
  OVERHEAD_ONLY_PARAMETER_NUMBERS.map((number) => `p${number}`),
);

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
  if (metric.provisional === true || metric.indeterminate === true || metric.verified === false) return true;
  const status = String(metric.status || "").toLowerCase();
  const formatted = String(metric.formatted || "").toUpperCase().trim();

  // Explicit N/A or not-applicable
  if (status === "not_applicable" || status === "na") return true;
  if (formatted === "N/A" || formatted === "NOT APPLICABLE") return true;

  // Not-calculated family — applicable but not yet computed
  if (/not.?calculated|uncalculated|calculating|updating|no.?data|incomplete|provisional|stale|indeterminate/.test(status)) return true;
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
 * Is this metric a LEGITIMATE terminal not-applicable result (as opposed to an
 * insufficient-data result that merely displays as N/A)? A legitimate N/A carries
 * an explicit not-applicable status or an applicable:false flag. Used for P10 to
 * keep the single-row / no-overhead N/A terminal (excluded from the rating and
 * accepted by report readiness) while an applicable-but-uncalculated P10 stays
 * provisional so the export gate retains it as an unresolved failure.
 */
function isLegitimateOverheadNa(metric) {
  if (!metric || typeof metric !== "object") return false;
  if (metric.provisional === true || metric.indeterminate === true || metric.verified === false) return false;
  const status = String(metric.status || "").toLowerCase();
  if (status === "not_applicable" || status === "na") return true;
  if (metric.applicable === false) return true;
  const formatted = String(metric.formatted || "").toUpperCase().trim();
  if (formatted === "N/A" && metric.level === "N/A") return true;
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
  p19SeatAuthority = null,
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

  // Does this design have an overhead / height speaker layer at all? One
  // authority answers that (overheadLayerAuthority). Without a height layer the
  // overhead-only parameters are N/A, not unassessed.
  const overheadLayerPresent = hasOverheadLayer(placedSpeakers);

  // ── Room-scope parameters ──────────────────────────────────────────

  // P2: Number of screen wall speakers (bed count from canonical layout)
  const p2 = !isMetricIneligible(room[2]) && isNum(room[2]?.value) ? { rawValue: room[2].value } : null;

  // P3: Screen wall speakers outside zones (fail count: 0 = L4, >0 = FAIL)
  const p3 = !isMetricIneligible(room[3]) && isNum(room[3]?.value) ? { rawValue: room[3].value } : null;

  // P7: Front wide angular deviation — N/A if layout has no front wides
  let p7;
  if (!hasFrontWides) {
    p7 = { na: true };
  } else if (!isMetricIneligible(room[7]) && isNum(room[7]?.value)) {
    p7 = { rawValue: room[7].value };
  } else {
    p7 = null; // provisional (front wides exist but no data yet)
  }

  // P11: Speaker zone compliance — assessed on the speakers that are actually
  // installed (side/rear surrounds, front wides and any uppers). An absent
  // overhead layer never leaves it waiting, and with no such speaker at all —
  // or a published N/A from the canonical P11 authority — it is genuinely N/A.
  const p11RoomResult = room[11] || null;
  const p11Applicable = hasZonalSpeakerLayer(placedSpeakers);
  const p11NotApplicable = !p11Applicable
    || p11RoomResult?.status === "not_applicable"
    || String(p11RoomResult?.level || "").toUpperCase() === "N/A";
  const p11 = p11NotApplicable
    ? { na: true }
    : (isMetricIneligible(p11RoomResult)
        ? null
        : {
            outsideCount: p11RoomResult.value,
            level: p11RoomResult.level,
            indeterminate: p11RoomResult.status === "indeterminate",
          });

  // P12: Screen speakers SPL capability at RSP
  const p12 = !isMetricIneligible(room[12]) && isNum(room[12]?.value)
    ? { rawValue: room[12].value, mode: reportP12Mode }
    : null;

  // P13: Non-screen speakers SPL capability at RSP
  const p13 = !isMetricIneligible(room[13]) && isNum(room[13]?.value)
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

  // P19 is assessed only at RSP. Never substitute an individual seat result.
  const rspP19 = completedBassPresentation?.parameters?.p19;
  const p19 = bassVerified
    ? (rspP19?.isAuthoritative === true && rspP19?.status === "complete"
        ? { rawValue: rspP19.rawValue, authoritativeLevel: rspP19.level, verified: true }
        : null)
    : (retainedBassActive ? retainedBass.p19Rsp ?? null : null);

  // ── Seat-scope parameters ─────────────────────────────────────────

  const seatParamKeys = ["p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p20"];
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

    // Overhead-only parameters (P9, P10) do not exist for a design with no
    // overhead / height speakers: the answer is N/A for every seat, so they are
    // excluded from the rating and from report readiness rather than blocking it.
    if (OVERHEAD_ONLY_SEAT_KEYS.has(key) && !overheadLayerPresent) {
      for (const seatId of seatIds) {
        seatScope[key][seatId] = "na";
      }
      continue;
    }

    for (const seatId of seatIds) {
      // P20 preserves the canonical individual-seat grade without re-grading.
      if (key === "p20") {
        const metric = reportSeatHudById?.[seatId]?.rp22?.p20;
        const rawValue = extractRawValue(metric);
        if (bassVerified && !isMetricIneligible(metric) && isNum(rawValue) && metric?.level) {
          seatScope[key][seatId] = { rawValue, authoritativeLevel: metric.level, verified: true };
        } else if (retainedBassActive) {
          const retainedRaw = retainedBass.p20BySeat?.[seatId];
          const retainedLevel = retainedBass.p20LevelBySeat?.[seatId];
          seatScope[key][seatId] = isNum(retainedRaw) && retainedLevel
            ? { rawValue: retainedRaw, authoritativeLevel: retainedLevel, verified: true }
            : null;
        } else {
          seatScope[key][seatId] = null;
        }
        continue;
      }

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

      // Ineligible check (N/A, Not calculated, calculating, updating, etc.)
      if (isMetricIneligible(metric)) {
        // P10: distinguish a legitimate terminal N/A (no overhead layer or a
        // single overhead row — status "not_applicable") from an insufficient-
        // data result (P10 is applicable but the SPL spread could not be
        // calculated). The terminal N/A is "na" (excluded from the rating and
        // accepted by report readiness); insufficient-data stays provisional so
        // the export gate retains it as an unresolved failure.
        if (key === "p10" && !isLegitimateOverheadNa(metric)) {
          seatScope[key][seatId] = null;
        } else {
          seatScope[key][seatId] = "na";
        }
        continue;
      }

      const rawValue = extractRawValue(metric);

      // P17 carries the per-speaker coverage evidence the ASDR continuous
      // contribution needs. The discrete RP22 grade still comes from rawValue
      // (the limiting coverage-window dB); the continuous margin is passed
      // alongside it so the rating adapter can add a bounded bonus without
      // changing the RP22 level.
      if (key === "p17") {
        const margin = computeP17ContinuousMargin(metric?.perSpeaker, metric?.windowLevelNumber);
        seatScope[key][seatId] = isNum(rawValue)
          ? { rawValue, p17ContinuousMargin: isNum(margin) ? margin : 0 }
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
    seats: (Array.isArray(seats) ? seats : []).map((s) => ({ id: s?.id, priority: s?.priority })).filter((s) => s?.id),
    // Room-scope
    p2,
    p3,
    p7,
    p11,
    p12,
    p13,
    p14,
    // P15: a published measured grade wins; otherwise the permanent L2
    // design assumption contributes to the rating.
    p15: analysisResult?.gradedParameters?.primary?.[15]?.status === "measured"
      && normalizeAssumedLevel(analysisResult.gradedParameters.primary[15].level)
      ? normalizeAssumedLevel(analysisResult.gradedParameters.primary[15].level)
      : resolveAssumedP15Level(assumedP15Level),
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
    p19,
    p20: seatScope.p20,
    // P21: a published measured grade wins; otherwise the permanent L2
    // design assumption contributes to the rating.
    p21: analysisResult?.gradedParameters?.primary?.[21]?.status === "measured"
      && normalizeAssumedLevel(analysisResult.gradedParameters.primary[21].level)
      ? normalizeAssumedLevel(analysisResult.gradedParameters.primary[21].level)
      : resolveAssumedP21Level(assumedP21Level),
    screen: screenInput,
  };
}