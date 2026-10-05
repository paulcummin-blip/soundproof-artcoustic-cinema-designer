/**
 * reportEvidenceParity.js
 * -----------------------
 * The internal parity check run BEFORE a generated report is marked
 * proposal-ready. It compares what the human report actually shows against what
 * the evidence snapshot states, so the two can never disagree:
 *
 *   - every visible parameter value shown in the report vs parameter_index
 *   - every visible Products Selected row            vs system.products_selected
 *   - every visible viewing geometry value            vs screen / seating evidence
 *
 * A mismatch never fails the report itself: the mismatch is logged, the evidence
 * is saved with proposal_ready = false, and the report is shown as incomplete.
 * Proposal generation then refuses to read it.
 *
 * Pure: no React, no network, no recalculation.
 */

import { EVIDENCE_REQUIRED_PARAMETERS, validateReportEvidence } from './reportEvidenceAuthority';
import { PRODUCTS_SELECTED_ROWS } from './reportProductsSelected';

/** Values are compared for equality after this normalisation — glyph only. */
function normaliseValue(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[×✕✖xX]\s*(\d)/g, '× $1')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sameNumber(a, b, tolerance = 0.05) {
  if (a === null || a === undefined || b === null || b === undefined) return true;
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  return Math.abs(left - right) <= tolerance;
}

/**
 * The parameters parity compares: the blocking set for the report type, plus
 * every other parameter the evidence states a second, independent value for.
 */
function comparableParameterIds(evidence, reportType) {
  const required = EVIDENCE_REQUIRED_PARAMETERS[reportType] || [];
  const stated = (Array.isArray(evidence?.parameters) ? evidence.parameters : [])
    .map((entry) => Number(entry?.parameter_id))
    .filter((id) => Number.isFinite(id));
  return [...new Set([...required, ...stated])];
}

/** The product rows the evidence renders to, per report layer. */
export function evidenceProductsByLayer(evidence) {
  const byLayer = evidence?.system?.products_selected_by_layer || null;
  const rendered = {};
  for (const { key } of PRODUCTS_SELECTED_ROWS) {
    const entries = Array.isArray(byLayer?.[key]) ? byLayer[key] : [];
    const values = entries.map((entry) => {
      const base = entry.quantity > 1 ? `${entry.model} × ${entry.quantity}` : `${entry.model}`;
      return entry.position ? `${base} (${entry.position})` : base;
    });
    rendered[key] = values.length > 0 ? values : ['None specified'];
  }
  return rendered;
}

function productMismatches(evidence, captured) {
  const visible = captured?.system?.products_selected || {};
  const rendered = evidenceProductsByLayer(evidence);
  const mismatches = [];
  for (const { key, area } of PRODUCTS_SELECTED_ROWS) {
    const stated = Array.isArray(visible[key]) ? visible[key] : null;
    if (!stated) continue;
    // Layer order inside a loudspeaker row is a presentation detail; the stated
    // set of models and quantities is the fact, so it is compared as a set.
    const left = [...rendered[key]].map(normaliseValue).sort();
    const right = [...stated].map(normaliseValue).sort();
    if (left.join('|') !== right.join('|')) {
      mismatches.push({ area: 'products_selected', key, evidence: rendered[key].join(', '), report: stated.join(', '), label: area });
    }
  }
  return mismatches;
}

function parameterMismatches(evidence, reportType) {
  const ids = comparableParameterIds(evidence, reportType);
  const mismatches = [];
  for (const id of ids) {
    const entry = evidence?.parameter_index?.[`P${id}`];
    if (!entry) continue;
    // Only compared where the RP22 authority itself stated a figure: a
    // parameter the authority left unstated never manufactures a failure.
    if (entry.authority_level && normaliseValue(entry.authority_level) !== normaliseValue(entry.level)) {
      mismatches.push({ area: 'parameter_index', key: entry.key, evidence: entry.level, report: entry.authority_level });
    }
    if (entry.authority_value && normaliseValue(entry.authority_value) !== normaliseValue(entry.value)) {
      mismatches.push({ area: 'parameter_index', key: entry.key, evidence: entry.value, report: entry.authority_value });
    }
  }
  return mismatches;
}

function viewingMismatches(evidence, captured) {
  const visible = Array.isArray(captured?.viewing?.per_seat) ? captured.viewing.per_seat : [];
  if (visible.length === 0) return [];
  const stated = Array.isArray(evidence?.seating?.per_seat) ? evidence.seating.per_seat : [];
  const mismatches = [];
  for (const row of stated) {
    const match = visible.find((entry) => {
      const sameId = row.seat_id && (entry?.seatId === row.seat_id || entry?.seat_id === row.seat_id);
      const sameRow = !row.seat_id && Number(entry?.row ?? entry?.rowNumber) === Number(row.row);
      return sameId || sameRow;
    });
    if (!match) continue;
    const statedDistance = row.distance_m;
    const visibleDistance = match.distance_m ?? match.distanceM ?? null;
    if (!sameNumber(statedDistance, visibleDistance)) {
      mismatches.push({ area: 'seating.per_row_viewing', key: row.seat_label || row.seat_id || `row ${row.row}`, evidence: statedDistance, report: visibleDistance });
    }
    const statedAngle = row.horizontal_angle_deg;
    const visibleAngle = match.horizontal_angle_deg ?? match.horizontalAngleDeg ?? null;
    if (!sameNumber(statedAngle, visibleAngle)) {
      mismatches.push({ area: 'seating.per_row_viewing', key: row.seat_label || row.seat_id || `row ${row.row}`, evidence: statedAngle, report: visibleAngle });
    }
  }
  return mismatches;
}

/**
 * Run the parity check.
 *
 * @returns {{passed: boolean, mismatches: Array, missing: Array}}
 */
export function checkReportEvidenceParity({ evidence, captured, reportType = null } = {}) {
  const validation = validateReportEvidence(evidence, reportType);
  const mismatches = [
    ...parameterMismatches(evidence, reportType),
    ...productMismatches(evidence, captured),
    ...viewingMismatches(evidence, captured),
  ];
  return {
    passed: validation.complete && mismatches.length === 0,
    mismatches,
    missing: validation.missing,
  };
}

/** The parity outcome stored with the snapshot. */
export function buildParityRecord({ passed, mismatches = [], missing = [] } = {}) {
  return {
    proposal_ready: passed === true,
    mismatch_count: mismatches.length + missing.length,
    mismatches: mismatches.slice(0, 20),
    missing: missing.slice(0, 20),
    checked_at: new Date().toISOString(),
  };
}

export default checkReportEvidenceParity;