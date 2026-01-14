// Shared per-seat RP22 computation logic
// Used by both Room Designer HUD and RP22 Report

import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { getSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';
import {
  metricP1_nearestWallM,
  rp22LevelForP1,
  rp22LevelForP4,
  metricP5_maxSurroundGapNoWrap,
  rp22LevelForP5_NoWrap,
} from '@/components/utils/seatMetrics';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Shared yaw calculation helper
const safeYawToMLP = (pos, mlp) => {
  if (!pos || !mlp) return 0;
  const dx = mlp.x - pos.x;
  const dy = mlp.y - pos.y;
  return -Math.atan2(dx, dy) * (180 / Math.PI);
};

// 3D vector helpers for overhead calculations
const v3 = (x, y, z) => ({ x, y, z });
const v3sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const v3len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const v3norm = (a) => {
  const L = v3len(a);
  return L > 1e-9 ? v3(a.x / L, a.y / L, a.z / L) : v3(0, 0, 0);
};
const v3dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad2deg = (r) => (r * 180) / Math.PI;

const angleBetweenDeg = (a, b) => {
  const na = v3norm(a);
  const nb = v3norm(b);
  const d = clamp(v3dot(na, nb), -1, 1);
  return rad2deg(Math.acos(d));
};

/**
 * Compute all RP22 per-seat metrics for a single seat
 * Returns: { p1, p4, p5, p6, p9, p10, p16, p17, p20, rp23 }
 */
export function computePerSeatRP22Metrics({
  seat,
  seatingPositions = [],
  placedSpeakers = [],
  dimensions,
  mlp,
  screen,
  screenFrontPlaneM,
  allSeatSplMetrics,
  aimAtMLP = false,
  aimFrontWidesAtMLP = false,
  aimSideSurroundsAtMLP = false,
  aimRearSurroundsAtMLP = false,
  lcrAngleInfo = { L: 0, R: 0 },
}) {
  if (!seat) return null;

  // Extract seat coordinates
  const seatX = isNum(seat?.x ?? seat?.position?.x) ? (seat.x ?? seat.position.x) : 0;
  const seatY = isNum(seat?.y ?? seat?.position?.y) ? (seat.y ?? seat.position.y) : 0;
  const seatZ = isNum(seat?.z) ? seat.z : 1.2;

  // Room dimensions
  const roomWidth = isNum(dimensions?.width ?? dimensions?.widthM) ? (dimensions.width ?? dimensions.widthM) : 4.5;
  const roomLength = isNum(dimensions?.length ?? dimensions?.lengthM) ? (dimensions.length ?? dimensions.lengthM) : 6.0;
  const roomHeight = isNum(dimensions?.height ?? dimensions?.heightM) ? (dimensions.height ?? dimensions.heightM) : 2.4;
  const halfW = roomWidth / 2;

  const result = {
    p1: { valueM: null, level: '—', formatted: '—' },
    p4: { valueDb: null, level: '—', formatted: '—' },
    p5: { valueDeg: null, level: '—', formatted: '—' },
    p6: { valueDb: null, level: '—', formatted: '—' },
    p9: { valueDeg: null, level: '—', formatted: '—' },
    p10: { valueDb: null, level: '—', formatted: '—' },
    p16: { valueDb: null, level: '—', formatted: '—' },
    p17: { valueDb: null, level: '—', formatted: '—' },
    p20: { valueDb: null, level: '—', formatted: '—' },
    rp23: { angleDeg: null, level: null, formatted: '—' },
  };

  // Get SPL data for this seat
  const seatSplData = getSeatSplMetrics(allSeatSplMetrics, seat.id);

  // --- P1: Nearest boundary distance ---
  if (isNum(seatX) && isNum(seatY) && isNum(screenFrontPlaneM)) {
    const isCenterlineX = seatX < 0 || (
      Array.isArray(seatingPositions) &&
      seatingPositions.some(s => Number(s?.x) < 0)
    );

    const xLeftWall = isCenterlineX
      ? Math.max(0, Math.min(roomWidth, halfW + seatX))
      : Math.max(0, Math.min(roomWidth, seatX));

    const yFromScreenPlane = Math.max(0, seatY);

    const p1ValueM = metricP1_nearestWallM({
      xLeftWall,
      yFromScreenPlane,
      widthM: roomWidth,
      lengthM: roomLength,
      screenFrontPlaneM,
    });

    if (isNum(p1ValueM)) {
      result.p1 = {
        valueM: p1ValueM,
        level: rp22LevelForP1(p1ValueM),
        formatted: `${p1ValueM.toFixed(2)}m (nearest)`
      };
    }
  }

  // Helper for max pairwise delta
  const maxPairwiseDelta = (values) => {
    if (!values || values.length < 2) return null;
    let maxDelta = 0;
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const delta = Math.abs(values[i] - values[j]);
        if (delta > maxDelta) maxDelta = delta;
      }
    }
    return maxDelta;
  };

  // --- P4: Max SPL difference between screen speakers ---
  if (seatSplData?.screen) {
    const lcrSplValues = Object.values(seatSplData.screen)
      .map(s => s.value)
      .filter(isNum);

    const valueDb = maxPairwiseDelta(lcrSplValues);

    if (isNum(valueDb)) {
      result.p4 = {
        valueDb,
        level: rp22LevelForP4(valueDb),
        formatted: `${Math.floor(valueDb)} dB (screen)`
      };
    }
  }

  // --- P5: Max horizontal gap between adjacent surrounds (no wrap) ---
  const allSurrounds = (placedSpeakers || []).filter(s => {
    const r = getCanonicalRole(s.role);
    return ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(r);
  });

  const hasSL = allSurrounds.some(s => getCanonicalRole(s.role) === 'SL');
  const hasSR = allSurrounds.some(s => getCanonicalRole(s.role) === 'SR');

  const eligibleSurrounds = allSurrounds.filter(s => {
    const r = getCanonicalRole(s.role);
    if (r === 'LW' || r === 'RW') return hasSL && hasSR;
    return true;
  });

  if (seat && eligibleSurrounds.length >= 2) {
    const p5Val = metricP5_maxSurroundGapNoWrap({
      seat,
      surrounds: eligibleSurrounds,
      toPoint: sp => sp?.position,
    });

    if (isNum(p5Val)) {
      result.p5 = {
        valueDeg: p5Val,
        level: rp22LevelForP5_NoWrap(p5Val),
        formatted: `${p5Val.toFixed(1)}° (sur spacing)`
      };
    }
  }

  // --- P6: Surround SPL delta (requires ≥2 surrounds) ---
  if (seatSplData?.surrounds) {
    const surSplValues = Object.values(seatSplData.surrounds)
      .map(s => s.value)
      .filter(isNum);

    const p6ValueDb = maxPairwiseDelta(surSplValues);
    if (isNum(p6ValueDb)) {
      let level = '—';
      if (p6ValueDb <= 2) level = 'L4';
      else if (p6ValueDb <= 4) level = 'L3';
      else if (p6ValueDb <= 6) level = 'L2';
      else if (p6ValueDb <= 10) level = 'L1';

      result.p6 = {
        valueDb: p6ValueDb,
        level,
        formatted: `${Math.floor(p6ValueDb)} dB (sur)`
      };
    }
  }

  // --- P10: Maximum SPL difference between upper speakers ---
  if (seatSplData?.uppers) {
    const upperValues = Object.values(seatSplData.uppers)
      .map(o => (o && typeof o.value === 'number') ? o.value : null)
      .filter(isNum);

    if (upperValues.length >= 2) {
      const maxSpl = Math.max(...upperValues);
      const minSpl = Math.min(...upperValues);
      const delta = Math.abs(maxSpl - minSpl);
      const deltaRounded = Math.round(delta * 10) / 10;

      let level10 = 1;
      if (deltaRounded <= 2) level10 = 4;
      else if (deltaRounded <= 5) level10 = 3;
      else if (deltaRounded <= 8) level10 = 2;

      result.p10 = {
        value: deltaRounded,
        formatted: `±${deltaRounded.toFixed(1)} dB`,
        level: level10,
      };
    } else {
      result.p10 = {
        value: null,
        formatted: 'N/A (insufficient data)',
        level: '—',
      };
    }
  }

  // --- P16: LCR horizontal off-axis HF loss ---
  {
    const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
    const lcrSpeakers = (placedSpeakers || []).filter(sp => {
      const canon = getCanonicalRole(sp.role);
      return lcrRoles.has(canon) && sp.position;
    });

    if (lcrSpeakers.length > 0) {
      const perSpeaker = [];
      let worstLossLabel = null;
      let worstLevel = 4;
      let worstRole = null;
      let worstAngleDeg = null;

      for (const sp of lcrSpeakers) {
        const canon = getCanonicalRole(sp.role);
        const pos = sp.position;

        // Direction from speaker to seat
        const dirDeg = safeYawToMLP(pos, { x: seatX, y: seatY });

        // Aim direction (matches renderSpeakers logic)
        let aimDeg = 0;
        if (aimAtMLP && (canon === 'FL' || canon === 'L')) {
          aimDeg = lcrAngleInfo?.L ?? 0;
        } else if (aimAtMLP && (canon === 'FR' || canon === 'R')) {
          aimDeg = lcrAngleInfo?.R ?? 0;
        } else if (canon === 'FC' || canon === 'C') {
          aimDeg = 0;
        }

        // Off-axis angle
        let offAxisRaw = dirDeg - aimDeg;
        while (offAxisRaw > 180) offAxisRaw -= 360;
        while (offAxisRaw < -180) offAxisRaw += 360;
        const offAxisDeg = Math.abs(offAxisRaw);

        // Product-dependent thresholds (half the dispersion windows)
        const meta = getSpeakerModelMeta(sp.model);
        const disp = meta?.dispersion?.horizontal;

        const halfDispersionDeg = (fullDeg) => {
          if (!isNum(fullDeg)) return null;
          return Math.ceil(fullDeg / 2);
        };

        const w1 = isNum(disp?.minus1p5dB) ? halfDispersionDeg(disp.minus1p5dB) : null;
        const w3 = isNum(disp?.minus3dB) ? halfDispersionDeg(disp.minus3dB) : null;
        const w5 = isNum(disp?.minus5dB) ? halfDispersionDeg(disp.minus5dB) : null;

        let lossLabel = 'FAIL';
        let level = 1;

        if (isNum(w1) && isNum(w3) && isNum(w5)) {
          if (offAxisDeg <= w1) {
            lossLabel = '≤1.5 dB';
            level = 4;
          } else if (offAxisDeg <= w3) {
            lossLabel = '≤3.0 dB';
            level = 3;
          } else if (offAxisDeg <= w5) {
            lossLabel = '≤5.0 dB';
            level = 2;
          } else {
            lossLabel = 'FAIL';
            level = 1;
          }
        } else {
          // Fallback generic thresholds
          if (offAxisDeg <= 28) {
            lossLabel = '≤1.5 dB';
            level = 4;
          } else if (offAxisDeg <= 41) {
            lossLabel = '≤3.0 dB';
            level = 3;
          } else if (offAxisDeg <= 55) {
            lossLabel = '≤5.0 dB';
            level = 2;
          } else {
            lossLabel = 'FAIL';
            level = 1;
          }
        }

        perSpeaker.push({
          role: canon,
          angleDeg: Math.floor(offAxisDeg),
          rawAngleDeg: offAxisDeg,
          lossLabel,
          level,
        });

        if (level < worstLevel || (level === worstLevel && offAxisDeg > (worstAngleDeg || 0))) {
          worstLevel = level;
          worstLossLabel = lossLabel;
          worstRole = canon;
          worstAngleDeg = offAxisDeg;
        }
      }

      const levelStr = worstLevel === 4 ? 'L4' : worstLevel === 3 ? 'L3' : worstLevel === 2 ? 'L2' : 'L1';

      result.p16 = {
        value: null,
        formatted: worstLossLabel ? `${worstRole} ${worstLossLabel}` : '—',
        level: levelStr,
        perSpeaker,
        worstRole,
        worstAngleDeg,
        worstLossLabel,
        hudLabel: worstLossLabel ? `${worstRole} ${worstLossLabel}` : '—',
      };
    }
  }

  // --- P17: Non-LCR (surrounds/wides/overheads) HF off-axis variance ---
  {
    const surroundAndOverheadRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']);

    const groupForRole = (role) => {
      if (role === 'LW' || role === 'RW') return 'Front Wides';
      if (role === 'SL' || role === 'SR') return 'Side Surrounds';
      if (role === 'SBL' || role === 'SBR') return 'Rear Surrounds';
      if (String(role).startsWith('T')) return 'Overheads';
      return 'Other';
    };

    const relevantSpeakers = (placedSpeakers || []).filter(sp => {
      const canon = getCanonicalRole(sp.role);
      return surroundAndOverheadRoles.has(canon) && sp.position;
    });

    if (relevantSpeakers.length > 0) {
      const halfDispersionDeg = (fullDeg) => {
        if (!isNum(fullDeg)) return null;
        return Math.ceil(fullDeg / 2);
      };

      const perSpeaker = [];
      let worstLossDb = -Infinity;
      let worstRole = null;
      let worstAngleDeg = null;
      let worstGroup = null;

      for (const sp of relevantSpeakers) {
        const canon = getCanonicalRole(sp.role);
        const pos = sp.position;

        const isLW_RW = (canon === 'LW' || canon === 'RW');
        const isSL_SR = (canon === 'SL' || canon === 'SR');
        const isSBL_SBR = (canon === 'SBL' || canon === 'SBR');
        const isOverhead = canon.startsWith('T');

        let offAxisDeg = 0;

        if (isOverhead) {
          // 3D overhead calculation
          const sp3 = v3(pos.x, pos.y, roomHeight);
          const mlp3 = v3(mlp.x, mlp.y, 1.2);
          const seat3 = v3(seatX, seatY, seatZ);

          const aimVec = v3sub(mlp3, sp3);
          const seatVec = v3sub(seat3, sp3);

          offAxisDeg = angleBetweenDeg(aimVec, seatVec);

          // Apply built-in tilt
          const meta = getSpeakerModelMeta(sp.model);
          const builtInTilt = Number(meta?.builtInTiltDeg) || 0;
          offAxisDeg = Math.max(0, offAxisDeg - builtInTilt);
        } else {
          // 2D bed speaker calculation
          const dirDeg = safeYawToMLP(pos, { x: seatX, y: seatY });

          let aimDeg = 0;
          if (isLW_RW) {
            aimDeg = aimFrontWidesAtMLP ? safeYawToMLP(pos, mlp) : (canon === 'LW' ? -90 : 90);
          } else if (isSL_SR) {
            aimDeg = aimSideSurroundsAtMLP ? safeYawToMLP(pos, mlp) : (canon === 'SL' ? 90 : -90);
          } else if (isSBL_SBR) {
            if (aimRearSurroundsAtMLP) {
              aimDeg = safeYawToMLP(pos, mlp);
            } else {
              const distLeft = Math.abs(pos.x - 0);
              const distRight = Math.abs(roomWidth - pos.x);
              const distBack = Math.abs(roomLength - pos.y);
              const minDist = Math.min(distLeft, distRight, distBack);

              if (minDist === distBack) aimDeg = 180;
              else if (minDist === distLeft) aimDeg = -90;
              else if (minDist === distRight) aimDeg = 90;
              else aimDeg = 180;
            }
          }

          let offAxisRaw = dirDeg - aimDeg;
          while (offAxisRaw > 180) offAxisRaw -= 360;
          while (offAxisRaw < -180) offAxisRaw += 360;
          offAxisDeg = Math.abs(offAxisRaw);
        }

        const offAxisDegInt = Math.floor(offAxisDeg + 1e-9);
        const offAxisClamped = Math.min(180, Math.max(0, offAxisDeg));

        // Product-dependent loss buckets
        const meta = getSpeakerModelMeta(sp.model);
        const dispRaw = meta?.dispersion?.horizontal;
        const disp = dispRaw
          ? {
              minus1p5dB: halfDispersionDeg(dispRaw.minus1p5dB),
              minus3dB: halfDispersionDeg(dispRaw.minus3dB),
              minus5dB: halfDispersionDeg(dispRaw.minus5dB),
            }
          : null;

        let lossDb = 3.0;
        let levelBucket = 2;

        if (disp && disp.minus1p5dB != null && disp.minus3dB != null) {
          if (offAxisClamped <= disp.minus1p5dB) {
            lossDb = 0.0;
            levelBucket = 4;
          } else if (offAxisClamped <= disp.minus3dB) {
            lossDb = 1.5;
            levelBucket = 3;
          } else {
            lossDb = 3.0;
            levelBucket = 2;
          }
        }

        const isBeyondNonLcrLimit = false;

        perSpeaker.push({
          role: canon,
          angleDeg: offAxisDegInt,
          rawAngleDeg: offAxisDegInt,
          lossDb: Math.round(lossDb * 10) / 10,
          isBeyondNonLcrLimit,
        });

        if (!isBeyondNonLcrLimit) {
          const angleInt = offAxisDegInt;

          const isBetter =
            (lossDb > worstLossDb) ||
            (lossDb === worstLossDb && angleInt > (worstAngleDeg ?? -Infinity)) ||
            (lossDb === worstLossDb && angleInt === (worstAngleDeg ?? -Infinity) && String(canon).localeCompare(String(worstRole)) < 0);

          if (isBetter) {
            worstLossDb = lossDb;
            worstRole = canon;
            worstAngleDeg = angleInt;
            worstGroup = groupForRole(canon);
          }
        }
      }

      let level17 = '—';
      if (isNum(worstLossDb)) {
        if (worstLossDb <= 1.5) level17 = 'L4';
        else if (worstLossDb < 3.0) level17 = 'L3';
        else level17 = 'L2';
      }

      result.p17 = {
        value: worstLossDb,
        formatted: isNum(worstLossDb) ? `±${worstLossDb.toFixed(1)} dB` : '—',
        level: level17,
        perSpeaker,
        worstRole,
        worstAngleDeg,
        worstLossDb,
        worstGroup,
        p17HasNaAngles: perSpeaker.some(s => s.isBeyondNonLcrLimit),
      };
    }
  }

  // --- RP23: Horizontal viewing angle ---
  const distanceToScreen = Math.abs(seatY - screenFrontPlaneM);

  if (screen?.visibleWidthInches && distanceToScreen > 0.1) {
    const screenWidthM = (screen.visibleWidthInches * 0.0254) || 0;
    if (screenWidthM > 0) {
      const rp23AngleDeg = 2 * Math.atan((screenWidthM / 2) / distanceToScreen) * (180 / Math.PI);

      let rp23Level = null;
      if (rp23AngleDeg >= 48 && rp23AngleDeg <= 67) rp23Level = 'L4';
      else if (rp23AngleDeg >= 45 && rp23AngleDeg <= 70) rp23Level = 'L3';
      else if (rp23AngleDeg >= 40 && rp23AngleDeg <= 75) rp23Level = 'L2';
      else if (rp23AngleDeg >= 35 && rp23AngleDeg <= 80) rp23Level = 'L1';
      else rp23Level = 'N/A';

      result.rp23 = {
        angleDeg: rp23AngleDeg,
        level: rp23Level,
        formatted: `${rp23AngleDeg.toFixed(1)}°`,
      };
    }
  }

  return result;
}