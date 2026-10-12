/**
 * adiDesignPhilosophy.js (shared)
 * -------------------------------
 * STAGE 1's design philosophy: the professional judgement behind the recommended
 * solution, derived from the project data the interpretation already read.
 *
 * Sound Proof explains not only what has been designed, but why that solution is
 * right for this project. The interpretation records the reasoning; the report and
 * proposal writers explain it. This module produces that reasoning:
 *
 *   - what the design is for and which priorities it serves;
 *   - the display and seating balance, the coverage approach and the bass approach;
 *   - where the design is strongest, and which lower results are conscious
 *     trade-offs rather than failures;
 *   - which value-engineering opportunities the design already takes without
 *     substantial additional expenditure, and which remain a design choice;
 *   - what the project data does NOT establish, listed rather than guessed.
 *
 * It adds no engineering value, changes no result, and states no reason the
 * project data does not establish. The frozen evidence remains the sole authority
 * for every figure, level, product and claim.
 *
 * Split out of `adiProjectInterpretation.js` so each file stays readable: the
 * interpretation assembles the design story, and this module derives the
 * judgement behind it.
 *
 * Pure: no React, no side effects, no runtime-specific APIs.
 */

import { plainLanguageName } from './adiReportEvidenceRules.js';
import {
  DESIGN_PHILOSOPHY_NOT_ESTABLISHED,
  DESIGN_PHILOSOPHY_PRINCIPLE,
  DESIGN_PHILOSOPHY_RULES,
  DESIGN_PHILOSOPHY_VERSION,
  LEGITIMATE_LOWER_RESULT_REASONS,
  VALUE_ENGINEERING_PARAMETERS,
} from './designPhilosophyAuthority.js';

/** The RP22 Performance Level ordering, and a level's rank within it. */
export const LEVEL_RANK = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

export function rank(level) {
  if (!level) return null;
  const key = String(level).trim().toUpperCase();
  return Number.isFinite(LEVEL_RANK[key]) ? LEVEL_RANK[key] : null;
}

/** Every evidence row the interpretation already treats as usable, in one list. */
export function usableRows(parameterEvidence, bassEvidence) {
  return [
    ...Object.values(parameterEvidence?.byStructure || {}).flat(),
    ...(bassEvidence?.usable || []),
  ].filter((row) => row && rank(row.level) != null);
}

/**
 * The design's own strongest recorded rank, and the results that sit below it.
 * Nothing is inferred from them: a lower result is listed as a result, with no
 * reason attached, because the project data does not state one.
 */
export function lowerResults(rows, limit = 6) {
  if (rows.length === 0) return { best: null, lower: [] };
  const best = Math.max(...rows.map((row) => rank(row.level)));
  const lower = rows
    .filter((row) => rank(row.level) < best)
    .map((row) => ({ label: row.label || plainLanguageName(Number(row.parameter_id)), level: row.level }))
    .slice(0, limit);
  return { best, lower };
}

/**
 * Value engineering, read from the existing assessment only: which of the
 * value-engineering families this design already takes without substantial
 * additional expenditure, and which remain a design choice. Nothing is promised
 * and nothing is recommended: an entry here is an opportunity to investigate.
 */
export function valueEngineering(rows) {
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row.parameter_id);
    if (Number.isFinite(id) && !byId.has(id)) byId.set(id, row);
  }
  const alreadyCaptured = [];
  const remaining = [];
  for (const entry of VALUE_ENGINEERING_PARAMETERS) {
    // An assumed or administrative check is never a client-facing opportunity.
    if (entry.administrative) continue;
    const row = byId.get(entry.parameter_id);
    if (!row) continue;
    const record = {
      area: entry.label,
      label: row.label || plainLanguageName(entry.parameter_id),
      level: row.level,
    };
    if (rank(row.level) >= 4) alreadyCaptured.push(record);
    else remaining.push(record);
  }
  return { alreadyCaptured, remaining };
}

/** Which listening position the design is assessed from, from the seating data. */
export function prioritisedPositions({ mlpBasis, viewing, rowCount, totalSeats }) {
  const basis = String(mlpBasis || '').toLowerCase();
  const prioritised = basis === 'front'
    ? 'The front row is the reference position.'
    : basis === 'back'
      ? 'The rear row is the reference position.'
      : basis === 'all'
        ? 'The seating rows are read together as one reference area.'
        : basis === 'middle'
          ? 'The middle row is the reference position.'
          : 'The reference position is the design\'s own listening position.';
  return {
    reference_basis: mlpBasis || null,
    prioritised,
    rows: rowCount,
    seats: totalSeats,
    primary_level: viewing?.primary_floor ?? null,
    secondary_level: viewing?.secondary_floor ?? null,
    note: 'the seating evidence states which row the design is assessed from, so the priority is never moved to another row by choice',
  };
}

/**
 * The design philosophy: what this design is for, which priorities it serves, the
 * constraints it works within, where it is strongest, which lower results are
 * conscious trade-offs, and which improvements it already takes without
 * substantial cost.
 *
 * @param {Object} params
 * @param {string} params.roomType — the interpretation's room type
 * @param {string} params.intent — the interpretation's primary design intent
 * @param {Object|null} params.strongest — the strongest structure, with its level
 * @param {Array<string>} params.constraints — the constraints the interpretation states
 * @param {Array<Object>} params.strongestAreas — the strongest areas it records
 * @param {Object} params.priorities — prioritisedPositions output
 * @param {string} params.displayText — the display and seating balance
 * @param {string} params.coverageText — the coverage approach
 * @param {string} params.bassText — the bass approach
 * @param {Array<Object>} params.rows — every usable evidence row
 * @param {string|null} params.emphasis — the designer's brief, if one is stated
 * @returns {Object} the design philosophy, frozen with the interpretation
 */
export function deriveDesignPhilosophy({
  roomType, intent, strongest, constraints, strongestAreas, priorities,
  displayText, coverageText, bassText, rows, emphasis,
}) {
  const { alreadyCaptured, remaining } = valueEngineering(rows);
  const { lower } = lowerResults(rows);
  const whyAppropriate = [
    `${roomType} designed for ${String(intent || 'home cinema').toLowerCase()}`,
    strongest ? `strongest in ${strongest.structure.toLowerCase()}` : 'with the results the interpretation records',
    priorities.prioritised.replace(/\.$/, '').toLowerCase(),
  ].join(', ');
  return {
    version: DESIGN_PHILOSOPHY_VERSION,
    principle: DESIGN_PHILOSOPHY_PRINCIPLE,
    legitimate_reasons: [...LEGITIMATE_LOWER_RESULT_REASONS],
    why_appropriate: `${whyAppropriate}. ${emphasis
      ? 'The client priorities are stated in the designer brief.'
      : 'No client priorities beyond the design intent are stated.'}`,
    priorities: {
      prioritised: priorities.prioritised,
      display_and_seating: displayText,
      coverage: coverageText,
      bass: bassText,
    },
    reasoning: {
      strongest_results: strongestAreas.map((entry) => ({ area: entry.area, evidence: entry.evidence })),
      lower_results: lower,
      lower_result_rule: 'a lower result is a legitimate design decision: state the result and what it means for this room, and name a reason only where the interpretation records one',
      value_engineering: {
        already_captured: alreadyCaptured,
        remaining_design_choices: remaining,
        rule: 'opportunities identified from the existing assessment, never promises of a free improvement and never instructions to change the finished design',
      },
      constraints,
    },
    not_established: [...DESIGN_PHILOSOPHY_NOT_ESTABLISHED],
    rules: [...DESIGN_PHILOSOPHY_RULES],
  };
}

export default deriveDesignPhilosophy;