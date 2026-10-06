/**
 * publicationGateCore (client)
 * ----------------------------
 * The client mirror of base44/shared/publicationGateAuthority.js. The server
 * half cannot be imported across the boundary, so the rule lives twice and is
 * kept in step by test/publication-durability.test.mjs, which asserts both
 * halves agree on the same publication fixtures.
 *
 * Pure. Identical vocabulary to the shared module.
 */

import { auditPublicationContract } from '../../../shared/engineeringPublicationContract.js';

export const PUBLICATION_ACKNOWLEDGEMENT = Object.freeze({
  DURABLE: 'durably_published',
  NOT_PUBLISHED: 'not_published',
  INCOMPLETE: 'incomplete',
});

export const RP22_PARAMETER_KEYS = Object.freeze(
  Array.from({ length: 21 }, (_, index) => `p${index + 1}`),
);

export const PUBLICATION_SECTION_LABELS = Object.freeze({
  identity: 'a stored publication key',
  pointer_match: 'a matching version publication pointer',
  published_at: 'a publication timestamp',
  engine_versions: 'engine, RP22 and algorithm versions',
  rp22_parameters: 'RP22 P1 to P21 results',
  report_summary: 'the report engineering summary',
  seat_priority: 'the seat priority',
  rp23_viewing: 'RP23 viewing results',
  products: 'the products selected',
  room: 'the room dimensions',
  screen: 'the screen data',
  seating: 'the seating layout',
  system: 'the placed loudspeakers',
  report_payload: 'the report payload',
  bass_authority: 'the bass authority (P14, P18, P19, P20)',
  spl_authority: 'the SPL authority (P12, P13)',
  source_fingerprints: 'the source fingerprints',
});

const section = (key) => ({ key, label: PUBLICATION_SECTION_LABELS[key] });

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const asArray = (value) => (Array.isArray(value) ? value : []);

function stated(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text !== '' && text.toLowerCase() !== 'unknown';
}

function statesValue(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const raw = entry.value ?? entry.rawValue;
  if (raw !== null && raw !== undefined && raw !== '') {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return true;
  }
  const formatted = typeof entry.formatted === 'string' ? entry.formatted.trim() : '';
  return formatted.length > 0 && formatted !== '—' && formatted.toUpperCase() !== 'N/A';
}

function parsesRoomDims(roomDims) {
  if (!roomDims) return false;
  if (typeof roomDims === 'object') {
    return Number(roomDims.widthM) > 0 && Number(roomDims.lengthM) > 0;
  }
  try {
    const parsed = JSON.parse(String(roomDims));
    return Number(parsed?.widthM) > 0 && Number(parsed?.lengthM) > 0;
  } catch {
    return false;
  }
}

/** Every required authority section, resolved against the stored publication. */
export function publicationSectionReport(publication, { project = null, bassAuthorityAvailable = false } = {}) {
  const summary = asObject(publication?.engineering_summary) || {};
  const payload = asObject(publication?.report_snapshot) || {};
  const analysisResult = asObject(payload.analysisResult) || {};
  const parameters = asObject(summary.parameterAuthority) || {};
  const results = asObject(summary.roomResultsByParameter) || {};
  const roomResult = (number) => results[number] ?? results[String(number)] ?? null;

  const items = [];
  const add = (key, ok) => items.push({ ...section(key), ok: ok === true });

  add('identity', stated(publication?.engineering_fingerprint));
  add('published_at', stated(publication?.published_at));
  add(
    'engine_versions',
    stated(publication?.engine_version)
      && stated(publication?.rp22_version)
      && stated(publication?.algorithm_version),
  );
  add('rp22_parameters', RP22_PARAMETER_KEYS.every((key) => !!parameters[key]));
  add('report_summary', !!asObject(summary.designRating)?.rating);
  add('seat_priority', stated(summary.seatPriorityFingerprint));
  add('rp23_viewing', !!asObject(summary.viewing));
  add('products', !!payload.priceData);
  add('report_payload', Object.keys(analysisResult).length > 0);
  add('seating', asArray(payload.seatingPositions).length > 0);
  add('system', asArray(payload.placedSpeakers).length > 0);
  add(
    'bass_authority',
    [14, 18, 19].every((number) => statesValue(roomResult(number))) || bassAuthorityAvailable === true,
  );
  add(
    'spl_authority',
    statesValue(roomResult(12)) || statesValue(roomResult(13)) || !!parameters.p12 || !!parameters.p13,
  );
  add('source_fingerprints', !!asObject(publication?.provenance));

  if (payload.report_project) {
    const project = payload.report_project; // Frozen selected-version authority only.
    add('room', parsesRoomDims(project.roomDims));
    add('screen', stated(project.screen_size) || stated(project.manual_width_m) || stated(project.tv_width_mm));
  }

  const missing = items.filter((item) => !item.ok);
  return { items, missing, complete: missing.length === 0 };
}

/** Audit one stored publication entry. Mirrors the shared server rule. */
export function auditPublicationEntry(
  publication,
  { expectedFingerprint = null, project = null, bassAuthorityAvailable = false } = {},
) {
  if (!publication) {
    return {
      status: PUBLICATION_ACKNOWLEDGEMENT.NOT_PUBLISHED,
      durablyPublished: false,
      complete: false,
      fingerprintMatches: false,
      missing: [section('identity')],
    };
  }

  const fingerprintMatches = !expectedFingerprint
    || publication.engineering_fingerprint === expectedFingerprint;
  const report = publicationSectionReport(publication, { project, bassAuthorityAvailable });
  const missing = [...report.missing, ...auditPublicationContract(publication).missing.map(reason => ({key:reason,label:reason}))];
  if (!fingerprintMatches) missing.unshift(section('pointer_match'));

  const complete = missing.length === 0;
  return {
    status: complete ? PUBLICATION_ACKNOWLEDGEMENT.DURABLE : PUBLICATION_ACKNOWLEDGEMENT.INCOMPLETE,
    durablyPublished: complete,
    complete,
    fingerprintMatches,
    missing,
  };
}

/** The one message a blocked report or proposal shows. */
export function publicationBlockMessage({ versionName = null, missing = [], published = false } = {}) {
  const version = versionName ? ` for ${versionName}` : '';
  if (published) {
    const labels = [...new Set(missing.map((item) => item?.label || item?.key).filter(Boolean))];
    return `The saved engineering assessment${version} is incomplete: ${labels.join(', ')}. Re-run the assessment in Room Designer, then generate the report.`;
  }
  return `Engineering assessment has not been saved${version}. Run assessment before generating reports.`;
}