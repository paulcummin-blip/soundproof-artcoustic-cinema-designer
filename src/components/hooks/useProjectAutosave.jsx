
import { useEffect, useMemo, useRef, useState } from "react";
import { serializeProject } from "@/components/utils/serializeProject";
import { fetchApi } from "@/components/net/api";

/**
 * @typedef {"idle"|"dirty"|"saving"|"saved"|"error"} AutosaveStatus
 */

/**
 * Debounced autosave for Project entity with create-once then update.
 * @param {Object} opts
 * @param {string|null} opts.projectId
 * @param {string} opts.projectName
 * @param {string} opts.dolbyPreset
 * @param {any} opts.dimensions
 * @param {any} opts.screen
 * @param {Array} opts.seatingPositions
 * @param {Array} opts.roomElements
 * @param {Array} opts.subwoofers
 * @param {boolean} opts.showZones
 * @param {boolean} opts.showAngles
 * @param {boolean} opts.isHydrating
 * @param {(id:string)=>void} [opts.onProjectCreated]
 * @param {number} [opts.debounceMs]
 * @returns {AutosaveStatus}
 */
export function useProjectAutosave(opts) {
  const {
    projectId, projectName, dolbyPreset,
    dimensions, screen,
    seatingPositions, roomElements, subwoofers,
    showZones,
    showAngles,
    isHydrating, onProjectCreated, debounceMs = 800,
  } = opts || {};

  const [status, setStatus] = useState("idle");
  const timerRef = useRef(null);
  const inflightRef = useRef(null);
  const lastHashRef = useRef("");

  const payload = useMemo(() => serializeProject({
    name: projectName,
    dimensions, screen,
    seatingPositions, roomElements, subwoofers,
    dolbyPreset,
    showZones,
    showAngles,
  }), [
    projectName, dimensions, screen,
    seatingPositions, roomElements, subwoofers, dolbyPreset,
    showZones,
    showAngles,
  ]);

  const hash = useMemo(() => {
    try { return JSON.stringify(payload); } catch { return String(Date.now()); }
  }, [payload]);

  useEffect(() => {
    if (isHydrating) return;
    if (hash === lastHashRef.current) return;

    setStatus("dirty");
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      if (inflightRef.current) return;

      setStatus("saving");
      try {
        let res;
        if (projectId) {
          res = await (inflightRef.current = fetchApi(
            `/entities/Project/${encodeURIComponent(projectId)}`,
            { method: "PUT", body: payload }
          ));
          if (!res?.ok && (res?.status === 405 || res?.status === 404)) {
            res = await (inflightRef.current = fetchApi(
              `/entities/Project/${encodeURIComponent(projectId)}`,
              { method: "PATCH", body: payload }
            ));
          }
        } else {
          res = await (inflightRef.current = fetchApi(
            `/entities/Project`,
            { method: "POST", body: payload }
          ));
        }

        inflightRef.current = null;
        if (!res?.ok) throw new Error(res?.error || "Save failed");

        if (!projectId && res?.data?.id && typeof onProjectCreated === "function") {
          onProjectCreated(res.data.id);
        }

        lastHashRef.current = hash;
        setStatus("saved");
      } catch (_e) {
        inflightRef.current = null;
        setStatus("error");
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [hash, projectId, isHydrating, debounceMs, payload, onProjectCreated]);

  // Flush on hide/unload (unchanged)
  useEffect(() => {
    const flush = async () => {
      if (isHydrating) return;
      if (hash === lastHashRef.current) return;
      try {
        const path = projectId
          ? `/entities/Project/${encodeURIComponent(projectId)}`
          : `/entities/Project`;
        const method = projectId ? "PUT" : "POST";
        await fetchApi(path, { method, body: payload });
        lastHashRef.current = hash;
      } catch {
        // swallow
      }
    };
    const onHide = () => { void flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, [hash, projectId, isHydrating, payload]);

  return status;
}
