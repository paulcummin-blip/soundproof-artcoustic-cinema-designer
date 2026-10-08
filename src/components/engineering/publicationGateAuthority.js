/**
 * publicationGateAuthority (client)
 * ---------------------------------
 * The report/proposal-facing half of the durability rule. Mirrors
 * base44/shared/publicationGateAuthority.js (the server half) — the two are kept
 * in step by test/publication-durability.test.mjs.
 *
 * The rule: no final report, no report snapshot, no reportEvidence and no
 * "Current" readiness without a durable engineering publication for this exact
 * version. A browser handoff may preview; it may never be final authority.
 *
 * Pure: reads the durable read result it is given, plus the acknowledgement
 * store. No I/O of its own.
 */

import {
  PUBLICATION_ACKNOWLEDGEMENT,
  PUBLICATION_SECTION_LABELS,
  auditPublicationEntry,
  publicationBlockMessage,
} from './publicationGateCore';

export {
  PUBLICATION_ACKNOWLEDGEMENT,
  PUBLICATION_SECTION_LABELS,
  auditPublicationEntry,
  publicationBlockMessage,
};

/**
 * Audit the durable read for one version.
 *
 * @param {object}  input
 * @param {object}  input.durable              { publication, status, version, readState }
 * @param {string}  input.versionName
 * @param {object}  input.project              optional room/screen authority
 * @param {boolean} input.authorityComplete    the composed RP22 + bass verdict
 * @param {string}  input.authorityReason
 * @param {object}  input.attempt              publication acknowledgement record
 * @returns {{allowed:boolean, status:string, reason:string|null, missing:Array,
 *            publication:object|null, fingerprintMatches:boolean, blocked:boolean}}
 */
export function auditDurablePublication({
  durable = null,
  versionName = null,
  project = null,
  authorityComplete = null,
  authorityReason = null,
  attempt = null,
  assessmentExists = false,
  assessmentComplete = false,
} = {}) {
  const block = (status, missing, reason) => ({
    allowed: false,
    blocked: true,
    status,
    missing,
    missing_fields: missing.map((item) => item?.key || String(item)),
    reason,
    publication: durable?.publication || null,
    fingerprintMatches: false,
  });

  if (durable === undefined || durable === null) {
    // Cold load: the durable read has not resolved yet. Fail closed and say so,
    // instead of reporting an assessment that has not been saved yet.
    return block(
      PUBLICATION_ACKNOWLEDGEMENT.CHECKING,
      [],
      `Engineering authority${versionName ? ` for ${versionName}` : ''} is still loading. Report generation is blocked until it resolves.`,
    );
  }

  if (durable?.readState === 'failed') {
    return block(
      'read_failed',
      [],
      durable?.error
        ? `The saved engineering assessment${versionName ? ` for ${versionName}` : ''} could not be read: ${durable.error}`
        : `The saved engineering assessment${versionName ? ` for ${versionName}` : ''} could not be read. Retry before generating reports.`,
    );
  }

  if (!durable?.publication || !durable?.version?.published_fingerprint) {
    // Not published, or the version pointer references a publication that is not
    // there. Either way there is no authority to report from.
    const missing = attempt?.missing || [];
    const details = attempt?.message || missing.map(item => item.label || item.key || String(item)).join('; ');
    if (durable?.status === 'stale') return block('stale_pointer', missing,
      'Saved publication stale: the version pointer has no matching stored publication. ' + (details || 'Publish this version again.'));
    if (attempt?.status === 'publishing' || attempt?.status === 'queued') return block(attempt.status, [],
      details || 'Assessment publication is in progress. Reports remain blocked until acknowledgement.');
    const complete = assessmentComplete || attempt?.assessmentComplete === true;
    if (complete) return block('publication_rejected', missing,
      'Assessment complete but not durably published. ' + (details || 'Publish Assessment in Room Designer.'));
    if (assessmentExists || attempt) return block('assessment_incomplete', missing,
      'Assessment incomplete or publication preflight blocked. ' + (details || authorityReason || 'Complete the identified assessment gates.'));
    return block('assessment_missing', [], 'Engineering assessment missing: no complete saved assessment exists for this version. Run assessment in Room Designer.');
  }

  const audited = auditPublicationEntry(durable.publication, {
    expectedFingerprint: durable.version.published_fingerprint,
    project,
    bassAuthorityAvailable: authorityComplete === true,
  });

  if (audited.complete && authorityComplete === false) {
    // The publication is durable, but the composed authority is not yet a
    // complete RP22 + bass assessment. The report gate's own reason is exact.
    return {
      allowed: false,
      blocked: true,
      status: PUBLICATION_ACKNOWLEDGEMENT.INCOMPLETE,
      missing: audited.missing,
      reason: authorityReason || publicationBlockMessage({ versionName, published: true, missing: [] }),
      publication: durable.publication,
      fingerprintMatches: audited.fingerprintMatches,
    };
  }

  if (!audited.complete) {
    return {
      allowed: false,
      blocked: true,
      status: PUBLICATION_ACKNOWLEDGEMENT.INCOMPLETE,
      missing: audited.missing,
      reason: publicationBlockMessage({
        versionName,
        published: true,
        missing: audited.missing,
      }),
      publication: durable.publication,
      fingerprintMatches: audited.fingerprintMatches,
    };
  }

  return {
    allowed: true,
    blocked: false,
    status: PUBLICATION_ACKNOWLEDGEMENT.DURABLE,
    missing: [],
    reason: null,
    publication: durable.publication,
    fingerprintMatches: audited.fingerprintMatches,
  };
}

/**
 * The hard gate in front of a report snapshot write. The composed RP22 + bass
 * verdict is the page's business (it already gated the report); what this
 * refuses is a snapshot created without a durable publication to have come from.
 */
export function auditReportSaveAuthority(durable, { versionName = null } = {}) {
  const gate = auditDurablePublication({ durable, versionName, authorityComplete: true });
  return { allowed: gate.allowed, reason: gate.reason, status: gate.status, missing: gate.missing };
}