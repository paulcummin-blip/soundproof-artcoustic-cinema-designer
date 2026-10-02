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
import { readProjectRecord, readProjectVersionRecord } from "@/components/state/projectReadCache";
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
import {
  clearCommercialEdits,
  createCommercialAuthority,
  getActiveCommercialAuthority,
  isCommercialHydrationComplete,
  markCommercialHydrated,
  normaliseCommercialSelections,
  setActiveCommercialAuthority,
} from "@/components/state/commercialHydrationAuthority";

export default function ProjectDesignHydrator({ projectId }) {
  const app = useAppState();
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    if (!projectId || !app) return undefined;

    // Re-entrancy guard: both the design and its commercial baseline must be
    // present. Preview refreshes/HMR can preserve the app state while resetting
    // the module-scoped commercial authority; treating that as fully hydrated
    // leaves the project behind the opening screen forever and, more importantly,
    // would make the autosave guard unable to prove its baseline.
    const canonical = getProjectHydration();
    const canonicalVersionId = canonical?.identity?.activeVersionId || null;
    const commercialReady = isCommercialHydrationComplete(
      getActiveCommercialAuthority(),
      projectId,
      canonicalVersionId,
    );
    if (
      canonical.projectId === projectId
      && canonical.design === "loaded"
      && !canonical.error
      && commercialReady
    ) {
      return undefined;
    }

    // Already hydrated in this session for this exact project — nothing to do
    // only when the commercial editing baseline survived as well. Otherwise the
    // authoritative project/version is re-read to rebuild that baseline safely.
    const alreadyHydrated =
      activeProjectId === projectId &&
      app?.isProjectHydrationReady === true &&
      Number.isFinite(Number(app?.roomDims?.widthM)) &&
      Number.isFinite(Number(app?.roomDims?.lengthM));

    if (alreadyHydrated && commercialReady) {
      completeDesignHydration(projectId);
      return undefined;
    }

    let cancelled = false;
    beginDesignHydration(projectId);

    (async () => {
      try {
        const project = await readProjectRecord(projectId);
        if (cancelled) return;
        if (!project) {
          failDesignHydration(projectId, "Project not found");
          return;
        }

        // Merge with the active ProjectVersion so per-version design fields come
        // from design_state, not from the legacy Project position.
        let merged = project;
        if (project.active_version_id) {
          try {
            const version = await readProjectVersionRecord(project.active_version_id);
            if (cancelled) return;
            if (version) {
              merged = mergeProjectAndVersion(project, version);
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

        // Commercial hydration: this version's priced selections are loaded, so
        // the price summary can never appear briefly defaulted and no save may
        // write an empty commercial value over a populated one. Marked before the
        // design hydration completes, so the opening gate reads it as loaded.
        clearCommercialEdits();
        setActiveCommercialAuthority(markCommercialHydrated(
          createCommercialAuthority({
            projectId,
            versionId: project.active_version_id || null,
          }),
          normaliseCommercialSelections(merged),
        ));

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