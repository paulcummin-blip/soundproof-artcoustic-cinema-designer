import { auditEngineeringPublication } from './publicationGateAuthority.js';

export class PublicationConflict extends Error {
  constructor(message) { super(message); this.name = 'PublicationConflict'; }
}

export async function publicationRow(service, version, fingerprint = version.published_fingerprint) {
  const entity = service.entities.ProjectAnalysisCache;
  const scope = { project_id: version.project_id, version_id: version.id };
  // Legacy cache rows may predate tenant stamping. Project ownership is checked
  // by the caller and both project and version must match, including for get().
  const owned = row => row && row.project_id === scope.project_id && row.version_id === scope.version_id &&
    (!row.account_id || row.account_id === version.account_id);
  const explicit = fingerprint === version.published_fingerprint && version.published_cache_record_id != null;
  let row;
  if (explicit) {
    try {
      row = await entity.get(version.published_cache_record_id);
    } catch (error) {
      if ((error?.status ?? error?.response?.status) !== 404) throw error;
      throw new PublicationConflict('The committed engineering cache record is missing.');
    }
    if (!owned(row) || row.id !== version.published_cache_record_id)
      throw new PublicationConflict('The committed engineering cache record could not be verified.');
  } else {
    for (let skip = 0; ; skip += 25) {
      const page = await entity.filter(scope, 'id', 25, skip);
      const items = Array.isArray(page) ? page : page?.items;
      if (skip >= 2500 || !Array.isArray(items)) throw new PublicationConflict('Engineering cache lookup was incomplete.');
      for (const item of items) {
        if (!owned(item) || !Object.hasOwn(item.engineering_publications || {}, fingerprint)) continue;
        if (row) throw new PublicationConflict('Multiple cache records claim this engineering fingerprint.');
        row = item;
      }
      if (items.length < 25) break;
    }
  }
  const entry = row?.engineering_publications?.[fingerprint];
  if (!row || entry?.engineering_fingerprint !== fingerprint)
    throw new PublicationConflict('Matching saved engineering evidence could not be verified.');
  const identity = entry.report_snapshot?.report_project;
  if (identity && (identity.project_id !== version.project_id || identity.version_id !== version.id))
    throw new PublicationConflict('The saved engineering evidence belongs to a different design version.');
  return row;
}

export async function verifiedPublicationRow(service, version, project) {
  const row = await publicationRow(service, version);
  const fp = version.published_fingerprint;
  const audit = auditEngineeringPublication(row.engineering_publications[fp], {
    expectedFingerprint: fp, project: project ?? await service.entities.Project.get(version.project_id),
    bassAuthorityAvailable: Object.keys(row.completed_by_fingerprint || {}).length > 0,
  });
  if (!audit.durablyPublished) throw new PublicationConflict('The saved engineering evidence failed verification.');
  return row;
}

// A frozen report can name an older publication in a different cache record.
export async function comparisonPublications(service, version, currentRow, savedReport) {
  const current = version?.published_fingerprint;
  const frozen = savedReport?.source_fingerprints?.engineeringFingerprint;
  if (!currentRow || !frozen || current === frozen) return currentRow;
  try {
    const row = await publicationRow(service, version, frozen);
    return { engineering_publications: {
      [current]: currentRow.engineering_publications[current],
      [frozen]: row.engineering_publications[frozen],
    }};
  } catch (error) {
    if (!(error instanceof PublicationConflict)) throw error;
    return null;
  }
}
