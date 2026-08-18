import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DEFAULT_STATUSES } from "./statusDefaults";

// Module-level guard so concurrent mounts (e.g. Projects page + NewProjectDialog)
// only seed defaults once per scope.
const _seedingPromises = {};
async function ensureSeeded(scopeId) {
  if (_seedingPromises[scopeId]) return _seedingPromises[scopeId];
  _seedingPromises[scopeId] = (async () => {
    try {
      const existing = await base44.entities.ProjectStatus.filter({ account_id: scopeId });
      if (!existing || existing.length === 0) {
        await Promise.all(
          DEFAULT_STATUSES.map((d) =>
            base44.entities.ProjectStatus.create({ ...d, account_id: scopeId })
          )
        );
      }
    } catch (err) {
      console.warn("[useProjectStatuses] seed failed (entity unavailable?):", err);
    } finally {
      delete _seedingPromises[scopeId];
    }
  })();
  return _seedingPromises[scopeId];
}

function sortStatuses(list) {
  return list.slice().sort((a, b) => {
    const aArch = a.is_archived ? 1 : 0;
    const bArch = b.is_archived ? 1 : 0;
    if (aArch !== bArch) return aArch - bArch;
    const ao = a.sort_order ?? 999;
    const bo = b.sort_order ?? 999;
    if (ao !== bo) return ao - bo;
    return (a.label || "").localeCompare(b.label || "");
  });
}

// Loads (and seeds) the ProjectStatus definitions for the current account/workspace.
// Returns the active+archived status list plus CRUD helpers.
export function useProjectStatuses() {
  const { user } = useAuth();
  const scopeId = user?.account_id || user?.id || "global";

  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await ensureSeeded(scopeId);
      const records = await base44.entities.ProjectStatus.filter({ account_id: scopeId });
      let list = (records || []).slice();
      if (list.length === 0) {
        // Entity unavailable or empty — fall back to in-memory defaults so the
        // UI still works (e.g. before the entity is deployed).
        list = DEFAULT_STATUSES.map((d) => ({ ...d, account_id: scopeId }));
      }
      setStatuses(sortStatuses(list));
    } catch (err) {
      console.error("[useProjectStatuses] load failed:", err);
      setStatuses(DEFAULT_STATUSES.map((d) => ({ ...d, account_id: scopeId })));
    } finally {
      setLoading(false);
    }
  }, [scopeId]);

  useEffect(() => {
    load();
  }, [load]);

  const addStatus = useCallback(
    async (label, color) => {
      const trimmed = (label || "").trim();
      if (!trimmed) return;
      const maxOrder = statuses.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0);
      const status_id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const created = await base44.entities.ProjectStatus.create({
        status_id,
        label: trimmed,
        sort_order: maxOrder + 1,
        is_archived: false,
        color: color || "#625143",
        account_id: scopeId,
        is_default: false,
      });
      setStatuses((arr) => sortStatuses([...arr, created]));
      return created;
    },
    [scopeId, statuses]
  );

  const renameStatus = useCallback(async (id, newLabel) => {
    const trimmed = (newLabel || "").trim();
    if (!trimmed) return;
    const updated = await base44.entities.ProjectStatus.update(id, { label: trimmed });
    setStatuses((arr) =>
      sortStatuses(arr.map((s) => (s.id === id ? { ...s, label: updated.label } : s)))
    );
  }, []);

  const recolorStatus = useCallback(async (id, newColor) => {
    if (!newColor) return;
    const updated = await base44.entities.ProjectStatus.update(id, { color: newColor });
    setStatuses((arr) =>
      sortStatuses(arr.map((s) => (s.id === id ? { ...s, color: updated.color } : s)))
    );
    return updated;
  }, []);

  const reorderStatuses = useCallback(async (orderedIds) => {
    // orderedIds: array of ProjectStatus record .id values in desired order
    await Promise.all(
      orderedIds.map((rid, i) =>
        base44.entities.ProjectStatus.update(rid, { sort_order: i + 1 })
      )
    );
    setStatuses((arr) => {
      const map = new Map(arr.map((s) => [s.id, s]));
      const reordered = orderedIds.map((rid, i) => ({
        ...map.get(rid),
        sort_order: i + 1,
      }));
      const rest = arr.filter((s) => !orderedIds.includes(s.id));
      return sortStatuses([...reordered, ...rest]);
    });
  }, []);

  const archiveStatus = useCallback(async (id) => {
    const updated = await base44.entities.ProjectStatus.update(id, { is_archived: true });
    setStatuses((arr) =>
      sortStatuses(arr.map((s) => (s.id === id ? { ...s, is_archived: true } : s)))
    );
    return updated;
  }, []);

  const unarchiveStatus = useCallback(async (id) => {
    const updated = await base44.entities.ProjectStatus.update(id, { is_archived: false });
    setStatuses((arr) =>
      sortStatuses(arr.map((s) => (s.id === id ? { ...s, is_archived: false } : s)))
    );
    return updated;
  }, []);

  return {
    scopeId,
    statuses,
    activeStatuses: statuses.filter((s) => !s.is_archived),
    archivedStatuses: statuses.filter((s) => s.is_archived),
    loading,
    reload: load,
    addStatus,
    renameStatus,
    recolorStatus,
    reorderStatuses,
    archiveStatus,
    unarchiveStatus,
  };
}