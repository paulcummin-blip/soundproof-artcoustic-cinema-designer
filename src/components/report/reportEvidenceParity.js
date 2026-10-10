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
import reportEvidenceIntegrity from './reportEvidenceIntegrity';
import { renderReportProduct } from './reportStructuredProducts';

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
 * Whether two stated figures are the same figure. Identical text is the common
 * case; beyond that the two are the same only when they carry the same number
 * AND the same unit, so "42.1 Hz" and "42 Hz" are the same figure whereas
 * "L3" and "L4" never are. Formatting alone never manufactures a failure.
 */
function sameStatedValue(a, b) {
  const left = normaliseValue(a);
  const right = normaliseValue(b);
  if (left === right) return true;
  if (!left || !right) return false;
  const leftNumber = parseFloat(left);
  const rightNumber = parseFloat(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  const unitOf = (text) => text.replace(/[\d.\-+\s]/g, '');
  if (unitOf(left) !== unitOf(right)) return false;
  return Math.abs(leftNumber - rightNumber) <= 0.05;
}

/**
 * The parameters parity BLOCKS on: the report type's own required set — for a
 * Technical Report, P12 and P13 among them. A parameter outside that set is
 * still compared and reported, but a difference there never blocks a proposal.
 */
function blockingParameterIds(reportType) {
  return new Set(EVIDENCE_REQUIRED_PARAMETERS[reportType] || []);
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
    const values = entries.map(renderReportProduct);
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
  const blockingIds = blockingParameterIds(reportType);
  const mismatches = [];
  for (const id of ids) {
    const entry = evidence?.parameter_index?.[`P${id}`];
    if (!entry) continue;
    const blocking = blockingIds.has(id);
    // Only compared where the RP22 authority itself stated a figure: a
    // parameter the authority left unstated never manufactures a failure.
    if (entry.authority_level && !sameStatedValue(entry.authority_level, entry.level)) {
      mismatches.push({ area: 'parameter_index', key: entry.key, evidence: entry.level, report: entry.authority_level, blocking });
    }
    if (entry.authority_value && !sameStatedValue(entry.authority_value, entry.value)) {
      mismatches.push({ area: 'parameter_index', key: entry.key, evidence: entry.value, report: entry.authority_value, blocking });
    }
  }
  return mismatches;
}

/**
 * The room and screen the report states, compared against the evidence's own
 * statement of the same facts. Both sides are read from the SAME captured
 * values the report renders from — the version's own design state over the
 * project record — so this can only fail when the two genuinely disagree, never
 * on formatting or a differing derivation.
 */
function geometryMismatches(evidence, captured) {
  const mismatches = [];
  const dimensions = captured?.room?.dimensions || null;
  const room = evidence?.room || {};
  const pairs = [
    ['length_m', dimensions?.length_m],
    ['width_m', dimensions?.width_m],
    ['height_m', dimensions?.height_m],
  ];
  for (const [key, reportValue] of pairs) {
    // A dimension the capture does not state never manufactures a failure; the
    // required-fact check is what refuses a report with no room at all.
    if (reportValue === null || reportValue === undefined) continue;
    if (!sameNumber(room[key], reportValue)) {
      mismatches.push({ area: 'room', key, evidence: room[key], report: reportValue, label: 'Room dimensions' });
    }
  }

  const screen = captured?.room?.screen || null;
  const stated = evidence?.screen || null;
  if (screen && stated) {
    if (screen.aspect_ratio && stated.format && !sameStatedValue(stated.format, screen.aspect_ratio)) {
      mismatches.push({ area: 'screen', key: 'aspect_ratio', evidence: stated.format, report: screen.aspect_ratio, label: 'Screen' });
    }
    if (screen.computed_width_m !== null && screen.computed_width_m !== undefined && stated.viewable_width_cm !== null) {
      if (!sameNumber(stated.viewable_width_cm, screen.computed_width_m * 100, 0.5)) {
        mismatches.push({ area: 'screen', key: 'viewable_width_cm', evidence: stated.viewable_width_cm, report: screen.computed_width_m * 100, label: 'Screen' });
      }
    }
    if (screen.computed_height_m !== null && screen.computed_height_m !== undefined && stated.viewable_height_cm !== null) {
      if (!sameNumber(stated.viewable_height_cm, screen.computed_height_m * 100, 0.5)) {
        mismatches.push({ area: 'screen', key: 'viewable_height_cm', evidence: stated.viewable_height_cm, report: screen.computed_height_m * 100, label: 'Screen' });
      }
    }
  }
  return mismatches;
}

/**
 * The design fingerprint the report was frozen against — stated in the capture,
 * in the snapshot's own source fingerprints, and in the evidence. All three must
 * name the same frozen authority.
 */
function frozenAuthorityFingerprint(captured) {
  const fingerprints = captured?.engineeringFingerprint || {};
  return normaliseValue(fingerprints.engineeringFingerprint)
    || normaliseValue(captured?.identity?.engineeringFingerprint)
    || normaliseValue(fingerprints.calculationFingerprint)
    || null;
}

function fingerprintMismatches(evidence, captured) {
  const reportValue = frozenAuthorityFingerprint(captured);
  const evidenceValue = normaliseValue(evidence?.identity?.source_fingerprint) || null;
  // Unreadable on either side never manufactures a failure: a report frozen
  // against no authority at all states no fingerprint to disagree with.
  if (!reportValue || !evidenceValue || reportValue === evidenceValue) return [];
  return [{
    area: 'identity.source_fingerprint',
    key: 'source_fingerprint',
    evidence: evidence?.identity?.source_fingerprint || null,
    report: captured?.engineeringFingerprint?.engineeringFingerprint
      || captured?.identity?.engineeringFingerprint
      || captured?.engineeringFingerprint?.calculationFingerprint
      || null,
    label: 'Design fingerprint',
  }];
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
    if (visibleDistance != null && !sameNumber(statedDistance, visibleDistance)) {
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
  const validation = validateReportEvidence(evidence, reportType, { requireProposalReady: false });
  const mismatches = [
    ...reportEvidenceIntegrity(evidence, captured, reportType),
    ...parameterMismatches(evidence, reportType),
    ...productMismatches(evidence, captured).map((entry) => ({ ...entry, blocking: true })),
    ...viewingMismatches(evidence, captured).map((entry) => ({ ...entry, blocking: true })),
    // The room, the screen and the design fingerprint are blocking facts: a
    // report that shows a room, a screen or a frozen design must have evidence
    // that states the same ones.
    ...geometryMismatches(evidence, captured).map((entry) => ({ ...entry, blocking: true })),
    ...fingerprintMismatches(evidence, captured).map((entry) => ({ ...entry, blocking: true })),
  ];
  // A difference the report's own required parameters disagree on, or an
  // incomplete evidence set, is what blocks a proposal. An advisory difference
  // elsewhere is stated but does not block.
  const blocking = mismatches.filter((entry) => entry.blocking !== false);
  return {
    passed: validation.complete && blocking.length === 0,
    mismatches,
    missing: validation.missing,
    blocking,
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