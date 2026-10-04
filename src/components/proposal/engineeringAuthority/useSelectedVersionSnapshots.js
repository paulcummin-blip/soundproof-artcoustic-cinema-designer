/**
 * useSelectedVersionSnapshots
 * ---------------------------
 * The frozen Engineering Snapshot of EVERY selected version of a comparison.
 *
 * Single-version proposals need nothing here: the wizard already holds that
 * version's snapshot, and the primary entry is passed back unchanged. In
 * comparison mode the other versions are read from the same published authority
 * through the same builder the generation path uses, so the Client Brief
 * examples and the generated report read the same engineering truth.
 *
 * Read-only: nothing is calculated, written or published here.
 */

import { useEffect, useRef, useState } from 'react';
import { buildSelectedVersionSnapshots } from './buildSelectedVersionSnapshots';

export function useSelectedVersionSnapshots({
  projectId,
  versionIds = [],
  primaryVersionId = null,
  primarySnapshot = null,
  enabled = true,
} = {}) {
  const ids = (versionIds || []).filter(Boolean);
  const versionKey = ids.join('|');
  const [state, setState] = useState({ versions: [], loading: false, error: null });

  // The primary snapshot is read through a ref: it is the same object the rest
  // of the wizard already holds, and re-running the read whenever the parent
  // re-renders would re-read every version for no reason.
  const primaryRef = useRef(primarySnapshot);
  primaryRef.current = primarySnapshot;

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !projectId || ids.length < 2) {
      setState({ versions: [], loading: false, error: null });
      return () => { cancelled = true; };
    }

    setState({ versions: [], loading: true, error: null });

    (async () => {
      try {
        const read = await buildSelectedVersionSnapshots({
          projectId,
          versionIds: ids,
          primaryVersionId,
          primarySnapshot: primaryRef.current,
        });
        if (cancelled) return;
        setState({
          versions: read.map((entry) => ({
            version_id: entry.version_id,
            version_name: entry.version_name || null,
            snapshot: entry.snapshot || null,
            error: entry.error || null,
          })),
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          versions: [],
          loading: false,
          error: error?.message || 'The selected versions could not be read.',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, projectId, versionKey, primaryVersionId]);

  return state;
}

export default useSelectedVersionSnapshots;