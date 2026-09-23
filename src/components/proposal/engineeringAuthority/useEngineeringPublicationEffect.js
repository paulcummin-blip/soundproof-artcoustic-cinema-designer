/**
 * useEngineeringPublicationEffect.js
 * ---------------------------------
 * Phase 1A auto-publish effect.
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
 * Debounce: the publish is debounced by PUBLISH_DEBOUNCE_MS so intermediate
 * design states (while the user is still dragging, or bass is still settling)
 * do not hammer the backend. The publish fires once after the design settles.
 *
 * Failures are logged but do not block the UI or the browser handoff.
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { ENGINEERING_AUTHORITY_VERSION } from '@/components/proposal/engineeringAuthority';
import { ENGINEERING_SNAPSHOT_VERSION } from '@/components/proposal/engineeringAuthority/buildEngineeringSnapshot';
import {
  INSTANCE_AUTHORITY_VERSION,
  BASS_ANALYSIS_CONTRACT_VERSION,
  RP22_BASS_METRIC_SCHEMA_VERSION,
} from '@/lib/bassAuthorityVersion';

const PUBLISH_DEBOUNCE_MS = 2000;

/**
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @param {Object|null} params.designRating  — the appDesignRating object
 * @param {boolean} params.isPublishable      — appDesignRating.isPublishable
 * @param {Object|null} params.engineeringSummary — appDesignRating.engineeringSummary
 * @param {string|null} params.fingerprint     — appDesignRating.bassReadiness.fingerprint
 * @param {boolean} params.ready               — hydration/load ready gate
 */
export function useEngineeringPublicationEffect({
  projectId,
  versionId,
  isPublishable,
  engineeringSummary,
  fingerprint,
  ready,
}) {
  const lastPublishedFingerprintRef = useRef(null);
  const debounceTimerRef = useRef(null);

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

    // Must have an engineering summary and fingerprint
    if (!engineeringSummary || !fingerprint) {
      return;
    }

    // Idempotency: skip if we already published this exact fingerprint
    // in this session (the backend is also idempotent, but this avoids
    // redundant network calls).
    if (lastPublishedFingerprintRef.current === fingerprint) {
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await base44.functions.invoke('publishEngineering', {
          project_id: projectId,
          version_id: versionId,
          engineering_summary: engineeringSummary,
          engineering_fingerprint: fingerprint,
          engine_version: ENGINEERING_AUTHORITY_VERSION,
          rp22_version: String(RP22_BASS_METRIC_SCHEMA_VERSION),
          algorithm_version: String(BASS_ANALYSIS_CONTRACT_VERSION),
          publication_reason: 'auto-settled',
          provenance: {
            snapshot_version: ENGINEERING_SNAPSHOT_VERSION,
            instance_authority_version: INSTANCE_AUTHORITY_VERSION,
          },
        });
        lastPublishedFingerprintRef.current = fingerprint;
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
  }, [projectId, versionId, ready, isPublishable, engineeringSummary, fingerprint]);
}