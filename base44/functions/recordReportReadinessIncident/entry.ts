import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { assertCapability, resolveAccountAccess } from '../../shared/accountAccessAuthority.js';
import { publicationRow } from '../../shared/publicationRow.js';
import { loadOwnedProjectVersion, loadCacheRecord, findPublication } from '../../shared/publishedEngineeringRead.js';
import { recordSystemIncident } from '../../shared/systemHealth/incidentRecorder.js';

// A dealer's settled report-readiness failure is an incident even when React
// and the network did not throw. Identity is verified server-side; no arbitrary
// diagnostic text, recipient, account ID or severity is accepted from a browser.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    const access = await resolveAccountAccess(base44, user, { bootstrapLegacyMembership: false });
    try { assertCapability(access, 'soundProof'); }
    catch { return Response.json({ error: 'FORBIDDEN' }, { status: 403 }); }
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.project_id || '');
    const versionId = String(body.version_id || '');
    const reportType = body.report_type;
    const code = body.error_code;
    if (!/^[a-f0-9]{24}$/.test(projectId) || !/^[a-f0-9]{24}$/.test(versionId)
      || !['technical', 'project'].includes(reportType)
      || !['REPORT_SAVED_EVIDENCE_REJECTED', 'REPORT_EVIDENCE_READ_FAILED'].includes(code)) {
      return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    }
    let owned;
    try { owned = await loadOwnedProjectVersion(base44.asServiceRole, projectId, versionId, access); }
    catch (error) { return Response.json({ error: error.code || 'FORBIDDEN' }, { status: error.code === 'FORBIDDEN' ? 403 : 404 }); }
    const cache = await (owned.version.published_fingerprint ? publicationRow(base44.asServiceRole, owned.version) : loadCacheRecord(base44.asServiceRole, projectId, versionId)).catch(() => null);
    const engineeringFingerprint = owned.version.published_fingerprint || null;
    const publication = engineeringFingerprint ? findPublication(cache, engineeringFingerprint) : null;
    if (code === 'REPORT_SAVED_EVIDENCE_REJECTED' && !engineeringFingerprint && !cache?.current_fingerprint) {
      return Response.json({ recorded: false, reason: 'no_saved_assessment' });
    }
    const diagnostic = [
      'A report route rejected saved engineering evidence after hydration settled.',
      `Report: ${reportType}. Version: ${versionId}.`,
      `Engineering: ${engineeringFingerprint || 'missing'}.`,
      `Published bass: ${publication?.provenance?.bass_fingerprint || 'missing'}.`,
      `Current bass: ${cache?.current_fingerprint || 'missing'}. Cache state: ${cache?.status || 'unavailable'}.`,
      'No design, calculation or report asset was changed by this incident recorder.',
    ].join(' ');
    const result = await recordSystemIncident(base44, {
      runtime_environment:body.runtime_environment==='preview'?'preview':'deployed',
      component: 'report_readiness', operation: `${reportType}_report`, error_code: code,
      severity: 'high', account_id: owned.projectAccountId, project_id: projectId, version_id:versionId,
      grouping_scope: `${projectId}::${versionId}`,
      diagnostic_summary: diagnostic, operation_id: `${reportType}::${projectId}::${versionId}`,
      stage_failed: 'saved_engineering_readiness', data_committed: false,
      data_integrity_summary: 'Existing project, bass evidence and report assets preserved.',
    });
    return Response.json(result || { recorded: false, fail_open: true });
  } catch {
    return Response.json({ recorded: false, fail_open: true });
  }
}
