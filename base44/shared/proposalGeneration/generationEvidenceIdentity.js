/**
 * generationEvidenceIdentity.js (shared)
 * ---------------------------------------
 * The evidence identity a generation attempt is filed under.
 *
 * It is read from the frozen proposal evidence pack's own audit spine
 * (`evidence_basis`), which is where the pack records the saved reports it was
 * built from and the fingerprints those reports were generated against. Nothing
 * is read from live project state: a generation is traced to the same saved
 * evidence the pack was, or it is not filed at all.
 *
 * The identity is what makes an old generation readable after the design moves
 * on: the record keeps the exact pack fingerprint, report snapshot IDs, evidence
 * fingerprints and engineering fingerprints it was generated against, so it can
 * always be shown as the historical attempt it was.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

function asText(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The evidence identity of one frozen pack.
 *
 * @param {Object} pack — a buildProposalEvidence pack
 * @returns {{
 *   evidence_pack_fingerprint: string|null,
 *   evidence_pack_schema_version: number|null,
 *   visual_report_snapshot_ids: Array<string>,
 *   technical_report_snapshot_ids: Array<string>,
 *   evidence_fingerprints: Object,
 *   engineering_fingerprints: Object,
 * }}
 * @throws when no pack is supplied — the identity has no other source
 */
export function generationEvidenceIdentity(pack) {
  if (!pack || typeof pack !== 'object') {
    throw new Error(
      'A generation record is filed under the evidence it was generated from, so the frozen proposal evidence pack is required.',
    );
  }

  const basis = pack.evidence_basis && typeof pack.evidence_basis === 'object' ? pack.evidence_basis : {};
  const snapshotIds = Array.isArray(basis.report_snapshot_ids) ? basis.report_snapshot_ids : [];
  const fingerprints = Array.isArray(basis.fingerprints) ? basis.fingerprints : [];

  const reports = (Array.isArray(pack.options) ? pack.options : []).map((option) => {
    const versionId = option?.version_id ?? null;
    const snapshot = snapshotIds.find((entry) => entry?.version_id === versionId) || {};
    const fingerprint = fingerprints.find((entry) => entry?.version_id === versionId) || {};
    return {
      version_id: versionId,
      visual_report_snapshot_id: snapshot.visual_report_snapshot_id ?? null,
      technical_report_snapshot_id: snapshot.technical_report_snapshot_id ?? null,
      visual_evidence: fingerprint.visual_evidence ?? null,
      technical_evidence: fingerprint.technical_evidence ?? null,
      engineering: fingerprint.engineering ?? null,
    };
  });

  const present = (values) => values.filter((value) => asText(value) !== null);

  return {
    evidence_pack_fingerprint: pack.pack_fingerprint ?? null,
    evidence_pack_schema_version: pack.schema_version ?? null,
    visual_report_snapshot_ids: present(reports.map((entry) => entry.visual_report_snapshot_id)),
    technical_report_snapshot_ids: present(reports.map((entry) => entry.technical_report_snapshot_id)),
    // Which saved reports were used, per version, and what they were generated
    // against: the same report can be regenerated later, and its own evidence
    // fingerprint moves while this record still states what this attempt read.
    evidence_fingerprints: {
      pack: pack.pack_fingerprint ?? null,
      reports: reports.map((entry) => ({
        version_id: entry.version_id,
        visual_report_snapshot_id: entry.visual_report_snapshot_id,
        technical_report_snapshot_id: entry.technical_report_snapshot_id,
        visual_evidence: entry.visual_evidence,
        technical_evidence: entry.technical_evidence,
      })),
    },
    engineering_fingerprints: {
      versions: reports.map((entry) => ({
        version_id: entry.version_id,
        engineering: entry.engineering,
      })),
    },
  };
}

export default generationEvidenceIdentity;