/**
 * proposalExportIdentity
 * ----------------------
 * The ONE authority that decides a proposal document's own identity before
 * anything is prepared for printing: the project / client / dealer / reference it
 * states, and the EXACT saved names of the design versions it documents.
 *
 * It exists because resolution must be bounded and honest:
 *
 *   - every wait here has a deadline. A saved-version read that never answers, or
 *     an animation frame that never arrives (a hidden or throttled tab suspends
 *     requestAnimationFrame), ends the wait rather than the export.
 *   - names that are already available are REUSED, never read again: the names
 *     frozen in the proposal's own comparison metadata are authoritative, so a
 *     document that already states its versions needs no database read at all.
 *   - a name is never invented. When a document must state more than one version
 *     — a comparison — and a name cannot be read, resolution FAILS and says so,
 *     because printing the wrong identity is worse than printing nothing. A single
 *     version with an unreadable name simply states no version, exactly as the
 *     cover already does.
 *   - an expired frame is reported as expired, never as readiness. What the
 *     document is prepared from is decided afterwards by the resource authority.
 *
 * Pure: no React, no SDK, no DOM. The read and the frame wait are injected, so the
 * ordering, the deadlines and the failure rules are all testable on their own.
 */

import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import { buildVersionNameMap } from '@/components/library/libraryVersionLabels';
import { readinessNow, withDeadline } from '@/components/report/printReadiness';

/** Why identity resolution did not complete. */
export const PROPOSAL_IDENTITY_REASON = Object.freeze({
  VERSION_NAMES_UNRESOLVED: 'proposal_version_names_unresolved',
});

/** What each identity wait may take. Both are bounded on purpose. */
export const PROPOSAL_IDENTITY_BUDGET_MS = Object.freeze({
  versionLookup: 5000,
  frame: 1000,
});

/** The operation that prevented completion, for internal diagnostics. */
export const PROPOSAL_IDENTITY_BLOCKED_BY = Object.freeze({
  VERSION_LOOKUP: 'version_lookup',
  ANIMATION_FRAME: 'animation_frame',
});

/**
 * The version names already available without any read: those frozen into the
 * proposal's own metadata when it was generated or saved. Authoritative, and
 * reusable — this is what keeps a document that already states its versions off
 * the database entirely.
 *
 * @returns {Map<string, string>} version id → saved name
 */
export function frozenVersionNames(proposal) {
  const names = new Map();
  const meta = proposal?.metadata || {};
  const add = (versionId, versionName) => {
    const id = String(versionId || '').trim();
    const name = typeof versionName === 'string' ? versionName.trim() : '';
    if (id && name && !names.has(id)) names.set(id, name);
  };
  (Array.isArray(meta.selected_versions) ? meta.selected_versions : [])
    .forEach((entry) => add(entry?.version_id || entry?.id, entry?.version_name));
  (Array.isArray(meta.comparison_table?.versions) ? meta.comparison_table.versions : [])
    .forEach((entry) => add(entry?.version_id, entry?.version_name));
  return names;
}

/** The versions this document covers, in selection order. */
export function documentVersionIds(proposal) {
  return proposalVersionIds(proposal);
}

/** A document that states more than one version must state every one of them. */
export function requiresEveryVersionName(versionIds = []) {
  return (Array.isArray(versionIds) ? versionIds : []).length > 1;
}

/** The version ids still without a name. */
export function unresolvedVersionIds(versionIds = [], names = new Map()) {
  return (Array.isArray(versionIds) ? versionIds : []).filter((id) => !names.get(id));
}

/** Whatever a read returned, as a name map. Never invents an entry. */
function toNameMap(result) {
  if (result instanceof Map) return result;
  if (Array.isArray(result)) return buildVersionNameMap(result);
  if (Array.isArray(result?.items)) return buildVersionNameMap(result.items);
  return new Map();
}

/**
 * Resolve this document's identity, within bounds.
 *
 * @param {Object} options
 * @param {Object} options.proposal                the proposal being printed
 * @param {Object} [options.projectContext]        project / dealer / client / reference
 * @param {Map}    [options.knownNames]            names already resolved by the caller
 * @param {Function} [options.readVersionNames]     async () => the saved version names
 * @param {Function} [options.frameWait]            async () => one settled frame
 * @param {Object} [options.budgets]                this module's own budgets
 * @param {Object} [options.diagnostics]            the attempt's timing trace
 * @returns {Promise<{ok: boolean, identity: Object|null, names: Map, reason: string|null,
 *   blockedBy: string|null, versionsResolved: boolean, frameExpired: boolean,
 *   diagnostics: Object}>}
 */
export async function resolveProposalExportIdentity({
  proposal,
  projectContext = {},
  knownNames = null,
  readVersionNames = null,
  frameWait = null,
  budgets = PROPOSAL_IDENTITY_BUDGET_MS,
  diagnostics = null,
  now = readinessNow,
} = {}) {
  const trace = diagnostics;
  const startedAt = now();
  if (trace) trace.start('identity_resolution', { phase: 'identity' });

  // 1. Already-available names first — frozen metadata, then anything the editor
  //    has resolved. Nothing is read that is already known.
  const versionIds = documentVersionIds(proposal);
  const names = new Map(frozenVersionNames(proposal));
  if (knownNames && typeof knownNames.forEach === 'function') {
    versionIds.forEach((id) => {
      const known = knownNames.get(id);
      if (known && !names.has(id)) names.set(id, known);
    });
  }

  // 2. One bounded read, only for the names still missing, and only when a reader
  //    was supplied. A read that fails or runs out of its budget leaves the name
  //    missing: resolution reports that, it never fills the gap with a guess.
  let lookupFailed = false;
  let lookupExpired = false;
  const missing = unresolvedVersionIds(versionIds, names);
  if (missing.length > 0 && typeof readVersionNames === 'function') {
    if (trace) trace.start('version_lookup', { missing: missing.length });
    try {
      const read = await withDeadline(
        Promise.resolve().then(() => readVersionNames(missing, versionIds)),
        budgets.versionLookup,
      );
      toNameMap(read).forEach((name, id) => {
        if (name && !names.get(id)) names.set(id, name);
      });
      if (trace) {
        trace.done('version_lookup', { resolved: missing.length - unresolvedVersionIds(missing, names).length });
      }
    } catch (error) {
      lookupFailed = true;
      lookupExpired = error?.printReadinessTimeout === true;
      if (trace) {
        const detail = { expired: lookupExpired, missing: missing.length };
        if (lookupExpired) trace.expire('version_lookup', detail);
        else trace.fail('version_lookup', detail);
      }
      if (!lookupExpired) {
        console.warn('[proposal-export] saved version names unavailable:', error?.message || error);
      }
    }
  }

  // 3. A comparison must state every version it compares. An identity that cannot
  //    be resolved is a clear failure the designer can retry — never a document
  //    that names the wrong version, or none where one is required.
  const remaining = unresolvedVersionIds(versionIds, names);
  if (remaining.length > 0 && requiresEveryVersionName(versionIds)) {
    // The trace names the operation that prevented completion, so a failed
    // preparation can be diagnosed without reproducing it.
    if (trace) trace.fail('version_lookup', { unresolved: remaining.length });
    const snapshot = trace ? trace.snapshot() : null;
    return {
      ok: false,
      identity: null,
      names,
      reason: PROPOSAL_IDENTITY_REASON.VERSION_NAMES_UNRESOLVED,
      blockedBy: PROPOSAL_IDENTITY_BLOCKED_BY.VERSION_LOOKUP,
      versionsResolved: false,
      frameExpired: false,
      diagnostics: snapshot,
    };
  }

  // 4. One bounded frame, so React has applied anything resolved above. Its
  //    expiry is recorded and passed on — it is not proof of readiness, and the
  //    export's resource checks still decide whether anything may print.
  let frameExpired = false;
  if (typeof frameWait === 'function') {
    if (trace) trace.start('animation_frame');
    try {
      const outcome = await withDeadline(
        Promise.resolve().then(() => frameWait()),
        budgets.frame,
      );
      frameExpired = outcome?.expired === true;
      if (trace) {
        if (frameExpired) trace.expire('animation_frame');
        else trace.done('animation_frame');
      }
    } catch (error) {
      frameExpired = true;
      if (trace) trace.expire('animation_frame', { expired: error?.printReadinessTimeout === true });
    }
  }

  // 5. The identity handed over is an explicit, settled snapshot — the names
  //    resolved here, in selection order — not a value read back from a frame.
  const identity = {
    projectName: projectContext.projectName || proposal?.title || null,
    dealerName: projectContext.filenameDealerName ?? null,
    clientName: projectContext.filenameClientName ?? null,
    projectReference: projectContext.projectReference ?? null,
    versionNames: versionIds.map((id) => names.get(id)).filter(Boolean),
    versionsResolved: remaining.length === 0,
    frameExpired,
    lookupFailed,
  };

  if (trace) trace.done('identity_available', { elapsedMs: Math.round(now() - startedAt) });
  const snapshot = trace ? trace.snapshot() : null;

  return {
    ok: true,
    identity,
    names,
    reason: null,
    blockedBy: null,
    versionsResolved: identity.versionsResolved,
    frameExpired,
    diagnostics: snapshot,
  };
}

export default resolveProposalExportIdentity;