/**
 * snapshotIdentity.js
 * --------------------------------
 * Builds the frozen snapshot identity block: projectId, versionId,
 * engineering fingerprint, calculation revision, and generation timestamp.
 *
 * Uses the strongest existing authority fingerprints rather than inventing
 * a single global calculationRevision.
 *
 * Pure function. No React. No side effects.
 */

import { INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from '@/lib/bassAuthorityVersion';

/**
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string} params.versionId
 * @param {Object} params.completedBassAuthority — for bass fingerprint
 * @param {Object} params.designRating — for seat-priority fingerprint
 * @returns {Object} identity block
 */
export function buildSnapshotIdentity({ projectId, versionId, completedBassAuthority, designRating }) {
  const bassFingerprint = completedBassAuthority?.contract?.job?.resultFingerprint
    || completedBassAuthority?.currentFingerprint
    || null;

  const seatPriorityFingerprint = designRating?.seatPriorityFingerprint || null;

  const calculationRevision = [
    `bass-instance:${INSTANCE_AUTHORITY_VERSION}`,
    `bass-metric:${RP22_BASS_METRIC_SCHEMA_VERSION}`,
    seatPriorityFingerprint ? `seat-priority:${seatPriorityFingerprint}` : null,
  ].filter(Boolean).join('|');

  return {
    projectId: projectId || null,
    versionId: versionId || null,
    engineeringFingerprint: bassFingerprint,
    seatPriorityFingerprint,
    calculationRevision,
    generatedAt: new Date().toISOString(),
  };
}