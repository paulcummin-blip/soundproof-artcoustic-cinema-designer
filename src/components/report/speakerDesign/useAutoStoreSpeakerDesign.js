/**
 * useAutoStoreSpeakerDesign
 * -------------------------
 * Part of the Project Documents update: when a CURRENT Project Report is ready for
 * a version and that version's stored Speaker Design is missing, or was made for a
 * different design fingerprint, the schedule is created and stored from the same
 * version authority, exactly as a report export would. The dealer does not repeat
 * any step. A Speaker Design that already matches is left alone.
 */
import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { storeSpeakerDesignInBackground } from './speakerDesignIssuedDocument';

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

    (async () => {
      const page = await base44.entities.ProjectAssetExport.filter(
        { project_id: projectId, document_type: 'speaker_design', version_id: versionId },
        { sort: '-exported_at', limit: 1 },
      );
      const latest = (page?.items || [])[0] || null;
      const storedFp = latest?.source_fingerprints?.engineeringFingerprint || null;
      if (latest && storedFp === engineeringFingerprint) return;
      storeSpeakerDesignInBackground(storeParameters);
    })().catch(() => attempted.current.delete(key));
  }, [enabled, projectId, versionId, engineeringFingerprint, storeParameters]);
}