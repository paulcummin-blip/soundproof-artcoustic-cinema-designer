/**
 * useEngineeringPublicationEffect.js
 * ---------------------------------
 * Phase 1A.5 auto-publish effect.
 *
 * Watches the Room Designer's settled design rating and publishes the
 * engineering summary to the database-backed Published Engineering Authority
 * via the publishEngineering backend function.
 *
 * IMPORTANT — this hook does NOT touch the browser handoff. The existing
 * publishDesignReviewHandoff call in RoomDesigner.jsx remains exactly as-is.
 * This hook runs alongside it as a parallel database write. The browser
 * handoff is the legacy compatibility mirror; the database publication is the
 * authoritative store.
 *
 * Phase 1A.5 changes:
 *   - Uses the FULL engineering fingerprint (not bass-only). The fingerprint
 *     changes whenever any published engineering result could change —
 *     room, seating, speakers, subwoofers, screen, RSP, RP22 assumptions,
 *     engine/RP22/algorithm revisions.
 *   - The bass fingerprint is preserved inside the publication provenance for
 *     bass cache lookup, but the publication key is the full engineering
 *     fingerprint.
 *
 * Cold-restore change:
 *   - The publication also carries an optional `report_snapshot` presentation
 *     payload (analysisResult, priceData, seating, placed speakers, showAsdr),
 *     read from the SAME browser handoff snapshot the Room Designer publishes
 *     above. It carries no identity and no metric authority — the engineering
 *     summary remains the sole metric source. This is what lets reports and
 *     Proposal Centre assemble a complete snapshot on a cold load without a
 *     browser-only store.
 *
 * Debounce: the publish is debounced by PUBLISH_DEBOUNCE_MS so intermediate
 * design states (while the user is still dragging, or bass is still settling)
 * do not hammer the backend. The publish fires once after the design settles.
 *
 * Failures are logged but do not block the UI or the browser handoff.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { PUBLICATION_CONTRACT_VERSION, buildFrozenReportProject } from '../../../../shared/engineeringPublicationContract.js';
import { useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { engineeringPublicationPreflight } from '@/components/engineering/engineeringPublicationPreflight';
import { base44 } from '@/api/base44Client';
import { ENGINEERING_AUTHORITY_VERSION } from '@/components/proposal/engineeringAuthority';
import { ENGINEERING_SNAPSHOT_VERSION } from '@/components/proposal/engineeringAuthority/buildEngineeringSnapshot';
import { ENGINEERING_SUMMARY_SCHEMA_VERSION } from '@/components/engineering/engineeringSummaryAuthority';
import {
  INSTANCE_AUTHORITY_VERSION,
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from '@/lib/bassAuthorityVersion';
import {
  computeEngineeringFingerprint,
} from '@/components/proposal/engineeringAuthority/engineeringFingerprint';
import { readDesignReviewHandoff } from '@/components/state/designReviewHandoff';
import { refreshEngineeringPublicationReaders } from '@/components/engineering/versionedEngineeringAuthority';
import { registerEngineeringPublishTrigger } from '@/components/engineering/engineeringPublishTrigger';
import { statesBassAuthority } from '@/components/engineering/versionedEngineeringAuthority';
import {
  PUBLICATION_ATTEMPT,
  recordPublicationAttempt,
  usePublicationAttempt,
} from '@/components/engineering/publicationAcknowledgementStore';

const PUBLISH_DEBOUNCE_MS = 2000;

/**
 * Read the presentation payload for the publication from the browser handoff
 * snapshot the Room Designer publishes for the SAME project + version. Nothing
 * is recalculated; this is a verbatim copy of already-settled presentation
 * state. The rating envelope is deliberately not copied — it is derived from
 * the published engineering summary on read, so it is never duplicated.
 */
function buildReportSnapshot(projectId, versionId, designState) {
  if (!projectId || !versionId) return null;
  const snapshot = readDesignReviewHandoff(projectId, versionId, { preferStored: false });
  if (!snapshot || !designState?.roomDims || !designState?.screen) return null;
  return {
    report_project: buildFrozenReportProject(designState, { projectId, versionId }).reportProject,
    capture_missing: buildFrozenReportProject(designState, { projectId, versionId }).missing,
    analysisResult: snapshot.analysisResult || null,
    priceData: snapshot.priceData || null,
    seatingPositions: designState.seatingPositions || null,
    placedSpeakers: designState.placedSpeakers || null,
    showAsdr: snapshot.showAsdr === true,
  };
}

/**
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @param {Object|null} params.designRating  — the appDesignRating object
 * @param {boolean} params.isPublishable      — appDesignRating.isPublishable
 * @param {Object|null} params.engineeringSummary — appDesignRating.engineeringSummary
 * @param {string|null} params.bassFingerprint  — appDesignRating.bassReadiness.fingerprint (bass-only, kept for provenance)
 * @param {boolean} params.ready               — hydration/load ready gate
 * @param {Object}  params.designState         — curated design state for fingerprint computation
 */
export function useEngineeringPublicationEffect({
  projectId,
  versionId,
  isPublishable,
  engineeringSummary,
  bassFingerprint,
  ready,
  designState: assessmentDesignState,
  bassReadiness,
  retainedFromRefresh,
}) {
  // Read selected-version identity only; never substitute its design or project facts.
  const [selectedVersion, setSelectedVersion] = useState(null);
  useEffect(() => {
    let active = true;
    setSelectedVersion(null);
    if (projectId && versionId) base44.entities.ProjectVersion.get(versionId).then(version => {
      if (active && version?.project_id === projectId) setSelectedVersion(version);
    }).catch(() => {});
    return () => { active = false; };
  }, [projectId, versionId]);
  const designState = useMemo(() => ({ ...assessmentDesignState,
    versionName: selectedVersion?.id === versionId ? selectedVersion.version_name : null,
  }), [assessmentDesignState, selectedVersion, versionId]);
  const completedBassAuthority = useCompletedBassAuthority(projectId || 'free', versionId || 'free');
  const [retrySequence, setRetrySequence] = useState(0);
  const attempt = usePublicationAttempt(projectId, versionId);
  const lastPublishedFingerprintRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Compute the full engineering fingerprint from the design state + versions.
  // This is memoized so it only changes when the design state actually changes.
  const engineeringFingerprint = useMemo(() => {
    if (!designState) return null;
    return computeEngineeringFingerprint(designState, {
      engineVersion: ENGINEERING_AUTHORITY_VERSION,
      rp22Version: String(RP22_BASS_METRIC_SCHEMA_VERSION),
      algorithmVersion: String(BASS_ANALYSIS_CONTRACT_VERSION),
      instanceAuthorityVersion: INSTANCE_AUTHORITY_VERSION,
      summarySchemaVersion: ENGINEERING_SUMMARY_SCHEMA_VERSION,
      publicationContractVersion: PUBLICATION_CONTRACT_VERSION,
      bassFingerprint,
    });
  }, [designState, bassFingerprint]);

  const preflight = engineeringPublicationPreflight({
    projectId, versionId, ready, isPublishable, engineeringSummary,
    engineeringFingerprint, bassReadiness, retainedFromRefresh, designState, completedBassAuthority,
    reportSnapshot: buildReportSnapshot(projectId, versionId, designState),
    versions: {
      engine_version: ENGINEERING_AUTHORITY_VERSION,
      rp22_version: String(RP22_BASS_METRIC_SCHEMA_VERSION),
      algorithm_version: String(BASS_ANALYSIS_CONTRACT_VERSION),
    },
  });
  const preflightKey = JSON.stringify(preflight);
  // A new summary object on render is not a changed assessment. Debounce only
  // semantic changes; acknowledgement-store renders must not cancel their own write.
  const summaryKey = JSON.stringify(engineeringSummary);
  const publicationKey = `${projectId}::${versionId}::${engineeringFingerprint}`;
  useEffect(() => {
    // Clear any pending debounce on input change
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!preflight.ready) {
      recordPublicationAttempt(projectId, versionId, {
        status: PUBLICATION_ATTEMPT.NOT_READY, fingerprint: engineeringFingerprint,
        message: 'Not ready: ' + preflight.reason, missing: preflight.missing, gates: preflight.gates,
        assessmentComplete: preflight.assessmentComplete,
      });
      return;
    }

    // Must have an engineering summary and the full engineering fingerprint
    if (!engineeringSummary || !engineeringFingerprint) {
      return;
    }

    // Never save a partial summary. A summary assembled before the completed
    // bass authority settled carries the RP22 parameters but no P14/P18/P19,
    // and saving it is what left every restored report with empty bass boxes.
    // A publishable rating always states its bass results (settled bass, or
    // retained same-fingerprint bass), so this blocks only the partial case.
    if (!statesBassAuthority(engineeringSummary)) {
      return;
    }

    // Idempotency: skip if we already published this exact fingerprint
    // in this session (the backend is also idempotent, but this avoids
    // redundant network calls).
    if (lastPublishedFingerprintRef.current === publicationKey) {
      return;
    }

    recordPublicationAttempt(projectId, versionId, {
      status: PUBLICATION_ATTEMPT.QUEUED, fingerprint: engineeringFingerprint,
      message: 'Waiting for assessment to settle before publishing.', gates: preflight.gates,
    });
    let started = false;
    debounceTimerRef.current = setTimeout(async () => {
      started = true;
      debounceTimerRef.current = null;
      try {
        // Read the presentation payload at fire time so it reflects the most
        // recent settled handoff publication.
        const reportSnapshot = buildReportSnapshot(projectId, versionId, designState);
        recordPublicationAttempt(projectId, versionId, {
          status: PUBLICATION_ATTEMPT.PUBLISHING,
          fingerprint: engineeringFingerprint,
        });
        const response = await base44.functions.invoke('publishEngineering', {
          project_id: projectId,
          version_id: versionId,
          engineering_summary: engineeringSummary,
          engineering_fingerprint: engineeringFingerprint,
          publication_contract_version: PUBLICATION_CONTRACT_VERSION,
          ...(reportSnapshot ? { report_snapshot: reportSnapshot } : {}),
          engine_version: ENGINEERING_AUTHORITY_VERSION,
          rp22_version: String(RP22_BASS_METRIC_SCHEMA_VERSION),
          algorithm_version: String(BASS_ANALYSIS_CONTRACT_VERSION),
          publication_reason: 'auto-settled',
          provenance: {
            snapshot_version: ENGINEERING_SNAPSHOT_VERSION,
            instance_authority_version: INSTANCE_AUTHORITY_VERSION,
            summary_schema_version: ENGINEERING_SUMMARY_SCHEMA_VERSION,
            bass_fingerprint: bassFingerprint || null,
          },
        });
        // The acknowledgement is the server's audit of the STORED publication,
        // read back by fingerprint. Only an acknowledged write counts as
        // published — a request that returned without one does not, and the
        // report gate will say so instead of reporting Current.
        const body = response?.data || response || {};
        const acknowledgement = body.acknowledgement || null;
        if (acknowledgement?.durably_published === true) {
          refreshEngineeringPublicationReaders(projectId, versionId);
          lastPublishedFingerprintRef.current = publicationKey;
          recordPublicationAttempt(projectId, versionId, {
            status: PUBLICATION_ATTEMPT.ACKNOWLEDGED,
            fingerprint: engineeringFingerprint,
            publishedAt: body?.version?.published_at || null,
            httpStatus: response?.status || 200,
            gates: preflight.gates,
            assessmentComplete: preflight.assessmentComplete,
          });
        } else {
          recordPublicationAttempt(projectId, versionId, {
            status: PUBLICATION_ATTEMPT.FAILED,
            fingerprint: engineeringFingerprint,
            missing: acknowledgement?.missing || [],
            httpStatus: response?.status || null,
            gates: preflight.gates,
            message: body?.message
              || `The saved assessment is incomplete (${(acknowledgement?.missing || []).map((item) => item?.label || item?.key).join(', ') || 'unknown reason'}).`,
          });
          console.error('[publishEngineering] not acknowledged:', body?.message || acknowledgement?.status || 'unknown');
        }
      } catch (err) {
        // The write did not land: record it, so report generation stays blocked
        // with the exact reason instead of appearing ready.
        recordPublicationAttempt(projectId, versionId, {
          status: PUBLICATION_ATTEMPT.FAILED,
          fingerprint: engineeringFingerprint,
          message: err?.response?.data?.message || err?.message || 'The engineering assessment could not be saved.',
          missing: err?.response?.data?.acknowledgement?.missing || [],
          httpStatus: err?.response?.status || null,
          assessmentComplete: preflight.assessmentComplete,
          gates: preflight.gates,
        });
        console.error('[publishEngineering] DB publish failed:', err?.message || err);
      }
    }, retrySequence ? 0 : PUBLISH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (!started) recordPublicationAttempt(projectId, versionId, {
          status: PUBLICATION_ATTEMPT.CANCELLED, fingerprint: engineeringFingerprint,
          message: 'Publication cancelled before sending: assessment changed or Room Designer closed. Reopen this version and publish the settled assessment.',
        });
      }
    };
  }, [projectId, versionId, ready, isPublishable, summaryKey, engineeringFingerprint, bassFingerprint, preflightKey, retrySequence]);

  // The manual publish action, and the SAME action other surfaces ask for when a
  // completed result is not yet published (the bass result band's "Publish
  // Current Assessment"). It only clears the session idempotency guard and asks
  // this effect to run again — it publishes nothing itself, and adds no second
  // path to publishEngineering.
  const publish = useCallback(() => {
    // The same preflight as auto-publication: a manual click must explain a
    // refused assessment immediately, never bypass it or silently do nothing.
    if (!preflight.ready) {
      recordPublicationAttempt(projectId, versionId, {
        status: PUBLICATION_ATTEMPT.NOT_READY, fingerprint: engineeringFingerprint,
        message: 'Cannot publish yet: ' + preflight.reason,
        missing: preflight.missing, gates: preflight.gates,
        assessmentComplete: preflight.assessmentComplete,
      });
      return;
    }
    recordPublicationAttempt(projectId, versionId, {
      status: PUBLICATION_ATTEMPT.QUEUED, fingerprint: engineeringFingerprint,
      message: 'Publishing the current assessment.', gates: preflight.gates,
      assessmentComplete: preflight.assessmentComplete,
    });
    lastPublishedFingerprintRef.current = null;
    setRetrySequence((value) => value + 1);
  }, [projectId, versionId, engineeringFingerprint, preflightKey]);

  useEffect(() => {
    if (!projectId || !versionId) return undefined;
    return registerEngineeringPublishTrigger(projectId, versionId, publish);
  }, [projectId, versionId, publish]);

  return { preflight, attempt, fingerprint: engineeringFingerprint, bassFingerprint, publish };
}