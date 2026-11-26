import { base44 } from "@/api/base44Client";
import { stableStringify } from "@/components/proposal/engineeringAuthority/engineeringFingerprint";

// Uses the existing records and permissions. No new revision field or lock.
// The SDK's single-id conditional update rechecks updated_date at write time.
export const DESIGN_CONFLICT = "DESIGN_SAVE_CONFLICT";
const same = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);
export function assertSaveBaseline(baseline, projectId, versionId) {
  if (baseline?.conflict) throw Object.assign(new Error(baseline.conflict), { code: DESIGN_CONFLICT });
  if (baseline?.project?.id !== projectId || baseline?.version?.id !== versionId ||
      baseline.version.project_id !== projectId) {
    throw new Error("The saved design baseline is unavailable. Keep your changes open and reopen the saved design in another tab before retrying.");
  }
}
function conflict(baseline, detail) {
  const message = detail + " Your unsaved edits are kept in this tab. Review them before reloading the saved version.";
  baseline.conflict = message;
  return Object.assign(new Error(message), { code: DESIGN_CONFLICT });
}
function matches(row, expected, keys) {
  return keys.every(key => same(row?.[key], expected?.[key]));
}
async function latest(entity, id) {
  const rows = await entity.filter({ id }, "-updated_date", 1);
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== id) {
    throw new Error("The saved record could not be verified. Your edits remain open; retry when the connection is available.");
  }
  return rows[0];
}
function verifyIdentity(row, baseline, kind) {
  const expected = baseline[kind];
  if (row.id !== expected.id || row.account_id !== expected.account_id ||
      (kind === "version" && row.project_id !== baseline.project.id)) {
    throw conflict(baseline, "The saved project or version identity changed. Saving was stopped.");
  }
}
export async function assertDesignUnchanged(baseline, projectId, versionId, client = base44) {
  assertSaveBaseline(baseline, projectId, versionId);
  const row = await latest(client.entities.ProjectVersion, versionId);
  verifyIdentity(row, baseline, "version");
  if (!same(row.design_state, baseline.version.design_state)) {
    throw conflict(baseline, "Another tab or session changed this design. Saving was stopped.");
  }
  return row;
}
async function conditionalWrite(baseline, kind, patch, assertScope, client) {
  assertSaveBaseline(baseline, baseline?.project?.id, baseline?.version?.id);
  const entity = client.entities[kind === "version" ? "ProjectVersion" : "Project"];
  const original = baseline[kind];
  const keys = Object.keys(patch);
  const row = await latest(entity, original.id);
  assertScope();
  verifyIdentity(row, baseline, kind);
  // A lost response may already have saved exactly this payload.
  if (matches(row, patch, keys)) { baseline[kind] = row; return row; }
  if (!matches(row, original, keys)) {
    throw conflict(baseline, kind === "version"
      ? "Another tab or session changed this design. Saving was stopped."
      : "Another tab or session changed the shared room details. Saving was stopped.");
  }
  if (!row.updated_date) throw new Error("The saved record has no revision timestamp. Saving was stopped; your edits remain open.");
  const query = { id: row.id, updated_date: row.updated_date };
  if (kind === "version") query.project_id = baseline.project.id;
  let result, failure;
  try {
    result = await entity.updateMany(query, { $set: patch });
  } catch (error) { failure = error; }
  if (result?.updated === 1) {
    baseline[kind] = { ...row, ...patch };
    return baseline[kind];
  }
  // Neither a rejected request nor zero matches is permission to overwrite.
  // Reconcile the existing record, including a successful write with lost reply.
  const observed = await latest(entity, row.id);
  assertScope();
  verifyIdentity(observed, baseline, kind);
  if (matches(observed, patch, keys)) { baseline[kind] = observed; return observed; }
  if (!matches(observed, original, keys)) {
    throw conflict(baseline, "A newer saved change won the save conflict. It was not overwritten.");
  }
  if (failure) throw failure;
  throw new Error("The record changed while saving. Your edits remain open; retry the save.");
}
export function saveDesignConditionally(baseline, designState, assertScope = () => {}, client = base44) {
  return conditionalWrite(baseline, "version", { design_state: designState }, assertScope, client);
}
export function saveSharedConditionally(baseline, patch, assertScope = () => {}, client = base44) {
  return conditionalWrite(baseline, "project", patch, assertScope, client);
}
