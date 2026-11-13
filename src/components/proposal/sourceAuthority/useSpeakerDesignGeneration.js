/**
 * useSpeakerDesignGeneration
 * ---------------------------
 * The Proposal Centre's Speaker Design action — the Retry a failed generation
 * offers, and the status the document card reads while the shared authority is
 * working.
 *
 * It is a thin React binding over the ONE shared authority
 * (`ensureSpeakerDesignForVersion`) and its in-session status store
 * (`speakerDesignGenerationStatus`): the same authority the Project Report
 * save, the report-page catch-up and the report PDF export use. So a Retry here
 * can never race another path into a second stored copy, and the "Preparing…"
 * state the card shows is the same state every other reader sees.
 *
 * In the normal flow the designer never sees this action: the auto-preparation
 * hook (`useEnsureSpeakerDesignDocuments`) has already asked the authority to
 * store the schedule, and the card reads "Preparing documents…" until it lands.
 * The Retry button appears only when a generation genuinely failed.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { ensureSpeakerDesignForVersion } from '@/components/report/speakerDesign/ensureSpeakerDesignForVersion';
import {
  clearSpeakerDesignGeneration,
  getSpeakerDesignGenerationError,
  isPreparingSpeakerDesign,
  subscribeSpeakerDesignGenerationStatus,
} from '@/components/report/speakerDesign/speakerDesignGenerationStatus';

/** A stable snapshot for useSyncExternalStore — the subscribe function itself. */
const subscribe = (listener) => subscribeSpeakerDesignGenerationStatus(listener);

/**
 * @param {string} projectId
 * @returns {{ generate: (versionId: string) => Promise<void>, isGenerating: (versionId: string) => boolean, getError: (versionId: string) => string|null, clearError: (versionId: string) => void, errors: Record<string, string|null> }}
 */
export function useSpeakerDesignGeneration(projectId) {
  // Re-render whenever any generation status changes, so the card's "Preparing…"
  // and Retry state stay in step with the shared authority.
  useSyncExternalStore(subscribe, () => null, () => null);

  const isGenerating = useCallback(
    (versionId) => !!(projectId && versionId && isPreparingSpeakerDesign(projectId, versionId)),
    [projectId],
  );

  const getError = useCallback(
    (versionId) => (projectId && versionId ? getSpeakerDesignGenerationError(projectId, versionId) : null),
    [projectId],
  );

  const clearError = useCallback((versionId) => {
    if (!projectId || !versionId) return;
    clearSpeakerDesignGeneration(projectId, versionId);
  }, [projectId]);

  const generate = useCallback(async (versionId) => {
    if (!projectId || !versionId) return;
    // A Retry clears the previous failure's status and re-runs the one authority.
    // The authority reuses a matching stored PDF, dedupes a concurrent attempt
    // and verifies a stored file reference before reporting success.
    await ensureSpeakerDesignForVersion({ projectId, versionId });
  }, [projectId]);

  return { generate, isGenerating, getError, clearError, errors: {} };
}

export default useSpeakerDesignGeneration;