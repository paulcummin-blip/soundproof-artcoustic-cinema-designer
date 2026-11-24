/**
 * documentFreshnessReason.js
 * --------------------------
 * Pure comparison of the frozen design and engineering facts associated with a
 * saved document against the current authoritative design.
 *
 * When a stored document (Technical Report or Speaker Design) is marked Outdated
 * because its source engineering fingerprint no longer matches the version's
 * current published pointer, this module explains WHY in human-readable terms,
 * by comparing the actual frozen design facts from the two publications rather
 * than inferring a reason from the fingerprint mismatch alone.
 *
 * The frozen facts live on each publication's report_snapshot.report_project
 * (see shared/engineeringPublicationContract.js → buildFrozenReportProject).
 * Both the saved document's source publication and the current publication are
 * looked up from the ProjectAnalysisCache.engineering_publications map by
 * fingerprint.
 *
 * Rules this module holds:
 *   - Never infer a reason from a fingerprint mismatch alone. A change is
 *     reported only when the two publications' frozen facts actually differ in
 *     a meaningful design category.
 *   - Ignore presentation-only changes. Derived display identity (display type,
 *     label, phrase) is stripped from the screen before comparison. Zoom,
 *     scrolling and workspace layout are not part of the frozen facts and so
 *     can never produce a reason here.
 *   - If either publication's frozen facts are unavailable, or the fingerprints
 *     differ but no identifiable design change is found, return null so the
 *     caller shows "Document source could not be verified." rather than
 *     attributing an internal inconsistency to the designer.
 *
 * Pure: no React, no network, no side effects.
 */

import { withoutDerivedDisplayIdentity } from '@/components/models/screen/displayTypeAuthority';

/**
 * Tolerance for numeric comparisons of published design values. Published
 * values are deterministic for a given design, so a real change produces a
 * genuinely different value. This small tolerance guards against any
 * serialisation rounding noise without hiding sub-millimetre design changes.
 */
const NUMERIC_TOLERANCE = 1e-4;

/** Categories the comparison reports, in display order. */
export const FRESHNESS_CATEGORY = Object.freeze({
  ROOM: 'room',
  SCREEN: 'screen',
  SEATING: 'seating',
  SPEAKER_SELECTION: 'speaker_selection',
  SPEAKER_POSITIONS: 'speaker_positions',
  SPEAKER_ANGLES: 'speaker_angles',
  SUBWOOFER: 'subwoofer',
  PERFORMANCE: 'performance',
  ACOUSTIC_TREATMENT: 'acoustic_treatment',
});

/** Short noun phrases used to build the human-readable summary. */
const CATEGORY_PHRASE = Object.freeze({
  [FRESHNESS_CATEGORY.ROOM]: 'Room dimensions',
  [FRESHNESS_CATEGORY.SCREEN]: 'Screen configuration',
  [FRESHNESS_CATEGORY.SEATING]: 'Seating layout',
  [FRESHNESS_CATEGORY.SPEAKER_SELECTION]: 'Speaker selection',
  [FRESHNESS_CATEGORY.SPEAKER_POSITIONS]: 'Speaker positions',
  [FRESHNESS_CATEGORY.SPEAKER_ANGLES]: 'Speaker angles',
  [FRESHNESS_CATEGORY.SUBWOOFER]: 'Subwoofer design',
  [FRESHNESS_CATEGORY.PERFORMANCE]: 'Performance assessment',
  [FRESHNESS_CATEGORY.ACOUSTIC_TREATMENT]: 'Acoustic treatment',
});

/**
 * Categories relevant to each document type. Both documents are issued against
 * the same engineering publication, but an equipment schedule (Speaker Design)
 * is concerned with speakers, subwoofers and the screen that places them, while
 * the Technical Report covers the whole design.
 */
const RELEVANT_CATEGORIES = Object.freeze({
  project: new Set(Object.values(FRESHNESS_CATEGORY)),
  speaker_design: new Set([
    FRESHNESS_CATEGORY.SPEAKER_SELECTION,
    FRESHNESS_CATEGORY.SPEAKER_POSITIONS,
    FRESHNESS_CATEGORY.SPEAKER_ANGLES,
    FRESHNESS_CATEGORY.SUBWOOFER,
    FRESHNESS_CATEGORY.SCREEN,
    FRESHNESS_CATEGORY.ROOM,
  ]),
});

/**
 * Extract the frozen report project from a publication's report_snapshot.
 * Returns null when the publication or its frozen facts are unavailable.
 */
function frozenReportProject(publication) {
  const p = publication?.report_snapshot?.report_project;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  return p;
}

/** Parse roomDims, which may be a JSON string or an object. */
function parseRoomDims(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' ? value : null;
}

/** Whether two numeric values differ beyond the tolerance. */
function numbersDiffer(a, b) {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return String(a) !== String(b);
  return Math.abs(na - nb) > NUMERIC_TOLERANCE;
}

/** Whether two scalar values differ (exact for strings/enums, tolerant for numbers). */
function scalarsDiffer(a, b) {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  if (typeof a === 'number' || typeof b === 'number') return numbersDiffer(a, b);
  return String(a) !== String(b);
}

/** Build a role-keyed map of speakers from a selected_speakers array. */
function speakersByRole(speakers) {
  const map = new Map();
  (Array.isArray(speakers) ? speakers : []).forEach((speaker) => {
    const role = speaker?.role || speaker?.id;
    if (role) map.set(String(role), speaker || {});
  });
  return map;
}

/** Compare room dimensions between two frozen report projects. */
function roomChanged(saved, current) {
  const s = parseRoomDims(saved.roomDims);
  const c = parseRoomDims(current.roomDims);
  if (!s || !c) return false;
  return numbersDiffer(s.widthM, c.widthM)
    || numbersDiffer(s.lengthM, c.lengthM)
    || numbersDiffer(s.heightM, c.heightM);
}

/** Compare screen configuration, excluding derived display identity. */
function screenChanged(saved, current) {
  if (scalarsDiffer(saved.screen_size, current.screen_size)) return true;
  if (scalarsDiffer(saved.aspect_ratio, current.aspect_ratio)) return true;
  if (scalarsDiffer(saved.manual_dimensions, current.manual_dimensions)) return true;
  if (numbersDiffer(saved.manual_width_m, current.manual_width_m)) return true;
  if (numbersDiffer(saved.manual_height_m, current.manual_height_m)) return true;
  if (numbersDiffer(saved.screen_height_from_floor, current.screen_height_from_floor)) return true;
  if (scalarsDiffer(saved.screen_mount_mode, current.screen_mount_mode)) return true;
  if (numbersDiffer(saved.screen_front_plane_m, current.screen_front_plane_m)) return true;
  if (numbersDiffer(saved.float_depth_m, current.float_depth_m)) return true;
  if (numbersDiffer(saved.border_thickness_m, current.border_thickness_m)) return true;
  if (numbersDiffer(saved.speaker_clearance_m, current.speaker_clearance_m)) return true;
  if (scalarsDiffer(saved.tv_preset_key, current.tv_preset_key)) return true;
  if (numbersDiffer(saved.tv_width_mm, current.tv_width_mm)) return true;
  const sScreen = withoutDerivedDisplayIdentity(saved.report_screen || {}) || {};
  const cScreen = withoutDerivedDisplayIdentity(current.report_screen || {}) || {};
  const screenKeys = [
    'visibleWidthInches', 'aspectRatio', 'manualMode', 'manualWidthM', 'manualHeightM',
    'heightFromFloorM', 'mountMode', 'screenPlaneY_m', 'floatDepthM', 'borderThicknessM',
    'speakerClearanceM', 'tvWidthMm', 'tvPresetKey',
  ];
  for (const key of screenKeys) {
    if (scalarsDiffer(sScreen[key], cScreen[key])) return true;
  }
  return false;
}

/** Compare seating layout between two frozen report projects. */
function seatingChanged(saved, current) {
  const sSeats = Array.isArray(saved.seating_positions) ? saved.seating_positions : [];
  const cSeats = Array.isArray(current.seating_positions) ? current.seating_positions : [];
  if (sSeats.length !== cSeats.length) return true;
  if (scalarsDiffer(saved.seating_rows, current.seating_rows)) return true;
  const sCounts = Array.isArray(saved.seats_per_row_by_row) ? saved.seats_per_row_by_row : [];
  const cCounts = Array.isArray(current.seats_per_row_by_row) ? current.seats_per_row_by_row : [];
  if (sCounts.length !== cCounts.length) return true;
  for (let i = 0; i < sCounts.length; i += 1) {
    if (numbersDiffer(sCounts[i], cCounts[i])) return true;
  }
  if (numbersDiffer(saved.row_spacing_m, current.row_spacing_m)) return true;
  if (numbersDiffer(saved.seating_block_offset, current.seating_block_offset)) return true;
  if (scalarsDiffer(saved.mlp_basis, current.mlp_basis)) return true;
  const sEarHeights = Array.isArray(saved.row_ear_heights) ? saved.row_ear_heights : [];
  const cEarHeights = Array.isArray(current.row_ear_heights) ? current.row_ear_heights : [];
  if (sEarHeights.length !== cEarHeights.length) return true;
  for (let i = 0; i < sEarHeights.length; i += 1) {
    if (numbersDiffer(sEarHeights[i], cEarHeights[i])) return true;
  }
  for (let i = 0; i < sSeats.length; i += 1) {
    const s = sSeats[i] || {};
    const c = cSeats[i] || {};
    if (numbersDiffer(s.x, c.x) || numbersDiffer(s.y, c.y) || numbersDiffer(s.z, c.z)) return true;
    if (scalarsDiffer(s.priority, c.priority)) return true;
  }
  return false;
}

/** Compare speaker selection (models by role, layout, overheads). */
function speakerSelectionChanged(saved, current) {
  if (scalarsDiffer(saved.dolby_config, current.dolby_config)) return true;
  if (scalarsDiffer(saved.seven_bed_layout_type, current.seven_bed_layout_type)) return true;
  if (scalarsDiffer(saved.global_surround_model, current.global_surround_model)) return true;
  if (scalarsDiffer(saved.overhead_global_model, current.overhead_global_model)) return true;
  const sMap = speakersByRole(saved.selected_speakers);
  const cMap = speakersByRole(current.selected_speakers);
  if (sMap.size !== cMap.size) return true;
  for (const [role, sSpeaker] of sMap) {
    const cSpeaker = cMap.get(role);
    if (!cSpeaker) return true;
    if (scalarsDiffer(sSpeaker.model, cSpeaker.model)) return true;
  }
  return false;
}

/** Compare speaker positions for matching roles. */
function speakerPositionsChanged(saved, current) {
  const sMap = speakersByRole(saved.selected_speakers);
  const cMap = speakersByRole(current.selected_speakers);
  if (sMap.size === 0 || cMap.size === 0) return false;
  let found = false;
  for (const [role, sSpeaker] of sMap) {
    const cSpeaker = cMap.get(role);
    if (!cSpeaker) continue;
    const sp = sSpeaker.position || {};
    const cp = cSpeaker.position || {};
    if (numbersDiffer(sp.x, cp.x) || numbersDiffer(sp.y, cp.y) || numbersDiffer(sp.z, cp.z)) {
      found = true;
      break;
    }
  }
  if (found) return true;
  // Speaker clearance drives LCR placement relative to the screen.
  return numbersDiffer(saved.speaker_clearance_m, current.speaker_clearance_m);
}

/** Compare speaker angles and aim settings for matching roles. */
function speakerAnglesChanged(saved, current) {
  if (scalarsDiffer(saved.lcr_aim_mode, current.lcr_aim_mode)) return true;
  if (scalarsDiffer(saved.aim_front_wides_at_mlp, current.aim_front_wides_at_mlp)) return true;
  if (scalarsDiffer(saved.aim_side_surrounds_at_mlp, current.aim_side_surrounds_at_mlp)) return true;
  if (scalarsDiffer(saved.aim_rear_surrounds_at_mlp, current.aim_rear_surrounds_at_mlp)) return true;
  const sMap = speakersByRole(saved.selected_speakers);
  const cMap = speakersByRole(current.selected_speakers);
  if (sMap.size === 0 || cMap.size === 0) return false;
  for (const [role, sSpeaker] of sMap) {
    const cSpeaker = cMap.get(role);
    if (!cSpeaker) continue;
    const sr = sSpeaker.rotation || {};
    const cr = cSpeaker.rotation || {};
    if (numbersDiffer(sr.x, cr.x) || numbersDiffer(sr.y, cr.y) || numbersDiffer(sr.z, cr.z)) return true;
  }
  return false;
}

/** Compare subwoofer design. */
function subwooferChanged(saved, current) {
  const sSubs = Array.isArray(saved.subwooferInstances) ? saved.subwooferInstances : [];
  const cSubs = Array.isArray(current.subwooferInstances) ? current.subwooferInstances : [];
  const sActive = sSubs.filter((s) => s && s.enabled !== false);
  const cActive = cSubs.filter((s) => s && s.enabled !== false);
  if (sActive.length !== cActive.length) return true;
  for (let i = 0; i < sActive.length; i += 1) {
    const s = sActive[i] || {};
    const c = cActive[i] || {};
    if (scalarsDiffer(s.model, c.model)) return true;
    const sp = s.position || {};
    const cp = c.position || {};
    if (numbersDiffer(sp.x, cp.x) || numbersDiffer(sp.y, cp.y)) return true;
    if (numbersDiffer(s.bottomHeightM, c.bottomHeightM)) return true;
    if (scalarsDiffer(s.polarity, c.polarity)) return true;
    if (numbersDiffer(s.gainDb, c.gainDb)) return true;
    if (numbersDiffer(s.delayMs, c.delayMs)) return true;
  }
  return false;
}

/** Compare performance assessment (RP22 assumptions, SPL config, target SPL). */
function performanceChanged(saved, current) {
  if (scalarsDiffer(saved.assumed_p15_level, current.assumed_p15_level)) return true;
  if (scalarsDiffer(saved.assumed_p21_level, current.assumed_p21_level)) return true;
  if (scalarsDiffer(saved.viewing_priority, current.viewing_priority)) return true;
  const sSpl = saved.spl_config || {};
  const cSpl = current.spl_config || {};
  const splKeys = [
    'selectedP14Level', 'selectedP14TargetBasis', 'p14Mode',
    'p12_mode', 'p12_level', 'p13Mode',
    'lcrW', 'surroundsW', 'overheadsW', 'globalPowerW',
    'radiationMode', 'autoAlignEnabled',
  ];
  for (const key of splKeys) {
    if (scalarsDiffer(sSpl[key], cSpl[key])) return true;
  }
  if (numbersDiffer(saved.target_spl, current.target_spl)) return true;
  return false;
}

/** Compare acoustic treatment. */
function acousticTreatmentChanged(saved, current) {
  if (scalarsDiffer(saved.acoustic_treatment_enabled, current.acoustic_treatment_enabled)) return true;
  if (numbersDiffer(saved.selected_abfuser_qty, current.selected_abfuser_qty)) return true;
  return false;
}

/** The ordered category checkers. */
const CATEGORY_CHECKERS = Object.freeze([
  [FRESHNESS_CATEGORY.ROOM, roomChanged],
  [FRESHNESS_CATEGORY.SCREEN, screenChanged],
  [FRESHNESS_CATEGORY.SEATING, seatingChanged],
  [FRESHNESS_CATEGORY.SPEAKER_SELECTION, speakerSelectionChanged],
  [FRESHNESS_CATEGORY.SPEAKER_POSITIONS, speakerPositionsChanged],
  [FRESHNESS_CATEGORY.SPEAKER_ANGLES, speakerAnglesChanged],
  [FRESHNESS_CATEGORY.SUBWOOFER, subwooferChanged],
  [FRESHNESS_CATEGORY.PERFORMANCE, performanceChanged],
  [FRESHNESS_CATEGORY.ACOUSTIC_TREATMENT, acousticTreatmentChanged],
]);

/**
 * Identify the meaningful design changes between two publications' frozen
 * facts. Returns an ordered list of FRESHNESS_CATEGORY values that changed, or
 * an empty list when no identifiable design change is found.
 *
 * Returns null when either publication's frozen facts are unavailable, so the
 * caller can distinguish "could not compare" from "compared and nothing
 * changed".
 */
export function identifyDesignChanges(savedPublication, currentPublication) {
  const saved = frozenReportProject(savedPublication);
  const current = frozenReportProject(currentPublication);
  if (!saved || !current) return null;
  const changed = [];
  for (const [category, check] of CATEGORY_CHECKERS) {
    if (check(saved, current)) changed.push(category);
  }
  return changed;
}

/**
 * Build the concise human-readable summary of the design changes, filtered to
 * the categories relevant to the given document type.
 *
 * Returns a string, or null when the changes are null (evidence unavailable) or
 * empty (fingerprints differ but no identifiable design change — the caller then
 * shows "Document source could not be verified.").
 *
 * @param {Object} params
 * @param {Object|null} params.savedPublication  the publication the saved document was issued against
 * @param {Object|null} params.currentPublication  the version's current publication
 * @param {string} params.documentType  the ProjectAssetExport document_type
 */
export function buildFreshnessReason({ savedPublication = null, currentPublication = null, documentType = null } = {}) {
  const changes = identifyDesignChanges(savedPublication, currentPublication);
  if (changes == null) return null;
  if (changes.length === 0) return null;
  const relevant = RELEVANT_CATEGORIES[documentType] || RELEVANT_CATEGORIES.project;
  const filtered = changes.filter((category) => relevant.has(category));
  if (filtered.length === 0) return null;
  const phrases = filtered.map((category) => CATEGORY_PHRASE[category] || category);
  if (phrases.length === 1) {
    return `${phrases[0]} has changed since this document was created.`;
  }
  if (phrases.length === 2) {
    return `${phrases[0]} and ${phrases[1]} have changed since this document was created.`;
  }
  const head = phrases.slice(0, -1).join(', ');
  return `${head} and ${phrases[phrases.length - 1]} have changed since this document was created.`;
}

export default buildFreshnessReason;