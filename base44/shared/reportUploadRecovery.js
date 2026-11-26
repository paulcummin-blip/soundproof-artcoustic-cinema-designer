// Private-file receipts for the EXISTING report operation. No new file store,
// document authority or expiry-based lock takeover. A lost storage receipt is
// explicitly uncertain; it is never permission to upload again.
import { reconcileReportRecord } from './reportRecordRecovery.js';

const REFUSED = new Set([400, 401, 403, 404, 413, 415, 422]);
const rows = value => Array.isArray(value) ? value : value?.items || [];
const fail = (code, status = 409) => Object.assign(new Error(code), { code, status });

export async function handleReportUpload({ service, caller, user, body, file = null, now = () => new Date().toISOString() }) {
  if (!user) throw fail('UNAUTHORIZED', 401);
  if (user.role !== 'admin' && (user.soundproof_access_enabled !== true || !['FULL_ACCESS', 'SOUND_PROOF_ONLY'].includes(user.access_level))) throw fail('FORBIDDEN', 403);
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(String(body.operation_id || ''))) throw fail('INVALID_OPERATION', 400);
  const operations = service.entities.MonitoredOperation;
  const found = rows(await operations.filter({ operation_id: body.operation_id }, '-created_date', 2));
  if (found.length !== 1) throw fail(found.length ? 'AMBIGUOUS_REPORT_OPERATION' : 'REPORT_OPERATION_NOT_REGISTERED');
  const operation = found[0];
  if (operation.operation_type !== 'report_export' || !operation.project_id || !operation.version_id) throw fail('INVALID_REPORT_OPERATION', 400);
  if (user.role !== 'admin' && operation.initiated_by !== user.id) throw fail('FORBIDDEN', 403);
  // Caller-scoped reads preserve the entity security gate, including current
  // access flags. Never use service-role ownership alone as authorization.
  const projects = rows(await caller.entities.Project.filter({ id: operation.project_id }, '-created_date', 1));
  const versions = rows(await caller.entities.ProjectVersion.filter({ id: operation.version_id, project_id: operation.project_id }, '-created_date', 1));
  if (!projects.length || !versions.length || (user.role !== 'admin' && (!operation.account_id || operation.account_id !== user.account_id || projects[0].account_id !== operation.account_id))) throw fail('FORBIDDEN', 403);
  const read = async () => {
    const result = rows(await operations.filter({ id: operation.id }, '-created_date', 1));
    if (result.length !== 1) throw fail('REPORT_OPERATION_UNAVAILABLE');
    return result[0].report_upload || null;
  };
  const view = receipt => {
    if (!receipt) return { state: 'unprepared' };
    // A running request is not re-claimable after a deadline. Its eventual
    // receipt can still be recovered by a later status read.
    const state = receipt.state === 'uploading' && Date.parse(now()) - Date.parse(receipt.claimed_at) > 90000 ? 'unknown' : receipt.state;
    return { state, file_uri: receipt.file_uri || null, sha256: receipt.sha256, size: receipt.size, failure_code: receipt.failure_code || null };
  };
  if (body.action === 'report_upload_status') return view(await read());
  if (['report_record_status', 'report_record_put'].includes(body.action)) {
    return reconcileReportRecord({ operations, operation, caller, body, receipt: await read(), now });
  }
  if (body.action === 'report_upload_recover') {
    const receipt = await read();
    if (!receipt || receipt.sha256 !== body.sha256 || receipt.size !== Number(body.size)) throw fail('REPORT_PDF_IDENTITY_CONFLICT');
    if (receipt.state === 'stored') {
      if (receipt.file_uri !== body.file_uri) throw fail('REPORT_FILE_IDENTITY_CONFLICT');
      return view(receipt);
    }
    if (!['uploading', 'unknown'].includes(receipt.state)) throw fail('REPORT_UPLOAD_NOT_STARTED');
    // Only a reference returned for this caller's original operation can be recovered.
    // The signing integration retains Base44's private-file authorization.
    const uri = String(body.file_uri || '');
    const parts = uri.split('/');
    if (parts.length !== 6 || parts[0] !== 'mp' || parts[1] !== 'private' ||
        !/^[a-f0-9]{24}$/.test(parts[2]) || parts[3] !== 'app-users' ||
        parts[4] !== operation.initiated_by ||
        !parts[5].endsWith(`_SoundProofReport-${operation.operation_id}.pdf`) ||
        !/^[A-Za-z0-9:_-]+\.pdf$/.test(parts[5])) throw fail('INVALID_RECOVERY_FILE', 400);
    const signed = await caller.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 60 });
    const url = new URL(signed.signed_url);
    if (url.protocol !== 'https:' || url.hostname !== 'media.base44.com') throw fail('UNSUPPORTED_PRIVATE_FILE_HOST');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fail('RECOVERY_FILE_UNAVAILABLE');
    const bytes = await response.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== receipt.size || hash !== receipt.sha256 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw fail('RECOVERY_FILE_BYTES_MISMATCH');
    await operations.updateMany({ id: operation.id, 'report_upload.state': { $in: ['uploading', 'unknown'] }, 'report_upload.sha256': hash }, { $set: {
      'report_upload.state': 'stored', 'report_upload.file_uri': uri, 'report_upload.stored_at': now(), 'report_upload.failure_code': null,
    } });
    const recovered = await read();
    if (recovered.state !== 'stored' || recovered.file_uri !== uri) throw fail('UPLOAD_RECEIPT_SAVE_UNCONFIRMED');
    return view(recovered);
  }
  if (!/^[a-f0-9]{64}$/.test(body.sha256 || '') || !Number.isSafeInteger(Number(body.size)) || Number(body.size) < 8) throw fail('INVALID_PDF_IDENTITY', 400);
  const same = receipt => receipt?.sha256 === body.sha256 && receipt?.size === Number(body.size);
  let receipt = await read();
  if (body.action === 'report_upload_prepare') {
    if (!receipt) {
      // The plain id is essential: Base44 rechecks this condition atomically
      // at write time ONLY when the query names a single record id.
      await operations.updateMany({ id: operation.id, report_upload: null }, { $set: {
        report_upload: { state: 'ready', sha256: body.sha256, size: Number(body.size), prepared_at: now() },
      } });
      receipt = await read();
    }
    if (!same(receipt)) throw fail('REPORT_PDF_IDENTITY_CONFLICT');
    return view(receipt);
  }
  if (body.action !== 'report_upload_put') throw fail('UNKNOWN_UPLOAD_ACTION', 400);
  if (!same(receipt)) throw fail('REPORT_PDF_IDENTITY_CONFLICT');
  if (!['ready', 'refused'].includes(receipt.state)) return view(receipt);
  if (!file || file.size !== receipt.size) throw fail('PDF_SIZE_MISMATCH', 400);
  const bytes = await file.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (hash !== receipt.sha256 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw fail('PDF_BYTES_MISMATCH', 400);
  const claimed = await operations.updateMany({ id: operation.id, 'report_upload.state': { $in: ['ready', 'refused'] }, 'report_upload.sha256': hash }, { $set: {
    'report_upload.state': 'uploading', 'report_upload.claimed_at': now(), 'report_upload.failure_code': null,
  } });
  if (claimed.updated !== 1) return view(await read());
  let uploaded;
  try {
    // Same Base44 private-storage integration, under the authenticated caller.
    // The opaque storage filename keeps client names out of diagnostics.
    uploaded = await caller.integrations.Core.UploadPrivateFile({ file: new File([bytes], `SoundProofReport-${body.operation_id}.pdf`, { type: 'application/pdf' }) });
  } catch (error) {
    const status = Number(error?.response?.status || error?.status || 0);
    const state = REFUSED.has(status) ? 'refused' : 'unknown';
    await operations.updateMany({ id: operation.id, 'report_upload.state': 'uploading' }, { $set: {
      'report_upload.state': state, 'report_upload.failure_code': state === 'refused' ? 'STORAGE_REFUSED' : 'STORAGE_OUTCOME_UNKNOWN',
    } });
    return view(await read());
  }
  if (!uploaded?.file_uri) {
    await operations.updateMany({ id: operation.id, 'report_upload.state': 'uploading' }, { $set: { 'report_upload.state': 'unknown', 'report_upload.failure_code': 'STORAGE_RECEIPT_MISSING' } });
    return view(await read());
  }
  // Keep the known storage result even when the subsequent receipt write fails.
  // receipt_pending does NOT claim that the database acknowledgement succeeded.
  const known = { state: 'receipt_pending', file_uri: uploaded.file_uri,
    sha256: receipt.sha256, size: receipt.size, failure_code: 'UPLOAD_RECEIPT_SAVE_UNCONFIRMED' };
  try {
    const saved = await operations.updateMany({ id: operation.id, 'report_upload.state': 'uploading' }, { $set: {
      'report_upload.state': 'stored', 'report_upload.file_uri': uploaded.file_uri, 'report_upload.stored_at': now(),
    } });
    if (saved.updated !== 1) return known;
    return view(await read());
  } catch {
    return known;
  }
}
