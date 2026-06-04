import { _isNum, _degToRad, _wrap180 } from "@/components/roomdesigner/utils/speakerDepthHelpers";

const WALL_BUFFER_M = 0.01;

const isSideLeftRole = (role) => role === "LW" || /^SL\d*$/.test(role);
const isSideRightRole = (role) => role === "RW" || /^SR\d*$/.test(role);
const isRearRole = (role) => role === "SBL" || role === "SBR";
const isFrontWideRole = (role) => role === "LW" || role === "RW";
const isSurroundRole = (role) => /^SL\d*$/.test(role) || /^SR\d*$/.test(role);
const isLcrRole = (role) => role === "FL" || role === "FC" || role === "FR";

function getWallForRole(role) {
  if (isSideLeftRole(role)) return "LEFT";
  if (isSideRightRole(role)) return "RIGHT";
  if (isRearRole(role)) return "BACK";
  return null;
}

function getWallNormalYawDeg(wall) {
  if (wall === "LEFT") return 90;
  if (wall === "RIGHT") return -90;
  return 0;
}

function getHingeAngleDegFromWall(wall, yawDeg) {
  const normal = getWallNormalYawDeg(wall);
  const delta = _wrap180((Number(yawDeg) || 0) - normal);
  const abs = Math.abs(delta);
  return Math.min(90, Math.min(abs, 180 - abs));
}

function getHingeIntrusionM(widthM, depthM, angleDeg) {
  const angleRad = _degToRad(angleDeg);
  return depthM * Math.abs(Math.cos(angleRad)) + widthM * Math.abs(Math.sin(angleRad));
}

function getAimYawDeg(speaker, mlp) {
  if (!speaker?.position || !mlp) return 0;
  return _wrap180(
    -Math.atan2(mlp.x - speaker.position.x, mlp.y - speaker.position.y) * (180 / Math.PI)
  );
}

function getSpeakerYawDeg({ speaker, role, mlp, appState }) {
  const aimFrontWides = appState?.aimFrontWidesAtMLP || false;
  const aimSideSurrounds = appState?.aimSideSurroundsAtMLP || false;
  const aimRearSurrounds = appState?.aimRearSurroundsAtMLP || false;

  if (isLcrRole(role)) {
    return appState?.lcrAimMode === "angled" ? getAimYawDeg(speaker, mlp) : 0;
  }

  if (isFrontWideRole(role) && aimFrontWides) return getAimYawDeg(speaker, mlp);
  if (isSurroundRole(role) && aimSideSurrounds) return getAimYawDeg(speaker, mlp);
  if (isRearRole(role) && aimRearSurrounds) return getAimYawDeg(speaker, mlp);
  if (role === "LW" || /^SL\d*$/.test(role)) return 90;
  if (role === "RW" || /^SR\d*$/.test(role)) return -90;
  return 0;
}

export default function getSpeakerWallDepthCm({
  speaker,
  widthM,
  lengthM,
  mlp,
  appState,
  getCanonicalRole,
  getSpeakerModelMeta,
}) {
  if (!_isNum(widthM) || !_isNum(lengthM) || widthM <= 0 || lengthM <= 0) return null;
  if (!speaker?.position || !_isNum(speaker.position.x) || !_isNum(speaker.position.y)) return null;

  const role = getCanonicalRole ? getCanonicalRole(speaker?.role) : String(speaker?.role || "").toUpperCase();

  const meta = getSpeakerModelMeta?.(speaker?.model);
  const modelWidthM = _isNum(meta?.widthM) ? meta.widthM : 0.27;
  const modelDepthM = _isNum(meta?.depthM) ? meta.depthM : 0.082;

  if (isLcrRole(role)) {
    const yawDeg = getSpeakerYawDeg({ speaker, role, mlp, appState });
    const yawRad = (yawDeg || 0) * (Math.PI / 180);
    const projectedIntrusionM =
      modelDepthM * Math.abs(Math.cos(yawRad)) +
      modelWidthM * Math.abs(Math.sin(yawRad));
    const totalDepthM = WALL_BUFFER_M + projectedIntrusionM;
    return _isNum(totalDepthM) ? Math.round(totalDepthM * 100) : null;
  }

  const wall = getWallForRole(role);
  if (!wall) return null;

  const yawDeg = getSpeakerYawDeg({ speaker, role, mlp, appState });
  const hingeAngleDeg = getHingeAngleDegFromWall(wall, yawDeg);
  const intrusionM = getHingeIntrusionM(modelWidthM, modelDepthM, hingeAngleDeg);
  const totalDepthM = WALL_BUFFER_M + intrusionM;

  return _isNum(totalDepthM) ? Math.round(totalDepthM * 100) : null;
}