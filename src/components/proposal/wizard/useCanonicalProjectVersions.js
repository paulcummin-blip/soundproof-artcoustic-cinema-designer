import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { selectCanonicalVersions } from '@/lib/canonicalVersionSelection';

const EMPTY = { versions: [], collisions: [], loading: false, error: null };

/**
 * One project's genuine design versions, read once for the whole proposal wizard.
 *
 * The count of versions a proposal may be built from is decided by the ONE shared
 * canonical selector (selectCanonicalVersions): a version slot that holds two
 * records — a lazy migration that ran twice, leaving the real design beside an
 * empty artefact — collapses to the single record the project's active pointer
 * names, or to the one carrying verified evidence. Raw ProjectVersion record
 * counts are never used: they would report two designs where there is one.
 *
 * Reading order is the canonical slot order. The same list and the same count
 * therefore drive the Type step's availability rule and the Versions step, so the
 * two can never disagree, and the project's versions are read once rather than
 * once per step.
 *
 * @param {string|null} projectId
 * @returns {{versions: Array, collisions: Array, loading: boolean, error: any}}
 */
export default function useCanonicalProjectVersions(projectId) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    if (!projectId) {
      setState(EMPTY);
      return undefined;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    (async () => {
      try {
        const [versionRecords, projectRecords] = await Promise.all([
          base44.entities.ProjectVersion.filter({ project_id: projectId }),
          base44.entities.Project.filter({ id: projectId }),
        ]);
        if (cancelled) return;
        const canonical = selectCanonicalVersions({
          versions: Array.isArray(versionRecords) ? versionRecords : [],
          activeVersionId: projectRecords?.[0]?.active_version_id || null,
        });
        setState({
          versions: canonical.versions,
          collisions: canonical.collisions,
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error('Failed to load versions:', err);
        // A failed read is never reported as "this project has no versions": the
        // wizard is told the read failed and offers nothing it cannot build.
        if (!cancelled) setState({ versions: [], collisions: [], loading: false, error: err });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return state;
}