/**
 * overheadLayerAuthority
 * ----------------------
 * The ONE authority for whether a design has an overhead / height speaker layer,
 * and therefore whether the OVERHEAD-ONLY RP22 parameters exist for it at all.
 *
 * A system with no overhead / height speakers (a 5.2, for example) has no
 * vertical speaker spread and no upper-speaker level spread to assess. P9 and
 * P10 are then NOT APPLICABLE — not missing, not unverified, not failed — and
 * they must never block report readiness or lower the design rating.
 *
 * Applicability only. This module changes no threshold, no geometry, no SPL
 * value and no grading: it answers one question ("is there a height layer?")
 * and packages the N/A result shape the rest of the app already understands
 * (state "na" / status "not_applicable", level "N/A").
 *
 * The "present" test is the same eligibility every other zone and rating
 * consumer uses: a canonical height role, a real product model, and a placed
 * position.
 */

import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

/**
 * Canonical height / overhead (upper-layer) roles. Includes the Dolby top roles
 * and the up-firing variants; TL/TR are kept because legacy layouts store them.
 */
export const HEIGHT_LAYER_ROLES = Object.freeze([
  "TFL", "TFR",
  "TML", "TMR",
  "TBL", "TBR",
  "TRL", "TRR",
  "TL", "TR",
  "UFL", "UFR", "UBL", "UBR",
]);

const HEIGHT_LAYER_ROLE_SET = new Set(HEIGHT_LAYER_ROLES);

/** Listener-level surround / wide roles that P11 assesses alongside the uppers. */
export const ZONAL_BED_ROLES = Object.freeze(["SL", "SR", "SBL", "SBR", "LW", "RW"]);

const ZONAL_BED_ROLE_SET = new Set(ZONAL_BED_ROLES);

/** RP22 parameters that only exist when a height / overhead layer is installed. */
export const OVERHEAD_ONLY_PARAMETER_NUMBERS = Object.freeze([9, 10]);

/** The stated reason shown wherever an overhead-only parameter reads N/A. */
export const NO_OVERHEAD_LAYER_REASON =
  "Not applicable — this design has no overhead / height speakers.";

/** The stated reason when there is no surround, wide or upper speaker to assess. */
export const NO_ZONAL_SPEAKER_LAYER_REASON =
  "Not applicable — this design has no surround, wide or upper speakers to assess.";

/**
 * The stated reason when exactly one overhead speaker row is present. Kept
 * internally for validation and diagnostics; the normal interface and PDF show
 * only "N/A" (see buildSingleOverheadRowNotApplicableMetric).
 */
export const SINGLE_OVERHEAD_ROW_REASON =
  "Not applicable — only one overhead speaker row is present.";

/** Canonical height role? */
export function isHeightLayerRole(role) {
  return HEIGHT_LAYER_ROLE_SET.has(getCanonicalRole(role));
}

/** A placed speaker that really exists: real model, not disabled, positioned. */
function isInstalledSpeaker(speaker) {
  if (!speaker || typeof speaker !== "object") return false;
  if (speaker.enabled === false) return false;
  const model = String(speaker.model ?? "").trim().toLowerCase();
  if (!model || model === "off" || model === "none") return false;
  const position = speaker.position || null;
  if (!position) return false;
  return Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y));
}

/**
 * Does the design have an overhead / height speaker layer?
 *
 * @param {Array} speakers - placed / layout-visible speakers
 * @returns {boolean}
 */
export function hasOverheadLayer(speakers) {
  if (!Array.isArray(speakers)) return false;
  return speakers.some((speaker) => isInstalledSpeaker(speaker) && isHeightLayerRole(speaker.role));
}

/**
 * Does the design have any speaker P11 can assess — a listener-level side, rear
 * or wide surround, or an upper/height speaker? Without one of these there is no
 * placement to judge, so P11 is N/A rather than a false "0 outside zones".
 *
 * @param {Array} speakers - placed / layout-visible speakers
 * @returns {boolean}
 */
export function hasZonalSpeakerLayer(speakers) {
  if (!Array.isArray(speakers)) return false;
  return speakers.some((speaker) => {
    if (!isInstalledSpeaker(speaker)) return false;
    const role = getCanonicalRole(speaker.role);
    return ZONAL_BED_ROLE_SET.has(role) || HEIGHT_LAYER_ROLE_SET.has(role);
  });
}

/** Is this RP22 parameter number an overhead-only parameter (P9, P10)? */
export function isOverheadOnlyParameter(number) {
  return OVERHEAD_ONLY_PARAMETER_NUMBERS.includes(Number(number));
}

/**
 * The published shape for a parameter that does not apply to this design.
 * Consumers already read `state`/`status` for applicability and `level`/`formatted`
 * for display, so an N/A metric travels the existing paths unchanged:
 * the rating excludes it, the readiness gate treats it as complete, and the
 * panels show "N/A" rather than a dash.
 */
export function buildOverheadNotApplicableMetric() {
  return {
    value: null,
    formatted: "N/A",
    level: "N/A",
    status: "not_applicable",
    applicable: false,
    note: NO_OVERHEAD_LAYER_REASON,
  };
}

/**
 * Map a canonical height / overhead role to its overhead row index, using the
 * same front/mid/rear convention as the P9 row-elevation authority:
 *   0 = front (TFL, TFR, TF*), 1 = mid (TML, TMR, TM*),
 *   2 = rear (TRL, TRR, TBL, TBR, TB*). Returns null for anything else.
 */
export function overheadRowFromRole(role) {
  const r = getCanonicalRole(role);
  if (!r) return null;
  if (r === "TFL" || r === "TFR" || r.startsWith("TF")) return 0;
  if (r === "TML" || r === "TMR" || r.startsWith("TM")) return 1;
  if (r === "TRL" || r === "TRR" || r === "TBL" || r === "TBR" || r.startsWith("TB") || r.startsWith("TR")) return 2;
  if (r === "TL" || r === "TR") return 0; // legacy top left/right
  return null;
}

/**
 * Count the distinct overhead rows actually installed (enabled, real model,
 * positioned) — the real speaker-row geometry, not the nominal channel count.
 * P10 needs two or more rows (four or six speakers in the standard Dolby Atmos
 * layouts); a single row has no upper-row level spread to assess.
 */
export function countDistinctOverheadRows(speakers) {
  if (!Array.isArray(speakers)) return 0;
  const rows = new Set();
  for (const speaker of speakers) {
    if (!isInstalledSpeaker(speaker)) continue;
    if (!isHeightLayerRole(speaker.role)) continue;
    const row = overheadRowFromRole(speaker.role);
    if (row != null && row >= 0 && row <= 2) rows.add(row);
  }
  return rows.size;
}

/**
 * The published shape for P10 when only one overhead speaker row is present.
 * Displays as "N/A" (formatted/level); the note carries the reason internally
 * for validation and troubleshooting only.
 */
export function buildSingleOverheadRowNotApplicableMetric() {
  return {
    value: null,
    formatted: "N/A",
    level: "N/A",
    status: "not_applicable",
    applicable: false,
    note: SINGLE_OVERHEAD_ROW_REASON,
  };
}

/** Is this published metric an explicit not-applicable result? */
export function isNotApplicableMetric(metric) {
  if (!metric || typeof metric !== "object") return false;
  const status = String(metric.status || "").toLowerCase();
  if (status === "not_applicable" || status === "na") return true;
  return metric.applicable === false || String(metric.level).toUpperCase() === "N/A";
}