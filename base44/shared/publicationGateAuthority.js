/**
 * publicationGateAuthority.js
 * ---------------------------
 * The ONE durability audit for an engineering publication.
 *
 * A design becomes authoritative for reports and proposals in exactly one way:
 *
 *   ProjectVersion.published_fingerprint
 *     → ProjectAnalysisCache.engineering_publications[fingerprint]
 *
 * Reporting may read from that authority ONLY. A browser handoff, a historical
 * report value, a proposalSource capture or a bass fingerprint on its own is
 * never authority, and never a reason for a report to exist.
 *
 * Pure: no I/O, no SDK, no React. Mirrored for the client in
 * src/components/engineering/publicationGateAuthority.js; the two are kept in
 * step by test/publication-durability.test.mjs, which asserts they agree.
 *
 * Used by:
 *   - base44/functions/publishEngineering      (write-time refusal + acknowledgement)
 *   - base44/functions/readPublishedEngineering (read-time acknowledgement)
 */

export const PUBLICATION_ACKNOWLEDGEMENT = Object.freeze({
  /** A complete publication is stored and the version pointer references it. */
  DURABLE: 'durably_published',
  /** Nothing is published for this version. */
  NOT_PUBLISHED: 'not_published',
  /** Published, but the stored authority is missing required sections. */
  INCOMPLETE: 'incomplete',
});

/** The RP22 parameter authority a publication must carry. */
export const RP22_PARAMETER_KEYS = Object.freeze(
  Array.from({ length: 21 }, (_, index) => `p${index + 1}`),
);

/**
 * The authority sections a publication must carry to be report-bearing.
 * `key` is stable for tests and messages; `label` is what the dealer reads.
 */
export const PUBLICATION_SECTION = Object.freeze({
  IDENTITY: { key: 'identity', label: 'a stored publication key' },
  POINTER_MATCH: { key: 'pointer_match', label: 'a matching version publication pointer' },
  PUBLISHED_AT: { key: 'published_at', label: 'a publication timestamp' },
  ENGINE_VERSIONS: { key: 'engine_versions', label: 'engine, RP22 and algorithm versions' },
  RP22_PARAMETERS: { key: 'rp22_parameters', label: 'RP22 P1 to P21 results' },
  REPORT_SUMMARY: { key: 'report_summary', label: 'the report engineering summary' },
  SEAT_PRIORITY: { key: 'seat_priority', label: 'the seat priority' },
  RP23_VIEWING: { key: 'rp23_viewing', label: 'RP23 viewing results' },
  PRODUCTS: { key: 'products', label: 'the products selected' },
  ROOM: { key: 'room', label: 'the room dimensions' },
  SCREEN: { key: 'screen', label: 'the screen data' },
  SEATING: { key: 'seating', label: 'the seating layout' },
  SYSTEM: { key: 'system', label: 'the placed loudspeakers' },
  REPORT_PAYLOAD: { key: 'report_payload', label: 'the report payload' },
  BASS_AUTHORITY: { key: 'bass_authority', label: 'the bass authority (P14, P18, P19, P20)' },
  SPL_AUTHORITY: { key: 'spl_authority', label: 'the SPL authority (P12, P13)' },
  SOURCE_FINGERPRINTS: { key: 'source_fingerprints', label: 'the source fingerprints' },
  AUTHORITY_COMPLETE: { key: 'authority_complete', label: 'the completed RP22 and bass assessment' },
});

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
export function publicationSectionReport(
  publication,
  { project = null, bassAuthorityAvailable = false, requirePayload = true } = {},
) {
  const summary = asObject(publication?.engineering_summary) || {};
  const payload = asObject(publication?.report_snapshot) || {};
  const analysisResult = asObject(payload.analysisResult) || {};
  const parameters = asObject(summary.parameterAuthority) || {};
  const results = asObject(summary.roomResultsByParameter) || {};
  const roomResult = (number) => results[number] ?? results[String(number)] ?? null;

  const items = [];
  const add = (section, ok) => items.push({ ...section, ok: ok === true });

  add(PUBLICATION_SECTION.IDENTITY, stated(publication?.engineering_fingerprint));
  add(PUBLICATION_SECTION.PUBLISHED_AT, stated(publication?.published_at));
  add(
    PUBLICATION_SECTION.ENGINE_VERSIONS,
    stated(publication?.engine_version)
      && stated(publication?.rp22_version)
      && stated(publication?.algorithm_version),
  );
  add(
    PUBLICATION_SECTION.RP22_PARAMETERS,
    RP22_PARAMETER_KEYS.every((key) => !!parameters[key]),
  );
  add(PUBLICATION_SECTION.REPORT_SUMMARY, !!asObject(summary.designRating)?.rating);
  add(PUBLICATION_SECTION.SEAT_PRIORITY, stated(summary.seatPriorityFingerprint));
  add(PUBLICATION_SECTION.RP23_VIEWING, !!asObject(summary.viewing));
  add(PUBLICATION_SECTION.PRODUCTS, !!payload.priceData);
  add(PUBLICATION_SECTION.REPORT_PAYLOAD, Object.keys(analysisResult).length > 0);
  add(PUBLICATION_SECTION.SEATING, asArray(payload.seatingPositions).length > 0);
  add(PUBLICATION_SECTION.SYSTEM, asArray(payload.placedSpeakers).length > 0);
  add(
    PUBLICATION_SECTION.BASS_AUTHORITY,
    // The publication states its own bass room results, or the version's durable
    // bass contract supplies them — the bass authority is durable either way.
    [14, 18, 19].every((number) => statesValue(roomResult(number))) || bassAuthorityAvailable === true,
  );
  add(
    PUBLICATION_SECTION.SPL_AUTHORITY,
    statesValue(roomResult(12)) || statesValue(roomResult(13)) || !!parameters.p12 || !!parameters.p13,
  );
  add(PUBLICATION_SECTION.SOURCE_FINGERPRINTS, !!asObject(publication?.provenance));

  if (project) {
    // Room and screen are stated by the project the version belongs to: they are
    // shared by every version and are not per-version authority.
    add(PUBLICATION_SECTION.ROOM, parsesRoomDims(project.roomDims));
    add(
      PUBLICATION_SECTION.SCREEN,
      stated(project.screen_size) || stated(project.manual_width_m) || stated(project.tv_width_mm),
    );
  }

  const missing = requirePayload ? items.filter((item) => !item.ok) : [];
  return { items, missing, complete: missing.length === 0 };
}

/**
 * Audit one stored publication entry.
 *
 * @returns {{status:string, durablyPublished:boolean, complete:boolean,
 *            fingerprintMatches:boolean, missing:Array, reason:string|null}}
 */
export function auditEngineeringPublication(
  publication,
  { expectedFingerprint = null, project = null, bassAuthorityAvailable = false, requirePayload = true } = {},
) {
  if (!publication) {
    return {
      status: PUBLICATION_ACKNOWLEDGEMENT.NOT_PUBLISHED,
      durablyPublished: false,
      complete: false,
      fingerprintMatches: false,
      missing: [{ ...PUBLICATION_SECTION.IDENTITY }],
      reason: null,
    };
  }

  const fingerprintMatches = !expectedFingerprint
    || publication.engineering_fingerprint === expectedFingerprint;

  const report = publicationSectionReport(publication, {
    project,
    bassAuthorityAvailable,
    requirePayload,
  });

  const missing = [...report.missing];
  if (!fingerprintMatches) missing.unshift({ ...PUBLICATION_SECTION.POINTER_MATCH });

  const complete = missing.length === 0;

  return {
    status: complete
      ? PUBLICATION_ACKNOWLEDGEMENT.DURABLE
      : PUBLICATION_ACKNOWLEDGEMENT.INCOMPLETE,
    durablyPublished: complete,
    complete,
    fingerprintMatches,
    missing,
    reason: null,
  };
}

/** Can this incoming summary become an engineering publication at all? */
export function isPublishableEngineeringSummary(summary) {
  const parameters = asObject(asObject(summary)?.parameterAuthority);
  if (!parameters) {
    return { usable: false, missing: [PUBLICATION_SECTION.RP22_PARAMETERS.key] };
  }
  const missing = RP22_PARAMETER_KEYS.filter((key) => !parameters[key])
    .map(() => PUBLICATION_SECTION.RP22_PARAMETERS.key);
  return { usable: missing.length === 0, missing };
}

/** The one message a blocked report or proposal shows. */
export function publicationBlockReason({ versionName = null, missing = [], published = false } = {}) {
  const version = versionName ? ` for ${versionName}` : '';
  if (published) {
    const labels = [...new Set(missing.map((item) => item?.label || item?.key).filter(Boolean))];
    return `The saved engineering assessment${version} is incomplete: ${labels.join(', ')}. Re-run the assessment in Room Designer, then generate the report.`;
  }
  return `Engineering assessment has not been saved${version}. Run assessment before generating reports.`;
}