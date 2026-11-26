// Final save for the existing report operation and ProjectAssetExport entity.
// Caller-scoped entity calls keep the existing security rules in force.
const refused = new Set([400, 401, 403, 404, 422]);
const rows = result => Array.isArray(result) ? result : result?.items || [];
const fail = code => Object.assign(new Error(code), { code, status: 409 });
const fields = ['project_id', 'account_id', 'document_type', 'title', 'filename',
  'version_id', 'selected_version_ids', 'source_record_id', 'file_uri', 'exported_at',
  'exported_by', 'source_fingerprints', 'source_status_at_export', 'page_count',
  'preview_status', 'rendering', 'superseded_by_id'];
const stable = value => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(v => JSON.parse(stable(v)))
    : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(stable(value[k]))]))
  : value ?? null);

export async function reconcileReportRecord({ operations, operation, caller, body, receipt, now }) {
  const row = body.row;
  if (!row || Object.keys(row).some(key => !fields.includes(key)) ||
      row.project_id !== operation.project_id || row.version_id !== operation.version_id ||
      (row.account_id || null) !== (operation.account_id || null) || row.document_type !== 'project' ||
      stable(row.selected_version_ids) !== stable([operation.version_id]) ||
      !row.source_record_id || !row.source_fingerprints?.engineeringFingerprint ||
      !row.filename || !Number.isFinite(Date.parse(row.exported_at))) throw fail('INVALID_REPORT_RECORD_IDENTITY');
  if (receipt?.state !== 'stored' || receipt.file_uri !== row.file_uri) throw fail('REPORT_UPLOAD_RECEIPT_REQUIRED');
  const identity = stable(row);
  const identityHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const readClaim = async () => {
    const found = rows(await operations.filter({ id: operation.id }, '-created_date', 1));
    if (found.length !== 1) throw fail('REPORT_OPERATION_UNAVAILABLE');
    const claim = found[0].report_record;
    if (claim && claim.identity_hash !== identityHash) throw fail('REPORT_RECORD_IDENTITY_CONFLICT');
    return claim || null;
  };
  const find = async () => {
    const matches = rows(await caller.entities.ProjectAssetExport.filter({
      project_id: operation.project_id, version_id: operation.version_id,
      document_type: 'project', file_uri: receipt.file_uri,
    }, '-created_date', 2));
    if (matches.length > 1) throw fail('DUPLICATE_REPORT_RECORDS');
    if (matches.length && !fields.every(key => stable(matches[0][key]) === stable(row[key]))) throw fail('REPORT_RECORD_IDENTITY_CONFLICT');
    return matches[0] || null;
  };
  const readback = async () => {
    const record = await find();
    return record ? { state: 'stored', asset_id: record.id } : null;
  };
  let claim = await readClaim();
  const existing = await readback();
  if (existing) return existing;
  if (body.action === 'report_record_status') return { state: claim?.state === 'stored' ? 'unknown' : claim?.state || 'ready' };
  if (!claim) {
    await operations.updateMany({ id: operation.id, report_record: null }, { $set: {
      report_record: { state: 'ready', identity_hash: identityHash },
    } });
    claim = await readClaim();
  }
  if (!claim || !['ready', 'refused'].includes(claim.state)) return { state: claim?.state || 'unknown' };
  const acquired = await operations.updateMany({ id: operation.id,
    'report_record.identity_hash': identityHash, 'report_record.state': { $in: ['ready', 'refused'] },
  }, { $set: { 'report_record.state': 'writing', 'report_record.started_at': now(), 'report_record.failure_code': null } });
  if (acquired.updated !== 1) return await readback() || { state: (await readClaim())?.state || 'unknown' };
  try {
    await caller.entities.ProjectAssetExport.create(row);
  } catch (error) {
    // A committed write can lose its acknowledgement. Read before deciding.
    const existing = await readback();
    if (existing) return existing;
    const state = refused.has(Number(error?.response?.status || error?.status)) ? 'refused' : 'unknown';
    await operations.updateMany({ id: operation.id, 'report_record.state': 'writing' }, { $set: {
      'report_record.state': state,
      'report_record.failure_code': state === 'refused' ? 'RECORD_REFUSED' : 'RECORD_OUTCOME_UNKNOWN',
    } });
    return { state };
  }
  const saved = await readback();
  if (!saved) return { state: 'unknown' };
  // The asset readback, rather than this advisory receipt, proves completion.
  try {
    await operations.updateMany({ id: operation.id, 'report_record.identity_hash': identityHash }, { $set: {
      'report_record.state': 'stored', 'report_record.asset_id': saved.asset_id, 'report_record.stored_at': now(),
    } });
  } catch { /* A later read reconciles the original asset without a new write. */ }
  return saved;
}
