/**
 * useDesignIntentPreview.js
 * -------------------------
 * The admin Design Intent preview's own data: which project and version to write
 * for, and the READ-ONLY result of the production writer for that pair.
 *
 * Every request it makes goes to previewReportDesignIntent, which runs the real
 * production writer and saves nothing. Nothing here writes, approves, publishes or
 * regenerates a report: the hook holds a result in state and discards it when the
 * target changes, so the panel on screen always describes the project and version
 * it was run for.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const PROJECT_PAGE = 300;
const VERSION_PAGE = 50;

/**
 * @param {string|null} [initialProjectId] — the app's active project, used as the
 *   opening default. The designer can still choose any other project.
 */
export default function useDesignIntentPreview(initialProjectId = null) {
  const [projects, setProjects] = useState([]);
  const [versions, setVersions] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [targetError, setTargetError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const opened = useRef(false);

  // The project list, once. The active project is preferred as the opening default;
  // every other project stays selectable, which is the point of the audit mode.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await base44.entities.Project.list('-updated_date', PROJECT_PAGE);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setProjects(list);
        if (!opened.current) {
          opened.current = true;
          setProjectId(
            initialProjectId && list.some((project) => project.id === initialProjectId)
              ? initialProjectId
              : (list[0]?.id || ''),
          );
        }
      } catch (e) {
        if (!cancelled) setTargetError(e?.message || 'The project list could not be read.');
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialProjectId]);

  // The versions of the chosen project. The project's own active version opens as
  // the default, and any other version of it stays selectable.
  useEffect(() => {
    if (!projectId) {
      setVersions([]);
      setVersionId('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const page = await base44.entities.ProjectVersion.filter(
          { project_id: projectId },
          { sort: 'version_number', limit: VERSION_PAGE },
        );
        if (cancelled) return;
        const list = page?.items || [];
        setVersions(list);
        const project = projects.find((row) => row.id === projectId) || null;
        setVersionId(
          project?.active_version_id && list.some((row) => row.id === project.active_version_id)
            ? project.active_version_id
            : (list[0]?.id || ''),
        );
      } catch (e) {
        if (!cancelled) setVersions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, projects]);

  // A result belongs to the target it was run for, so changing the target clears it
  // rather than leaving an old narrative beside a newly chosen project.
  const chooseProject = useCallback((next) => {
    setPreview(null);
    setError(null);
    setProjectId(next);
  }, []);

  const chooseVersion = useCallback((next) => {
    setPreview(null);
    setError(null);
    setVersionId(next);
  }, []);

  const runPreview = useCallback(async () => {
    if (!projectId || !versionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await base44.functions.invoke('previewReportDesignIntent', {
        project_id: projectId,
        version_id: versionId,
      });
      setPreview(response?.data || null);
    } catch (e) {
      const data = e?.response?.data || null;
      // A project with no saved report yet is a result to read, not a crash: the
      // backend states it with a plain message and the boundary it ran under.
      if (data && typeof data === 'object') {
        setPreview(data);
      } else {
        setPreview(null);
        setError(e?.message || 'The preview could not be run.');
      }
    } finally {
      setBusy(false);
    }
  }, [projectId, versionId, busy]);

  return {
    projects,
    versions,
    projectId,
    versionId,
    chooseProject,
    chooseVersion,
    loadingTargets,
    targetError,
    preview,
    busy,
    error,
    runPreview,
  };
}