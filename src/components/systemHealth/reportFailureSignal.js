// Report failures are monitored only after hydration settles. A new design with
// no saved engineering is an ordinary incomplete workflow, not an incident.
export function reportFailureCode({ loading, readFailed, blocked, hasSavedEvidence }) {
  if (loading) return null;
  if (readFailed) return 'REPORT_EVIDENCE_READ_FAILED';
  if (blocked && hasSavedEvidence) return 'REPORT_SAVED_EVIDENCE_REJECTED';
  return null;
}
