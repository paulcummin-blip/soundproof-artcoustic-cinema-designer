/** Shared content identity and read-back checks. No writes or engineering inputs. */
const text = v => typeof v === 'string' ? v.trim() : '';
export const contextRows = page => {
  if (Array.isArray(page)) return page;
  if (Array.isArray(page?.items)) return page.items;
  throw new Error('The saved Design Context response could not be verified. Please retry saving.');
};
export function contextItemValue(item) {
  return { question_id: text(item?.question_id), status: text(item?.status),
    answer: item?.status === 'answered' ? text(item?.answer) : null,
    decision_fingerprint: item?.decision_fingerprint || null };
}
export function projectContextValue(record) {
  return text(record?.project_context);
}
export function contextRevision(record) {
  if (!record) return 'dc2:none';
  const content = JSON.stringify({ id: record.id, project_id: record.project_id, version_id: record.version_id,
    updated_at: record.updated_at || record.updated_date || null,
    project_context: text(record?.project_context),
    items: (record.context_items || []).map(contextItemValue).sort((a,b) => a.question_id.localeCompare(b.question_id)) });
  let hash = 0x811c9dc5;
  for (let i=0;i<content.length;i++) hash = Math.imul(hash ^ content.charCodeAt(i), 0x01000193) >>> 0;
  return 'dc2:' + record.id + ':' + (record.updated_at || record.updated_date || '') + ':' + hash.toString(16);
}
export function persistedContextContains(record, submitted) {
  return (submitted || []).every(item => (record?.context_items || []).some(saved =>
    JSON.stringify(contextItemValue(saved)) === JSON.stringify(contextItemValue(item))));
}
export async function readContextRecord(entities, projectId, versionId) {
  const rows = contextRows(await entities.DesignContext.filter(
    { project_id: projectId, version_id: versionId }, { limit: 2 }));
  if (rows.length > 1) throw new Error('Multiple saved Design Context records were found. Generation has stopped.');
  const record = rows[0] || null;
  if (record && (record.project_id !== projectId || record.version_id !== versionId || !Array.isArray(record.context_items))) {
    throw new Error('The saved Design Context does not match this design. Please retry saving.');
  }
  return record;
}