/**
 * proposalSelectionAuthority.js
 * -----------------------------
 * The one rule for what a Proposal Library selection is: stable proposal IDs.
 *
 * A selection is held as IDs and nothing else, so a checkbox that hands over the
 * proposal record and one that hands over its id can never produce two different
 * selections. Requests to the deletion function are issued in batches, because
 * that function bounds a single request; the bound is on the request, never on
 * how many proposals may be selected.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** One deletion request may name this many proposals — the function's own bound. */
export const MAX_PROPOSALS_PER_DELETION_REQUEST = 50;

/** The stable ID a selection entry stands for, whichever shape it arrives in. */
export function selectionId(value) {
  if (typeof value === 'string') return value.trim();
  const id = value?.id ?? value?.proposal?.id ?? null;
  return typeof id === 'string' ? id.trim() : '';
}

/** Every selectable ID in a list of proposals (or IDs), in order, deduplicated. */
export function selectionIds(values = []) {
  const ids = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = selectionId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Add one proposal to the selection, or remove it when it is already selected. */
export function toggleSelection(previous, value) {
  const id = selectionId(value);
  const next = new Set(previous || []);
  if (!id) return next;
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Keep only what is still on screen: a proposal that leaves the list leaves the selection. */
export function retainVisibleSelection(previous, visibleValues = []) {
  const visible = new Set(selectionIds(visibleValues));
  const next = new Set([...(previous || [])].filter((id) => visible.has(id)));
  return next.size === (previous?.size ?? 0) ? previous : next;
}

/** A selection of any size, issued as requests that each stay within the bound. */
export function chunkSelection(values = [], size = MAX_PROPOSALS_PER_DELETION_REQUEST) {
  const ids = selectionIds(values);
  const batches = [];
  for (let index = 0; index < ids.length; index += size) batches.push(ids.slice(index, index + size));
  return batches;
}

/** The server's answers to a dry run, as one plan. */
export function mergeDeletionPlan(results = []) {
  const deletable = [];
  const refused = [];
  for (const data of Array.isArray(results) ? results : []) {
    deletable.push(...(data?.deletable || []));
    refused.push(...(data?.refused || []));
  }
  return { deletable, refused };
}

/** The server's answers to a deletion, as one outcome. */
export function mergeDeletionResults(results = []) {
  const deleted = [];
  const notDeleted = [];
  for (const data of Array.isArray(results) ? results : []) {
    deleted.push(...(data?.deleted || []));
    notDeleted.push(...(data?.not_deleted || []));
  }
  return { deleted, notDeleted };
}

export default selectionId;