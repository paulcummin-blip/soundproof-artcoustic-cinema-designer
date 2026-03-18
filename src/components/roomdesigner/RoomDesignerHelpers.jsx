// Extracted from src/pages/RoomDesigner.jsx (lines 52–195)
// No React component here – only plain functions and hooks.
import React, { useMemo, useCallback } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { computeMLPAndPrimary } from "@/components/utils/computeMLPAndPrimary";
import { getModelDimsM } from "@/components/roomdesigner/utils/getModelDimsM";
import { safeCanon } from "@/components/room/utils/speakerHelpers";

// NEW: Helper hook for URL query parameters - SSR Safe
export function useUrlQuery() {
  const [projectId, setProjectId] = React.useState(null);

  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setProjectId(params.get("projectId") || params.get("project"));
    } catch {
      setProjectId(null);
    }
  }, []);

  return { projectId };
}

export function useSurroundGroupDepths() {
  const {
    placedSpeakers,
    roomDims,
    mlpY_m,
    aimFrontWidesAtMLP,
    aimSideSurroundsAtMLP,
    aimRearSurroundsAtMLP,
  } = useAppState() || {};

  const mlp = useMemo(() => ({ x: (roomDims?.widthM || 0) / 2, y: mlpY_m, z: 1.2 }), [roomDims?.widthM, mlpY_m]);

  // inline helpers (verbatim from original)
  const _isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const _degToRad = (deg) => (deg * Math.PI) / 180;
  const _wrap180 = (deg) => {
    let a = (Number(deg) || 0) % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  };
  const rotatedHalfExtentToWall = (yawDeg, halfW, halfD, normalAxis) => {
    const a = _degToRad(_isNum(yawDeg) ? yawDeg : 0);
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    if (normalAxis === "x") return halfW * c + halfD * s;
    return halfW * s + halfD * c;
  };
  const yawDegToMLP = (pos, mlpPos) => {
    const dx = mlpPos.x - pos.x;
    const dy = mlpPos.y - pos.y;
    return _wrap180(-Math.atan2(dx, dy) * (180 / Math.PI));
  };

  const calculateGroupDepth = useCallback((groupName) => {
    let roles, defaultWallAxis;
    if (groupName === 'front-wides') {
      roles = ['LW', 'RW'];
      defaultWallAxis = 'x';
    } else if (groupName === 'side-surrounds') {
      roles = ['SL', 'SR'];
      defaultWallAxis = 'x';
    } else if (groupName === 'rear-surrounds') {
      roles = ['SBL', 'SBR'];
      defaultWallAxis = 'y';
    } else {
      return null;
    }

    const groupSpeakers = (placedSpeakers || []).filter(s => s && s.role && roles.includes(safeCanon(s.role)));
    if (groupSpeakers.length === 0) return null;

    const depths = groupSpeakers.map(speaker => {
      if (!speaker.position || !Number.isFinite(speaker.position.x) || !Number.isFinite(speaker.position.y)) {
        return null;
      }
      const canonRole = safeCanon(speaker.role);
      const pos = speaker.position;
      const W = roomDims?.widthM || 0;
      const L = roomDims?.lengthM || 0;

      let yawDeg = 0;
      let wallAxis = defaultWallAxis;

      const aimThisGroup =
        (groupName === 'front-wides' && aimFrontWidesAtMLP) ||
        (groupName === 'side-surrounds' && aimSideSurroundsAtMLP) ||
        (groupName === 'rear-surrounds' && aimRearSurroundsAtMLP);

      if (aimThisGroup && mlp && Number.isFinite(mlp.x) && Number.isFinite(mlp.y)) {
        yawDeg = yawDegToMLP(pos, mlp);
      } else {
        if (groupName === 'front-wides') {
          yawDeg = (canonRole === 'LW') ? -90 : 90;
        } else if (groupName === 'side-surrounds') {
          yawDeg = (canonRole === 'SL') ? 90 : -90;
        } else if (groupName === 'rear-surrounds') {
          const distLeft  = Math.abs(pos.x);
          const distRight = Math.abs(W - pos.x);
          const distBack  = Math.abs(L - pos.y);
          const minDist = Math.min(distLeft, distRight, distBack);
          if (minDist === distBack) { yawDeg = 0; wallAxis = 'y'; }
          else if (minDist === distLeft) { yawDeg = 90; wallAxis = 'x'; }
          else { yawDeg = -90; wallAxis = 'x'; }
        }
      }

      const dims = getModelDimsM(speaker.model) || {};
      const widthM = dims.widthM || 0.27;
      const depthM = dims.depthM || 0.082;
      const halfNormal = rotatedHalfExtentToWall(yawDeg, widthM, depthM, wallAxis);

      let dCentre = 0;
      if (wallAxis === 'x') {
        const isLeft = canonRole === 'LW' || canonRole === 'SL' || (canonRole === 'SBL' && Math.abs(pos.x) < Math.abs(W - pos.x));
        dCentre = isLeft ? pos.x : W - pos.x;
      } else {
        dCentre = L - pos.y;
      }

      return dCentre + halfNormal;
    });

    const validDepths = depths.filter(d => d !== null && Number.isFinite(d));
    if (validDepths.length === 0) return null;
    return Math.max(...validDepths);
  }, [placedSpeakers, roomDims?.widthM, roomDims?.lengthM, mlp, aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP]);

  const frontWideDepth = useMemo(() => calculateGroupDepth('front-wides'), [calculateGroupDepth]);
  const sideSurroundDepth = useMemo(() => calculateGroupDepth('side-surrounds'), [calculateGroupDepth]);
  const rearSurroundDepth = useMemo(() => calculateGroupDepth('rear-surrounds'), [calculateGroupDepth]);

  return { frontWideDepth, sideSurroundDepth, rearSurroundDepth };
}

// NEW: Helper for parsing JSON from project properties
export function parseProjectJson(value, defaultValue = null) {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch (e) {
      if (globalThis.__B44_LOGS) console.warn("Failed to parse project JSON:", e);
      return defaultValue;
    }
  }
  return value === undefined ? defaultValue : value;
}

// Helper to extract MLP coordinates from computeMLPAndPrimary
export const getMlpPoint = (seatingPositions, mlpBasis, roomDimensions) => {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0 || !roomDimensions || !roomDimensions.width || !roomDimensions.length) {
    return null;
  }
  const { mlp } = computeMLPAndPrimary(
    seatingPositions,
    roomDimensions.width,
    roomDimensions.length,
    mlpBasis
  );
  return mlp;
};