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
import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  isPreparingSpeakerDesign,
  getSpeakerDesignGenerationError,
  subscribeSpeakerDesignGenerationStatus,
} from '@/components/report/speakerDesign/speakerDesignGenerationStatus';
import { resolveWorkflowStatus } from './documentWorkflowStatus';
import { subscribeIssuedExportStored } from '@/components/library/issuedExportSignal';
import { subscribeReportSourceStored } from '@/components/proposal/sourceAuthority/reportSourceSignal';
import { buildFreshnessReason, identifyDesignChanges } from './documentFreshnessReason';
import { EQUIVALENCE, WORKFLOW_STATE } from './documentWorkflowStatus';
import { reportClientFailure } from '@/components/systemHealth/clientExperienceMonitor';

const asItems = (page) => (Array.isArray(page) ? page : (page?.items || []));

const TECHNICAL_REPORT_TYPE = 'project';
const SPEAKER_DESIGN_TYPE = 'speaker_design';

/**
 * Compute BOTH the human-readable freshness reason AND the canonical
 * equivalence verdict for each stored document whose source fingerprint
 * differs from the version's current publication.
 *
 * The publications are looked up from the ProjectAnalysisCache's
 * engineering_publications map, keyed by fingerprint. The equivalence verdict
 * (EQUIVALENCE) is what the workflow status uses to decide Ready vs Outdated
 * vs Verification unavailable, from the SAME two publications the reason is
 * built from:
 *   - identifyDesignChanges returns []  → EQUIVALENT (Ready)
 *   - returns a non-empty list          → MATERIALLY_CHANGED (Outdated, reason)
 *   - returns null (a publication unavailable) → UNKNOWN (Verification unavailable)
 */
function computeFreshnessAndEquivalence({ exports, versionId, versionFingerprint, analysisCache }) {
  const publications = (analysisCache?.engineering_publications && typeof analysisCache.engineering_publications === 'object')
    ? analysisCache.engineering_publications
    : null;
  const empty = { reasons: {}, equivalences: {} };
  if (!publications || !versionFingerprint) return empty;
  const currentPublication = publications[versionFingerprint] || null;
  if (!currentPublication) return empty;
  const reasons = {};
  const equivalences = {};
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
    const changes = identifyDesignChanges(savedPublication, currentPublication);
    equivalences[documentType] = changes == null
      ? EQUIVALENCE.UNKNOWN
      : (changes.length === 0 ? EQUIVALENCE.EQUIVALENT : EQUIVALENCE.MATERIALLY_CHANGED);
    reasons[documentType] = buildFreshnessReason({
      savedPublication,
      currentPublication,
      documentType,
    });
  }
  return { reasons, equivalences };
}

export function useDocumentWorkflowStatus({ projectId = null, versionId = null } = {}) {
  const [exports, setExports] = useState([]);
  const [engineeringFingerprint, setEngineeringFingerprint] = useState(null);
  const [analysisCache, setAnalysisCache] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [verificationError, setVerificationError] = useState(null);
  const readInFlight = useRef(false);

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
    readInFlight.current = true;
    setLoading(true);
    setVerificationError(null);
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
              { sort: '-updated_date', limit: 1, fields: ['engineering_publications'] },
            );
            if (!cancelled) setAnalysisCache(asItems(cachePage)[0] || null);
          } catch (error) {
            if (!cancelled) {
              setAnalysisCache(null);
              const httpStatus = Number(error?.response?.status || error?.status || 0);
              setVerificationError(httpStatus
                ? `The saved engineering evidence could not be loaded (HTTP ${httpStatus}). Retry when access is restored.`
                : 'The saved engineering evidence request failed. Check your connection and retry.');
            }
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
          setVerificationError('The document or version records could not be loaded. Check your connection and retry.');
        }
      } finally {
        if (!cancelled) {
          readInFlight.current = false;
          setLoading(false);
        }
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

  const { reasons: freshnessReasons, equivalences } = computeFreshnessAndEquivalence({
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
    equivalences,
  });

  // A manual retry re-runs the stored-record + publication read without
  // regenerating any document. Used by a Verification-unavailable card to
  // re-attempt verification once the underlying publication read is available.
  const retry = useCallback(() => {
    // Do not cancel a pending successful read and start the same large request
    // again. A settled failure always gets a fresh SDK request on retry.
    if (readInFlight.current) return;
    readInFlight.current = true;
    setTick((t) => t + 1);
  }, []);

  // System Health: a document that is Verification unavailable is an
  // unexpected verification failure (a frozen publication is missing, so the
  // document's validity cannot be established). It is NOT a legitimate
  // Outdated state, so it is reported once per project+version+document so the
  // admin can see the document identities and fingerprints involved. A
  // legitimate Outdated state is never reported here.
  const reportedVerificationFailures = useRef(new Set());
  useEffect(() => {
    if (!projectId || !versionId || loading) return;
    const steps = [
      ['technical_report', status.technicalReport],
      ['speaker_design', status.speakerDesign],
      ['proposal', status.clientProposal],
    ];
    for (const [docType, step] of steps) {
      if (!step || step.state !== WORKFLOW_STATE.VERIFICATION_UNAVAILABLE) continue;
      const key = `${projectId}:${versionId}:${docType}`;
      if (reportedVerificationFailures.current.has(key)) continue;
      reportedVerificationFailures.current.add(key);
      reportClientFailure({
        code: 'DOCUMENT_VERIFICATION_UNAVAILABLE',
        operation: 'document-workflow-verification',
        projectId,
        versionId,
        detail: verificationError || `${docType} frozen source facts are unavailable for comparison with the current publication.`,
        document_type: docType,
        saved_fingerprint: step.record?.source_fingerprints?.engineeringFingerprint || null,
        current_fingerprint: engineeringFingerprint || null,
      });
    }
  }, [projectId, versionId, loading, status.technicalReport, status.speakerDesign, status.clientProposal, engineeringFingerprint, verificationError]);

  // A failed record read is unknown, never evidence that no document exists.
  const resolvedStatus = verificationError ? {
    ...status,
    proposalAvailable: false,
    ...Object.fromEntries(['technicalReport', 'speakerDesign', 'clientProposal'].map((key) => [key, {
      ...status[key], state: WORKFLOW_STATE.VERIFICATION_UNAVAILABLE,
    }])),
  } : status;
  return { loading, retry, verificationError, ...resolvedStatus };
}

export default useDocumentWorkflowStatus;