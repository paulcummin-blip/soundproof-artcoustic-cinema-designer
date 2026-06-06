import { useMemo } from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { safeCanon } from "@/components/room/utils/speakerHelpers";
import { _isNum, _degToRad, _wrap180 } from "@/components/roomdesigner/utils/speakerDepthHelpers";

/**
 * Computes in-room wall-intrusion depths (cm) for front-wide, surround, and rear-surround
 * speaker groups, taking aim mode into account.
 */
export function useInRoomDepths({
  placedSpeakersForAim,
  posSig,
  yawSig,
  widthM,
  lengthM,
  mlpAnchorEffective,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
}) {
  return useMemo(() => {
    const empty = { frontWides: null, surrounds: null, sideSurrounds: null, rearSurrounds: null };
    if (!Array.isArray(placedSpeakersForAim) || placedSpeakersForAim.length === 0) return empty;
    if (!_isNum(widthM) || !_isNum(lengthM) || widthM <= 0 || lengthM <= 0) return empty;

    const aimFW = aimFrontWidesAtMLP || false;
    const aimSide = aimSideSurroundsAtMLP || false;
    const aimRear = aimRearSurroundsAtMLP || false;

    const isFrontWideRole = (role) => role === "LW" || role === "RW";
    const isSurroundRole = (role) => /^SL\d*$/.test(role) || /^SR\d*$/.test(role);
    const isRearSurroundRole = (role) => role === "SBL" || role === "SBR";

    const _wallNormalYawDeg = (wall) => wall === "LEFT" ? 90 : wall === "RIGHT" ? -90 : 0;
    const _hingeAngleDegFromWall = (wall, yawDeg) => {
      const normal = _wallNormalYawDeg(wall);
      const delta = _wrap180((Number(yawDeg) || 0) - normal);
      const abs = Math.abs(delta);
      return Math.min(90, Math.min(abs, 180 - abs));
    };
    const _hingeIntrusionM = (wM, dM, hDeg) => {
      const a = _degToRad(hDeg);
      return dM * Math.abs(Math.cos(a)) + wM * Math.abs(Math.sin(a));
    };
    const getModelMeta = (sp) => {
      const meta = getSpeakerModelMeta(sp?.model);
      return meta && !meta.notFound ? meta : null;
    };
    const getYawDegForRole = (sp) => {
      const r = safeCanon(sp?.role);
      const aimToMLP = () => {
        if (!sp?.position || !mlpAnchorEffective) return 0;
        return _wrap180(-Math.atan2(mlpAnchorEffective.x - sp.position.x, mlpAnchorEffective.y - sp.position.y) * (180 / Math.PI));
      };
      if (isFrontWideRole(r) && aimFW) return aimToMLP();
      if (isSurroundRole(r) && aimSide) return aimToMLP();
      if (isRearSurroundRole(r) && aimRear) return aimToMLP();
      if (r === "LW" || /^SL\d*$/.test(r)) return 90;
      if (r === "RW" || /^SR\d*$/.test(r)) return -90;
      return 0;
    };
    const computeGroupDepthCm = (matchRole) => {
      let maxDepthM = null;
      for (const sp of placedSpeakersForAim) {
        const role = safeCanon(sp?.role);
        if (!role || !matchRole(role)) continue;
        const pos = sp?.position || {};
        if (!_isNum(pos.x) || !_isNum(pos.y)) continue;
        const meta = getModelMeta(sp);
        const wM = _isNum(meta?.widthM) ? meta.widthM : 0.27;
        const dM = _isNum(meta?.depthM) ? meta.depthM : 0.082;
        const wall =
          (role === "LW" || /^SL\d*$/.test(role)) ? "LEFT" :
          (role === "RW" || /^SR\d*$/.test(role)) ? "RIGHT" :
          isRearSurroundRole(role) ? "BACK" : null;
        if (!wall) continue;
        const d = _hingeIntrusionM(wM, dM, _hingeAngleDegFromWall(wall, getYawDegForRole(sp)));
        if (_isNum(d) && (maxDepthM === null || d > maxDepthM)) maxDepthM = d;
      }
      return maxDepthM === null ? null : Math.round(maxDepthM * 100);
    };

    const frontWides = computeGroupDepthCm(isFrontWideRole);
    const surrounds = computeGroupDepthCm(isSurroundRole);
    const rearSurrounds = computeGroupDepthCm(isRearSurroundRole);
    return { frontWides, surrounds, sideSurrounds: surrounds, rearSurrounds };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedSpeakersForAim, posSig, yawSig, widthM, lengthM, mlpAnchorEffective, aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP]);
}