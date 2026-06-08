import { useCallback, useEffect } from "react";

/**
 * Handles the b44:overlay:setLCR window event and exposes window.Base44Overlay.setLCR.
 * Extracted from RoomVisualisation to keep that file under the line limit.
 */
export function useApplyLcrFromDetail({ onSetSpeakers, widthM, lengthM, getCanonicalRole }) {
  const applyLcrFromDetail = useCallback((detail) => {
    if (!detail || !onSetSpeakers) return;

    const W = widthM || 4.5;
    const L = lengthM || 6.0;

    const coords = detail.coords || {};
    const speakers = detail.speakers || {};

    const toRoom = (p) => (!p ? { x: W * 0.5, y: 0.03 * L } : { x: (p.x || 0.5) * W, y: (p.y || 0.03) * L });

    const Lpos = toRoom(coords.L);
    const Cpos = toRoom(coords.C);
    const Rpos = toRoom(coords.R);

    const Lmodel = speakers.L || "";
    const Cmodel = speakers.C || "";
    const Rmodel = speakers.R || "";

    // SAFE SEEDER: never overwrite existing LCR speakers.
    // Only fills in missing roles or missing models on existing speakers.
    onSetSpeakers((prev = []) => {
      const seedMap = {
        FL: { id: "auto-fl", role: "FL", model: Lmodel, position: { x: Lpos.x, y: Lpos.y } },
        FC: { id: "auto-fc", role: "FC", model: Cmodel, position: { x: Cpos.x, y: Cpos.y } },
        FR: { id: "auto-fr", role: "FR", model: Rmodel, position: { x: Rpos.x, y: Rpos.y } },
      };

      let changed = false;
      const next = prev.map(s => {
        const role = getCanonicalRole(s.role);
        if (!seedMap[role]) return s;
        const seed = seedMap[role];
        delete seedMap[role];
        if (!s.model && seed.model) {
          changed = true;
          return { ...s, model: seed.model };
        }
        return s;
      });

      const missing = Object.values(seedMap);
      if (missing.length > 0) changed = true;

      return changed ? [...next, ...missing] : prev;
    });
  }, [onSetSpeakers, widthM, lengthM, getCanonicalRole]);

  useEffect(() => {
    const handler = (e) => applyLcrFromDetail(e?.detail);
    window.addEventListener("b44:overlay:setLCR", handler);

    try {
      window.Base44Overlay = window.Base44Overlay || {};
      window.Base44Overlay.setLCR = applyLcrFromDetail;
    } catch (e) {
      if (typeof console !== 'undefined') if (globalThis.__B44_LOGS) console.error("Failed to attach Base44Overlay.setLCR:", e);
    }

    return () => {
      window.removeEventListener("b44:overlay:setLCR", handler);
      try {
        if (window.Base44Overlay && window.Base44Overlay.setLCR === applyLcrFromDetail) {
          delete window.Base44Overlay.setLCR;
        }
      } catch (e) {
        if (typeof console !== 'undefined') if (globalThis.__B44_LOGS) console.error("Failed to detach Base44Overlay.setLCR:", e);
      }
    };
  }, [applyLcrFromDetail]);
}