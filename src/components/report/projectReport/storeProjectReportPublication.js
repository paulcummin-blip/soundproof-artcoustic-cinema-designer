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
import { storeSpeakerDesign } from '@/components/report/speakerDesign/speakerDesignIssuedDocument';
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
 * Store the companion Speaker Design PDF through the existing awaited storage
 * pipeline. Returns { ok, record } on success or { ok: false, error } on failure.
 */
async function storeCompanionDocument({ params }) {
  try {
    const record = await storeSpeakerDesign(params);
    return { ok: true, record };
  } catch (error) {
    const filename = params?.filename || null;
    const identity = {
      documentType: 'speaker_design',
      filename,
      projectId: params?.projectId || null,
    };
    const message = logFailure(error, identity, filename);
    return { ok: false, error: message };
  }
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