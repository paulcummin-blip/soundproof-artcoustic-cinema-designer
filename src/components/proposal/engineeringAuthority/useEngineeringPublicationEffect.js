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
 * Debounce: the publish is debounced by PUBLISH_DEBOUNCE_MS so intermediate
 * design states (while the user is still dragging, or bass is still settling)
 * do not hammer the backend. The publish fires once after the design settles.
 *
 * Failures are logged but do not block the UI or the browser handoff.
 */

import { useEffect, useMemo, useRef } from 'react';
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

const PUBLISH_DEBOUNCE_MS = 2000;

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
  designState,
}) {
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
    });
  }, [designState]);

  useEffect(() => {
    // Clear any pending debounce on input change
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Gate: must have project, version, be hydrated, and be publishable
    if (!projectId || !versionId || !ready || !isPublishable) {
      return;
    }

    // Must have an engineering summary and the full engineering fingerprint
    if (!engineeringSummary || !engineeringFingerprint) {
      return;
    }

    // Idempotency: skip if we already published this exact fingerprint
    // in this session (the backend is also idempotent, but this avoids
    // redundant network calls).
    if (lastPublishedFingerprintRef.current === engineeringFingerprint) {
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await base44.functions.invoke('publishEngineering', {
          project_id: projectId,
          version_id: versionId,
          engineering_summary: engineeringSummary,
          engineering_fingerprint: engineeringFingerprint,
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
        lastPublishedFingerprintRef.current = engineeringFingerprint;
      } catch (err) {
        // Database publish failure does not block the UI or the browser
        // handoff. Log for diagnostics; the next design change will retry.
        console.error('[publishEngineering] DB publish failed:', err?.message || err);
      }
    }, PUBLISH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [projectId, versionId, ready, isPublishable, engineeringSummary, engineeringFingerprint, bassFingerprint]);
}