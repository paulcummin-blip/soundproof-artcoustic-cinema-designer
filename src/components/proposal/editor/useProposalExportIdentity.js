/**
 * useProposalExportIdentity
 * -------------------------
 * The identity inputs of a proposal export, RESOLVED before anything is printed:
 *
 *   - the exact saved names of the design versions this document was built from
 *   - the project, client, dealer and reference the cover and the filename state
 *
 * The saved version names are read asynchronously, so an export that ran while
 * that read was still in flight could print a cover, an image caption and a
 * filename missing the very names it documents. `resolveExportIdentity` is
 * therefore handed to the export, which waits for it before any print preparation
 * begins — the stable snapshot the document is prepared from.
 *
 * Resolution is bounded and observable (see ../editor/proposalExportIdentity):
 * the read is shared and reused, never repeated, and it is given a deadline at the
 * export boundary only — a read that hangs cannot hold an export open. Names that
 * arrive are applied to the component SYNCHRONOUSLY, so the identity handed to the
 * export is the one already mounted in the document that is about to be prepared:
 * correctness does not rest on an animation frame, which a hidden or throttled tab
 * may never deliver.
 *
 * Nothing here changes proposal content, the approved writer, the validator or any
 * engineering value: it only decides which names the document states.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { base44 } from '@/api/base44Client';
import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import { buildVersionNameMap } from '@/components/library/libraryVersionLabels';
import { settleOneFrame } from '@/components/report/printReadiness';
import {
  createExportDiagnostics,
  recordExportDiagnostics,
} from '@/components/proposal/export/proposalExportDiagnostics';
import { resolveProposalExportIdentity } from './proposalExportIdentity';

export default function useProposalExportIdentity({ proposal, projectContext }) {
  const [versionNameById, setVersionNameById] = useState(new Map());
  // The EXPLICIT resolved identity state: the names resolved for this document so
  // far. Read straight from it by an export, so its identity never depends on
  // React having re-rendered.
  const resolvedNamesRef = useRef(new Map());
  // The one saved-name read for this version set, shared by the gallery labels and
  // by the export. Never started twice for the same versions.
  const namesReadRef = useRef(null);
  const namesReadKeyRef = useRef('');
  // The identity inputs as they stand, so resolution reads them fresh at the
  // moment of the export rather than through a stale closure.
  const contextRef = useRef({});
  const versionIds = proposalVersionIds(proposal);
  contextRef.current = { proposal, projectContext, versionIds };

  /** The shared read of this document's saved version names. */
  const ensureNames = useCallback(() => {
    const ids = contextRef.current.versionIds || [];
    const key = ids.join('|');
    if (namesReadRef.current && namesReadKeyRef.current === key) return namesReadRef.current;
    namesReadKeyRef.current = key;
    namesReadRef.current = ids.length === 0
      ? Promise.resolve(new Map())
      : base44.entities.ProjectVersion.filter(
        { id: { $in: ids } },
        { fields: ['version_name'], limit: 10 },
      )
        .then((result) => buildVersionNameMap(Array.isArray(result) ? result : (result?.items || [])))
        .catch((versionError) => {
          // The name is a label only: an unreadable name leaves the document
          // unlabelled rather than showing a wrong one. Resolution reports it.
          console.warn('[ProposalEditor] version names unavailable:', versionError?.message || versionError);
          return new Map();
        });
    return namesReadRef.current;
  }, []);

  /**
   * Apply resolved names to the resolved identity state, and to the component
   * synchronously, so they are in the document — not merely scheduled into it.
   */
  const applyNames = useCallback((names) => {
    if (!names || typeof names.forEach !== 'function') return;
    const merged = new Map(resolvedNamesRef.current);
    let changed = false;
    names.forEach((name, id) => {
      if (name && merged.get(id) !== name) {
        merged.set(id, name);
        changed = true;
      }
    });
    if (!changed) return;
    resolvedNamesRef.current = merged;
    const update = () => setVersionNameById(new Map(merged));
    try {
      flushSync(update);
    } catch {
      // Already inside a React render or lifecycle: the ordinary update applies
      // on the next pass, and the export still uses the resolved names above.
      update();
    }
  }, []);

  useEffect(() => {
    const ids = proposalVersionIds(proposal);
    if (ids.length === 0) {
      resolvedNamesRef.current = new Map();
      setVersionNameById(new Map());
      return undefined;
    }
    let cancelled = false;
    // Labels only: this read never gates the editor. Its result is applied when it
    // arrives, and its lateness can never restart or alter an export attempt.
    ensureNames().then((names) => {
      if (!cancelled) applyNames(names);
    });
    return () => { cancelled = true; };
  }, [proposal?.selected_version_ids, proposal?.version_id, ensureNames, applyNames]);

  // The exact saved names this document is built from, in selection order: the
  // version name for a summary, every name for a comparison.
  const versionNames = useMemo(
    () => proposalVersionIds(proposal).map((versionId) => versionNameById.get(versionId)).filter(Boolean),
    [proposal?.selected_version_ids, proposal?.version_id, versionNameById],
  );

  // Resolution is awaited by the export, with its own bounded trace: the shared
  // read, then one bounded frame. Nothing here can stay pending — a suspended
  // frame or an unanswered read ends the wait and is reported, not swallowed.
  const resolveExportIdentity = useCallback(async () => {
    const { proposal: currentProposal, projectContext: currentContext, versionIds: ids } = contextRef.current;
    const diagnostics = createExportDiagnostics({ scope: 'proposal-export-identity' });

    const result = await resolveProposalExportIdentity({
      proposal: currentProposal,
      projectContext: currentContext,
      knownNames: resolvedNamesRef.current,
      readVersionNames: ids.length === 0 ? null : () => ensureNames(),
      frameWait: settleOneFrame,
      diagnostics,
    });

    // The names just resolved are applied synchronously BEFORE the identity is
    // handed over, so the document that is about to be prepared already states
    // them. The identity returned carries them either way.
    if (result.names) applyNames(result.names);
    recordExportDiagnostics(diagnostics.snapshot());

    if (!result.ok) {
      const error = new Error('The design versions this document names could not be read.');
      error.printIdentityUnresolved = true;
      error.exportBlockedBy = result.blockedBy;
      throw error;
    }
    return result.identity;
  }, [applyNames, ensureNames]);

  return { versionNameById, versionNames, resolveExportIdentity };
}