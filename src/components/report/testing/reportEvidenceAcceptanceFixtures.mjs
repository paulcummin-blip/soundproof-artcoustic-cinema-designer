/** Isolated frozen fixtures for the legacy report-evidence reader acceptance tests.
 * No SDK connection or entity mutation; the stand-in client only reads local rows.
 * The legacy pair represents the current reader, not the consolidated readiness contract.
 */
import { buildReportEvidence } from '@/components/report/reportEvidenceAuthority.js';

export const PROJECT = 'p1';
const PARAM_IDS = [12, 13, 14, 18, 19, 20];
export const FINGERPRINT = 'eng:v1:aaa';

const HEADLINES = (p13 = { level: 'L4', value: '108 dBC (OH)' }) => PARAM_IDS.map((id) => ({
  parameter_id: id,
  title: `P${id}`,
  category: 'RP22',
  achieved_level: id === 13 ? p13.level : 'L3',
  formatted_value: id === 13 ? p13.value : `P${id} value`,
}));

export const capture = ({
  versionId = 'v4',
  lcr = ['Q8-5 × 3'],
  p13 = { level: 'L4', value: '108 dBC (OH)' },
  authorityP13 = p13,
} = {}) => ({
  report_source_version: 1,
  identity: { projectId: PROJECT, versionId, generatedAt: '2026-10-05T10:00:00.000Z' },
  project: { project_name: 'Marquee Home', client_name: 'Mr C', project_reference: 'AC-2026-014', dealer_company: 'Sound Proof' },
  version: { name: 'Level 4 version' },
  dealer: { company_name: 'Sound Proof' },
  room: {
    dimensions: { length_m: 6, width_m: 4.5, height_m: 2.4 },
    volume_m3: 64.8,
    screen: {
      aspect_ratio: '16:9', computed_width_m: 2.655, computed_height_m: 1.494, diagonal_inches: 120, television: false,
    },
    rsp: { mode: 'middle_row_center', x_m: 2.25, y_m: 3.2 },
  },
  seats: [{ id: 'r1c1', row: 1, priority: 'primary' }, { id: 'r1c2', row: 1, priority: 'secondary' }],
  viewing: {
    available: true,
    per_seat: [{
      seatId: 'r1c1', row: 1, label: 'Row 1 seat 1',
      distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, level: 'Level 4',
    }, { seatId: 'r1c2', row: 1, distance_m: 3.2, horizontal_angle_deg: 0, vertical_angle_deg: 0, level: 'Level 4' }],
  },
  system: {
    products_selected: { rows: [{ key: 'lcr', area: 'LCR', value: lcr[0] }], lcr },
    configuration: { dolby_config: '9.4.6', text: '9.4.6' },
    channel_layout: {
      bed_channels: 9, overhead_channels: 6, dolby_subwoofer_channels: 4, total_discrete: 19, subwoofer_count: 4,
    },
  },
  rp22: { parameter_headlines: HEADLINES(authorityP13) },
  report_parameters: PARAM_IDS.map((id) => ({
    key: `P${id}`, parameter_id: id, scope: 'room',
    level: id === 13 ? p13.level : 'L3',
    value: id === 13 ? p13.value : `P${id} value`,
    text: `${id === 13 ? p13.level : 'L3'} · ${id === 13 ? p13.value : `P${id} value`}`,
    authority_fingerprint: [14,18,19,20].includes(id) ? 'bass:v1:abc' : FINGERPRINT,
    authority_timestamp: '2026-10-05T10:00:00.000Z',
    source_type: [14,18,19,20].includes(id) ? 'durable-current-bass-authority' : 'durable-engineering-publication',
  })),
  bass: { available: true, p14: { text: 'L3 · 30 Hz', achieved_level: 'L3' }, p18: { text: 'L3 · 25 Hz' }, p19: { text: 'L3 · ±3 dB' }, p20: { text: 'L3 · ±4 dB' } },
});

export const buildEvidence = (captured, reportType = 'technical') => buildReportEvidence({
  reportType,
  captured,
  sourceFingerprint: { engineeringFingerprint: FINGERPRINT, calculationFingerprint: 'bass:v1:abc', seatPriorityFingerprint: 'seat:v1:def' },
});

export const EVIDENCE = ({
  versionId = 'v4',
  fingerprint = FINGERPRINT,
  ready = true,
  p13 = { level: 'L4', value: '108 dBC (OH)' },
  model = 'Q8-5',
  quantity = 3,
  reportType = 'technical',
  room = { length_m: 6, width_m: 4.5, height_m: 2.4 },
  seat = { distance_m: 3.2, horizontal_angle_deg: 0, rp23_level: 'Level 4' },
} = {}) => {
  const parameters = PARAM_IDS.map((id) => {
    const level = id === 13 ? p13.level : 'L3';
    const value = id === 13 ? p13.value : `P${id} value`;
    return {
      key: `P${id}`,
      parameter_id: id,
      title: `P${id}`,
      area: 'RP22',
      level,
      value,
      text: `${level} · ${value}`,
      unit: null,
      context: null,
      scope: 'room',
      authority_fingerprint: [14,18,19,20].includes(id) ? 'bass:v1:abc' : fingerprint,
      authority_timestamp: '2026-10-05T10:00:00.000Z',
      source_type: [14,18,19,20].includes(id) ? 'durable-current-bass-authority' : 'durable-engineering-publication',
      authority_value: value, authority_level: level,
      source: 'technical_report',
    };
  });
  const layer = [{ role: 'LCR', model, quantity, position: null }];
  return {
    evidence_version: 1,
    report_type: reportType,
    identity: {
      project_id: PROJECT,
      version_id: versionId,
      report_type: reportType,
      source_fingerprint: fingerprint,
      bass_fingerprint: 'bass:v1:abc',
      generated_at: '2026-10-05T10:00:00.000Z',
    },
    room,
    screen: { screen_type: 'Projection screen', format: '16:9', viewable_width_cm: 265.5 },
    seating: {
      row_count: 1, seats: 1,
      per_seat: [{
        row: 1, column: 1, priority: 'primary', seat_id: 'r1c1', seat_label: 'Row 1 seat 1',
        vertical_angle_deg: 0, ...seat,
      }],
    },
    system: { products_selected: layer, products_selected_by_layer: { lcr: layer } },
    parameters,
    parameter_index: Object.fromEntries(parameters.map((row) => [row.key, row])),
    bass: { current: false, p14: { achieved_level: 'L3' } },
    proposal_ready: ready,
    evidence_fingerprint: `re1-${versionId}-${reportType}-${fingerprint}`,
  };
};

export const FROZEN = ({
  versionId = 'v4',
  p13 = 'L3 · 99 dBC (OH)',
  lcr = 'DFC-2 × 1',
  room = { length_m: 6, width_m: 4.5, height_m: 2.4 },
  seat = { distance_m: 3.2, horizontal_angle_deg: 0 },
} = {}) => ({
  report_source_version: 1,
  identity: { projectId: PROJECT, versionId },
  room: { dimensions: room },
  seats: [{ id: 'r1c1', row: 1, priority: 'primary' }],
  viewing: { available: true, per_seat: [{ seatId: 'r1c1', row: 1, ...seat }] },
  system: { products_selected: { rows: [{ key: 'lcr', area: 'LCR', value: lcr }], lcr: [lcr] } },
  rp22: { parameter_headlines: [] },
  report_parameters: PARAM_IDS.map((id) => ({
    parameter_id: id,
    level: 'L3',
    value: id === 13 ? '99 dBC (OH)' : `P${id} value`,
    text: id === 13 ? p13 : `L3 · P${id} value`,
  })),
});

export const row = ({
  type, versionId = 'v4', evidence = null, frozen = null, status = 'current', fingerprint = FINGERPRINT,
}) => ({
  id: `${versionId}-${type}`,
  project_id: PROJECT,
  version_id: versionId,
  report_type: type,
  report_schema_version: 1,
  status,
  generated_at: '2026-10-05T10:00:00.000Z',
  source_fingerprints: { engineeringFingerprint: fingerprint },
  payload: {
    pages: [],
    ...(frozen ? { proposalSource: frozen } : {}),
    ...(evidence ? { reportEvidence: evidence } : {}),
  },
});

export const pair = ({
  versionId = 'v4',
  fingerprint = FINGERPRINT,
  technical = {},
  visual = {},
  technicalEvidence,
  visualEvidence,
  technicalFrozen,
  visualFrozen,
  technicalStatus = 'current',
} = {}) => [
  row({
    type: 'technical',
    versionId,
    fingerprint,
    status: technicalStatus,
    evidence: technicalEvidence === undefined ? EVIDENCE({ versionId, fingerprint, reportType: 'technical', ...technical }) : technicalEvidence,
    frozen: technicalFrozen === undefined ? FROZEN({ versionId }) : technicalFrozen,
  }),
  row({
    type: 'visual',
    versionId,
    fingerprint,
    evidence: visualEvidence === undefined ? EVIDENCE({ versionId, fingerprint, reportType: 'visual' }) : visualEvidence,
    frozen: visualFrozen === undefined ? FROZEN({ versionId }) : visualFrozen,
  }),
];

export const VERSION = (id = 'v4', published = FINGERPRINT) => ({
  id,
  version_number: id === 'v4' ? 4 : 1,
  version_name: `Level ${id === 'v4' ? 4 : 1} version`,
  published_fingerprint: published,
});

export const fakeEntities = (rows) => ({
  ReportSnapshot: { filter: async (query) => ({ items: rows.filter((item) => item.version_id === query.version_id) }) },
});