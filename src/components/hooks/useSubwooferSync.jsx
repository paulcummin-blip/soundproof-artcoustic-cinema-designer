import { useEffect } from "react";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";

/**
 * Syncs the subwoofer placement array from frontSubsCfg / rearSubsCfg config objects.
 * Extracted from RoomDesignerWithState.
 */
export function useSubwooferSync({ appState, stableDimensions, frontSubsCfg, rearSubsCfg }) {
  useEffect(() => {
    const setSubwoofers = appState?.setSubwoofers;
    if (typeof setSubwoofers !== "function") return;
    const widthM = Number(appState?.roomDims?.widthM) || Number(stableDimensions?.width) || 4.5;
    const lengthM = Number(appState?.roomDims?.lengthM) || Number(stableDimensions?.length) || 6.0;
    const normQty = (q) => Math.max(0, Math.min(8, Number(q?.count ?? q?.qty ?? q) || 0));
    const normModel = (m) => String(m || "").trim();
    const frontModel = normModel(frontSubsCfg?.model);
    const rearModel = normModel(rearSubsCfg?.model);
    const frontQty = normQty(frontSubsCfg);
    const rearQty = normQty(rearSubsCfg);
    const hasPlacedSubs = Array.isArray(appState?.subwoofers) && appState.subwoofers.length > 0;
    const cfgExplicitNone =
      (frontSubsCfg && Object.prototype.hasOwnProperty.call(frontSubsCfg, "model") &&
        Object.prototype.hasOwnProperty.call(frontSubsCfg, "count") &&
        !String(frontSubsCfg.model || "").trim() && Number(frontSubsCfg.count) === 0) &&
      (rearSubsCfg && Object.prototype.hasOwnProperty.call(rearSubsCfg, "model") &&
        Object.prototype.hasOwnProperty.call(rearSubsCfg, "count") &&
        !String(rearSubsCfg.model || "").trim() && Number(rearSubsCfg.count) === 0);

    if ((!frontModel || frontQty === 0) && (!rearModel || rearQty === 0)) {
      setSubwoofers((prev) => (Array.isArray(prev) && prev.length ? [] : prev));
      return;
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const EPS = 0.01;
    const getDepthM = (model) => {
      try {
        const dims = getModelDimsM?.(model) || {};
        const d = Number(dims?.depthM);
        return Number.isFinite(d) && d > 0 ? d : 0.30;
      } catch (_) { return 0.30; }
    };
    const wallPinnedY = (wall, model) => {
      const d = getDepthM(model);
      const halfD = d / 2;
      if (wall === 'front') return halfD + EPS;
      if (wall === 'rear') return Math.max(halfD + EPS, lengthM - halfD - EPS);
      return 0.30;
    };
    const makeDefaultXs = (qty) => {
      if (qty <= 0) return [];
      if (qty === 1) return [widthM * 0.5];
      const margin = widthM * 0.15;
      const span = Math.max(0.01, widthM - margin * 2);
      return Array.from({ length: qty }, (_, i) => margin + span * (i / (qty - 1)));
    };
    const safePositionsArray = (arr) => (Array.isArray(arr) ? arr : []);
    const buildGroup = (group, qty, model, cfgPositions, existingSubs) => {
      if (!model || qty <= 0) return [];
      const defaultsX = makeDefaultXs(qty);
      const cfgPos = safePositionsArray(cfgPositions);
      const yPinned = wallPinnedY(group === 'front' ? 'front' : 'rear', model);
      const minX = EPS; const maxX = Math.max(EPS, widthM - EPS);
      return Array.from({ length: qty }, (_, i) => {
        const prev = existingSubs?.[i] || null;
        const xFromCfg = Number(cfgPos?.[i]?.x);
        const xFromPrev = Number(prev?.position?.x);
        const xFromDefault = Number(defaultsX?.[i]);
        const pickedX = Number.isFinite(xFromCfg) ? xFromCfg : (Number.isFinite(xFromPrev) ? xFromPrev : xFromDefault);
        const finalX = clamp(pickedX, minX, maxX);
        return {
          ...(prev ? { ...prev } : {}),
          id: `sub-${group}-${i + 1}`,
          role: group === 'front' ? `SUBF${i + 1}` : `SUBR${i + 1}`,
          group, model,
          position: { x: finalX, y: yPinned, z: Number.isFinite(prev?.position?.z) ? prev.position.z : 0 }
        };
      });
    };

    setSubwoofers((prevAll) => {
      const prevList = Array.isArray(prevAll) ? prevAll : [];
      const prevFront = prevList.filter(s => s?.group === 'front');
      const prevRear = prevList.filter(s => s?.group === 'rear');
      const nextFront = buildGroup('front', frontQty, frontModel, frontSubsCfg?.positions, prevFront);
      const nextRear = buildGroup('rear', rearQty, rearModel, rearSubsCfg?.positions, prevRear);
      const next = [...nextFront, ...nextRear];
      const sameLen = prevList.length === next.length;
      const same = sameLen && prevList.every((p, i) => {
        const n = next[i];
        if (!p || !n) return false;
        const px = Number(p?.position?.x), py = Number(p?.position?.y);
        const nx = Number(n?.position?.x), ny = Number(n?.position?.y);
        const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.001;
        return String(p.id) === String(n.id) && String(p.group) === String(n.group) &&
          String(p.model) === String(n.model) && close(px, nx) && close(py, ny);
      });
      return same ? prevAll : next;
    });
  }, [
    appState?.setSubwoofers,
    appState?.roomDims?.widthM, appState?.roomDims?.lengthM,
    stableDimensions?.width, stableDimensions?.length,
    frontSubsCfg?.model, frontSubsCfg?.count, frontSubsCfg?.positions,
    rearSubsCfg?.model, rearSubsCfg?.count, rearSubsCfg?.positions,
  ]);
}