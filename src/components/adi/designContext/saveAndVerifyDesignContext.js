import { contextRevision, persistedContextContains, readContextRecord } from '../../../../base44/shared/designContext/designContextPersistence.js';
/** Save, then independently read the saved answers. Never resolves success on an unverified write. */
export async function saveAndVerifyDesignContext({ base44, projectId, versionId, items = [] }) {
  let acknowledgedRevision = null;
  if (items.length) {
    const response = await base44.functions.invoke('saveDesignContext', {
      project_id: projectId, version_id: versionId, context_items: items,
    });
    const data = response?.data;
    if (data?.ok !== true || data.saved !== true || data.verified !== true || !data.context_revision) {
      throw new Error('Your answers could not be confirmed as saved. Please retry saving.');
    }
    acknowledgedRevision = data.context_revision;
  }
  const record = await readContextRecord(base44.entities, projectId, versionId);
  const revision = contextRevision(record);
  if (!persistedContextContains(record, items) || (acknowledgedRevision && revision !== acknowledgedRevision)) {
    throw new Error('The saved answers could not be verified. Your entries are still here; please retry saving.');
  }
  return revision;
}
