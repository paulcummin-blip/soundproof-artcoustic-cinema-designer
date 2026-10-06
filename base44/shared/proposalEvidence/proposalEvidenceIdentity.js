/**
 * proposalEvidenceIdentity.js (shared)
 * -------------------------------------
 * The version-name source rule of the frozen proposal evidence pack.
 *
 * A proposal names a design in front of a client, so the name it prints must be
 * the name the saved reports were generated under — the name frozen inside each
 * report's own saved evidence — and never the live ProjectVersion record. A
 * version can be renamed at any moment without regenerating a report, so a live
 * read can print a name the client's own report does not carry.
 *
 * THE RULE
 * --------
 *   - the pack reads the name from the saved report evidence: the Technical
 *     Report first (the report carrying the engineering authority), then the
 *     Visual Report;
 *   - when neither states it, the pack is NOT generated. It is never filled
 *     from live project state, and an empty name is never invented;
 *   - live reads remain allowed for access control, membership checks and
 *     internal IDs, which the pack carries as internal identifiers only.
 *
 * A disagreement between the two reports (one generated before a rename) is
 * recorded rather than resolved from live state: the Technical Report's own name
 * is used, and the disagreement is visible in the pack's audit.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The saved-evidence identity of one selected version.
 *
 * @param {Object} entry — one readProposalReportEvidence result
 * @param {string} [versionId] — the internal id, for a blocked message
 * @returns {{ version_id, version_name, from, technical, visual, stated_by, reports_agree }}
 * @throws when the saved report evidence states no version name
 */
export function savedVersionIdentity(entry, versionId = null) {
  const technical = asText(entry?.evidence?.technical?.identity?.version_name);
  const visual = asText(entry?.evidence?.visual?.identity?.version_name);
  const versionName = technical || visual;
  const id = versionId || entry?.version_id || entry?.snapshot?.identity?.versionId || null;

  if (!versionName) {
    throw new Error(
      `${id || 'A selected version'}: the saved report evidence does not state this version's name. `
      + 'The proposal evidence pack is built only from saved report evidence, so it is not built at all: '
      + 'a version name is never taken from live project state. '
      + 'Regenerate the Visual and Technical Reports for this version so their evidence states the name, then try again.',
    );
  }

  return {
    version_id: id,
    version_name: versionName,
    from: technical ? 'technical_report' : 'visual_report',
    technical,
    visual,
    stated_by: [technical ? 'technical_report' : null, visual ? 'visual_report' : null].filter(Boolean),
    reports_agree: technical && visual ? technical === visual : true,
  };
}

export default savedVersionIdentity;