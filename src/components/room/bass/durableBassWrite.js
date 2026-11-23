import { buildPersistedBassAuthority, isAuthoritativeBassContract } from './completedBassResultPersistence';

const fields = ['id', 'project_id', 'version_id', 'account_id', 'status', 'current_fingerprint',
  'completed_cache_version', 'instance_authority_version', 'metric_schema_version', 'completed_by_fingerprint'];
export function canonicalSavedValue(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalSavedValue).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ':' + canonicalSavedValue(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const same = (a, b) => canonicalSavedValue(a) === canonicalSavedValue(b);

/** A write acknowledgement is not persistence. Only a new entity read can prove it. */
export async function persistBassAuthorityDurably(entity, payload, { accountId = null } = {}) {
  const query = { project_id: payload.project_id, version_id: payload.version_id };
  if (!query.project_id || !query.version_id || query.project_id === 'free' || query.version_id === 'free')
    throw new Error('A saved project and version are required.');
  const fp = payload.current_fingerprint;
  const desired = payload.completed_by_fingerprint?.[fp];
  if (payload.status === 'complete' && (!desired || desired.job?.resultFingerprint !== fp || !isAuthoritativeBassContract(desired)))
    throw new Error('The completed bass contract does not match its authority fingerprint.');
  const read = async () => {
    const rows = await entity.filter(query, '-updated_date', 100, 0, fields);
    if (!Array.isArray(rows)) throw new Error('Bass persistence read returned an invalid response.');
    if (rows.length === 100) throw new Error('Bass persistence found too many cache records to reconcile safely.');
    return rows;
  };
  const before = await read();
  // Reuse the freshest durable row, not a captured null/old row from before a queued write.
  const target = before[0] || null;
  const completed = Object.assign({}, ...before.slice().reverse().map(row => row.completed_by_fingerprint || {}),
    payload.completed_by_fingerprint || {});
  const bounded = buildPersistedBassAuthority({
    version: payload.completed_cache_version, instanceAuthorityVersion: payload.instance_authority_version,
    metricSchemaVersion: payload.metric_schema_version, currentFingerprint: fp, completedByFingerprint: completed,
  }, fp, desired || null);
  const write = { ...payload, completed_by_fingerprint: bounded.completedByFingerprint };
  if (!target?.account_id && accountId) write.account_id = accountId;
  const matches = row => row?.project_id === query.project_id && row?.version_id === query.version_id
    && Object.entries(write).every(([key, value]) => same(row[key], value));
  // A fresh read is a valid no-op receipt; a session signature or old object is not.
  if (target && matches(target)) return { row: target, disposition: 'verified-existing', fingerprint: fp };
  let writeError = null;
  let response = null;
  try {
    response = target?.id ? await entity.update(target.id, write) : await entity.create(write);
    if (response?.error || response?.success === false) writeError = new Error(response?.message || response?.error || 'Bass save was unsuccessful.');
  } catch (error) { writeError = error; }
  // Also reconcile a committed write whose HTTP acknowledgement was lost. Never create again here.
  let after;
  try { after = await read(); }
  catch (error) {
    throw new Error('Bass save outcome is unverified. Retry Save will reconcile storage before writing: ' + error.message);
  }
  const id = target?.id || response?.id;
  const verified = after.find(row => (!id || row.id === id) && matches(row));
  const conflicting = after.some(row => row.id !== verified?.id && row.status === 'complete'
    && row.current_fingerprint === fp && !same(row.completed_by_fingerprint?.[fp], verified?.completed_by_fingerprint?.[fp]));
  if (!verified || conflicting) throw new Error(conflicting
    ? 'Conflicting completed bass records exist for the same fingerprint. No current authority was accepted.'
    : 'Bass save could not be verified by durable readback' + (writeError ? ': ' + writeError.message : '.'));
  return { row: verified, disposition: writeError ? 'reconciled-after-uncertain-write' : 'verified-readback', fingerprint: fp };
}
