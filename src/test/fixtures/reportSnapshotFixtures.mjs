/**
 * Saved-report fixtures for the canonical-selection and atomic-write tests.
 *
 * The evidence builder produces a COMPLETE report evidence payload — the exact
 * shape validateReportEvidence accepts — so a row can be made genuinely
 * proposal-ready rather than merely populated. incompleteEvidence() breaks one
 * required seat fact and nothing else, so completeness is the only difference
 * between the two.
 */

export const PROJECT = 'marquee';
export const VERSION = 'ver-v4';
export const CURRENT = 'eng:v1:8efc8c3bb8cfaf11';
export const STALE = 'eng:v1:0cf530d793062741';
const BASS = 'cal:v8:cbf2c9881a3c211a';

const REQUIRED = [12, 13, 14, 18, 19, 20];
const SEAT_COUNT = 3;

const seats = (count = SEAT_COUNT) => Array.from({ length: count }, (_, index) => ({
  row: 1,
  seat_id: `seat-${index + 1}`,
  column: index + 1,
  priority: index === 1 ? 'primary' : 'secondary',
  distance_m: 4.2 + index * 0.6,
  horizontal_angle_deg: 10 - index * 8,
}));

/** A complete report evidence payload for one report type. */
export function completeEvidence({
  reportType = 'technical',
  fingerprint = CURRENT,
  versionId = VERSION,
  proposalReady = true,
  seatRows = seats(),
} = {}) {
  const index = {};
  const parameters = [];
  REQUIRED.forEach((id, position) => {
    const key = `P${id}`;
    const isBass = ['P14', 'P18', 'P19', 'P20'].includes(key);
    const value = `${20 + position} Hz`;
    const row = {
      parameter_id: id,
      key,
      title: `Parameter ${id}`,
      area: 'Acoustic',
      level: 'L2',
      value,
      scope: 'project',
      authority_value: value,
      authority_level: 'L2',
      authority_fingerprint: isBass ? BASS : fingerprint,
      authority_timestamp: '2026-10-06T10:00:00.000Z',
      source_type: isBass ? 'durable-current-bass-authority' : 'durable-engineering-publication',
    };
    index[key] = row;
    parameters.push({ ...row });
  });
  index.P14.raw_value = 22;
  parameters.find((row) => row.key === 'P14').raw_value = 22;

  return {
    evidence_version: 1,
    report_type: reportType,
    proposal_ready: proposalReady,
    identity: {
      project_id: PROJECT,
      version_id: versionId,
      report_type: reportType,
      source_fingerprint: fingerprint,
      bass_fingerprint: BASS,
    },
    room: { length_m: 6.5, width_m: 5.18, height_m: 2.7 },
    screen: { screen_type: 'fixed frame', format: '2.35:1', viewable_diagonal_in: 150 },
    system: { products_selected: [{ model: 'SL-12', quantity: 3 }] },
    parameter_index: index,
    parameters,
    seating: { seats: seatRows.length, per_seat: seatRows },
    bass: { p14: { raw_value: 22, achieved_level: 'L2' } },
  };
}

/** The same evidence with one required seat fact missing. */
export function incompleteEvidence(options = {}) {
  const evidence = completeEvidence(options);
  evidence.seating.per_seat[0].row = null;
  return evidence;
}

/** A saved report row as the database returns it. */
export function reportRow({
  id,
  generatedAt,
  fingerprint = CURRENT,
  reportType = 'technical',
  complete = true,
  proposalReady = true,
  parity = true,
  versionId = VERSION,
} = {}) {
  const build = complete ? completeEvidence : incompleteEvidence;
  return {
    id,
    project_id: PROJECT,
    version_id: versionId,
    report_type: reportType,
    report_schema_version: 1,
    source_fingerprints: {
      engineeringFingerprint: fingerprint,
      calculationFingerprint: BASS,
      seatPriorityFingerprint: 'seatprio:aaaa1111',
    },
    generated_at: generatedAt,
    generated_by: 'Paul',
    status: 'current',
    payload: {
      reportEvidence: build({ reportType, fingerprint, proposalReady }),
      ...(parity === null ? {} : { evidence_parity: { proposal_ready: parity === true, mismatch_count: 0 } }),
    },
  };
}