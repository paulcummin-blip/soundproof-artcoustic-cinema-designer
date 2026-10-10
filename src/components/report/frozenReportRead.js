/** Current pointer is status/generation authority, never saved-document content. */
export default function frozenReportRead(saved, currentFingerprint, generate = false) {
  const pinned = saved?.source_fingerprints?.engineeringFingerprint || null;
  return { fingerprint: generate ? currentFingerprint : pinned || currentFingerprint,
    updateNeeded: !!pinned && !!currentFingerprint && pinned !== currentFingerprint };
}