// ProjectDesignHydrator.jsx
// --------------------------------
// Headless hydrator used by ProjectGate.
//
// Design-dependent pages (Room Designer, reports, Design Review) are only
// mounted once the saved design state is hydrated. This component performs that
// hydration through the SAME canonical path the pages use:
//
//   Project → active ProjectVersion → mergeProjectAndVersion →
//   hydrateProjectIntoAppState
//
// It reports progress into the canonical hydration store, so the sidebar and
// every other surface share one project state. It renders nothing.
//
// Fast path: if the shared app state is already hydrated for this exact project
// (SPA navigation, e.g. Room Designer → report → back), no network work is done
// and the project is marked loaded immediately.

import { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAppState } from "@/components/AppStateProvider";
import { mergeProjectAndVersion } from "@/lib/versionAuthority";
import { hydrateProjectIntoAppState } from "@/components/utils/hydrateProjectIntoAppState";
import { useActiveProjectId } from "@/components/state/project-session";
import {
  beginDesignHydration,
  completeDesignHydration,
  failDesignHydration,
  getProjectHydration,
} from "@/components/state/projectHydrationStore";

export default function ProjectDesignHydrator({ projectId }) {
  const app = useAppState();
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    if (!projectId || !app) return undefined;

    // Re-entrancy guard: once the canonical store reports this project's design
    // as hydrated, never fetch again (the app state object identity changes as
    // hydration writes land, and this effect must not loop).
    const canonical = getProjectHydration();
    if (canonical.projectId === projectId && canonical.design === "loaded" && !canonical.error) {
      return undefined;
    }

    // Already hydrated in this session for this exact project — nothing to do.
    const alreadyHydrated =
      activeProjectId === projectId &&
      app?.isProjectHydrationReady === true &&
      Number.isFinite(Number(app?.roomDims?.widthM)) &&
      Number.isFinite(Number(app?.roomDims?.lengthM));

    if (alreadyHydrated) {
      completeDesignHydration(projectId);
      return undefined;
    }

    let cancelled = false;
    beginDesignHydration(projectId);

    (async () => {
      try {
        const results = await base44.entities.Project.filter({ id: projectId });
        if (cancelled) return;
        const project = Array.isArray(results) && results.length > 0 ? results[0] : null;
        if (!project) {
          failDesignHydration(projectId, "Project not found");
          return;
        }

        // Merge with the active ProjectVersion so per-version design fields come
        // from design_state, not from the legacy Project position.
        let merged = project;
        if (project.active_version_id) {
          try {
            const versions = await base44.entities.ProjectVersion.filter({ id: project.active_version_id });
            if (cancelled) return;
            if (Array.isArray(versions) && versions.length > 0) {
              merged = mergeProjectAndVersion(project, versions[0]);
            }
          } catch (versionError) {
            console.warn("[ProjectDesignHydrator] Version fetch failed, using project fields:", versionError);
          }
        }

        hydrateProjectIntoAppState(merged, app, {
          ...app,
          setDolbyPreset: app.setDolbyLayout,
        });
        app?.setProjectHydrationReady?.(true);

        if (!cancelled) {
          completeDesignHydration(projectId, {
            name: merged?.name || project.name || null,
            clientName: merged?.client_name || project.client_name || null,
            accountId: project.account_id || null,
            activeVersionId: project.active_version_id || null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        failDesignHydration(
          projectId,
          error?.message || "Project could not be loaded"
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, app]);

  return null;
}