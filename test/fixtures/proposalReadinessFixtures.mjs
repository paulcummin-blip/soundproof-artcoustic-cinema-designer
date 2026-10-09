import {
  resolveSavedReportCell as clientSavedReportCell,
  resolveVersionReadinessRow as clientRow,
  versionDisplayName as clientVersionDisplayName,
} from '../../src/components/proposal/sourceAuthority/proposalReadinessAuthority.js';

export const PROJECT_ID = 'p1';
export const ENGINEERING_FP = 'eng:v1:c19ceb2efb6c3d9c';
const BASS_FP = 'cal:v8:2b7f4c91d0a8e63f|mode:canonical-physics-eq';
export const SEAT_PRIORITY = 'seat-r1-c1:primary|seat-r1-c2:secondary';
export const GENERATED_AT = '2026-10-04T17:11:05.564Z';
export const LEVEL_4_VERSION = {
  id: '6abbca6e199f13dc4d74ec4a', version_name: 'Level 4 version', version_number: 1,
};
export const ORIGINAL_VERSION = {
  id: '6ac22230d40d8bb0a925ecab', version_name: 'Original Design', version_number: 2,
};
export const CURRENT_FINGERPRINTS = {
  engineeringFingerprint: ENGINEERING_FP,
  calculationFingerprint: BASS_FP,
  seatPriorityFingerprint: SEAT_PRIORITY,
};
function parameterRow({ key, value, level, scope, rawValue = null }) {
  const bass = ['P14', 'P18', 'P19', 'P20'].includes(key);
  return {
    key, parameter_id: Number(key.slice(1)), scope, value, level,
    ...(rawValue === null ? {} : { raw_value: rawValue }),
    authority_value: value, authority_level: level,
    authority_fingerprint: bass ? BASS_FP : ENGINEERING_FP,
    authority_timestamp: GENERATED_AT,
    source_type: bass ? 'durable-current-bass-authority' : 'durable-engineering-publication',
  };
}
function projectParameters() {
  return [
    parameterRow({ key: 'P4', value: 4.02, level: 'L3', scope: 'room' }),
    parameterRow({ key: 'P5', value: 41.2, level: 'L2', scope: 'room' }),
    parameterRow({ key: 'P10', value: 4, level: 'L3', scope: 'project' }),
    parameterRow({ key: 'P14', value: 4, level: 'L4', scope: 'room', rawValue: 4 }),
  ];
}
const EVIDENCE_SEATS = [
  { row: 1, seat_id: 'seat-r1-c1', column: 1, priority: 'primary', distance_m: 4.12, horizontal_angle_deg: -3.1 },
  { row: 1, seat_id: 'seat-r1-c2', column: 2, priority: 'secondary', distance_m: 4.02, horizontal_angle_deg: 3.1 },
];
export function projectEvidence({ versionId = LEVEL_4_VERSION.id } = {}) {
  const parameters = projectParameters();
  return {
    evidence_version: 1, report_type: 'project',
    identity: {
      project_id: PROJECT_ID, version_id: versionId, report_type: 'project',
      source_fingerprint: ENGINEERING_FP, bass_fingerprint: BASS_FP,
    },
    room: { length_m: 6.2, width_m: 4.6, height_m: 2.5, volume_m3: 71.3 },
    screen: { screen_type: 'Projection screen', format: '16:9', viewable_diagonal_in: 120 },
    system: { products_selected: [{ role: 'Screen LCR', model: 'DF-48', quantity: 3 }] },
    seating: { seats: EVIDENCE_SEATS.length, per_seat: EVIDENCE_SEATS.map((seat) => ({ ...seat })) },
    parameters, parameter_index: Object.fromEntries(parameters.map((row) => [row.key, row])),
    bass: { current: true, p14: { raw_value: 4, achieved_level: 'L4' } },
    proposal_ready: true, evidence_fingerprint: 're1-project-8c1f0f2a-2a0',
  };
}
export function savedProjectReport({
  versionId = LEVEL_4_VERSION.id, evidence = null, fingerprints = CURRENT_FINGERPRINTS,
  generatedAt = GENERATED_AT, status = 'current', reportSchemaVersion = 1, parity = null,
} = {}) {
  return {
    report_type: 'project', project_id: PROJECT_ID, version_id: versionId,
    report_schema_version: reportSchemaVersion, status,
    payload: {
      pages: [{ id: 'cover', category: 'cover' }],
      proposalSource: { report_source_version: 1 },
      ...(evidence ? { reportEvidence: evidence } : {}),
      ...(parity ? { evidence_parity: parity } : {}),
    },
    source_fingerprints: fingerprints, generated_at: generatedAt,
  };
}
export const CURRENT_REPORT = savedProjectReport({ evidence: projectEvidence() });
export const CURRENT_SOURCES = { version: LEVEL_4_VERSION, savedProjectReport: CURRENT_REPORT };
export const asClientRow = (sources, currentFingerprints = CURRENT_FINGERPRINTS) => {
  const cell = clientSavedReportCell({ saved: sources.savedProjectReport, currentFingerprints });
  return clientRow({
    versionId: sources.version.id, versionName: clientVersionDisplayName(sources.version),
    versionNumber: sources.version.version_number, cells: { project: cell },
  });
};
export const BASS_FINGERPRINT = 'cal:v8:395d1a338da6c449|mode:canonical-physics-eq';
export const CALC_COMPLETED_AT_MS = 1791108297487;
export const CACHE_RECORD = {
  version_id: LEVEL_4_VERSION.id, status: 'complete', current_fingerprint: BASS_FINGERPRINT,
  completed_by_fingerprint: {
    [BASS_FINGERPRINT]: { metricSchemaVersion: 21, job: { status: 'complete', completedAtMs: CALC_COMPLETED_AT_MS } },
  },
};