// src/components/versions/useProjectVersionsBatched.js
//
// Page-level hook for batch-loading and managing ProjectVersion records
// across ALL projects on the Projects page. Replaces the per-card
// useProjectVersions() N+1 pattern with a single batched query.
//
// Architecture:
//   1. Load all Projects (done by the page).
//   2. Migrate only unmigrated projects (active_version_id == null).
//   3. Batch-load ALL ProjectVersions for ALL projects in ≤50-ID batches.
//   4. Group versions by project_id in memory.
//   5. Pass grouped data down to cards as props — cards never fetch.
//
// Request count is O(ceil(N/50)) for versions + O(unmigrated count) for
// migration, NOT O(N×3). For 30 already-migrated projects: 1 version
// batch request. For 500: 10 version batch requests.

import { useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  MAX_VERSION_SLOTS,
  findNextEmptySlot,
  sanitiseVersionName,
  resolveActiveAfterDeletion,
} from "@/lib/versionAuthority";

const VERSION_BATCH_SIZE = 50;

export function useProjectVersionsBatched() {
  const [versionsByProject, setVersionsByProject] = useState({});
  const [loading, setLoading] = useState(false);

  // Ref mirror so createVersion can read the latest versions without
  // depending on the state in its useCallback.
  const versionsRef = useRef({});
  versionsRef.current = versionsByProject;

  // ─── Batch-load all versions for a list of project IDs ──────────────
  const loadVersionsForProjects = useCallback(async (projectIds) => {
    if (!projectIds || projectIds.length === 0) return {};

    const map = {};
    for (let i = 0; i < projectIds.length; i += VERSION_BATCH_SIZE) {
      const batch = projectIds.slice(i, i + VERSION_BATCH_SIZE);
      try {
        const versions = await base44.entities.ProjectVersion.filter(
          { project_id: batch },
          "version_number"
        );
        if (Array.isArray(versions)) {
          for (const v of versions) {
            if (!map[v.project_id]) map[v.project_id] = [];
            map[v.project_id].push(v);
          }
        }
      } catch (err) {
        console.warn("[useProjectVersionsBatched] Version batch fetch failed:", err);
      }
    }
    return map;
  }, []);

  // ─── Migrate unmigrated projects (active_version_id == null) ─────────
  // Returns a map of projectId -> active_version_id for newly migrated projects.
  const migrateUnmigrated = useCallback(async (projects) => {
    const unmigrated = (projects || []).filter((p) => p && !p.active_version_id);
    if (unmigrated.length === 0) return {};

    const migrated = {};
    await Promise.all(
      unmigrated.map(async (p) => {
        try {
          const res = await base44.functions.invoke("migrateProjectVersions", {
            project_id: p.id,
          });
          if (res?.data?.version_id) {
            migrated[p.id] = res.data.version_id;
          }
        } catch (err) {
          console.error("[useProjectVersionsBatched] Migration failed for", p.id, err);
        }
      })
    );
    return migrated;
  }, []);

  // ─── Full load: migrate, then batch-load all versions ────────────────
  // Returns { updatedProjects, versionMap } so the page can use the
  // updated project objects (with new active_version_ids) for card mapping.
  const loadAllVersions = useCallback(
    async (projects) => {
      if (!projects || projects.length === 0) {
        setVersionsByProject({});
        return { updatedProjects: [], versionMap: {} };
      }

      setLoading(true);
      try {
        // Step 1: Migrate unmigrated projects
        const migratedMap = await migrateUnmigrated(projects);

        // Update project objects with new active_version_id
        const updatedProjects = projects.map((p) =>
          migratedMap[p.id]
            ? { ...p, active_version_id: migratedMap[p.id] }
            : p
        );

        // Step 2: Batch-load all versions for all projects
        const projectIds = updatedProjects.map((p) => p.id);
        const versionMap = await loadVersionsForProjects(projectIds);

        setVersionsByProject(versionMap);
        return { updatedProjects, versionMap };
      } finally {
        setLoading(false);
      }
    },
    [migrateUnmigrated, loadVersionsForProjects]
  );

  // ─── Page-level version operations ──────────────────────────────────

  // Switch the active version for a project.
  const switchVersion = useCallback(async (projectId, versionId) => {
    try {
      await base44.entities.Project.update(projectId, {
        active_version_id: versionId,
      });
    } catch (err) {
      console.error("[useProjectVersionsBatched] Switch failed:", err);
      throw err;
    }
  }, []);

  // Create a new version by cloning the active version's design_state.
  // Updates local state; does not reload from server.
  const createVersion = useCallback(async (projectId, slotNumber, name) => {
    const sanitisedName = sanitiseVersionName(name);
    const slot = Number(slotNumber);
    if (!Number.isFinite(slot) || slot < 1 || slot > MAX_VERSION_SLOTS) {
      throw new Error(`Invalid slot number: ${slotNumber}`);
    }

    const versions = versionsRef.current[projectId] || [];

    // Find the source version to clone from (active version, or first)
    // We need the active_version_id; fetch the project to get it
    const projects = await base44.entities.Project.filter({ id: projectId });
    const project = projects?.[0];
    if (!project) throw new Error("Project not found");

    const sourceVersion =
      versions.find((v) => v.id === project.active_version_id) || versions[0];
    if (!sourceVersion) throw new Error("No source version to clone from");

    const accountId = project.account_id || "";

    const newVersion = await base44.entities.ProjectVersion.create({
      project_id: projectId,
      account_id: accountId,
      version_number: slot,
      version_name: sanitisedName,
      design_state: sourceVersion.design_state
        ? JSON.parse(JSON.stringify(sourceVersion.design_state))
        : {},
    });

    // Switch the project to the new version
    await base44.entities.Project.update(projectId, {
      active_version_id: newVersion.id,
    });

    // Update local state: add the new version to the map
    setVersionsByProject((prev) => {
      const next = { ...prev };
      const list = next[projectId] ? [...next[projectId]] : [];
      list.push(newVersion);
      next[projectId] = list;
      return next;
    });

    return newVersion;
  }, []);

  // Rename a version (local state update only, no reload).
  const renameVersion = useCallback(async (versionId, newName) => {
    const sanitised = sanitiseVersionName(newName);
    await base44.entities.ProjectVersion.update(versionId, {
      version_name: sanitised,
    });
    setVersionsByProject((prev) => {
      const next = { ...prev };
      for (const pid of Object.keys(next)) {
        next[pid] = next[pid].map((v) =>
          v.id === versionId ? { ...v, version_name: sanitised } : v
        );
      }
      return next;
    });
  }, []);

  // Delete a version (V2–V5 only). Updates local state.
  const deleteVersion = useCallback(async (projectId, versionId) => {
    const versions = versionsRef.current[projectId] || [];
    const target = versions.find((v) => v.id === versionId);
    if (!target) return;
    if (Number(target.version_number) === 1) {
      throw new Error("V1 cannot be deleted");
    }

    await base44.entities.ProjectVersion.delete(versionId);

    // If this was the active version, resolve the new active
    const projects = await base44.entities.Project.filter({ id: projectId });
    const project = projects?.[0];

    if (project && project.active_version_id === versionId) {
      const remaining = versions.filter((v) => v.id !== versionId);
      const next = resolveActiveAfterDeletion(
        remaining,
        Number(target.version_number)
      );
      if (next) {
        await base44.entities.Project.update(projectId, {
          active_version_id: next.id,
        });
      }
    }

    // Update local state: remove the deleted version
    setVersionsByProject((prev) => {
      const next = { ...prev };
      next[projectId] = (next[projectId] || []).filter((v) => v.id !== versionId);
      return next;
    });
  }, []);

  return {
    versionsByProject,
    loading,
    loadAllVersions,
    switchVersion,
    createVersion,
    renameVersion,
    deleteVersion,
  };
}