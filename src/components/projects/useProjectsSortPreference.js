// Per-user Projects page sort preference.
// Canonical authority: the signed-in user's profile via base44.auth
// (me() / updateMe()). Stored as `projects_sort_order` on the user record,
// so it survives refresh, logout/login, and later sessions — and is
// isolated per user (never written to project records).
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export const PROJECTS_SORT_OPTIONS = [
  "recent",
  "client",
  "project_az",
  "project_za",
];
export const PROJECTS_DEFAULT_SORT = "recent";

function isValidSort(v) {
  return typeof v === "string" && PROJECTS_SORT_OPTIONS.includes(v);
}

export function useProjectsSortPreference() {
  const [savedSort, setSavedSort] = useState(PROJECTS_DEFAULT_SORT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await base44.auth.me();
        const v = me?.projects_sort_order;
        if (mounted && isValidSort(v)) {
          setSavedSort(v);
        }
      } catch (_e) {
        // Not logged in or unavailable — keep default.
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function persistSort(value) {
    if (!isValidSort(value)) return;
    try {
      await base44.auth.updateMe({ projects_sort_order: value });
    } catch (_e) {
      // Best-effort persist; the visible list still updates immediately.
    }
  }

  return { savedSort, loaded, persistSort };
}