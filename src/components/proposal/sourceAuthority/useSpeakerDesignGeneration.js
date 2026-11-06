/**
 * useSpeakerDesignGeneration
 * ---------------------------
 * The Proposal Centre action that generates and stores a missing Speaker Design
 * PDF for one selected version — WITHOUT regenerating the version's current
 * Project Report.
 *
 * It reuses the EXISTING storage pipeline (`storeSpeakerDesign` →
 * `storeIssuedDocument` → capture, upload, `ProjectAssetExport` record) and the
 * SAME product authority the Project Report uses (`buildSpeakerDesignRows` via
 * `buildSpeakerDesignFromVersion`), so the schedule a designer generates here is
 * identical to the one the Project Report stores beside it.
 *
 * Rules this hook holds:
 *   - It operates on the EXACT selected version, reading its saved design_state
 *     and its published engineering fingerprint.
 *   - If a matching Speaker Design PDF already exists (same engineering
 *     fingerprint), it is reused — no duplicate is created.
 *   - It awaits capture, upload and record creation before reporting success.
 *   - On failure, the status stays "Not generated" and the real reason is shown.
 *     Success is never claimed for a failed store.
 *   - The current Project Report snapshot and PDF are never touched.
 *   - The Speaker Design remains non-blocking for proposal generation.
 */

import { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import { buildSpeakerDesignFromVersion } from '@/components/report/speakerDesign/buildSpeakerDesignFromVersion';
import { storeSpeakerDesign } from '@/components/report/speakerDesign/speakerDesignIssuedDocument';
import { fetchDurablePublication } from '@/components/engineering/versionedEngineeringAuthority';
import { notifyReportSourceStored } from './reportSourceSignal';

/** A human-readable reason for a storage failure, from the ExportStorageError. */
function describeStorageError(error) {
  if (!error) return 'The Speaker Design PDF could not be stored.';
  if (error.reason) return error.reason;
  if (error.detail) return String(error.detail);
  return error.message || 'The Speaker Design PDF could not be stored.';
}

/**
 * @param {string} projectId
 * @returns {{ generate: (versionId: string) => Promise<void>, isGenerating: (versionId: string) => boolean, getError: (versionId: string) => string|null, clearError: (versionId: string) => void }}
 */
export function useSpeakerDesignGeneration(projectId) {
  const [generatingSet, setGeneratingSet] = useState(() => new Set());
  const [errorMap, setErrorMap] = useState({});

  const isGenerating = useCallback(
    (versionId) => !!(versionId && generatingSet.has(versionId)),
    [generatingSet],
  );

  const getError = useCallback(
    (versionId) => (versionId ? errorMap[versionId] || null : null),
    [errorMap],
  );

  const clearError = useCallback((versionId) => {
    if (!versionId) return;
    setErrorMap((prev) => {
      if (!prev[versionId]) return prev;
      const next = { ...prev };
      delete next[versionId];
      return next;
    });
  }, []);

  const generate = useCallback(async (versionId) => {
    if (!projectId || !versionId) return;
    if (generatingSet.has(versionId)) return;

    setGeneratingSet((prev) => new Set(prev).add(versionId));
    setErrorMap((prev) => {
      if (!prev[versionId]) return prev;
      const next = { ...prev };
      delete next[versionId];
      return next;
    });

    try {
      // Read the Project and ProjectVersion records — the same records the
      // readiness table reads — and merge them into the single object the
      // speaker design authority consumes.
      const [projectPage, versionPage] = await Promise.all([
        base44.entities.Project.filter({ id: projectId }),
        base44.entities.ProjectVersion.filter({ id: versionId }),
      ]);
      const project = (Array.isArray(projectPage) ? projectPage : projectPage?.items || [])[0] || null;
      const version = (Array.isArray(versionPage) ? versionPage : versionPage?.items || [])[0] || null;
      if (!project || !version) {
        throw new Error('The project or version could not be read.');
      }

      // If a matching Speaker Design PDF already exists, reuse it — do not
      // create a duplicate.
      const engineeringFingerprint = version.published_fingerprint || null;
      if (engineeringFingerprint) {
        const existingPage = await base44.entities.ProjectAssetExport.filter(
          { project_id: projectId, document_type: 'speaker_design', version_id: versionId },
          { sort: '-exported_at', limit: 1 },
        );
        const latest = (existingPage?.items || [])[0] || null;
        const storedFp = latest?.source_fingerprints?.engineeringFingerprint || null;
        if (latest && storedFp === engineeringFingerprint) {
          // A matching PDF already exists — nothing to store.
          notifyReportSourceStored({ projectId, versionId });
          return;
        }
      }

      const merged = mergeProjectAndVersion(project, version);
      const schedule = buildSpeakerDesignFromVersion(merged);
      if (schedule.isEmpty || schedule.groups.length === 0) {
        throw new Error('This version has no speaker design to export yet.');
      }

      // Resolve the durable publication to get the engineering fingerprint, so
      // the stored PDF carries the same source fingerprint the readiness table
      // compares against.
      const durable = await fetchDurablePublication(projectId, versionId);
      const resolvedEngineeringFingerprint = durable?.publication?.engineering_fingerprint
        || engineeringFingerprint
        || null;

      const versionName = version.version_name || `Version ${version.version_number || ''}`;
      const versionNumber = version.version_number ?? null;

      await storeSpeakerDesign({
        groups: schedule.groups,
        layout: schedule.layout || null,
        projectName: project.name,
        dealerName: project.dealer_name || null,
        clientName: project.client_name || null,
        projectReference: project.project_reference || null,
        versionName,
        versionNumber,
        projectId,
        accountId: project.account_id || null,
        resolveSource: () => ({
          versionId,
          selectedVersionIds: [versionId],
          sourceRecordId: null,
          sourceFingerprints: { engineeringFingerprint: resolvedEngineeringFingerprint },
          sourceStatusAtExport: 'current',
        }),
      });

      // Tell the readiness table to re-read, so it picks up the new record and
      // shows "Current" for this version.
      notifyReportSourceStored({ projectId, versionId });
    } catch (error) {
      setErrorMap((prev) => ({
        ...prev,
        [versionId]: describeStorageError(error),
      }));
    } finally {
      setGeneratingSet((prev) => {
        if (!prev.has(versionId)) return prev;
        const next = new Set(prev);
        next.delete(versionId);
        return next;
      });
    }
  }, [projectId, generatingSet]);

  return { generate, isGenerating, getError, clearError };
}

export default useSpeakerDesignGeneration;