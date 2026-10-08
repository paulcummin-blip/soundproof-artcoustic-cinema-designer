import { isExplicitNotApplicable, isTerminalAssessment } from './assessmentTerminal.js';
/**
 * One pure completeness contract, imported by the browser and the server.
 * No source fallback, storage, calculation, or proposal narrative.
 */
export const REPORT_EVIDENCE_VERSION = 1;
export const REQUIRED_TECHNICAL_PARAMETERS = Object.freeze([12, 13, 14, 18, 19, 20]);
const missingValue = value => value == null || value === '' || (typeof value === 'string' && !value.trim());
const unstated = /NOT CALCULATED|Seat results|^—$/i;

export function validateReportEvidence(evidence, reportType = null, {
  requireProposalReady = true, projectId = null, versionId = null,
  sourceFingerprint = null, snapshotFingerprint = null,
} = {}) {
  const missing = [];
  const add = field => { if (!missing.includes(field)) missing.push(field); };
  const requireValue = (value, field) => { if (missingValue(value)) add(field); };
  if (!evidence || typeof evidence !== 'object') return {
    complete: false, missing: ['reportEvidence'], reason: 'reportEvidence is missing',
  };
  const type = reportType || evidence.report_type;
  if (Number(evidence.evidence_version) !== REPORT_EVIDENCE_VERSION) add('evidence_version');
  const identity = evidence.identity || {};
  for (const key of ['project_id', 'version_id', 'report_type', 'source_fingerprint'])
    requireValue(identity[key], 'identity.' + key);
  if (identity.report_type !== type || evidence.report_type !== type) add('identity.report_type');
  if (projectId && identity.project_id !== projectId) add('identity.project_id');
  if (versionId && identity.version_id !== versionId) add('identity.version_id');
  if (sourceFingerprint && identity.source_fingerprint !== sourceFingerprint) add('identity.source_fingerprint');
  if (snapshotFingerprint && identity.source_fingerprint !== snapshotFingerprint) add('identity.source_fingerprint');
  for (const key of ['length_m', 'width_m', 'height_m']) requireValue(evidence.room?.[key], 'room.' + key);
  requireValue(evidence.screen?.screen_type, 'screen.screen_type');
  requireValue(evidence.screen?.format, 'screen.format');
  requireValue(evidence.screen?.viewable_diagonal_in ?? evidence.screen?.viewable_width_cm, 'screen.size');
  if (!Array.isArray(evidence.system?.products_selected) || !evidence.system.products_selected.length)
    add('system.products_selected');
  const index = evidence.parameter_index;
  if (!index || typeof index !== 'object' || !Object.keys(index).length) add('parameter_index');
  for (const id of type === 'technical' ? REQUIRED_TECHNICAL_PARAMETERS : []) {
    const entry = index?.['P' + id];
    const source = entry?.source_row || entry;
    const explicitNA = isExplicitNotApplicable(source) && entry?.level === 'N/A';
    if (!entry || !isTerminalAssessment({ ...source, level:entry.level }, { requireState:false })
      || (!explicitNA && (missingValue(entry.value) || unstated.test(String(entry.value)) || /^N\/A$/i.test(String(entry.value)))))
      add('parameter_index.P' + id);
  }
  const seats = evidence.seating?.per_seat;
  if (!Array.isArray(seats) || !seats.length) add('seating.per_seat');
  const seen = new Set();
  (Array.isArray(seats) ? seats : []).forEach((seat, i) => {
    const base = 'seating.per_seat[' + i + ']';
    // Row is first so every consumer reports the same original blocker.
    for (const key of ['row', 'seat_id', 'column', 'priority', 'distance_m', 'horizontal_angle_deg'])
      requireValue(seat?.[key], base + '.' + key);
    if (seat?.seat_id && seen.has(seat.seat_id)) add(base + '.seat_id');
    seen.add(seat?.seat_id);
  });
  if (Array.isArray(seats) && evidence.seating?.seats !== seats.length) add('seating.seats');

  // Current is a provenance verdict, not merely a populated-fields verdict.
  for (const [key, row] of Object.entries(index || {})) {
    const base = 'parameter_index.' + key;
    for (const field of ['key', 'scope', 'authority_fingerprint', 'authority_timestamp', 'source_type'])
      requireValue(row?.[field], base + '.' + field);
    const bass = ['P14', 'P18', 'P19', 'P20'].includes(key);
    const expectedFingerprint = bass ? identity.bass_fingerprint : identity.source_fingerprint;
    const expectedSource = bass ? 'durable-current-bass-authority' : 'durable-engineering-publication';
    if (!expectedFingerprint || row?.authority_fingerprint !== expectedFingerprint) add(base + '.authority_fingerprint');
    if (row?.source_type !== expectedSource) add(base + '.source_type');
    if (row?.authority_value !== row?.value || row?.authority_level !== row?.level) add(base + '.atomic_pair');
    const parallel = (evidence.parameters || []).find(entry => entry.key === key);
    if (!parallel || ['scope', 'value', 'level', 'authority_fingerprint', 'authority_timestamp', 'source_type']
      .some(field => parallel[field] !== row?.[field])) add(base + '.atomic_pair');
  }
  const p10 = index?.P10;
  if (p10 && p10.scope !== 'project') add('parameter_index.P10.scope');
  if (p10 && Number(p10.raw_value) === 3 && ['L1', 'L2'].includes(p10.level))
    add('parameter_index.P10.atomic_pair');
  const p14 = index?.P14;
  if (p14 && (p14.raw_value !== evidence.bass?.p14?.raw_value
    || p14.level !== evidence.bass?.p14?.achieved_level))
    add('parameter_index.P14.atomic_pair');

  if (requireProposalReady && evidence.proposal_ready !== true) add('proposal_ready');
  return { complete: missing.length === 0, missing,
    reason: missing.length ? missing[0] + ' is missing' : null };
}