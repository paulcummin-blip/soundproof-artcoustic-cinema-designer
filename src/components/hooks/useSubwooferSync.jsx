import { useEffect, useRef } from "react";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { bassInputAdapter, isValidInstanceArray } from "@/components/utils/subwooferInstanceMigration";
import {
  applyModelChange,
  applyCountChange,
  applyBottomHeightChange,
  applyPlacementPreset,
  mirrorInstancesToCfg,
  detectCfgChanges,
} from "@/components/utils/subwooferInstanceCompatibility";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const WALL_BUFFER_M = 0.01;
const SUB_WIDTH_FALLBACK_M = 0.50;

/**
 * Syncs the subwoofer placement array from frontSubsCfg / rearSubsCfg config objects.
 * Extracted from RoomDesignerWithState.
 *
 * AUTHORITY GATE:
 *   When valid subwooferInstances exist (Rule A), CFG is NOT the analysis authority.
 *   This effect does NOT overwrite appState.subwoofers from CFG. Instead,
 *   appState.subwoofers is derived from instances via bassInputAdapter.
 *
 *   When instances are absent (Rule B), this effect runs normally to populate
 *   appState.subwoofers from CFG for backward compatibility. The one-time
 *   normalisation in hydrateProjectIntoAppState will create runtime instances
 *   from CFG on the next load.
 *
 *   The destructive reverse-sync path (subwoofers → subwooferInstances) has
 *   been REMOVED. Valid instances are never regenerated from CFG.
 */
export function useSubwooferSync({ appState, stableDimensions, frontSubsCfg, rearSubsCfg }) {
  const prevFrontCfgRef = useRef(frontSubsCfg);
  const prevRearCfgRef = useRef(rearSubsCfg);

  useEffect(() => {
    const setSubwoofers = appState?.setSubwoofers;
    const setSubwooferInstances = appState?.setSubwooferInstances;
    const setFrontSubsCfg = appState?.setFrontSubsCfg;
    const setRearSubsCfg = appState?.setRearSubsCfg;
    if (typeof setSubwoofers !== "function") return;

    // AUTHORITY GATE: If valid subwooferInstances exist, derive subwoofers from
    // instances via bassInputAdapter. CFG must NOT overwrite.
    const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
    if (isValidInstanceArray(instances)) {
      // Detect CFG changes and dispatch compatibility actions to instances
      const frontChanges = detectCfgChanges(prevFrontCfgRef.current, frontSubsCfg);
      const rearChanges = detectCfgChanges(prevRearCfgRef.current, rearSubsCfg);

      let updatedInstances = instances;
      let frontChanged = false;
      let rearChanged = false;

      if (frontChanges.model) {
        updatedInstances = applyModelChange(updatedInstances, "front", frontSubsCfg.model);
        frontChanged = true;
      }
      if (frontChanges.count) {
        updatedInstances = applyCountChange(updatedInstances, "front", frontSubsCfg.count, frontSubsCfg, appState.roomDims);
        frontChanged = true;
      }
      if (frontChanges.bottomHeightM) {
        updatedInstances = applyBottomHeightChange(updatedInstances, "front", frontSubsCfg.bottomHeightM);
        frontChanged = true;
      }
      if (frontChanges.placementMode) {
        updatedInstances = applyPlacementPreset(updatedInstances, "front", frontSubsCfg, appState.roomDims);
        frontChanged = true;
      }

      if (rearChanges.model) {
        updatedInstances = applyModelChange(updatedInstances, "rear", rearSubsCfg.model);
        rearChanged = true;
      }
      if (rearChanges.count) {
        updatedInstances = applyCountChange(updatedInstances, "rear", rearSubsCfg.count, rearSubsCfg, appState.roomDims);
        rearChanged = true;
      }
      if (rearChanges.bottomHeightM) {
        updatedInstances = applyBottomHeightChange(updatedInstances, "rear", rearSubsCfg.bottomHeightM);
        rearChanged = true;
      }
      if (rearChanges.placementMode) {
        updatedInstances = applyPlacementPreset(updatedInstances, "rear", rearSubsCfg, appState.roomDims);
        rearChanged = true;
      }

      if (frontChanged || rearChanged) {
        if (typeof setSubwooferInstances === "function") {
          setSubwooferInstances(updatedInstances);
        }
        // Mirror instances → CFG for positions (preserves placementMode, isManual)
        const mirrored = mirrorInstancesToCfg(updatedInstances, frontSubsCfg, rearSubsCfg);
        if (frontChanged && typeof setFrontSubsCfg === "function") {
          setFrontSubsCfg(mirrored.front);
          prevFrontCfgRef.current = mirrored.front;
        } else {
          prevFrontCfgRef.current = frontSubsCfg;
        }
        if (rearChanged && typeof setRearSubsCfg === "function") {
          setRearSubsCfg(mirrored.rear);
          prevRearCfgRef.current = mirrored.rear;
        } else {
          prevRearCfgRef.current = rearSubsCfg;
        }
      } else {
        prevFrontCfgRef.current = frontSubsCfg;
        prevRearCfgRef.current = rearSubsCfg;
      }

      // Always derive subwoofers from (possibly updated) instances
      const adapted = bassInputAdapter(updatedInstances);
      const current = Array.isArray(appState?.subwoofers) ? appState.subwoofers : [];
      const same =
        adapted.length === current.length &&
        adapted.every((s, i) => {
          const c = current[i];
          if (!c) return false;
          return (
            String(s.id) === String(c.id) &&
            String(s.model) === String(c.model) &&
            Math.abs((s.x ?? 0) - (c.x ?? 0)) < 0.001 &&
            Math.abs((s.y ?? 0) - (c.y ?? 0)) < 0.001 &&
            Math.abs((s.z ?? 0) - (c.z ?? 0)) < 0.001
          );
        });
      if (!same) setSubwoofers(adapted);
      return; // Do NOT run CFG → subwoofers when instances are canonical
    }

    // Update refs for legacy path too
    prevFrontCfgRef.current = frontSubsCfg;
    prevRearCfgRef.current = rearSubsCfg;

    // --- LEGACY PATH: instances absent, rebuild from CFG (Rule B) ---
    const widthM = Number(appState?.roomDims?.widthM) || Number(stableDimensions?.width) || 4.5;
    const lengthM = Number(appState?.roomDims?.lengthM) || Number(stableDimensions?.length) || 6.0;
    const normQty = (q) => Math.max(0, Math.min(8, Number(q?.count ?? q?.qty ?? q) || 0));
    const normModel = (m) => String(m || "").trim();
    const frontModel = normModel(frontSubsCfg?.model);
    const rearModel = normModel(rearSubsCfg?.model);
    const frontQty = normQty(frontSubsCfg);
    const rearQty = normQty(rearSubsCfg);

    if ((!frontModel || frontQty === 0) && (!rearModel || rearQty === 0)) {
      setSubwoofers((prev) => (Array.isArray(prev) && prev.length ? [] : prev));
      return;
    }

    const EPS = 0.01;
    const getDepthM = (model) => {
      try {
        const dims = getModelDimsM?.(model) || {};
        const d = Number(dims?.depthM);
        return Number.isFinite(d) && d > 0 ? d : 0.30;
      } catch (_) { return 0.30; }
    };
    const getSubWidthM = (model) => {
      try {
        const dims = getModelDimsM?.(model) || {};
        const w = Number(dims?.widthM);
        return Number.isFinite(w) && w > 0 ? w : SUB_WIDTH_FALLBACK_M;
      } catch (_) { return SUB_WIDTH_FALLBACK_M; }
    };
    const wallPinnedY = (wall, model) => {
      const d = getDepthM(model);
      const halfD = d / 2;
      if (wall === 'front') return halfD + EPS;
      if (wall === 'rear') return Math.max(halfD + EPS, lengthM - halfD - EPS);
      return 0.30;
    };
    const makePlacementXs = (qty, placementMode, model) => {
      if (qty <= 0) return [];
      if (placementMode === 'default') {
        if (qty === 1) return [widthM * 0.5];
        const margin = widthM * 0.15;
        const span = Math.max(0.01, widthM - margin * 2);
        return Array.from({ length: qty }, (_, i) => margin + span * (i / (qty - 1)));
      }

      const subWidth = getSubWidthM(model);
      const minX = WALL_BUFFER_M + subWidth / 2;
      const maxX = widthM - WALL_BUFFER_M - subWidth / 2;
      const left = minX;
      const right = maxX;
      const safeQty = Math.max(1, Number(qty) || 0);

      const patterns = {
        quarter: safeQty === 1
          ? [widthM * 0.5]
          : [widthM * 0.25, widthM * 0.75],
        corners: safeQty === 1
          ? [left]
          : [left, right],
        midpoint: [widthM * 0.5],
        sixth: safeQty === 1
          ? [widthM * 0.5]
          : [widthM / 6, widthM * 5 / 6],
        asymmetric: safeQty === 1
          ? [widthM * 0.38]
          : [widthM * 0.32, widthM * 0.78],
      };

      const selected = patterns[placementMode] || patterns.quarter;
      return selected.map((x) => clamp(x, minX, maxX));
    };
    const safePositionsArray = (arr) => (Array.isArray(arr) ? arr : []);
    const buildGroup = (group, qty, cfg, existingSubs) => {
      const model = String(cfg?.model || '').trim();
      if (!model || qty <= 0) return [];
      const placementMode = String(cfg?.placementMode || 'default').trim() || 'default';
      const isManual = cfg?.isManual === true || placementMode === 'manual';
      const defaultsX = makePlacementXs(qty, placementMode, model);
      const cfgPos = safePositionsArray(cfg?.positions);
      const yPinned = wallPinnedY(group === 'front' ? 'front' : 'rear', model);
      const subWidth = getSubWidthM(model);
      const minX = WALL_BUFFER_M + subWidth / 2;
      const maxX = widthM - WALL_BUFFER_M - subWidth / 2;
      const dims = getModelDimsM?.(model) || {};
      // Use orientation-aware metadata for heightM so position.z matches what FrontElevation/SideElevation render
      const subMeta = getSpeakerModelMeta(model, cfg?.orientation) || {};
      const subHeight = Number(subMeta.heightM);
      const resolvedSubHeight = Number.isFinite(subHeight) && subHeight > 0 ? subHeight : 0.50;
      const rawBottom = Number(cfg?.bottomHeightM);
      const bottom = Number.isFinite(rawBottom)
        ? Math.max(0, Math.min(2.5, rawBottom))
        : (cfg?.mountMode === 'wall' ? 0.80 : 0.05);
      const z = bottom + resolvedSubHeight / 2;
      const countChanged = qty !== (existingSubs?.length ?? 0);
      const buildCount = qty;
      return Array.from({ length: buildCount }, (_, i) => {
        const prev = existingSubs?.[i] || null;
        const xFromCfg = Number(cfgPos?.[i]?.x);
        const xFromPrev = Number(prev?.position?.x);
        const xFromDefault = Number(defaultsX?.[i]);
        // Priority: saved cfg position > live prev position > computed default.
        // A saved cfg position is always honoured when finite, regardless of placementMode,
        // so that positions persisted to the project record survive reload without being
        // overwritten by pattern-based defaults.
        const pickedX = Number.isFinite(xFromCfg)
          ? xFromCfg
          : (Number.isFinite(xFromPrev) && !countChanged)
            ? xFromPrev
            : xFromDefault;
        const finalX = clamp(pickedX, minX, maxX);
        const savedY = Number(cfgPos?.[i]?.y);
        const finalY = Number.isFinite(savedY) ? clamp(savedY, WALL_BUFFER_M, lengthM - WALL_BUFFER_M) : yPinned;
        return {
          ...(prev ? { ...prev } : {}),
          id: `sub-${group}-${i + 1}`,
          role: group === 'front' ? `SUBF${i + 1}` : `SUBR${i + 1}`,
          group, model,
          bottomHeightM: bottom,
          position: { x: finalX, y: finalY, z }
        };
      });
    };

    setSubwoofers((prevAll) => {
      const prevList = Array.isArray(prevAll) ? prevAll : [];
      const prevFront = prevList.filter(s => s?.group === 'front');
      const prevRear = prevList.filter(s => s?.group === 'rear');
      const nextFront = buildGroup('front', frontQty, frontSubsCfg, prevFront);
      const nextRear = buildGroup('rear', rearQty, rearSubsCfg, prevRear);
      const next = [...nextFront, ...nextRear];
      const sameLen = prevList.length === next.length;
      const same = sameLen && prevList.every((p, i) => {
        const n = next[i];
        if (!p || !n) return false;
        const px = Number(p?.position?.x), py = Number(p?.position?.y), pz = Number(p?.position?.z);
        const nx = Number(n?.position?.x), ny = Number(n?.position?.y), nz = Number(n?.position?.z);
        const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.001;
        return String(p.id) === String(n.id) && String(p.group) === String(n.group) &&
          String(p.model) === String(n.model) && close(px, nx) && close(py, ny) && close(pz, nz) &&
          close(Number(p.bottomHeightM), Number(n.bottomHeightM));
      });
      return same ? prevAll : next;
    });
  }, [
    appState?.setSubwoofers,
    appState?.subwooferInstances,
    appState?.roomDims?.widthM, appState?.roomDims?.lengthM,
    stableDimensions?.width, stableDimensions?.length,
    frontSubsCfg?.model, frontSubsCfg?.count, frontSubsCfg?.positions, frontSubsCfg?.placementMode, frontSubsCfg?.isManual, frontSubsCfg?.mountMode, frontSubsCfg?.bottomHeightM,
    rearSubsCfg?.model, rearSubsCfg?.count, rearSubsCfg?.positions, rearSubsCfg?.placementMode, rearSubsCfg?.isManual, rearSubsCfg?.mountMode, rearSubsCfg?.bottomHeightM,
  ]);
}