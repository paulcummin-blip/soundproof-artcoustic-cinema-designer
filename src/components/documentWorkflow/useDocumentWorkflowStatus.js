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
import { buildFreshnessReason } from './documentFreshnessReason';

const asItems = (page) => (Array.isArray(page) ? page : (page?.items || []));

const TECHNICAL_REPORT_TYPE = 'project';
const SPEAKER_DESIGN_TYPE = 'speaker_design';

/**
 * Compute the human-readable freshness reason for each outdated document by
 * comparing its source publication's frozen facts against the current
 * publication's frozen facts.
 *
 * The publications are looked up from the ProjectAnalysisCache's
 * engineering_publications map, keyed by fingerprint. A document's source
 * fingerprint is its stored source_fingerprints.engineeringFingerprint; the
 * current fingerprint is the version's published_fingerprint.
 *
 * Returns a map of documentType → reason (string) or null when no reason can be
 * determined (evidence unavailable or no identifiable design change).
 */
function computeFreshnessReasons({ exports, versionId, versionFingerprint, analysisCache }) {
  const publications = (analysisCache?.engineering_publications && typeof analysisCache.engineering_publications === 'object')
    ? analysisCache.engineering_publications
    : null;
  if (!publications || !versionFingerprint) return {};
  const currentPublication = publications[versionFingerprint] || null;
  if (!currentPublication) return {};
  const reasons = {};
  const documentTypes = [TECHNICAL_REPORT_TYPE, SPEAKER_DESIGN_TYPE, 'proposal'];
  for (const documentType of documentTypes) {
    const record = exports.find((entry) => {
      if (entry?.version_id !== versionId) return false;
      const type = documentType === 'proposal'
        ? ['proposal', 'system_design_summary'].includes(entry?.document_type) ? 'proposal' : null
        : entry?.document_type;
      if (type !== documentType) return false;
      return !!(entry?.file_uri || entry?.file_url);
    });
    if (!record) continue;
    const savedFingerprint = record.source_fingerprints?.engineeringFingerprint || null;
    if (!savedFingerprint || savedFingerprint === versionFingerprint) continue;
    const savedPublication = publications[savedFingerprint] || null;
    reasons[documentType] = buildFreshnessReason({
      savedPublication,
      currentPublication,
      documentType,
    });
  }
  return reasons;
}

export function useDocumentWorkflowStatus({ projectId = null, versionId = null } = {}) {
  const [exports, setExports] = useState([]);
  const [engineeringFingerprint, setEngineeringFingerprint] = useState(null);
  const [analysisCache, setAnalysisCache] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Read stored exports, the version's published fingerprint, and the
  // ProjectAnalysisCache record whose engineering_publications map holds the
  // frozen design facts for both the saved and current publications.
  useEffect(() => {
    if (!projectId) {
      setExports([]);
      setEngineeringFingerprint(null);
      setAnalysisCache(null);
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
        const fingerprint = version?.published_fingerprint || null;
        setEngineeringFingerprint(fingerprint);
        // The engineering_publications map carries the frozen report facts for
        // each published fingerprint, so the freshness reason can be computed
        // from the actual design rather than the fingerprint mismatch alone.
        if (version?.id && fingerprint) {
          try {
            const cachePage = await base44.entities.ProjectAnalysisCache.filter(
              { project_id: projectId, version_id: version.id },
              { limit: 1 },
            );
            if (!cancelled) setAnalysisCache(asItems(cachePage)[0] || null);
          } catch {
            if (!cancelled) setAnalysisCache(null);
          }
        } else {
          setAnalysisCache(null);
        }
      } catch (err) {
        console.warn('[useDocumentWorkflowStatus] read failed:', err);
        if (!cancelled) {
          setExports([]);
          setEngineeringFingerprint(null);
          setAnalysisCache(null);
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

  const freshnessReasons = computeFreshnessReasons({
    exports,
    versionId,
    versionFingerprint: engineeringFingerprint,
    analysisCache,
  });

  const status = resolveWorkflowStatus({
    exports,
    versionId,
    engineeringFingerprint,
    speakerDesignGenerating,
    speakerDesignError,
    freshnessReasons,
  });

  return { loading, ...status };
}

export default useDocumentWorkflowStatus;