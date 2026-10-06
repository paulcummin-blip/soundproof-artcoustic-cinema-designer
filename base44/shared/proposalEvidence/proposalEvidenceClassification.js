/**
 * proposalEvidenceClassification.js (shared)
 * ------------------------------------------
 * The INTERPRETATION half of the frozen proposal evidence pack: for every major
 * design area, whether the options are the same, different, materially
 * different, not materially different, or not comparable.
 *
 * This is Sound Proof's own reading of its own evidence. It is deterministic and
 * data-only, and it is the reason a writer never has to decide what is better: a
 * claim may be made only where this module has already classified the area and
 * said which option the evidence supports.
 *
 * THE RULES, in order
 * -------------------
 *  1. A single option is not a comparison: not comparable.
 *  2. An area any report does not state is not comparable. Missing evidence is
 *     never filled in from anywhere.
 *  2b. The room is compared on its own stated dimensions (to a millimetre of
 *     rounding), falling back to the stated dimensions text: same, different, or
 *     not comparable when a report does not state it. Wording is never what
 *     makes a room the same room.
 *  3. Identical statements in every report: same.
 *  4. Equipment: a change of model is a change of equipment, never a claimed
 *     gain. What the equipment achieves is decided by the graded results below.
 *  5. Graded areas (RP22 results, the RP23 viewing floor), where every report
 *     states a level:
 *       - the same level, a different value  -> not materially different
 *       - different levels, best result L3 or L4 -> materially different
 *       - different levels, every result L1 or L2 -> not materially different
 *         (two low-grade results are a stated difference, not a material gain:
 *          the same line the client meaning authority draws)
 *  6. Any other stated difference (screen, seating, system format): different.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { parseLevel } from '../comparisonTable.js';
import {
  AREA_KIND,
  CLASSIFICATION,
  MATERIAL_RESULT_LEVELS,
  PROPOSAL_EVIDENCE_AREAS,
} from './evidencePackSchema.js';

/** An area reading as comparable text, or null when it is not stated. */
function textOf(reading) {
  if (reading === null || reading === undefined) return null;
  if (typeof reading === 'string') {
    const trimmed = reading.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const explicit = typeof reading.text === 'string' ? reading.text.trim() : '';
  if (explicit.length > 0) return explicit;
  const composed = [reading.level, reading.value].filter(Boolean).join(' · ');
  return composed.length > 0 ? composed : null;
}

/** The graded level of a reading, or null when it states none. */
function levelOf(reading) {
  if (reading === null || reading === undefined) return null;
  if (typeof reading === 'string') return parseLevel(reading);
  return parseLevel(reading.level) || parseLevel(reading.text);
}

/** The highest level reached by any option. */
function highestLevel(levels) {
  return levels.reduce((best, level) => {
    if (!level) return best;
    if (!best) return level;
    return Number(level.slice(1)) > Number(best.slice(1)) ? level : best;
  }, null);
}

/** The two rooms are the same room within a millimetre of rounding. */
const ROOM_DIMENSION_TOLERANCE_M = 0.005;

/** A stated number, or null. An unstated dimension is never read as zero. */
function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The dimensions a room reading states, or null when it states none. */
function dimsOf(reading) {
  const dimensions = reading && typeof reading === 'object' ? reading.dimensions : null;
  if (!dimensions) return null;
  const values = [dimensions.length_m, dimensions.width_m, dimensions.height_m].map(numericOrNull);
  return values.every((value) => value !== null) ? values : null;
}

/**
 * The room: the same, different, or not comparable. The stated dimensions decide
 * it when both reports state them; the stated dimensions text decides it
 * otherwise. A room fact either report omits is never filled in.
 */
function classifyRoom(area, values, readings) {
  const dims = readings.map(dimsOf);
  const same = dims.every(Boolean)
    ? dims.every((entry) => entry.every((value, index) => Math.abs(value - dims[0][index]) <= ROOM_DIMENSION_TOLERANCE_M))
    : new Set(values.map((value) => String(value).toLowerCase().replace(/\s+/g, ' ').trim())).size === 1;
  return verdict(
    area,
    same ? CLASSIFICATION.SAME : CLASSIFICATION.DIFFERENT,
    same ? 'identical_room_dimensions' : 'different_room_dimensions',
    values,
  );
}

function verdict(area, classification, reason, values, levels = []) {
  return {
    area: area.key,
    label: area.label,
    kind: area.kind,
    structure: area.structure,
    classification,
    reason,
    values,
    levels,
  };
}

/**
 * Classify one area across every option.
 *
 * @param {Object} area — a PROPOSAL_EVIDENCE_AREAS entry
 * @param {Array<string|Object|null>} readings — one reading per option, in order
 * @returns {Object} the classification row
 */
export function classifyArea(area, readings = []) {
  const list = Array.isArray(readings) ? readings : [];
  const values = list.map(textOf);

  if (list.length < 2) return verdict(area, CLASSIFICATION.NOT_COMPARABLE, 'single_option', values);
  if (values.some((value) => !value)) {
    return verdict(area, CLASSIFICATION.NOT_COMPARABLE, 'not_stated_by_every_report', values);
  }

  // The room is classified from its own dimensions before any wording is read.
  if (area.kind === AREA_KIND.ROOM) return classifyRoom(area, values, list);

  if (new Set(values).size === 1) return verdict(area, CLASSIFICATION.SAME, 'identical_in_every_report', values);

  if (area.kind === AREA_KIND.EQUIPMENT) {
    return verdict(area, CLASSIFICATION.DIFFERENT, 'different_equipment', values);
  }

  const levels = list.map(levelOf);
  if (levels.some((level) => !level)) {
    return verdict(area, CLASSIFICATION.DIFFERENT, 'stated_values_differ', values, levels);
  }
  if (new Set(levels).size === 1) {
    return verdict(area, CLASSIFICATION.NOT_MATERIALLY_DIFFERENT, 'same_level_different_value', values, levels);
  }

  const best = highestLevel(levels);
  if (MATERIAL_RESULT_LEVELS.includes(best)) {
    return verdict(area, CLASSIFICATION.MATERIALLY_DIFFERENT, 'higher_level_achieved', values, levels);
  }
  return verdict(area, CLASSIFICATION.NOT_MATERIALLY_DIFFERENT, 'both_results_low_grade', values, levels);
}

/**
 * Classify every major design area across the options.
 *
 * @param {Array<Object>} optionAreas — each option's area readings, in order
 * @returns {Array<Object>} one classification row per area, in canonical order
 */
export function classifyAreas(optionAreas = []) {
  const list = Array.isArray(optionAreas) ? optionAreas : [];
  return PROPOSAL_EVIDENCE_AREAS.map((area) => classifyArea(area, list.map((readings) => readings?.[area.key] ?? null)));
}

/** The classification row for one area, or null. */
export function classificationFor(classification, areaKey) {
  return (Array.isArray(classification) ? classification : []).find((row) => row.area === areaKey) || null;
}