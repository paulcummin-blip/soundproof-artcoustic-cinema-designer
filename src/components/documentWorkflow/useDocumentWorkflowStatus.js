/**
 * useDocumentWorkflowStatus
 * --------------------------
 * React hook that reads a project's stored ProjectAssetExport records, the
 * active version's published engineering fingerprint, and the Speaker Design
 * in-session generation signal, and resolves the coordinated document workflow
 * status for one design version.
 *
 * The stored export records and the version's published fingerprint are the
 * durable authorities: a document is Ready only when its file-backed record
 * exists for this version with a matching engineering fingerprint. This
 * survives reload.
 *
 * The Speaker Design in-session signal (speakerDesignGenerationStatus) is read
 * alongside the stored records so the panel can show "Generating…" while a
 * creation is in flight, before the record has landed.
 */
import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  isPreparingSpeakerDesign,
  getSpeakerDesignGenerationError,
  subscribeSpeakerDesignGenerationStatus,
} from '@/components/report/speakerDesign/speakerDesignGenerationStatus';
import { resolveWorkflowStatus } from './documentWorkflowStatus';
import { subscribeIssuedExportStored } from '@/components/library/issuedExportSignal';
import { subscribeReportSourceStored } from '@/components/proposal/sourceAuthority/reportSourceSignal';

const asItems = (page) => (Array.isArray(page) ? page : (page?.items || []));

export function useDocumentWorkflowStatus({ projectId = null, versionId = null } = {}) {
  const [exports, setExports] = useState([]);
  const [engineeringFingerprint, setEngineeringFingerprint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Read stored exports and the version's published fingerprint.
  useEffect(() => {
    if (!projectId) {
      setExports([]);
      setEngineeringFingerprint(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [exportPage, versionPage] = await Promise.all([
          base44.entities.ProjectAssetExport.filter(
            { project_id: projectId },
            { sort: '-exported_at', limit: 200 },
          ),
          base44.entities.ProjectVersion.filter(
            { project_id: projectId },
            { sort: 'version_number', limit: 20 },
          ),
        ]);
        if (cancelled) return;
        setExports(asItems(exportPage));
        const versions = asItems(versionPage);
        const version = versionId
          ? versions.find((v) => v?.id === versionId)
          : versions[0] || null;
        console.info('[DocumentWorkflowRead]', JSON.stringify({projectId, versionId, selectedId:version?.id, published:version?.published_fingerprint, versions:versions.map(v=>v.id), exports:asItems(exportPage).map(e=>({id:e.id,version:e.version_id,fp:e.source_fingerprints?.engineeringFingerprint}))}));
        setEngineeringFingerprint(version?.published_fingerprint || null);
      } catch (err) {
        console.warn('[useDocumentWorkflowStatus] read failed:', err);
        if (!cancelled) {
          setExports([]);
          setEngineeringFingerprint(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, versionId, tick]);

  // Re-read when a Speaker Design generation completes (the record lands).
  useEffect(() => {
    return subscribeSpeakerDesignGenerationStatus(() => setTick((t) => t + 1));
  }, []);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    const offExport = subscribeIssuedExportStored((id) => { if (id === projectId) refresh(); });
    const offSource = subscribeReportSourceStored((entry) => {
      if (entry.projectId === projectId && (!entry.versionId || entry.versionId === versionId)) refresh();
    });
    return () => { offExport(); offSource(); };
  }, [projectId, versionId]);

  const speakerDesignGenerating = isPreparingSpeakerDesign(projectId, versionId);
  const speakerDesignError = getSpeakerDesignGenerationError(projectId, versionId);

  const status = resolveWorkflowStatus({
    exports,
    versionId,
    engineeringFingerprint,
    speakerDesignGenerating,
    speakerDesignError,
  });

  return { loading, ...status };
}

export default useDocumentWorkflowStatus;