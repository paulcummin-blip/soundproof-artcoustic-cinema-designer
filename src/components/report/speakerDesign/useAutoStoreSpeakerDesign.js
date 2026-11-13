/**
 * useAutoStoreSpeakerDesign
 * -------------------------
 * The report page's catch-up: when a CURRENT Project Report is ready for a
 * version and that version's stored Speaker Design is missing or was made for a
 * different design fingerprint, the schedule is ensured through the ONE shared
 * authority (`ensureSpeakerDesignForVersion`) — the same authority the report
 * save, the export and the Proposal Centre use.
 *
 * This effect exists for the case the report-save trigger does not cover: a
 * version whose Project Report was saved in an earlier session and whose
 * Speaker Design never landed. Reopening that report page is where the catch-up
 * runs, so the designer never sees a stale "Not generated" that the system could
 * already fix. A Speaker Design that already matches is left alone.
 */
import { useEffect, useRef } from 'react';
import { ensureSpeakerDesignForVersion } from './ensureSpeakerDesignForVersion';

export default function useAutoStoreSpeakerDesign({
  enabled = false,
  projectId = null,
  versionId = null,
  engineeringFingerprint = null,
  storeParameters = null,
}) {
  const attempted = useRef(new Set());

  useEffect(() => {
    if (!enabled || !projectId || !versionId || !engineeringFingerprint || !storeParameters) return;
    if (!(storeParameters.groups?.length > 0)) return;
    const key = `${projectId}:${versionId}:${engineeringFingerprint}`;
    if (attempted.current.has(key)) return;
    attempted.current.add(key);

    // Delegate to the shared authority. It reuses a matching stored PDF, dedupes
    // concurrent attempts and reports its own outcome — so this effect never
    // fires a second, racing storage of its own.
    void ensureSpeakerDesignForVersion({
      projectId,
      versionId,
      engineeringFingerprint,
      schedule: {
        groups: storeParameters.groups,
        layout: storeParameters.layout || null,
      },
      projectName: storeParameters.projectName || null,
      dealerName: storeParameters.dealerName || null,
      clientName: storeParameters.clientName || null,
      projectReference: storeParameters.projectReference || null,
      versionName: storeParameters.versionName || null,
      versionNumber: storeParameters.versionNumber ?? null,
      accountId: storeParameters.accountId || null,
      resolveSource: storeParameters.resolveSource || null,
      exportedBy: storeParameters.exportedBy || null,
    });
  }, [enabled, projectId, versionId, engineeringFingerprint, storeParameters]);
}