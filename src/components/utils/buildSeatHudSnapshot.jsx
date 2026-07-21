// Shared Seat HUD snapshot builder - single source of truth for per-seat metrics
// Used by both Seat HUD (hover) and RP22 Report (all seats)
// 
// CRITICAL: This file is a PURE COPY of RoomVisualisation's tooltipData builder
// Any changes to the HUD must be reflected here to keep both in sync

import { getSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { 
  metricP1_nearestWallM, 
  rp22LevelForP1, 
  rp22LevelForP4,
} from '@/components/utils/seatMetrics';
import { safeYawToMLP } from '@/components/room/rv/RenderPrimitives';
import { computeSurroundRingGaps, rp22LevelForP5 } from '@/components/utils/p5SurroundGaps';
import { getSpeakerVisibilityFor } from '@/components/AppStateProvider';
import { rp23DisplayAngleDeg, rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';
import { levelP17_wsFR } from '@/components/utils/rp22/levels';

// Helper for safe number extraction
const finite = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const hasXY = (s) =>
  s?.position &&
  Number.isFinite(s.position.x) &&
  Number.isFinite(s.position.y);

const hasRealModel = (s) => {
  const ms = String(s?.model ?? "").trim().toLowerCase();
  return !!ms && ms !== "off" && ms !== "none";
};

const notCalculatedHud = () => ({
  value: null,
  formatted: "Not Calculated",
  hudLabel: "Not Calculated",
  level: "—",
});

// Angle display helpers - whole degrees only (floor), no decimals
const floorDeg = (deg) => {
  if (deg === null || deg === undefined) return null;
  const n = Number(deg);
  return Number.isFinite(n) ? Math.floor(n) : null;
};

const fmtDeg = (deg) => {
  const n = floorDeg(deg);
  return n !== null ? `${n}°` : '—';
};

// Safe role canonicalization
const getCanonicalRole = (role) => {
  const map = { SL:'SL',LS:'SL', SR:'SR',RS:'SR', SBL:'SBL',SBR:'SBR', LW:'LW',RW:'RW', FL:'FL',L:'FL', FC:'FC',C:'FC', FR:'FR',R:'FR' };
  const r = String(role || '').toUpperCase();
  return map[r] || r;
};

// Helper: max pairwise delta
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

// Helper: convert full included angle to half-angle (±off-axis), rounded up
const halfDispersionDeg = (fullDeg) => {
  if (!Number.isFinite(fullDeg)) return null;
  return Math.ceil(fullDeg / 2);
};

// 3D vector helpers for overhead aim-at-MLP logic
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
// angle between vectors in degrees (0..180)
const angleBetweenDeg = (a, b) => {
  const na = v3norm(a);
  const nb = v3norm(b);
  const d = clamp(v3dot(na, nb), -1, 1);
  return rad2deg(Math.acos(d));
};

/**
 * Build complete Seat HUD snapshot (matches RoomVisualisation tooltipData exactly)
 * 
 * @param {Object} params
 * @param {Object} params.seat - Seat object { id, x, y, z, isPrimary }
 * @param {Array} params.placedSpeakers - All speakers in the room
 * @param {number} params.widthM - Room width in meters
 * @param {number} params.lengthM - Room length in meters
 * @param {number} params.heightM - Room height in meters
 * @param {number} params.screenFrontPlaneM - Screen front plane Y coordinate
 * @param {Object} params.screen - Screen config { visibleWidthInches, ... }
 * @param {Object} params.mlp - MLP point { x, y, z }
 * @param {Map} params.allSeatSplMetrics - Pre-computed SPL metrics for all seats
 * @param {boolean} params.aimAtMLP - LCR aiming toggle
 * @param {boolean} params.aimFrontWidesAtMLP - Front wide aiming toggle
 * @param {boolean} params.aimSideSurroundsAtMLP - Side surround aiming toggle
 * @param {boolean} params.aimRearSurroundsAtMLP - Rear surround aiming toggle
 * @param {Object} params.lcrAngleInfo - Pre-computed LCR angles { L, R }
 * @param {Object} params.analysisResult - Global RP22 analysis result
 * @param {Array} params.seatingPositions - All seats (for P1 centerline check)
 * @param {Object} params.splConfig - SPL config { globalPowerW, radiationMode, ... }
 * @returns {Object} Complete HUD snapshot matching tooltipData structure
 */
export function buildSeatHudSnapshot({
  seat,
  placedSpeakers = [],
  widthM,
  lengthM,
  heightM,
  screenFrontPlaneM,
  screen = {},
  mlp,
  allSeatSplMetrics,
  aimAtMLP = false,
  aimFrontWidesAtMLP = false,
  aimSideSurroundsAtMLP = false,
  aimRearSurroundsAtMLP = false,
  lcrAngleInfo = { L: 0, R: 0 },
  analysisResult = {},
  seatingPositions = [],
  splConfig = {},
  sevenBedMode = '',
  dolbyLayout = '5.1',
  overlaysForRendering = {},
}) {
  if (!seat) return null;

  // Extract seat coordinates
  const seatX = finite(seat?.x ?? seat?.position?.x, 0);
  const seatY = finite(seat?.y ?? seat?.position?.y, 0);
  const seatZ = finite(seat?.z, 1.2);

  // Room dimensions with fallbacks
  const roomWidth = finite(widthM, 4.5);
  const roomLength = finite(lengthM, 6.0);
  const roomHeight = finite(heightM, 2.4);
  const halfW = roomWidth / 2;

  // Distance to screen (from screen plane)
  const distanceToScreen = Math.abs(seatY - screenFrontPlaneM);

  // Distance to MLP
  let distanceToMLP = null;
  if (mlp && Number.isFinite(mlp.x) && Number.isFinite(mlp.y)) {
    const dx = seatX - mlp.x;
    const dy = seatY - mlp.y;
    distanceToMLP = Math.hypot(dx, dy);
  }

  // RP23 horizontal viewing angle
  let rp23AngleDeg = null;
  let rp23Level = null;
  let rp23DisplayDeg = null;
  if (screen?.visibleWidthInches && distanceToScreen > 0.1) {
    const screenWidthM = (screen.visibleWidthInches * 0.0254) || 0;
    if (screenWidthM > 0) {
      rp23AngleDeg = 2 * Math.atan((screenWidthM / 2) / distanceToScreen) * (180 / Math.PI);
      rp23DisplayDeg = rp23DisplayAngleDeg(rp23AngleDeg);
      rp23Level = rp23LevelForAngleDeg(rp23AngleDeg) || 'FAIL';
    }
  }

  // Compute directional arrows and distance to nearest wall
  const distLeft = seatX;
  const distRight = roomWidth - seatX;
  const xNearest = Math.min(distLeft, distRight);
  const xArrow = distLeft <= distRight ? '⬅️' : '➡️';
  const yArrow = '⬆️';
  
  // Build base tooltip data
  const data = {
    seatId: seat.id || 'Seat',
    isPrimary: seat.isPrimary || false,
    position: `(${xArrow} ${xNearest.toFixed(2)}m, ${yArrow} ${seatY.toFixed(2)}m)`,
    distanceToScreen: Number.isFinite(distanceToScreen) ? `${distanceToScreen.toFixed(2)}m` : '—',
    distanceToMLP: Number.isFinite(distanceToMLP) ? `${distanceToMLP.toFixed(2)}m` : '—',
    rp23: {
      angleDeg: rp23AngleDeg,
      displayDeg: rp23DisplayDeg, // Floored integer
      level: rp23Level,
      formatted: Number.isFinite(rp23DisplayDeg) ? `${rp23DisplayDeg}°` : '—',
    }
  };

  // RP22 per-seat metrics – initialise with defaults
  data.rp22 = {
    p1:  { valueM:  null, level: '—', formatted: '—' },
    p4:  { valueDb: null, level: '—', formatted: '—' },
    p5:  { valueDeg: null, level: '—', formatted: '—' },
    p6:  { valueDb: null, level: '—', formatted: '—' },
    p9:  { valueDeg: null, level: '—', formatted: '—' },
    p10: { valueDb: null, level: '—', formatted: '—' },
    p16: { valueDb: null, level: '—', formatted: '—' },
    p17: { valueDb: null, level: '—', formatted: '—' },
    p20: { valueDb: null, level: '—', formatted: 'Not Calculated' },
  };

  const engineSeatId = seat.id || `seat-${seatX}-${seatY}`;
  const engineSeatRp22 = analysisResult?.perSeatRp22?.[engineSeatId]?.rp22 || null;

  if (engineSeatRp22) {
    const seatScopedParamMap = {
      1: 'p1',
      4: 'p4',
      5: 'p5',
      6: 'p6',
      9: 'p9',
      10: 'p10',
      16: 'p16',
      17: 'p17',
      20: 'p20',
    };

    Object.entries(seatScopedParamMap).forEach(([paramNumber, paramKey]) => {
      const metric = engineSeatRp22?.[paramNumber];
      if (metric) data.rp22[paramKey] = metric;
    });
  }

  // Detect if overheads exist (for P9/P10 applicability)
  const hasOverheads = placedSpeakers.some(s => {
    const r = getCanonicalRole(s.role);
    return r.startsWith('T'); // TFL, TFR, TML, etc
  });

  if (data.rp22.p9?.details?.gaps?.length) {
    const lines = data.rp22.p9.details.gaps.map(
      g => `${g.pair} ${g.deg.toFixed(0)}°`
    );

    const worst = data.rp22.p9.details.worst;
    const rowElevations = Array.isArray(data.rp22.p9.details.rowElevations)
      ? data.rp22.p9.details.rowElevations
      : [];
    const frontRow = rowElevations.find(r => r?.rowName === 'front');
    const midRow = rowElevations.find(r => r?.rowName === 'mid');
    const rearRow = rowElevations.find(r => r?.rowName === 'rear');
    const rspY = Number.isFinite(mlp?.y) ? mlp.y.toFixed(2) : '—';
    const geometryText = [
      `seatY=${Number.isFinite(seatY) ? seatY.toFixed(2) : '—'}`,
      `rspY=${rspY}`,
      `F=${Number.isFinite(frontRow?.avgY) ? frontRow.avgY.toFixed(2) : '—'}`,
      `M=${Number.isFinite(midRow?.avgY) ? midRow.avgY.toFixed(2) : '—'}`,
      `R=${Number.isFinite(rearRow?.avgY) ? rearRow.avgY.toFixed(2) : '—'}`
    ].join(' | ');

    data.rp22.p9.debugText = worst
      ? `${lines.join(', ')} (worst: ${worst.deg.toFixed(0)}°) | ${geometryText}`
      : `${lines.join(', ')} | ${geometryText}`;
  }

  // P9: Set N/A if no overheads
  if (!engineSeatRp22?.[9] && !hasOverheads && !data.rp22.p9.value) {
    data.rp22.p9 = {
      value: null,
      formatted: 'Not Calculated',
      level: '—',
    };
  }

  // ALWAYS compute P16 locally using LIVE plan-view yaw logic (matches icon rotation)
  if (!engineSeatRp22?.[16]) {
    const lcrRoles = new Set(['FL', 'FC', 'FR', 'L', 'C', 'R']);

    const lcrSpeakers = (placedSpeakers || []).filter(sp => {
      const canon = getCanonicalRole(sp.role);
      return lcrRoles.has(canon) && sp.position;
    });

    if (lcrSpeakers.length > 0) {
      const perSpeaker = [];
      let worstLossLabel = null;
      let worstLevel = 'L4';
      let worstRole = null;
      let worstAngleDeg = null;

      for (const sp of lcrSpeakers) {
        const canon = getCanonicalRole(sp.role);
        const pos = sp.position;

        // Direction from speaker to THIS seat (use SAME convention as icon yaw)
        const dirDeg = safeYawToMLP(pos, { x: seatX, y: seatY });

        // Aim calculation (match renderSpeakers exactly)
        let aimDeg = 0;
        if (aimAtMLP) {
          if (canon === 'FL') aimDeg = lcrAngleInfo.L || 0;
          else if (canon === 'FR') aimDeg = lcrAngleInfo.R || 0;
          else aimDeg = 0; // FC is always 0
        } else {
          aimDeg = 0;
        }

        // Off-axis = shortest arc between aim direction and seat direction
        let offAxisRaw = dirDeg - aimDeg;
        while (offAxisRaw > 180) offAxisRaw -= 360;
        while (offAxisRaw < -180) offAxisRaw += 360;
        const offAxisDeg = Math.abs(offAxisRaw);
        const offAxisFloor = Math.floor(offAxisDeg);

        // Dispersion windows (HALF the stored values, rounded up)
        const meta = getSpeakerModelMeta(sp.model);
        const disp = meta?.dispersion?.horizontal;

        const w1 = Number.isFinite(disp?.minus1p5dB) ? Math.ceil(disp.minus1p5dB / 2) : null;
        const w3 = Number.isFinite(disp?.minus3dB) ? Math.ceil(disp.minus3dB / 2) : null;
        const w5 = Number.isFinite(disp?.minus5dB) ? Math.ceil(disp.minus5dB / 2) : null;

        // Threshold-based step classification: L4/L2/L1/FAIL only (NO L3)
        let lossLabel = 'FAIL';
        let levelStr = 'FAIL';

        if (Number.isFinite(w1) && Number.isFinite(w3) && Number.isFinite(w5)) {
          if (offAxisFloor <= w1) {
            lossLabel = '≤1.5 dB';
            levelStr = 'L4';
          } else if (offAxisFloor <= w3) {
            lossLabel = '≤3.0 dB';
            levelStr = 'L2';
          } else if (offAxisFloor <= w5) {
            lossLabel = '≤5.0 dB';
            levelStr = 'L1';
          } else {
            lossLabel = 'FAIL';
            levelStr = 'FAIL';
          }
        } else {
          // Fallback to generic thresholds
          if (offAxisFloor <= 28) {
            lossLabel = '≤1.5 dB';
            levelStr = 'L4';
          } else if (offAxisFloor <= 41) {
            lossLabel = '≤3.0 dB';
            levelStr = 'L2';
          } else if (offAxisFloor <= 55) {
            lossLabel = '≤5.0 dB';
            levelStr = 'L1';
          } else {
            lossLabel = 'FAIL';
            levelStr = 'FAIL';
          }
        }

        perSpeaker.push({
          role: canon,
          angleDeg: offAxisFloor,
          rawAngleDeg: offAxisDeg,
          lossLabel,
          level: levelStr,
        });

        // Worst = FAIL worst, then L1 > L2 > L4, then highest angle
        const levelRank = { 'FAIL': 0, 'L1': 1, 'L2': 2, 'L4': 4 };
        const currRank = (levelRank[levelStr] != null) ? levelRank[levelStr] : 0;
        const worstRank = (levelRank[worstLevel] != null) ? levelRank[worstLevel] : 4;

        const currentWorstAngle = Number.isFinite(worstAngleDeg) ? worstAngleDeg : -Infinity;

        if (currRank < worstRank || (currRank === worstRank && offAxisFloor > currentWorstAngle)) {
          worstLevel = levelStr;
          worstLossLabel = lossLabel;
          worstRole = canon;
          worstAngleDeg = offAxisFloor;
        }
      }

      // P16 MUST BE N/A UNTIL REAL FL/FC/FR SPEAKERS EXIST (NO GHOSTS)
      const _p16Candidates = (placedSpeakers || [])
        .filter(hasXY)
        .filter(hasRealModel);

      const _p16HasFL = _p16Candidates.some(s => getCanonicalRole(s.role) === "FL");
      const _p16HasFC = _p16Candidates.some(s => getCanonicalRole(s.role) === "FC");
      const _p16HasFR = _p16Candidates.some(s => getCanonicalRole(s.role) === "FR");

      if (!(_p16HasFL && _p16HasFC && _p16HasFR)) {
        data.rp22.p16 = {
          ...notCalculatedHud(),
          perSpeaker: [],
          worstRole: null,
          worstAngleDeg: null,
          worstLossLabel: null,
        };
      } else {
        data.rp22.p16 = {
          value: null, // No numeric value, only step labels
          formatted: worstRole && Number.isFinite(worstAngleDeg) ? `${worstRole} ${worstAngleDeg}°` : '—',
          hudLabel: worstRole && Number.isFinite(worstAngleDeg) ? `${worstRole} ${worstAngleDeg}°` : '—',
          level: worstLevel || '—', // "FAIL" or "L4"/"L2"/"L1"
          perSpeaker,
          worstRole,
          worstAngleDeg,
          worstLossLabel,
        };
      }
    }
  }

  // ALWAYS compute P17 locally using LIVE plan-view yaw logic (matches icon rotation)
  if (!engineSeatRp22?.[17]) {
    const extraSurroundPattern = /^(SL|SR)\d+$/;

    // Front Wides are only valid if they are actually enabled by the current layout/toggles.
    // If this is false, LW/RW must be ignored everywhere (no ghost wides in P17).
    const frontWidesOn =
      Boolean(overlaysForRendering?.enableFrontWides) ||
      Boolean(overlaysForRendering?.FRONT_WIDE) ||
      /^9\./.test(String(dolbyLayout || "")) ||
      /^11\./.test(String(dolbyLayout || ""));

    const groupForRole = (role) => {
      const roleUpper = String(role || '').toUpperCase();
      if (extraSurroundPattern.test(roleUpper)) return 'Extra Surrounds';
      if (role === 'LW' || role === 'RW') return 'Front Wides';
      if (role === 'SL' || role === 'SR') return 'Side Surrounds';
      if (role === 'SBL' || role === 'SBR') return 'Rear Surrounds';
      if (String(role).startsWith('T')) return 'Overheads';
      return 'Other';
    };

    // P17 MUST measure ALL non-screen speakers that ACTUALLY EXIST in the drawing
    // (real model + real XY position). Exclude subs/LFE and screen-wall speakers.

    const isP17EligibleRole = (canon, rawRoleUpper) => {
      if (!canon) return false;

      // Exclude subs / LFE
      if (canon === "LFE") return false;

      // Exclude screen wall speakers
      if (canon === "FL" || canon === "FC" || canon === "FR") return false;

      // Extra surrounds count as surrounds
      if (extraSurroundPattern.test(rawRoleUpper)) return true;

      // Bed surrounds
      if (canon === "SL" || canon === "SR" ||
          canon === "SBL" || canon === "SBR") return true;

      // Front Wides: ONLY if actually enabled
      if ((canon === "LW" || canon === "RW") && frontWidesOn) return true;

      // Overheads (include any T* or U* just in case)
      if (String(canon).startsWith("T") || String(canon).startsWith("U")) return true;

      return false;
    };

    const relevantSpeakers = (placedSpeakers || []).filter((sp) => {
      const canon = getCanonicalRole(sp.role);
      const roleUpper = String(sp.role || "").toUpperCase();

      // Must have real XY and a real model (prevents ghosts)
      if (!hasXY(sp)) return false;
      if (!hasRealModel(sp)) return false;

      return isP17EligibleRole(canon, roleUpper);
    });

    if (relevantSpeakers.length > 0) {
      // DELETED: yawFromToDeg (was causing yaw convention mismatch)
      // P17 now uses safeYawToMLP for BOTH dirDeg and aimDeg

      const perSpeaker = [];
      let worstLossDb = -Infinity;
      let worstRole = null;
      let worstAngleDeg = null;
      let worstGroup = null;

      for (const sp of relevantSpeakers) {
        const canon = getCanonicalRole(sp.role);
        const pos = sp.position;
        
        // Calculate direction from speaker to seat (using same convention as aim)
        const dirDeg = safeYawToMLP(pos, { x: seatX, y: seatY });
        
        // CRITICAL: Get speaker's aim using EXACT same logic as renderSpeakers
        let aimDeg = 0;
        const isLW_RW = (canon === 'LW' || canon === 'RW');
        const isSL_SR = (canon === 'SL' || canon === 'SR');
        const isSBL_SBR = (canon === 'SBL' || canon === 'SBR');
        const isOverhead = canon.startsWith('T');
        
        if (isOverhead) {
          // --- OVERHEAD GEOMETRY: 0° is straight DOWN ---
          // Speaker is at ceiling height, seat is at seatZ (head height)
          const zSp = Number.isFinite(heightM) ? Number(heightM) : 2.4;
          const zSeat = Number.isFinite(seatZ) ? Number(seatZ) : 1.2;

          const dx = (seatX - pos.x);
          const dy = (seatY - pos.y);
          const horiz = Math.hypot(dx, dy);

          const drop = Math.max(0.01, zSp - zSeat); // avoid divide by zero
          let angleFromDownDeg = Math.atan2(horiz, drop) * (180 / Math.PI);

          // Apply built-in tilt (tilt reduces the required angle)
          const meta = getSpeakerModelMeta(sp.model);
          const builtInTilt = Number(meta?.builtInTiltDeg) || 0;
          angleFromDownDeg = Math.max(0, angleFromDownDeg - builtInTilt);

          // Store overhead off-axis locally (no mutation)
          sp.__p17_overheadOffAxisDeg = angleFromDownDeg;

          // Skip 2D dirDeg/aimDeg calculation for overheads
        } else if (isLW_RW) {
          // Front Wides: check toggle (LIVE)
          if (aimFrontWidesAtMLP) {
            aimDeg = safeYawToMLP(pos, mlp);
          } else {
            // Wall-flat MUST match RoomVisualisation yaw:
            // LW = +90, RW = -90
            aimDeg = (canon === 'LW') ? 90 : -90;
          }
        } else if (isSL_SR || extraSurroundPattern.test(String(sp.role || '').toUpperCase())) {
          // Side Surrounds + Extra Surrounds: check toggle (LIVE)
          if (aimSideSurroundsAtMLP) {
            aimDeg = safeYawToMLP(pos, mlp);
          } else {
            // Wall-flat: left wall = -90 for SL*/SR*, right wall = +90
            const roleUpper = String(sp.role || '').toUpperCase();
            const isLeftSide = roleUpper.startsWith('SL');
            aimDeg = isLeftSide ? 90 : -90;
          }
        } else if (isSBL_SBR) {
          // Rear Surrounds: check toggle (LIVE)
          if (aimRearSurroundsAtMLP) {
            aimDeg = safeYawToMLP(pos, mlp);
          } else {
            // Wall-flat: detect which wall
            const distLeft  = Math.abs(pos.x - 0);
            const distRight = Math.abs(widthM - pos.x);
            const distBack  = Math.abs(lengthM - pos.y);
            const minDist = Math.min(distLeft, distRight, distBack);

            // Wall-flat
            if (minDist === distBack) aimDeg = 180;
            else if (minDist === distLeft) aimDeg = 90;
            else if (minDist === distRight) aimDeg = -90;
            else aimDeg = 180;
          }
        }
        
        // P17: always keep the smaller of the two possible angles.
        // Example: 151° should be treated as 29° (180-151).
        const smallestOffAxisDeg = (deg) => {
          const a = Math.min(180, Math.max(0, Number(deg) || 0));
          return Math.min(a, 180 - a);
        };

        // Calculate off-axis angle (shortest arc)
        let offAxisRaw = dirDeg - aimDeg;
        // Normalize to -180..+180
        while (offAxisRaw > 180) offAxisRaw -= 360;
        while (offAxisRaw < -180) offAxisRaw += 360;

        // Overheads keep their 3D off-axis result (local value, no mutation)
        const overheadOffAxis = isOverhead ? (sp.__p17_overheadOffAxisDeg || 0) : null;

        // ALL wall speakers must use the smaller angle (eg 151° -> 29°).
        const offAxisDegRaw =
          (isOverhead && Number.isFinite(overheadOffAxis))
            ? overheadOffAxis
            : Math.abs(offAxisRaw);

        const offAxisDeg = isOverhead
          ? offAxisDegRaw
          : smallestOffAxisDeg(offAxisDegRaw);

        // Stabilise wall-speaker off-axis to stop 1° flicker (eg 20↔21).
        // Use the same stabilised value for display AND bucket decisions.
        const SNAP_STEP_DEG = 0.5; // 0.5° is enough to kill wobble without "rounding away" real changes
        const offAxisDegStable = isOverhead
          ? offAxisDeg
          : (Math.round(offAxisDeg / SNAP_STEP_DEG) * SNAP_STEP_DEG);

        const offAxisDegInt = Math.round(offAxisDegStable);
        
        // Product-dependent P17 "bucket" using the model's horizontal dispersion windows
        const meta = getSpeakerModelMeta(sp.model);
        const dispRaw = meta?.dispersion?.horizontal;
        const disp = dispRaw
          ? {
              minus1p5dB: halfDispersionDeg(dispRaw.minus1p5dB),
              minus3dB:   halfDispersionDeg(dispRaw.minus3dB),
              minus5dB:   halfDispersionDeg(dispRaw.minus5dB),
            }
          : null;
        
        // P17 LOSS BUCKETS (3-state only, no L1, no FAIL)
        // Use a rounded value (0.1°) for bucket decisions to stop threshold wobble
        const offAxisForBucket = offAxisDegStable;
        const offAxisClamped = Math.min(180, Math.max(0, offAxisForBucket));

        // Small tolerance so 24.0000001° doesn't flip buckets
        const EPS_DEG = 0.2;

        // Default: assume we're outside the -3 dB window -> treat as ">=4 dB down" (L2)
        // This ensures we can actually produce L2 under the new spec.
        let lossDb = 4.0;

        if (disp && disp.minus1p5dB != null && disp.minus3dB != null) {
          // disp values are already half-angles via halfDispersionDeg(...)
          if (offAxisClamped <= (disp.minus1p5dB + EPS_DEG)) {
            lossDb = 1.5;  // "no more than 1.5 dB down" => L4
          } else if (offAxisClamped <= (disp.minus3dB + EPS_DEG)) {
            lossDb = 3.0;  // "no more than 3 dB down" => L3
          } else {
            lossDb = 4.0;  // outside -3 window => L2 (>=4 dB down)
          }
        } else {
          // No dispersion data: still enforce the same 3-state rule using safe generic half-angle thresholds
          // (These are conservative defaults and keep the system stable.)
          if (offAxisClamped <= (28 + EPS_DEG)) lossDb = 1.5;
          else if (offAxisClamped <= (41 + EPS_DEG)) lossDb = 3.0;
          else lossDb = 4.0;
        }

        // Round DOWN to integer dB for grading (3.9 => 3)
        const lossDbFloor = Math.floor(lossDb + 1e-9);
        
        const isBeyondNonLcrLimit = false; // P17 never uses "beyond limit" logic
        
        perSpeaker.push({
          role: canon,
          angleDeg: offAxisDegInt,       // already floored int
          rawAngleDeg: offAxisDegInt,
          lossDb: lossDbFloor,           // store the floored dB bucket for consistent UI + report
          isBeyondNonLcrLimit,
        });
        
        // Worst = highest (floored) loss bucket, then highest angle
        if (!isBeyondNonLcrLimit) {
          const angleInt = offAxisDegInt;

          const isBetter =
            (lossDbFloor > worstLossDb) ||
            (lossDbFloor === worstLossDb && angleInt > (worstAngleDeg ?? -Infinity)) ||
            (lossDbFloor === worstLossDb && angleInt === (worstAngleDeg ?? -Infinity) && String(canon).localeCompare(String(worstRole)) < 0);

          if (isBetter) {
            worstLossDb = lossDbFloor;
            worstRole = canon;
            worstAngleDeg = angleInt;
            worstGroup = groupForRole(canon);
          }
        }
      }
      
      // Grade the measured value through the authoritative P17 floor rule.
      const level17 = Number.isFinite(worstLossDb)
        ? levelP17_wsFR(worstLossDb).level
        : '—';
      
      // P17 MUST BE N/A UNTIL REAL SL + SR SPEAKERS EXIST (NO GHOSTS)
      const _p17Candidates = (placedSpeakers || [])
        .filter(hasXY)
        .filter(hasRealModel)
        .filter((s) => isP17EligibleRole(getCanonicalRole(s.role), String(s.role || "").toUpperCase()));

      const _p17HasSL = _p17Candidates.some(s => getCanonicalRole(s.role) === "SL");
      const _p17HasSR = _p17Candidates.some(s => getCanonicalRole(s.role) === "SR");

      if (!(_p17HasSL && _p17HasSR)) {
        data.rp22.p17 = {
          ...notCalculatedHud(),
          perSpeaker: [],
          worstRole: null,
          worstAngleDeg: null,
          worstLossDb: null,
          worstGroup: null,
          p17HasNaAngles: false,
        };
      } else {
        data.rp22.p17 = {
          value: worstLossDb,
          formatted: worstGroup || '—', // Show worst group name (e.g., "Side Surrounds")
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
  }

  // NEW: Use centralized SPL calculation (single source of truth)
  const seatSplData = getSeatSplMetrics(allSeatSplMetrics, seat.id);
  
  data.splAtSeat = {
    lcr: seatSplData?.screen || {},
    surrounds: seatSplData?.surrounds || {},
    overheads: seatSplData?.uppers || {},
  };

  // HUD-local P10 – Maximum SPL difference between upper speakers
  if (!engineSeatRp22?.[10]) {
    if (!hasOverheads) {
      data.rp22.p10 = {
        value: null,
        formatted: 'Not Calculated',
        level: '—',
      };
    } else {
      const upperEntries = seatSplData?.uppers
        ? Object.values(seatSplData.uppers)
        : [];

      const upperValues = upperEntries
        .map((o) =>
          o && typeof o.value === 'number' && Number.isFinite(o.value)
            ? o.value
            : null
        )
        .filter((v) => typeof v === 'number' && Number.isFinite(v));

      if (upperValues.length >= 2) {
        const maxSpl = Math.max(...upperValues);
        const minSpl = Math.min(...upperValues);
        const delta  = Math.abs(maxSpl - minSpl);

        // Round to 0.1 dB
        const deltaRounded = Math.round(delta * 10) / 10;

        // RP22 P10 thresholds
        let level10 = 1;
        if (deltaRounded <= 2)      level10 = 4;
        else if (deltaRounded <= 5) level10 = 3;
        else if (deltaRounded <= 8) level10 = 2;
        else                        level10 = 1;

        data.rp22.p10 = {
          value:     deltaRounded,
          formatted: `±${deltaRounded.toFixed(1)} dB`,
          level:     level10,
        };
      } else {
        data.rp22.p10 = {
          value:     null,
          formatted: 'Not Calculated',
          level:     '—',
        };
      }
    }
  }

  // SPL meta: power + radiation mode for HUD caption
  data.splAtSeatMeta = {
    powerW: splConfig?.globalPowerW ?? 100,
    radiationMode: splConfig?.radiationMode ?? 'half-space',
  };

  // Helper: check if speaker has valid position
  const hasPos = s => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);

  // Role sets
  const screenRoles = new Set(['FL','FC','FR']);
  const surroundRoles = new Set(['SL','SR','SBL','SBR','LW','RW']);

  // Filter placed speakers by category (only those with valid positions)
  const placed = Array.isArray(placedSpeakers) ? placedSpeakers.filter(hasPos) : [];
  const placedLCR = placed.filter(s => screenRoles.has(getCanonicalRole(s.role)));
  const placedSur = placed.filter(s => surroundRoles.has(getCanonicalRole(s.role)));

  const seatPos = { x: seatX, y: seatY, z: seatZ };

  // --- Compute P1: Nearest boundary distance ---
  if (!engineSeatRp22?.[1] && Number.isFinite(seatX) && Number.isFinite(seatY)) {
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

    if (Number.isFinite(p1ValueM)) {
      data.rp22.p1 = {
        valueM: p1ValueM,
        level: rp22LevelForP1(p1ValueM),
        formatted: `${p1ValueM.toFixed(2)}m`
      };
    }
  }

  // --- Compute P4: Max SPL difference between screen speakers ---
  if (!engineSeatRp22?.[4]) {
    const lcrSplValues = Object.values(seatSplData?.screen || {})
      .map(s => s?.value)
      .filter(Number.isFinite);

    const valueDb = maxPairwiseDelta(lcrSplValues);

    if (Number.isFinite(valueDb)) {
      data.rp22.p4 = {
        valueDb,
        level: rp22LevelForP4(valueDb),
        formatted: `${floorDeg(valueDb) || 0} dB`
      };
    } else {
      data.rp22.p4 = {
        ...notCalculatedHud(),
      };
    }
  }

  // --- P5: engine is the single source of truth ---
  if (!engineSeatRp22?.[5]) {
    data.rp22.p5 = {
      ...notCalculatedHud(),
    };
  }

  // --- P6: Surround SPL delta (requires ≥2 surrounds) ---
  const engineP6 = engineSeatRp22?.[6];

  if (engineP6 && Number.isFinite(engineP6.valueDb)) {
    // Use engine result only if it contains a real numeric value
    data.rp22.p6 = engineP6;
  } else {
    // Fallback to local calculation from live SPL data
    const surSplValues = Object.values(seatSplData?.surrounds || {})
      .map(s => s?.value)
      .filter(Number.isFinite);

    const p6ValueDb = maxPairwiseDelta(surSplValues);

    if (Number.isFinite(p6ValueDb)) {
      const p6FloorDb = Math.floor(p6ValueDb);

      let level = '—';
      if (p6FloorDb <= 2) level = 'L4';
      else if (p6FloorDb <= 4) level = 'L3';
      else if (p6FloorDb <= 6) level = 'L2';
      else if (p6FloorDb <= 10) level = 'L1';
      else level = 'FAIL';

      data.rp22.p6 = {
        valueDb: p6ValueDb,
        valueDbFloor: p6FloorDb,
        level,
        formatted: `${p6FloorDb} dB`
      };
    } else {
      data.rp22.p6 = {
        ...notCalculatedHud(),
      };
    }
  }

  // Legacy bridge
  data.p1NearestM = data.rp22.p1.valueM;

  return data;
}