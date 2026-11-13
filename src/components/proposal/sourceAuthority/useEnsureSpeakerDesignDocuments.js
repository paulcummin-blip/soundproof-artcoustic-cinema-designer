/**
 * useEnsureSpeakerDesignDocuments
 * --------------------------------
 * The Proposal Centre's own auto-preparation. For every selected version whose
 * Project Report is Current but whose Speaker Design PDF is missing or stale,
 * the shared `ensureSpeakerDesignForVersion` authority is asked to create and
 * store it — so a designer who has finished the design never meets a manual
 * "Generate Speaker Design PDF" step in the normal flow.
 *
 * It is deliberately non-blocking: each ensure runs in the background and the
 * readiness table re-reads when it lands. It never re-triggers a version that is
 * already preparing, and it never triggers a version whose Project Report is
 * not Current (the report workflow owns that case). A genuine failure leaves
 * the shared status store's error on the row, where the document status card
 * shows a Retry — it is never swallowed.
 *
 * Reading only with respect to the design: it creates no report, no evidence,
 * no engineering publication and no calculation. It only asks the one authority
 * that stores the schedule to do so when the stored record is not already there.
 */

import { useEffect, useRef } from 'react';
import { ensureSpeakerDesignForVersion } from '@/components/report/speakerDesign/ensureSpeakerDesignForVersion';
import { isPreparingSpeakerDesign } from '@/components/report/speakerDesign/speakerDesignGenerationStatus';

/**
 * @param {Object} input
 * @param {string|null} input.projectId
 * @param {Array} input.rows — the readiness rows for every selected version
 * @param {boolean} [input.enabled] — false suspends the hook (e.g. while loading)
 */
export function useEnsureSpeakerDesignDocuments({ projectId = null, rows = [], enabled = true } = {}) {
  // One ensure per (versionId, engineeringFingerprint) pair: a version whose
  // fingerprint has not changed is never asked twice in the same session, even
  // if the readiness table re-reads.
  const attempted = useRef(new Set());

  useEffect(() => {
    if (!enabled || !projectId || !Array.isArray(rows) || rows.length === 0) return;

    rows.forEach((row) => {
      const versionId = row?.versionId || null;
      const engineeringFingerprint = row?.engineeringFingerprint || null;
      if (!versionId || !engineeringFingerprint) return;

      // Only when the Project Report is Current: the report workflow owns the
      // missing-report case, and a stale report means the design has moved on.
      const projectCurrent = !!row?.project?.current;
      if (!projectCurrent) return;

      const speakerDesign = row?.speakerDesign || row?.cells?.speaker_design || null;
      const needsDocument = !speakerDesign || !speakerDesign.current;
      if (!needsDocument) return;

      // A generation already in flight needs no second trigger.
      if (isPreparingSpeakerDesign(projectId, versionId)) return;

      // A generation that already failed shows its Retry on the card; do not
      // loop it automatically until the designer chooses to retry.
      if (row?.speakerDesignError) return;

      const key = `${projectId}:${versionId}:${engineeringFingerprint}`;
      if (attempted.current.has(key)) return;
      attempted.current.add(key);

      void ensureSpeakerDesignForVersion({ projectId, versionId, engineeringFingerprint });
    });
  }, [enabled, projectId, rows]);
}

export default useEnsureSpeakerDesignDocuments;