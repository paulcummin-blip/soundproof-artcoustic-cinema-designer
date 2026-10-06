/** Final report authority must include frozen facts, not only metric existence. */
export function auditFinalReportAuthority(publication) {
  const missing = [];
  const report = publication?.report_snapshot;
  if (!publication?.engineering_fingerprint) missing.push('engineering_fingerprint');
  if (!publication?.published_at) missing.push('published_at');
  if (!publication?.engineering_summary) missing.push('engineering_summary');
  if (!report?.report_project) missing.push('report_snapshot.report_project (frozen room/screen configuration)');
  if (!Array.isArray(report?.seatingPositions) || !report.seatingPositions.length) missing.push('report_snapshot.seatingPositions');
  if (!Array.isArray(report?.placedSpeakers) || !report.placedSpeakers.length) missing.push('report_snapshot.placedSpeakers');
  return {
    allowed: !missing.length, missing,
    reason: missing.length ? 'Final report blocked: ' + missing[0] + ' is missing from the durable publication.' : null,
  };
}
