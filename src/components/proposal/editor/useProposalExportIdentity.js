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
 * therefore handed to the export, which waits for it before any print
 * preparation begins — the stable snapshot the document is prepared from.
 *
 * Nothing here changes proposal content, the approved writer, the validator or
 * any engineering value: it only decides which names the document states.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { proposalVersionIds } from '@/components/proposal/library/proposalSourceState';
import { buildVersionNameMap } from '@/components/library/libraryVersionLabels';
import { settleOneFrame } from '@/components/report/printReadiness';

export default function useProposalExportIdentity({ proposal, projectContext }) {
  const [versionNameById, setVersionNameById] = useState(new Map());
  // The in-flight read of the saved version names. An export waits for it, so the
  // printed document is never prepared with its display names still arriving.
  const versionNamesPromiseRef = useRef(Promise.resolve());

  useEffect(() => {
    const versionIds = proposalVersionIds(proposal);
    if (versionIds.length === 0) {
      setVersionNameById(new Map());
      versionNamesPromiseRef.current = Promise.resolve();
      return undefined;
    }
    let cancelled = false;
    versionNamesPromiseRef.current = (async () => {
      try {
        const result = await base44.entities.ProjectVersion.filter(
          { id: { $in: versionIds } },
          { fields: ['version_name'], limit: 10 },
        );
        const records = Array.isArray(result) ? result : (result?.items || []);
        if (!cancelled) setVersionNameById(buildVersionNameMap(records));
      } catch (versionError) {
        // The name is a label only: an unreadable name leaves the image
        // unlabelled rather than showing a wrong one.
        console.warn('[ProposalEditor] version names unavailable:', versionError?.message || versionError);
      }
    })();
    return () => { cancelled = true; };
  }, [proposal?.selected_version_ids, proposal?.version_id]);

  // The exact saved names this document is built from, in selection order: the
  // version name for a summary, every name for a comparison.
  const versionNames = useMemo(
    () => proposalVersionIds(proposal).map((versionId) => versionNameById.get(versionId)).filter(Boolean),
    [proposal?.selected_version_ids, proposal?.version_id, versionNameById],
  );

  // The export's own inputs, kept current so the export can read the identity the
  // printed document and its filename state once those inputs have settled.
  const identityRef = useRef({});
  identityRef.current = {
    projectName: projectContext.projectName || proposal?.title || null,
    dealerName: projectContext.filenameDealerName ?? null,
    clientName: projectContext.filenameClientName ?? null,
    projectReference: projectContext.projectReference ?? null,
    versionNames,
  };

  // Resolution is awaited by the export; the settled frame afterwards lets React
  // apply the names just read, so the identity handed over is the one mounted in
  // the document that is about to be prepared.
  const resolveExportIdentity = useCallback(async () => {
    await versionNamesPromiseRef.current;
    await settleOneFrame();
    return identityRef.current;
  }, []);

  return { versionNameById, versionNames, resolveExportIdentity };
}