/**
 * ensureSpeakerDesignForVersion.js
 * ---------------------------------
 * ONE authority for creating and storing a version's Current Speaker Design PDF
 * when it does not already exist for the current design.
 *
 * Every caller — the Project Report snapshot save, the report-page catch-up
 * effect, the report PDF export and the Proposal Centre's own auto-preparation
 * — goes through this function. It holds the rules the recurring defect needed:
 *
 *   - It checks for a matching stored `ProjectAssetExport` FIRST. A Speaker
 *     Design whose engineering fingerprint matches the current design is reused
 *     — no duplicate is ever created.
 *   - Only one attempt runs per version at a time. The `speakerDesignGenerationStatus`
 *     store is the single in-flight guard, so a report save, an export, a
 *     background catch-up and the Proposal Centre opening can never race into
 *     two stored copies of the same schedule.
 *   - It awaits the EXISTING storage pipeline — `storeSpeakerDesign` →
 *     `storeIssuedDocument` → capture, private upload and `ProjectAssetExport`
 *     record creation — and verifies a stored file reference came back before it
 *     reports success. A failed capture, upload or record write is returned as a
 *     failure with the real reason; the status is never marked Current on the
 *     strength of a request alone.
 *   - The project id, version id, account and engineering fingerprint are taken
 *     from the saved records and the durable publication, never from
 *     potentially stale UI state — unless a caller that already holds the frozen
 *     schedule supplies overrides, in which case those are trusted verbatim.
 *   - It notifies Proposal Centre to re-read when a document lands or is reused,
 *     so the readiness table refreshes without a reload.
 *
 * Pure orchestration: nothing here calculates, grades, re-counts or re-orders
 * anything. It never touches the design, the report snapshot, the engineering
 * publication or any count.
 */

import { base44 } from '@/api/base44Client';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import { buildSpeakerDesignFromVersion } from './buildSpeakerDesignFromVersion';
import { storeSpeakerDesign } from './speakerDesignIssuedDocument';
import { fetchDurablePublication } from '@/components/engineering/versionedEngineeringAuthority';
import { notifyReportSourceStored } from '@/components/proposal/sourceAuthority/reportSourceSignal';
import {
  beginSpeakerDesignGeneration,
  completeSpeakerDesignGeneration,
  isPreparingSpeakerDesign,
} from './speakerDesignGenerationStatus';

/** Read the first record from a filter page that may be an array or a page. */
function firstRecord(page) {
  if (!page) return null;
  if (Array.isArray(page)) return page[0] || null;
  return (page.items || [])[0] || null;
}

/** A human-readable reason for a storage failure, from the ExportStorageError or Error. */
function describeError(error) {
  if (!error) return 'The Speaker Design PDF could not be stored.';
  if (error.reason) return error.reason;
  if (error.detail) return String(error.detail);
  return error.message || 'The Speaker Design PDF could not be stored.';
}

/**
 * Ensure a version has a current stored Speaker Design PDF.
 *
 * @param {Object} input
 * @param {string} input.projectId
 * @param {string} input.versionId
 * @param {string|null} [input.engineeringFingerprint] — the current design's fingerprint; reused if it already matches a stored PDF
 * @param {Object|null} [input.schedule] — optional prebuilt { groups, layout, isEmpty }; skips reading the version
 * @param {string|null} [input.projectName]
 * @param {string|null} [input.dealerName]
 * @param {string|null} [input.clientName]
 * @param {string|null} [input.projectReference]
 * @param {string|null} [input.versionName]
 * @param {number|null} [input.versionNumber]
 * @param {string|null} [input.accountId]
 * @param {Function|null} [input.resolveSource] — optional identity resolver override
 * @param {string|null} [input.exportedBy]
 * @returns {Promise<{status: string, record?: Object, reason?: string, error?: string}>}
 *   status: 'already-preparing' | 'reused' | 'stored' | 'blocked' | 'failed' | 'skipped'
 */
export async function ensureSpeakerDesignForVersion({
  projectId = null,
  versionId = null,
  engineeringFingerprint = null,
  schedule = null,
  projectName = null,
  dealerName = null,
  clientName = null,
  projectReference = null,
  versionName = null,
  versionNumber = null,
  accountId = null,
  resolveSource = null,
  exportedBy = null,
} = {}) {
  if (!projectId || !versionId) {
    return { status: 'skipped', reason: 'A project id and version id are required.' };
  }

  // ONE attempt per version at a time. A second caller — a concurrent report
  // save, an export, a background catch-up or the Proposal Centre opening —
  // receives 'already-preparing' and re-reads when the in-flight attempt lands.
  if (isPreparingSpeakerDesign(projectId, versionId)) {
    return { status: 'already-preparing' };
  }

  beginSpeakerDesignGeneration(projectId, versionId);

  try {
    // 1. Reuse: a Speaker Design whose engineering fingerprint matches the
    //    current design is already the document Proposal Centre needs.
    if (engineeringFingerprint) {
      const page = await base44.entities.ProjectAssetExport.filter(
        { project_id: projectId, document_type: 'speaker_design', version_id: versionId },
        { sort: '-exported_at', limit: 1 },
      );
      const latest = firstRecord(page);
      const storedFp = latest?.source_fingerprints?.engineeringFingerprint || null;
      if (latest && storedFp === engineeringFingerprint) {
        notifyReportSourceStored({ projectId, versionId });
        completeSpeakerDesignGeneration(projectId, versionId, null);
        return { status: 'reused', record: latest };
      }
    }

    // 2. Build the schedule. A caller that already holds the frozen schedule
    //    (the report export path) passes it in; otherwise it is built from the
    //    saved version's own design state through the same authority the
    //    Project Report uses.
    let groups = Array.isArray(schedule?.groups) ? schedule.groups : null;
    let layout = schedule?.layout || null;

    let project = null;
    let version = null;

    if (!Array.isArray(groups) || groups.length === 0) {
      const [projectPage, versionPage] = await Promise.all([
        base44.entities.Project.filter({ id: projectId }),
        base44.entities.ProjectVersion.filter({ id: versionId }),
      ]);
      project = firstRecord(projectPage);
      version = firstRecord(versionPage);
      if (!project || !version) {
        throw new Error('The project or version could not be read.');
      }
      const built = buildSpeakerDesignFromVersion(mergeProjectAndVersion(project, version));
      groups = built.groups;
      layout = built.layout || null;
      if (built.isEmpty || !Array.isArray(groups) || groups.length === 0) {
        // Nothing to store — and nothing to claim. The version reads Missing with
        // its own reason, and no false Current is recorded.
        completeSpeakerDesignGeneration(projectId, versionId, null);
        return { status: 'blocked', reason: 'This version has no speaker design to export yet.' };
      }
    }

    // 3. Resolve the engineering fingerprint from the durable publication when
    //    the caller did not state it, so the stored PDF carries the same source
    //    fingerprint the readiness table compares against.
    let resolvedEngineeringFingerprint = engineeringFingerprint;
    if (!resolvedEngineeringFingerprint) {
      const durable = await fetchDurablePublication(projectId, versionId);
      resolvedEngineeringFingerprint = durable?.publication?.engineering_fingerprint || null;
    }

    // 4. Resolve identity fields from the saved records when the caller did not
    //    supply them, so the filename and ownership match the Project Report.
    if (!project || !version) {
      const [projectPage, versionPage] = await Promise.all([
        base44.entities.Project.filter({ id: projectId }),
        base44.entities.ProjectVersion.filter({ id: versionId }),
      ]);
      project = project || firstRecord(projectPage);
      version = version || firstRecord(versionPage);
    }

    const resolvedVersionName = versionName || version?.version_name || `Version ${version?.version_number || ''}`;
    const resolvedVersionNumber = versionNumber ?? version?.version_number ?? null;

    const source = resolveSource || (() => ({
      versionId,
      selectedVersionIds: [versionId],
      sourceRecordId: null,
      sourceFingerprints: { engineeringFingerprint: resolvedEngineeringFingerprint },
      sourceStatusAtExport: 'current',
    }));

    // 5. Await the EXISTING storage pipeline. A failure here is returned with the
    //    real reason; the status is never marked Current on the strength of a
    //    request alone.
    const record = await storeSpeakerDesign({
      groups,
      layout,
      projectName: projectName || project?.name || null,
      dealerName: dealerName || project?.dealer_name || null,
      clientName: clientName || project?.client_name || null,
      projectReference: projectReference || project?.project_reference || null,
      versionName: resolvedVersionName,
      versionNumber: resolvedVersionNumber,
      projectId,
      accountId: accountId || project?.account_id || null,
      resolveSource: source,
      exportedBy,
    });

    // 6. Verify a stored file reference came back. The record IS the authority;
    //    a record with no file reference is a failure, not a success.
    if (!record || (!record.file_uri && !record.file_url)) {
      throw new Error('The Speaker Design PDF was not stored.');
    }

    notifyReportSourceStored({ projectId, versionId });
    completeSpeakerDesignGeneration(projectId, versionId, null);
    return { status: 'stored', record };
  } catch (error) {
    const reason = describeError(error);
    completeSpeakerDesignGeneration(projectId, versionId, reason);
    return { status: 'failed', error: reason };
  }
}

export default ensureSpeakerDesignForVersion;