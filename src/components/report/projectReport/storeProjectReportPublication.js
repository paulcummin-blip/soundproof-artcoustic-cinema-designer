/**
 * storeProjectReportPublication.js
 * ---------------------------------
 * Stores BOTH the Project Report PDF and the companion Speaker Design PDF
 * for one Project Report export, awaiting capture, upload and record
 * creation for each before reporting the publication outcome.
 *
 * Both documents are stored from the SAME saved project/version authority
 * and engineering fingerprint, through the EXISTING storage pipeline
 * (storeIssuedDocument / storeSpeakerDesign). No second generator is built.
 *
 * Returns a unified result so the export flow can treat the publication as
 * complete only when both documents have landed, and offer a targeted retry
 * that re-stores only the document that failed — never the one that succeeded.
 *
 * Pure storage orchestration: nothing here calculates, grades, re-counts or
 * re-orders anything. It never touches the design, the report snapshot, the
 * engineering publication or any count.
 */

import {
  storeIssuedDocument,
} from '@/components/library/issuedDocument/recordIssuedExport';
import { clearPendingExport } from '@/components/library/issuedDocument/pendingIssuedExportStore';
import { ensureSpeakerDesignForVersion } from '@/components/report/speakerDesign/ensureSpeakerDesignForVersion';
import {
  asExportStorageError,
  buildExportStorageDiagnostic,
} from '@/components/library/issuedDocument/exportStorageFailure';
import { writeExportStorageDiagnostic } from '@/components/library/issuedDocument/exportStorageDiagnosticLog';
import { notifyReportSourceStored } from '@/components/proposal/sourceAuthority/reportSourceSignal';

/** The two documents a Project Report publication stores. */
export const PUBLICATION_DOCUMENT = Object.freeze({
  PROJECT_REPORT: 'project_report',
  SPEAKER_DESIGN: 'speaker_design',
});

/** A human-readable reason for a storage failure, from the ExportStorageError. */
function describeError(error) {
  if (!error) return 'The document could not be stored.';
  if (error.reason) return error.reason;
  if (error.detail) return String(error.detail);
  return error.message || 'The document could not be stored.';
}

/** Write the structured diagnostic and return the plain reason. */
function logFailure(error, identity, filename) {
  const identified = asExportStorageError(error);
  writeExportStorageDiagnostic(buildExportStorageDiagnostic({
    failure: identified,
    identity: { ...identity, filename },
    filename,
    storagePath: identified?.storagePath,
    partial: identified?.partial,
  }));
  return describeError(identified);
}

/**
 * Store the Project Report PDF through the existing awaited storage pipeline.
 * Returns { ok, record } on success or { ok: false, error } on failure.
 */
async function storeReportDocument({ identity, snapshot }) {
  try {
    const { record, pendingKey } = await storeIssuedDocument({ identity, snapshot });
    clearPendingExport(pendingKey);
    return { ok: true, record };
  } catch (error) {
    const message = logFailure(error, identity, identity?.filename);
    return { ok: false, error: message };
  }
}

/**
 * Store the companion Speaker Design PDF through the ONE shared authority. The
 * export path reuses a matching stored PDF instead of duplicating one, and a
 * concurrent background attempt is never raced into two copies.
 *
 * Returns { ok, record } on success or { ok: false, error } on failure.
 */
async function storeCompanionDocument({ params }) {
  if (!params?.projectId) {
    return { ok: false, error: 'The Speaker Design storage requires a project id.' };
  }
  // The version id and engineering fingerprint come from the export's own
  // resolved source identity, so the stored schedule can only ever belong to the
  // version the report was made from.
  let resolvedSource = {};
  try {
    resolvedSource = typeof params.resolveSource === 'function'
      ? (await params.resolveSource()) || {}
      : {};
  } catch (error) {
    const message = describeError(error);
    return { ok: false, error: message };
  }
  const versionId = params.versionId || resolvedSource.versionId || null;
  const engineeringFingerprint = resolvedSource.sourceFingerprints?.engineeringFingerprint || null;

  const result = await ensureSpeakerDesignForVersion({
    projectId: params.projectId,
    versionId,
    engineeringFingerprint,
    schedule: {
      groups: params.groups,
      layout: params.layout || null,
    },
    projectName: params.projectName || null,
    dealerName: params.dealerName || null,
    clientName: params.clientName || null,
    projectReference: params.projectReference || null,
    versionName: params.versionName || null,
    versionNumber: params.versionNumber ?? null,
    accountId: params.accountId || null,
    resolveSource: params.resolveSource || null,
    exportedBy: params.exportedBy || null,
  });

  if (result.status === 'stored' || result.status === 'reused') {
    return { ok: true, record: result.record || null };
  }
  // 'already-preparing' is never returned: concurrent callers await the SAME
  // Promise and its actual outcome, so a second caller receives the verified
  // result — not a success claim before the PDF exists. Any status that is not
  // a verified stored or reused export is a failure, never a completed
  // publication, and no caller marks the companion document complete on the
  // strength of a request that has merely started.
  if (result.status === 'blocked') {
    return { ok: false, error: result.reason || 'This version has no speaker design to export yet.' };
  }
  return { ok: false, error: result.error || 'The Speaker Design PDF could not be stored.' };
}

/**
 * Store BOTH the Project Report PDF and the companion Speaker Design PDF for
 * one export, awaiting each. Both are fired in parallel so neither is delayed
 * by the other, but the returned promise resolves only when both have landed
 * or failed.
 *
 * @param {Object} params
 * @param {Object|null} params.reportIdentity — the Project Report issued-document identity
 * @param {Object|null} params.reportSnapshot — the captured Project Report composition snapshot
 * @param {Object|null} params.speakerDesignParams — the Speaker Design store parameters
 * @param {string|null} params.projectId — the project id, for the readiness signal
 * @param {string|null} params.versionId — the version id, for the readiness signal
 * @returns {Promise<{stored: string[], failed: Array<{key: string, error: string}>, complete: boolean}>}
 */
export async function storeProjectReportPublication({
  reportIdentity = null,
  reportSnapshot = null,
  speakerDesignParams = null,
  projectId = null,
  versionId = null,
} = {}) {
  const tasks = [];

  if (reportIdentity?.documentType && reportSnapshot?.nodeHtml) {
    tasks.push({
      key: PUBLICATION_DOCUMENT.PROJECT_REPORT,
      promise: storeReportDocument({ identity: reportIdentity, snapshot: reportSnapshot }),
    });
  }

  if (speakerDesignParams?.groups?.length > 0 && speakerDesignParams?.projectId) {
    tasks.push({
      key: PUBLICATION_DOCUMENT.SPEAKER_DESIGN,
      promise: storeCompanionDocument({ params: speakerDesignParams }),
    });
  }

  const results = await Promise.all(
    tasks.map(async (task) => ({ key: task.key, ...(await task.promise) })),
  );

  const stored = results.filter((r) => r.ok).map((r) => r.key);
  const failed = results.filter((r) => !r.ok).map((r) => ({ key: r.key, error: r.error }));

  // Tell the readiness table a report source has been written, so the Proposal
  // Centre re-reads and shows the stored document as Current without a reload.
  if (projectId && (stored.length > 0 || failed.length > 0)) {
    notifyReportSourceStored({ projectId, versionId: versionId || null });
  }

  return {
    stored,
    failed,
    complete: failed.length === 0 && results.length > 0,
  };
}

/**
 * Retry only the missing document, from the same saved authority. The document
 * that already succeeded is never re-stored.
 *
 * @returns {Promise<{ok: boolean, record?: Object, error?: string}>}
 */
export async function retryPublicationDocument({
  key = null,
  reportIdentity = null,
  reportSnapshot = null,
  speakerDesignParams = null,
} = {}) {
  if (key === PUBLICATION_DOCUMENT.PROJECT_REPORT) {
    if (!reportIdentity?.documentType || !reportSnapshot?.nodeHtml) {
      return { ok: false, error: 'The Project Report composition is no longer available.' };
    }
    return storeReportDocument({ identity: reportIdentity, snapshot: reportSnapshot });
  }
  if (key === PUBLICATION_DOCUMENT.SPEAKER_DESIGN) {
    if (!speakerDesignParams?.groups?.length || !speakerDesignParams?.projectId) {
      return { ok: false, error: 'The Speaker Design schedule is no longer available.' };
    }
    return storeCompanionDocument({ params: speakerDesignParams });
  }
  return { ok: false, error: 'Unknown document.' };
}