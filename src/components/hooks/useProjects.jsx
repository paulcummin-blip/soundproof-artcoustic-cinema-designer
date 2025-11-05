// components/hooks/useProjects.js
import { useEffect, useMemo, useRef, useState } from "react";

// Prefer the unified API layer if present, but don't crash if it's missing.
let ProjectAPI = null;
let fetchApi = null;
try {
  // Optional – if your repo has this (it does in our app), we'll use it.
  // If the import fails in this build, we keep graceful fallbacks below.
  // eslint-disable-next-line import/no-unresolved
  const api = require("@/components/net/api");
  ProjectAPI = api?.ProjectAPI ?? null;
  fetchApi = api?.fetchApi ?? null;
} catch { /* noop – stay resilient */ }

// --- Helpers ---------------------------------------------------------------

const CACHE_KEY = "useProjects:v1";
const CACHE_TTL_MS = 60 * 1000;

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return Array.isArray(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}
function writeCache(list) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data: list || [] })
    );
  } catch { /* ignore quota */ }
}

function toStringSafe(v, fallback = "") {
  if (v == null) return fallback;
  try {
    return String(v);
  } catch {
    return fallback;
  }
}

function normalizeProject(p) {
  // Always return a minimal, render-safe shape so React never sees weird values.
  const id = toStringSafe(p?.id || p?._id || p?.uuid || "", "");
  const name = toStringSafe(p?.name || p?.title || "Untitled Project", "Untitled Project");
  const client_name = toStringSafe(p?.client_name || p?.client || "", "");
  const layout = toStringSafe(
    p?.dolby_config || p?.dolby_layout || p?.audio_layout || "",
    ""
  );

  // Room dims: accept various server field names and coerce to numbers (or null)
  const L = Number(p?.room_length ?? p?.length ?? p?.room?.length ?? NaN);
  const W = Number(p?.room_width  ?? p?.width  ?? p?.room?.width  ?? NaN);
  const H = Number(p?.room_height ?? p?.height ?? p?.room?.height ?? NaN);

  return {
    id,
    name,
    client_name,
    dolby_config: layout || null,
    roomDims: {
      length: Number.isFinite(L) ? L : null,
      width:  Number.isFinite(W) ? W : null,
      height: Number.isFinite(H) ? H : null,
    },
    // Pass through common meta fields if present, but keep them render-safe primitives
    updated_date: p?.updated_date ?? p?.updatedAt ?? null,
    status: toStringSafe(p?.status ?? p?.project_status ?? "", ""),
    completed: Boolean(p?.completed ?? false),
  };
}

function coerceList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizeProject);
  // If server returns an envelope, try common shapes
  if (Array.isArray(raw.items)) return raw.items.map(normalizeProject);
  if (Array.isArray(raw.data))  return raw.data.map(normalizeProject);
  return [];
}

// --- Hook ------------------------------------------------------------------

/**
 * useProjects()
 * Returns { projects, isLoading, error, refresh }
 * - Never throws objects (prevents React #185)
 * - Normalizes/guards data so UI can render safely
 * - Uses session cache for instant paint
 */
export function useProjects() {
  const [projects, setProjects] = useState(() => readCache() || []);
  const [isLoading, setIsLoading] = useState(projects.length === 0);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const refresh = useMemo(() => {
    return async function refreshProjects() {
      // Abort any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setIsLoading(true);
      setError(null);

      try {
        // 1) Prefer our unified API if available
        if (ProjectAPI?.list) {
          const res = await ProjectAPI.list("-updated_date", 200, {}, { signal: ctrl.signal });
          if (!res.ok) {
            throw new Error(
              typeof res.error === "string" ? res.error : (res.error?.message || "Project list request failed")
            );
          }
          const list = coerceList(res.data);
          setProjects(list);
          writeCache(list);
          return;
        }

        // 2) Fallback to fetchApi if present, reading the same endpoint
        if (fetchApi) {
          const res = await fetchApi("/entities/Project?limit=200", { method: "GET", signal: ctrl.signal });
          if (!res.ok) {
            throw new Error(
              typeof res.error === "string" ? res.error : (res.error?.message || "Project list request failed")
            );
          }
          const list = coerceList(res.data);
          setProjects(list);
          writeCache(list);
          return;
        }

        // 3) Ultimate fallback (mock) – keeps UI working even if network layer missing
        // You can remove this block once network is guaranteed.
        const mock = [];
        setProjects(mock);
        writeCache(mock);
      } catch (e) {
        // Convert to string so React never sees an object as a child (prevents #185)
        const msg = e?.name === "AbortError" ? "Request cancelled" : (e?.message || "Unknown error");
        setError(new Error(msg));
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setIsLoading(false);
      }
    };
  }, []);

  useEffect(() => {
    // Paint from cache was handled in useState initializer; now refresh in background
    refresh();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [refresh]);

  return { projects, isLoading, error, refresh };
}

export default useProjects;