import { contextRevision, persistedContextContains, readContextRecord } from './designContextPersistence.js';
const trimContext = v => typeof v === 'string' ? v.trim() : null;
/** Save, then independently read the saved answers. Never resolves success on an unverified write.
 *  The optional free-text Project Context is saved alongside the items and verified the same way;
 *  it never overwrites or discards existing question answers. A non-empty project_context forces a
 *  save even when there are no items, so the designer's note is never lost. */
export async function saveAndVerifyDesignContext({ base44, projectId, versionId, items = [], projectContext = null }) {
  const normalisedContext = trimContext(projectContext);
  let acknowledgedRevision = null;
  if (items.length || normalisedContext !== null) {
    const response = await base44.functions.invoke('saveDesignContext', {
      project_id: projectId, version_id: versionId, context_items: items,
      project_context: normalisedContext,
    });
    const data = response?.data;
    if (data?.ok !== true || data.saved !== true || data.verified !== true || !data.context_revision) {
      throw new Error('Your answers could not be confirmed as saved. Please retry saving.');
    }
    acknowledgedRevision = data.context_revision;
  }
  const record = await readContextRecord(base44.entities, projectId, versionId);
  const revision = contextRevision(record);
  const confirmedContext = trimContext(record?.project_context);
  if (!persistedContextContains(record, items) || confirmedContext !== normalisedContext
    || (acknowledgedRevision && revision !== acknowledgedRevision)) {
    throw new Error('The saved answers could not be verified. Your entries are still here; please retry saving.');
  }
  return revision;
}