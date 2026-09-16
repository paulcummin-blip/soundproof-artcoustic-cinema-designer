// src/components/hooks/useVersionedProjectLoader.js
//
// Shared version-aware project loader for all report authorities.
//
// Resolution order:
//   1. ?version_id= URL parameter (explicit version override for comparison/stable links)
//   2. Project.active_version_id (default — the currently active version)
//   3. Lazy migration (if the project has no active_version_id yet)
//
// Returns a merged object via mergeProjectAndVersion(project, version) — the
// SAME merge path the Room Designer uses. No report may read per-version design
// data directly from the Project entity.
//
// Returns:
//   { loading, error, mergedProject, project, version, versionId, projectId }

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { mergeProjectAndVersion } from "@/lib/versionAuthority";

export function useVersionedProjectLoader(projectIdParam) {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState({
    loading: true,
    error: null,
    project: null,
    version: null,
    mergedProject: null,
  });

  const urlVersionId = searchParams.get("version_id") || null;
  const projectId = projectIdParam || searchParams.get("projectId") || searchParams.get("id") || null;

  const versionId = useMemo(() => urlVersionId || null, [urlVersionId]);

  useEffect(() => {
    let cancelled = false;

    if (!projectId) {
      setState({
        loading: false,
        error: "No project ID provided",
        project: null,
        version: null,
        mergedProject: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        // 1. Fetch the Project entity
        const projects = await base44.entities.Project.filter({ id: projectId });
        if (cancelled) return;
        if (!projects || projects.length === 0) {
          setState({
            loading: false,
            error: "Project not found",
            project: null,
            version: null,
            mergedProject: null,
          });
          return;
        }

        let project = projects[0];

        // 2. Lazy migration — ensure the project has a V1 ProjectVersion
        if (!project.active_version_id && !urlVersionId) {
          try {
            const migRes = await base44.functions.invoke("migrateProjectVersions", { project_id: projectId });
            if (cancelled) return;
            if (migRes?.data?.version_id || migRes?.version_id) {
              const reloaded = await base44.entities.Project.filter({ id: projectId });
              if (cancelled) return;
              if (reloaded && reloaded.length > 0) {
                project = reloaded[0];
              }
            }
          } catch (migErr) {
            console.error("[useVersionedProjectLoader] Migration failed:", migErr);
          }
        }

        // 3. Resolve the version ID to load
        const resolvedVersionId = urlVersionId || project.active_version_id || null;

        if (!resolvedVersionId) {
          // No version available — fall back to project-only (pre-versioning legacy)
          setState({
            loading: false,
            error: null,
            project,
            version: null,
            mergedProject: project,
          });
          return;
        }

        // 4. Fetch the ProjectVersion
        const versions = await base44.entities.ProjectVersion.filter({ id: resolvedVersionId });
        if (cancelled) return;

        const version = versions && versions.length > 0 ? versions[0] : null;

        if (!version) {
          // Version not found — fall back to project-only
          console.warn(`[useVersionedProjectLoader] Version ${resolvedVersionId} not found, falling back to project-only`);
          setState({
            loading: false,
            error: null,
            project,
            version: null,
            mergedProject: project,
          });
          return;
        }

        // 5. Merge project + version
        const merged = mergeProjectAndVersion(project, version);

        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          project,
          version,
          mergedProject: merged,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[useVersionedProjectLoader] Load failed:", err);
        setState({
          loading: false,
          error: err?.message || "Failed to load project",
          project: null,
          version: null,
          mergedProject: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId]);

  return {
    loading: state.loading,
    error: state.error,
    project: state.project,
    version: state.version,
    versionId: versionId || state.project?.active_version_id || null,
    projectId,
    mergedProject: state.mergedProject,
  };
}

export default useVersionedProjectLoader;