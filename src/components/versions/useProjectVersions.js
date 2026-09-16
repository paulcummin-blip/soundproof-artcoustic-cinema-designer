// src/components/versions/useProjectVersions.js
//
// React hook for managing ProjectVersion records.
// Provides loading, creating, switching, renaming, and deleting versions.
//
// Architecture:
//   Project.active_version_id is the single source of truth.
//   There is NO is_active flag on ProjectVersion.
//   design_state contains every field required to reconstruct a design version.

import { useState, useCallback, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  MAX_VERSION_SLOTS,
  VERSION_NAME_MAX_LENGTH,
  DEFAULT_V1_NAME,
  buildSlotGrid,
  findNextEmptySlot,
  resolveActiveAfterDeletion,
  sanitiseVersionName,
} from "@/lib/versionAuthority";

// Lazy-migrate a single project to V1 if it hasn't been migrated yet.
// Returns the active version ID.
async function ensureMigrated(projectId) {
  if (!projectId) return null;
  try {
    const res = await base44.functions.invoke("migrateProjectVersions", {
      project_id: projectId,
    });
    return res?.data?.version_id || null;
  } catch (err) {
    console.error("[useProjectVersions] Migration failed:", err);
    return null;
  }
}

export function useProjectVersions(projectId) {
  const [versions, setVersions] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Load all versions for a project + resolve the active one
  const loadVersions = useCallback(async (pid) => {
    if (!pid) {
      setVersions([]);
      setActiveVersionId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, ensure the project is migrated (lazy V1 creation)
      await ensureMigrated(pid);

      // Load the project to get active_version_id
      const projects = await base44.entities.Project.filter({ id: pid });
      const project = projects?.[0];
      if (!project) {
        setVersions([]);
        setActiveVersionId(null);
        setLoading(false);
        return;
      }

      // If still no active_version_id after migration, something went wrong
      if (!project.active_version_id) {
        console.warn("[useProjectVersions] No active_version_id after migration");
        setVersions([]);
        setActiveVersionId(null);
        setLoading(false);
        return;
      }

      // Load all versions for this project
      const versionRecords = await base44.entities.ProjectVersion.filter(
        { project_id: pid },
        "version_number"
      );

      if (!mountedRef.current) return;

      setVersions(versionRecords || []);
      setActiveVersionId(project.active_version_id);
    } catch (err) {
      console.error("[useProjectVersions] Load failed:", err);
      if (mountedRef.current) {
        setError(err.message || "Failed to load versions");
        setVersions([]);
        setActiveVersionId(null);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Load on mount / projectId change
  useEffect(() => {
    mountedRef.current = true;
    loadVersions(projectId);
    return () => {
      mountedRef.current = false;
    };
  }, [projectId, loadVersions]);

  // ─── Version operations ───────────────────────────────────────────────

  // Switch the active version. Updates Project.active_version_id.
  const switchVersion = useCallback(
    async (versionId) => {
      if (!projectId || !versionId) return;
      try {
        await base44.entities.Project.update(projectId, {
          active_version_id: versionId,
        });
        if (mountedRef.current) setActiveVersionId(versionId);
      } catch (err) {
        console.error("[useProjectVersions] Switch failed:", err);
        throw err;
      }
    },
    [projectId]
  );

  // Create a new version by cloning the active version's design_state.
  // slotNumber: 2–5 (the target slot)
  // name: custom version name (sanitised to 50 chars)
  const createVersion = useCallback(
    async (slotNumber, name) => {
      if (!projectId) return null;
      const sanitisedName = sanitiseVersionName(name);
      const slot = Number(slotNumber);
      if (!Number.isFinite(slot) || slot < 1 || slot > MAX_VERSION_SLOTS) {
        throw new Error(`Invalid slot number: ${slotNumber}`);
      }

      try {
        // Get the active version to clone from
        const sourceVersion = versions.find((v) => v.id === activeVersionId) || versions[0];
        if (!sourceVersion) {
          throw new Error("No source version to clone from");
        }

        // Get the project for account_id
        const projects = await base44.entities.Project.filter({ id: projectId });
        const project = projects?.[0];
        const accountId = project?.account_id || "";

        // Create the new version with a deep clone of the design_state
        const newVersion = await base44.entities.ProjectVersion.create({
          project_id: projectId,
          account_id: accountId,
          version_number: slot,
          version_name: sanitisedName,
          design_state: sourceVersion.design_state
            ? JSON.parse(JSON.stringify(sourceVersion.design_state))
            : {},
        });

        // Switch to the new version
        await base44.entities.Project.update(projectId, {
          active_version_id: newVersion.id,
        });

        // Reload versions
        await loadVersions(projectId);
        return newVersion;
      } catch (err) {
        console.error("[useProjectVersions] Create version failed:", err);
        throw err;
      }
    },
    [projectId, versions, activeVersionId, loadVersions]
  );

  // Overwrite an existing version's design_state with the active version's.
  const overwriteVersion = useCallback(
    async (targetVersionId) => {
      if (!projectId || !targetVersionId) return;
      try {
        const sourceVersion = versions.find((v) => v.id === activeVersionId) || versions[0];
        if (!sourceVersion) throw new Error("No source version to clone from");

        await base44.entities.ProjectVersion.update(targetVersionId, {
          design_state: sourceVersion.design_state
            ? JSON.parse(JSON.stringify(sourceVersion.design_state))
            : {},
        });

        // Switch to the overwritten version
        await base44.entities.Project.update(projectId, {
          active_version_id: targetVersionId,
        });

        await loadVersions(projectId);
      } catch (err) {
        console.error("[useProjectVersions] Overwrite version failed:", err);
        throw err;
      }
    },
    [projectId, versions, activeVersionId, loadVersions]
  );

  // Rename a version (max 50 characters).
  const renameVersion = useCallback(
    async (versionId, newName) => {
      if (!versionId) return;
      const sanitised = sanitiseVersionName(newName);
      try {
        await base44.entities.ProjectVersion.update(versionId, {
          version_name: sanitised,
        });
        // Update local state without full reload
        if (mountedRef.current) {
          setVersions((prev) =>
            prev.map((v) => (v.id === versionId ? { ...v, version_name: sanitised } : v))
          );
        }
      } catch (err) {
        console.error("[useProjectVersions] Rename failed:", err);
        throw err;
      }
    },
    []
  );

  // Delete a version (V2–V5 only). V1 cannot be deleted.
  // If the active version is deleted, activation moves to the previous
  // occupied version, falling back to V1 if none exists.
  const deleteVersion = useCallback(
    async (versionId) => {
      if (!projectId || !versionId) return;
      const target = versions.find((v) => v.id === versionId);
      if (!target) return;
      if (Number(target.version_number) === 1) {
        throw new Error("V1 cannot be deleted");
      }

      try {
        // Delete the version
        await base44.entities.ProjectVersion.delete(versionId);

        // If this was the active version, resolve the new active
        if (target.id === activeVersionId) {
          const remaining = versions.filter((v) => v.id !== versionId);
          const next = resolveActiveAfterDeletion(remaining, Number(target.version_number));
          if (next) {
            await base44.entities.Project.update(projectId, {
              active_version_id: next.id,
            });
            if (mountedRef.current) setActiveVersionId(next.id);
          }
        }

        // Reload versions
        await loadVersions(projectId);
      } catch (err) {
        console.error("[useProjectVersions] Delete failed:", err);
        throw err;
      }
    },
    [projectId, versions, activeVersionId, loadVersions]
  );

  // ─── Derived data ─────────────────────────────────────────────────────

  const slotGrid = buildSlotGrid(versions);
  const activeVersion = versions.find((v) => v.id === activeVersionId) || null;
  const nextEmptySlot = findNextEmptySlot(versions);
  const canCreateVersion = nextEmptySlot !== null;

  return {
    versions,
    activeVersionId,
    activeVersion,
    slotGrid,
    nextEmptySlot,
    canCreateVersion,
    loading,
    error,
    // Operations
    loadVersions: () => loadVersions(projectId),
    switchVersion,
    createVersion,
    overwriteVersion,
    renameVersion,
    deleteVersion,
  };
}