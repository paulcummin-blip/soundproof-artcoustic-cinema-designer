import { auditPublicationContract } from '../../../shared/engineeringPublicationContract.js';
/** Final report authority must include frozen facts, not only metric existence. */
export function auditFinalReportAuthority(publication) {
  const contract = auditPublicationContract(publication);
  // Cold load (undefined) or nothing published (null): a structured blocked
  // result, so a report page can render its checking/blocked state instead of
  // throwing while the durable authority is still resolving.
  if (publication === undefined || publication === null) {
    return {
      allowed: false,
      blocked: true,
      status: contract.status,
      missing: contract.missing,
      missing_fields: contract.missing_fields,
      reason: contract.reason,
    };
  }
  const missing = [...contract.missing];
  const report = publication?.report_snapshot;
  if (!publication?.engineering_fingerprint) missing.push('engineering_fingerprint');
  if (!publication?.published_at) missing.push('published_at');
  if (!publication?.engineering_summary) missing.push('engineering_summary');
  if (!report?.report_project) missing.push('report_snapshot.report_project (frozen room/screen configuration)');
  if (!Array.isArray(report?.seatingPositions) || !report.seatingPositions.length) missing.push('report_snapshot.seatingPositions');
  if (!Array.isArray(report?.placedSpeakers) || !report.placedSpeakers.length) missing.push('report_snapshot.placedSpeakers');
  return {
    allowed: !missing.length,
    blocked: !!missing.length,
    status: missing.length ? 'incomplete' : 'complete',
    missing,
    missing_fields: [...missing],
    reason: missing.length ? 'Final report blocked: ' + missing.join('; ') : null,
  };
}