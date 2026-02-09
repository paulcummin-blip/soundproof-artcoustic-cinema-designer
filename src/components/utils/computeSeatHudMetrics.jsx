// Shared seat HUD metrics calculator (single source of truth)
// Used by both RoomVisualisation (for hover HUD) and RP22Report (for automatic display)

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { 
  metricP1_nearestWallM, 
  rp22LevelForP1,
  rp22LevelForP4,
  metricP5_maxSurroundGapNoWrap,
  rp22LevelForP5_NoWrap 
} from "@/components/utils/seatMetrics";
import { getSeatSplMetrics } from "@/components/utils/spl/centralSplEngine";

// Helper: check if point has valid coordinates
const hasPoint = (p) => {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y);
};

// Helper: safeYawToMLP (copied from RenderPrimitives to avoid circular deps)
const safeYawToMLP = (speakerPos, mlpTarget) => {
  if (!speakerPos || !mlpTarget) return 0;
  const dx = mlpTarget.x - speakerPos.x;
  const dy = mlpTarget.y - speakerPos.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  return Math.atan2(dx, -dy) * (180 / Math.PI);
};

// Helper: getPlanAimDeg (copied from RoomVisualisation)
const getPlanAimDeg = (speaker, mlp, widthM, lengthM, aimAtMLP, aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, lcrAngleInfo) => {
  if (!speaker?.position) return 0;
  
  const canon = getCanonicalRole(speaker.role);
  const pos = speaker.position;
  
  if (canon === 'FL' || canon === 'L') {
    return aimAtMLP ? (lcrAngleInfo?.L ?? 0) : 0;
  }
  if (canon === 'FR' || canon === 'R') {
    return aimAtMLP ? (lcrAngleInfo?.R ?? 0) : 0;
  }
  if (canon === 'FC' || canon === 'C') return 0;
  
  if (canon === 'LW' || canon === 'RW') {
    if (aimFrontWidesAtMLP) return safeYawToMLP(pos, mlp);
    return canon === 'LW' ? -90 : 90;
  }
  
  if (canon === 'SL' || canon === 'SR') {
    if (aimSideSurroundsAtMLP) return safeYawToMLP(pos, mlp);
    return canon === 'SL' ? 90 : -90;
  }
  
  if (canon === 'SBL' || canon === 'SBR') {
    if (aimRearSurroundsAtMLP) return safeYawToMLP(pos, mlp);
    const distLeft = Math.abs(pos.x - 0);
    const distRight = Math.abs(widthM - pos.x);
    const distBack = Math.abs(lengthM - pos.y);
    const minDist = Math.min(distLeft, distRight, distBack);
    if (minDist === distBack) return 180;
    if (minDist === distLeft) return 90;
    if (minDist === distRight) return -90;
    return 180;
  }
  
  return 0;
};

export function computeSeatHudMetrics({
  seat,
  placedSpeakers,
  widthM,
  lengthM,
  heightM,
  screenFrontPlaneM,
  screen,
  mlp,
  allSeatSplMetrics,
  aimAtMLP,
  aimFrontWidesAtMLP,
  aimSideSurroundsAtMLP,
  aimRearSurroundsAtMLP,
  lcrAngleInfo,
  analysisResult,
  seatingPositions,
}) {
  // Basic null-safety: seat must exist
  if (!seat) return null;

  const seatX = Number(seat?.x ?? seat?.position?.x ?? 0);
  const seatY = Number(seat?.y ?? seat?.position?.y ?? 0);
  const seatZ = Number(seat?.z ?? 1.2);

  const roomWidth = Number(widthM) || 4.5;
  const roomLength = Number(lengthM) || 6.0;
  const roomHeight = Number(heightM) || 2.4;
  const halfW = roomWidth / 2;

  // Check if we have valid seat position
  const hasSeatPos = Number.isFinite(seatX) && Number.isFinite(seatY);
  const hasMlp = hasPoint(mlp);

  // Distance to screen
  const distanceToScreen = Math.abs(seatY - screenFrontPlaneM);

  // RP23 horizontal viewing angle
  let rp23AngleDeg = null;
  let rp23Level = null;
  if (screen?.visibleWidthInches && distanceToScreen > 0.1) {
    const screenWidthM = (screen.visibleWidthInches * 0.0254) || 0;
    if (screenWidthM > 0) {
      rp23AngleDeg = 2 * Math.atan((screenWidthM / 2) / distanceToScreen) * (180 / Math.PI);
      
      if (rp23AngleDeg >= 48 && rp23AngleDeg <= 67) rp23Level = 'L4';
      else if (rp23AngleDeg >= 45 && rp23AngleDeg <= 70) rp23Level = 'L3';
      else if (rp23AngleDeg >= 40 && rp23AngleDeg <= 75) rp23Level = 'L2';
      else if (rp23AngleDeg >= 35 && rp23AngleDeg <= 80) rp23Level = 'L1';
      else rp23Level = 'N/A';
    }
  }

  const metrics = {
    rp23: {
      angleDeg: rp23AngleDeg,
      level: rp23Level,
      formatted: Number.isFinite(rp23AngleDeg) ? `${rp23AngleDeg.toFixed(1)}°` : '—',
    },
    rp22: {}
  };

  // --- P1 ---
  if (Number.isFinite(seatX) && Number.isFinite(seatY)) {
    const isCenterlineX = seatX < 0 || (seatingPositions || []).some(s => Number(s?.x) < 0);
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
    if (Number.isFinite(p1ValueM)) {
      metrics.rp22.p1 = {
        valueM: p1ValueM,
        level: rp22LevelForP1(p1ValueM),
        formatted: `${p1ValueM.toFixed(2)}m`
      };
    }
  }

  // Get SPL data for this seat
  const seatSplData = getSeatSplMetrics(allSeatSplMetrics, seat.id);

  // Helper for pairwise delta
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

  // --- P4 ---
  const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);
  const placedLCR = (placedSpeakers || []).filter(sp => {
    const canon = getCanonicalRole(sp.role);
    return lcrRoles.has(canon) && sp.position;
  });

  if (placedLCR.length >= 2 && seatSplData?.screen) {
    const lcrSplValues = Object.values(seatSplData.screen)
      .map(s => s.value)
      .filter(Number.isFinite);
    const valueDb = maxPairwiseDelta(lcrSplValues);
    if (Number.isFinite(valueDb)) {
      metrics.rp22.p4 = {
        valueDb,
        level: rp22LevelForP4(valueDb),
        formatted: `${Math.floor(valueDb)} dB`
      };
    }
  }

  // --- P5 ---
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

  if (eligibleSurrounds.length >= 2) {
    const p5Val = metricP5_maxSurroundGapNoWrap({
      seat,
      surrounds: eligibleSurrounds,
      toPoint: sp => sp?.position,
    });
    if (Number.isFinite(p5Val)) {
      metrics.rp22.p5 = {
        valueDeg: p5Val,
        level: rp22LevelForP5_NoWrap(p5Val),
        formatted: `${p5Val.toFixed(1)}°`
      };
    }
  }

  // --- P6 ---
  const surroundRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
  const placedSur = (placedSpeakers || []).filter(sp => {
    const canon = getCanonicalRole(sp.role);
    return surroundRoles.has(canon) && sp.position;
  });

  if (placedSur.length >= 2 && seatSplData?.surrounds) {
    const surSplValues = Object.values(seatSplData.surrounds)
      .map(s => s.value)
      .filter(Number.isFinite);
    const p6ValueDb = maxPairwiseDelta(surSplValues);
    if (Number.isFinite(p6ValueDb)) {
      let level = '—';
      if (p6ValueDb <= 2) level = 'L4';
      else if (p6ValueDb <= 4) level = 'L3';
      else if (p6ValueDb <= 6) level = 'L2';
      else if (p6ValueDb <= 10) level = 'L1';
      metrics.rp22.p6 = {
        valueDb: p6ValueDb,
        level,
        formatted: `${Math.floor(p6ValueDb)} dB`
      };
    }
  }

  // --- P10 ---
  const upperEntries = seatSplData?.uppers ? Object.values(seatSplData.uppers) : [];
  const upperValues = upperEntries
    .map(o => (o && typeof o.value === 'number' && Number.isFinite(o.value)) ? o.value : null)
    .filter(v => typeof v === 'number' && Number.isFinite(v));

  if (upperValues.length >= 2) {
    const maxSpl = Math.max(...upperValues);
    const minSpl = Math.min(...upperValues);
    const delta = Math.abs(maxSpl - minSpl);
    const deltaRounded = Math.round(delta * 10) / 10;

    let level10 = 1;
    if (deltaRounded <= 2) level10 = 4;
    else if (deltaRounded <= 5) level10 = 3;
    else if (deltaRounded <= 8) level10 = 2;

    metrics.rp22.p10 = {
      value: deltaRounded,
      formatted: `±${deltaRounded.toFixed(1)} dB`,
      level: level10
    };
  }

  // --- P16 (LCR off-axis) ---
  if (placedLCR.length > 0 && hasSeatPos && hasMlp) {
    const perSpeaker = [];
    let worstLossLabel = null;
    let worstLevel = 4;
    let worstRole = null;
    let worstAngleDeg = null;

    for (const sp of placedLCR) {
      const canon = getCanonicalRole(sp.role);
      const pos = sp.position;
      const dirDeg = safeYawToMLP(pos, { x: seatX, y: seatY });
      const aimDeg = getPlanAimDeg(sp, mlp, widthM, lengthM, aimAtMLP, aimFrontWidesAtMLP, aimSideSurroundsAtMLP, aimRearSurroundsAtMLP, lcrAngleInfo);

      let offAxisRaw = dirDeg - aimDeg;
      while (offAxisRaw > 180) offAxisRaw -= 360;
      while (offAxisRaw < -180) offAxisRaw += 360;
      const offAxisDeg = Math.abs(offAxisRaw);

      const meta = getSpeakerModelMeta(sp.model);
      const disp = meta?.dispersion?.horizontal;
      const w1 = Number.isFinite(disp?.minus1p5dB) ? Math.ceil(disp.minus1p5dB / 2) : null;
      const w3 = Number.isFinite(disp?.minus3dB) ? Math.ceil(disp.minus3dB / 2) : null;
      const w5 = Number.isFinite(disp?.minus5dB) ? Math.ceil(disp.minus5dB / 2) : null;

      let lossLabel = 'FAIL';
      let level = 1;

      if (Number.isFinite(w1) && Number.isFinite(w3) && Number.isFinite(w5)) {
        if (offAxisDeg <= w1) { lossLabel = '≤1.5 dB'; level = 4; }
        else if (offAxisDeg <= w3) { lossLabel = '≤3.0 dB'; level = 3; }
        else if (offAxisDeg <= w5) { lossLabel = '≤5.0 dB'; level = 2; }
        else { lossLabel = 'FAIL'; level = 1; }
      } else {
        if (offAxisDeg <= 28) { lossLabel = '≤1.5 dB'; level = 4; }
        else if (offAxisDeg <= 41) { lossLabel = '≤3.0 dB'; level = 3; }
        else if (offAxisDeg <= 55) { lossLabel = '≤5.0 dB'; level = 2; }
        else { lossLabel = 'FAIL'; level = 1; }
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
    metrics.rp22.p16 = {
      value: null,
      formatted: worstLossLabel ? `${worstRole} ${worstLossLabel}` : '—',
      level: levelStr,
      perSpeaker,
      worstRole,
      worstAngleDeg,
      worstLossLabel,
    };
  }

  // --- P17 (surround/overhead off-axis) ---
  const surroundAndOverheadRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']);

  const hasFiniteXY = (p) =>
    !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

  const hasValidModel = (m) => {
    const s = String(m || '').trim().toLowerCase();
    return !!s && s !== 'off' && s !== 'none';
  };

  const relevantSpeakers = (placedSpeakers || []).filter(sp => {
    const canon = getCanonicalRole(sp.role);
    if (!surroundAndOverheadRoles.has(canon)) return false;
    if (!hasFiniteXY(sp.position)) return false;

    // CRITICAL: exclude "not really there" speakers (hidden/off/none)
    if (!hasValidModel(sp.model)) return false;

    return true;
  });

  if (relevantSpeakers.length > 0 && hasSeatPos && hasMlp) {
    const halfDispersionDeg = (fullDeg) => Number.isFinite(fullDeg) ? Math.ceil(fullDeg / 2) : null;
    const rad2deg = (r) => (r * 180) / Math.PI;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const v3 = (x, y, z) => ({ x, y, z });
    const v3sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
    const v3len = (a) => Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z);
    const v3norm = (a) => {
      const L = v3len(a);
      return L > 1e-9 ? v3(a.x / L, a.y / L, a.z / L) : v3(0, 0, 0);
    };
    const v3dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
    const angleBetweenDeg = (a, b) => {
      const na = v3norm(a);
      const nb = v3norm(b);
      const d = clamp(v3dot(na, nb), -1, 1);
      return rad2deg(Math.acos(d));
    };

    const perSpeaker = [];
    let worstLossDb = -Infinity;
    let worstRole = null;
    let worstAngleDeg = null;

    for (const sp of relevantSpeakers) {
      const canon = getCanonicalRole(sp.role);
      const pos = sp.position;
      const isOverhead = canon.startsWith('T');

      let offAxisDeg = 0;

      if (isOverhead) {
        const sp3 = v3(pos.x, pos.y, roomHeight);
        const mlp3 = v3(mlp.x, mlp.y, 1.2);
        const seat3 = v3(seatX, seatY, seatZ);
        const aimVec = v3sub(mlp3, sp3);
        const seatVec = v3sub(seat3, sp3);
        offAxisDeg = angleBetweenDeg(aimVec, seatVec);

        const meta = getSpeakerModelMeta(sp.model);
        const builtInTilt = Number(meta?.builtInTiltDeg) || 0;
        offAxisDeg = Math.max(0, offAxisDeg - builtInTilt);
      } else {
        const dirDeg = safeYawToMLP(pos, { x: seatX, y: seatY });
        let aimDeg = 0;

        if (canon === 'LW' || canon === 'RW') {
          aimDeg = aimFrontWidesAtMLP ? safeYawToMLP(pos, mlp) : ((canon === 'LW') ? -90 : 90);
        } else if (canon === 'SL' || canon === 'SR') {
          aimDeg = aimSideSurroundsAtMLP ? safeYawToMLP(pos, mlp) : ((canon === 'SL') ? 90 : -90);
        } else if (canon === 'SBL' || canon === 'SBR') {
          if (aimRearSurroundsAtMLP) {
            aimDeg = safeYawToMLP(pos, mlp);
          } else {
            const distLeft = Math.abs(pos.x - 0);
            const distRight = Math.abs(widthM - pos.x);
            const distBack = Math.abs(lengthM - pos.y);
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

      const meta = getSpeakerModelMeta(sp.model);
      const dispRaw = meta?.dispersion?.horizontal;
      const disp = dispRaw ? {
        minus1p5dB: halfDispersionDeg(dispRaw.minus1p5dB),
        minus3dB: halfDispersionDeg(dispRaw.minus3dB),
        minus5dB: halfDispersionDeg(dispRaw.minus5dB),
      } : null;

      let lossDb = 3.0; // keep for worstLossDb tracking
      let lossLabel = '>3.0 dB';

      if (disp && disp.minus1p5dB != null && disp.minus3dB != null) {
        if (offAxisDeg <= disp.minus1p5dB) { lossDb = 1.5; lossLabel = '≤1.5 dB'; }
        else if (offAxisDeg <= disp.minus3dB) { lossDb = 3.0; lossLabel = '≤3.0 dB'; }
        else { lossDb = 3.1; lossLabel = '>3.0 dB'; } // 3.1 is ONLY an internal marker for "over 3"
      } else {
        // If dispersion is missing, treat as worst case for P17
        lossDb = 3.1;
        lossLabel = '>3.0 dB';
      }

      const offAxisDegInt = Math.floor(offAxisDeg + 1e-9);
      perSpeaker.push({
        role: canon,
        angleDeg: offAxisDegInt,
        rawAngleDeg: offAxisDegInt,
        lossDb: Math.round(lossDb * 10) / 10,
        lossLabel, // NEW: always one of "≤1.5 dB", "≤3.0 dB", ">3.0 dB"
        isBeyondNonLcrLimit: false,
      });

      if (lossDb > worstLossDb) {
        worstLossDb = lossDb;
        worstRole = canon;
        worstAngleDeg = offAxisDegInt;
      }
    }

    let level17 = '—';
    if (Number.isFinite(worstLossDb)) {
      if (worstLossDb <= 1.5) level17 = 'L4';
      else if (worstLossDb <= 3.0) level17 = 'L3';
      else level17 = 'L2'; // ONLY when > 3.0
    }

    const worstLossLabel = perSpeaker.find(s => s.role === worstRole)?.lossLabel || '—';

    metrics.rp22.p17 = {
      value: worstLossDb,
      formatted: worstLossLabel, // show threshold label, not a pretend "dB reading"
      level: level17,
      perSpeaker,
      worstRole,
      worstAngleDeg,
      worstLossDb,
      worstLossLabel,
    };
  }

  // P9/P20 from analysisResult (if available)
  const seatAnalysis = analysisResult?.seatMetrics?.get?.(seat.id);
  if (seatAnalysis?.p9) metrics.rp22.p9 = seatAnalysis.p9;
  if (seatAnalysis?.p20) metrics.rp22.p20 = seatAnalysis.p20;

  // Add SPL and position data
  const seatSplFormatted = seatSplData ? {
    lcr: seatSplData.screen || {},
    surrounds: seatSplData.surrounds || {},
    overheads: seatSplData.uppers || {},
  } : { lcr: {}, surrounds: {}, overheads: {} };

  return {
    seatId: seat.id || '—',
    isPrimary: seat.isPrimary || false,
    rp23: metrics.rp23,
    rp22: metrics.rp22,
    splAtSeat: seatSplFormatted,
    position: `(${seatX.toFixed(2)}, ${seatY.toFixed(2)})`,
    distanceToScreen: `${distanceToScreen.toFixed(2)}m`,
    distanceToMLP: hasMlp ? `${Math.hypot(seatX - mlp.x, seatY - mlp.y).toFixed(2)}m` : '—',
  };
}