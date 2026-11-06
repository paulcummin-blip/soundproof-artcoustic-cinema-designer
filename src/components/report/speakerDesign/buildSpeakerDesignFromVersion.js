/**
 * buildSpeakerDesignFromVersion.js
 * --------------------------------
 * Builds the Current Speaker Design schedule ({ groups, layout }) from a merged
 * project+version object — the same object `mergeProjectAndVersion` produces and
 * `hydrateProjectIntoAppState` consumes — WITHOUT requiring the live React app
 * state.
 *
 * It extracts only the fields the speaker design schedule needs
 * (placedSpeakers, subwooferInstances, front/rear sub configs, screen, layout)
 * and applies the same normalisation the full hydration does for those fields:
 * canonical product IDs, JSON parsing and the layout visibility rule. The
 * front-stage placement note is read from the version's own saved screen
 * construction, through the same `frontStagePlacementAuthority` the report uses.
 *
 * This is the lightweight path the Proposal Centre's "Generate Speaker Design
 * PDF" action uses: it reuses the SAME `buildSpeakerDesignRows` product
 * authority the Project Report and the Current Speaker Design panel use, so the
 * schedule a designer generates from the Proposal Centre is identical to the one
 * the Project Report stores beside it.
 *
 * Pure: no React, no SDK, no side effects.
 */

import { parseProjectJson } from '@/components/roomdesigner/RoomDesignerHelpers';
import { canonicalProductId } from '@/components/utils/modelKeyNormaliser';
import { layoutVisibilityFilter } from '@/components/report/reportProductsSelected';
import { buildSpeakerDesignRows } from '@/components/report/speakerDesign/speakerDesignRows';
import { systemFormat } from '@/shared/systemFormat';
import { readPersistedScreenPlaneM } from '@/components/utils/screenPlanePersistence';
import { resolveDisplayType } from '@/components/models/screen/displayTypeAuthority';

/** Parse a JSON-or-array/object field into its native type, or a fallback. */
function parseField(value, fallback) {
  if (value == null) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

/**
 * The placed-speakers array from the merged object, with the same canonical
 * product-ID normalisation the full hydration applies, so a stored "_s" suffix
 * never reaches the schedule as a different product.
 */
function extractPlacedSpeakers(merged) {
  const raw = parseField(merged?.selected_speakers, null) || parseField(merged?.placedSpeakers, null);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((spk) => spk && typeof spk === 'object')
    .map((spk) => (spk.model ? { ...spk, model: canonicalProductId(spk.model) } : spk));
}

/** The subwoofer instances array, parsed from the merged object. */
function extractSubwooferInstances(merged) {
  const raw = parseField(merged?.subwooferInstances, null);
  return Array.isArray(raw) ? raw : [];
}

/** The front/rear sub configs, parsed from the merged object. */
function extractSubConfig(merged, primaryKey, legacyKey) {
  return parseProjectJson(merged?.[primaryKey] ?? merged?.[legacyKey], null);
}

/**
 * A minimal screen object carrying the fields the front-stage placement note and
 * the display type authority read, built from the merged object's screen fields.
 * This is NOT a full hydration — it is exactly what the speaker design schedule
 * needs to state the same placement note the report states.
 */
function extractScreen(merged) {
  const screenFrontPlaneM = readPersistedScreenPlaneM(merged?.screen_front_plane_m);
  return {
    display_type: merged?.display_type ?? null,
    tv_preset_key: merged?.tv_preset_key ?? null,
    tv_width_mm: Number(merged?.tv_width_mm) || null,
    manual_dimensions: !!merged?.manual_dimensions,
    manual_width_m: Number(merged?.manual_width_m) || 0,
    manual_height_m: Number(merged?.manual_height_m) || 0,
    mount_mode: merged?.screen_mount_mode || merged?.mountMode || 'floating',
    mountMode: merged?.screen_mount_mode || merged?.mountMode || 'floating',
    show_cavity: !!merged?.show_cavity,
    screen_front_plane_m: screenFrontPlaneM,
    screenFrontPlaneM,
    aspect_ratio: merged?.aspect_ratio || '16:9',
    visibleWidthInches: Number(merged?.screen_size) || 120,
    screen_size: Number(merged?.screen_size) || 120,
  };
}

/**
 * The Current Speaker Design schedule of one design version, built from its
 * merged project+version object through the SAME product authority the Project
 * Report and the Current Speaker Design panel use.
 *
 * @param {Object} merged — the result of `mergeProjectAndVersion(project, version)`
 * @returns {{ groups: Array, layout: string|null, isEmpty: boolean }}
 */
export function buildSpeakerDesignFromVersion(merged) {
  if (!merged || typeof merged !== 'object') {
    return { groups: [], layout: null, isEmpty: true };
  }

  const placedSpeakers = extractPlacedSpeakers(merged);
  const subwooferInstances = extractSubwooferInstances(merged);
  const frontSubsCfg = extractSubConfig(merged, 'front_subs_cfg', 'frontSubsCfg');
  const rearSubsCfg = extractSubConfig(merged, 'rear_subs_cfg', 'rearSubsCfg');
  const dolbyLayout = merged?.dolby_config || '5.1';
  const sevenBedLayoutType = merged?.seven_bed_layout_type || 'rears';
  const screen = extractScreen(merged);
  const isVisible = layoutVisibilityFilter(dolbyLayout, sevenBedLayoutType);

  const acousticTreatmentEnabled = !!(merged?.acoustic_treatment_enabled ?? merged?.acousticTreatmentEnabled ?? false);
  const selectedAbfuserQty = Math.floor(Number(merged?.selected_abfuser_qty ?? merged?.selectedAbfuserQty) || 0);

  const result = buildSpeakerDesignRows({
    placedSpeakers,
    frontSubsCfg,
    rearSubsCfg,
    subwooferInstances,
    screen,
    isVisible,
    acousticTreatmentEnabled,
    selectedAbfuserQty,
  });

  const layout = systemFormat({
    layout: dolbyLayout,
    subwooferInstances,
    frontSubsCfg,
    rearSubsCfg,
  }) || dolbyLayout;

  return {
    groups: result.groups,
    layout,
    isEmpty: result.isEmpty,
  };
}

export default buildSpeakerDesignFromVersion;