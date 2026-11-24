const EVIDENCE_KEYS = ['engineeringFingerprint', 'calculationFingerprint', 'seatPriorityFingerprint'];
export function narrativeIsCurrent(snapshot) {
  const di = snapshot?.payload?.design_intent;
  if (!di || di.status !== 'accepted') return false;
  const savedFp = (di.evidence_fingerprints && typeof di.evidence_fingerprints === 'object')
    ? di.evidence_fingerprints : {};
  const currentFp = (snapshot.source_fingerprints && typeof snapshot.source_fingerprints === 'object')
    ? snapshot.source_fingerprints : {};
  for (const key of EVIDENCE_KEYS) {
    const a = savedFp[key];
    const b = currentFp[key];
    if (a && b && a !== b) return false;
  }
  return true;
}

