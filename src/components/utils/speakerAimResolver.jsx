/**
 * speakerAimResolver.js
 * SINGLE SOURCE OF TRUTH for surround speaker aim / yaw resolution.
 *
 * Both the plan-view render path (rvAiming.js / getPlanAimDeg) and the
 * RP22 P17 calculation path (rp22HfOffAxis.js / getEffectiveYawDeg) must
 * call this function so they always return identical yaw for the same speaker.
 *
 * Priority order:
 *   1. Manual rotation — ONLY respected when positionSource === 'user'
 *      (auto-rebuilt / hydrated speakers must never inherit stale rotation)
 *   2. Aim-at-MLP toggles from appState
 *   3. Role-based defaults
 *      - SBL / SBR  → always aim at MLP  (prevents 168° bug at RSP)
 *      - SL  / SR   → wall-flat (+90 / -90)
 *      - LW  / RW   → wall-flat (-90 / +90)
 */

// 0° = +Y (into room), clockwise positive, range −180..+180
// Matches yawFromToPlan convention in rp22HfOffAxis.js
function _yawFromTo(from, to) {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return -(Math.atan2(dx, dy) * 180) / Math.PI;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {object}   speaker            - The placed speaker object
 * @param {{x,y}|null} mlpPos           - Current MLP / RSP position
 * @param {object}   appState           - AppState slice (needs aim toggle booleans)
 * @param {function} [getCanonicalRole] - Optional role normaliser
 * @returns {number} yaw in degrees (−180..+180)
 */
export function resolveSpeakerYaw({ speaker, mlpPos, appState, getCanonicalRole }) {
  if (!speaker) return 0;

  const rawRole = String(speaker.role || '').trim().toUpperCase();
  const canon = getCanonicalRole ? String(getCanonicalRole(rawRole)).trim().toUpperCase() : rawRole;

  const pos = speaker.position || speaker;
  const hasValidMlp = mlpPos && isNum(mlpPos.x) && isNum(mlpPos.y);

  // ─── Role booleans ────────────────────────────────────────────────────────
  const isFW   = canon === 'LW'  || canon === 'RW';
  const isSide = canon === 'SL'  || canon === 'SR'  || /^SL\d+$/.test(canon) || /^SR\d+$/.test(canon);
  const isRear = canon === 'SBL' || canon === 'SBR';

  // ─── 1. Manual rotation (ONLY when user explicitly placed the speaker) ────
  // NOTE: rotation?.y is intentionally excluded — it is often a default { x:0, y:0, z:0 }
  // object field and is not reliable evidence of intentional manual aim.
  // Only standalone yaw / rotationDeg / rotation_deg fields are trusted.
  if (speaker.positionSource === 'user') {
    if (isNum(speaker.yaw))          return Number(speaker.yaw);
    if (isNum(speaker.rotationDeg))  return Number(speaker.rotationDeg);
    if (isNum(speaker.rotation_deg)) return Number(speaker.rotation_deg);
    // Fall through to role-based defaults if no real manual aim field exists
  }

  // ─── 2. Aim-at-MLP toggles ────────────────────────────────────────────────
  const aimFW   = !!appState?.aimFrontWidesAtMLP;
  const aimSide = !!appState?.aimSideSurroundsAtMLP;
  const aimRear = !!appState?.aimRearSurroundsAtMLP;

  if (isFW   && aimFW   && hasValidMlp) return _yawFromTo(pos, mlpPos) ?? 0;
  if (isSide && aimSide && hasValidMlp) return _yawFromTo(pos, mlpPos) ?? 0;
  if (isRear && aimRear && hasValidMlp) return _yawFromTo(pos, mlpPos) ?? 0;

  // ─── 3. Role-based defaults ───────────────────────────────────────────────

  // Rear surrounds: flat to wall (0°) unless aim toggle is ON
  if (isRear) {
    if (aimRear && hasValidMlp) {
      const y = _yawFromTo(pos, mlpPos);
      return isNum(y) ? y : 0;
    }
    return 0;
  }

  // Side surrounds: wall-flat
  if (isSide) {
    if (canon === 'SL' || /^SL\d+$/.test(canon)) return  90;
    if (canon === 'SR' || /^SR\d+$/.test(canon)) return -90;
    return 0;
  }

  // Front Wides: wall-flat
  if (isFW) {
    return canon === 'LW' ? -90 : 90;
  }

  return 0;
}