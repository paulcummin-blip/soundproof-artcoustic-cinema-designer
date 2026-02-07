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

// Helper for safe number extraction
const finite = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

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
  let rp23DisplayDeg = null; // Floored integer for display
  if (screen?.visibleWidthInches && distanceToScreen > 0.1) {
    const screenWidthM = (screen.visibleWidthInches * 0.0254) || 0;
    if (screenWidthM > 0) {
      rp23AngleDeg = 2 * Math.atan((screenWidthM / 2) / distanceToScreen) * (180 / Math.PI);
      rp23DisplayDeg = Math.floor(rp23AngleDeg);
      
      if (rp23AngleDeg >= 48 && rp23AngleDeg <= 67) rp23Level = 'L4';
      else if (rp23AngleDeg >= 45 && rp23AngleDeg <= 70) rp23Level = 'L3';
      else if (rp23AngleDeg >= 40 && rp23AngleDeg <= 75) rp23Level = 'L2';
      else if (rp23AngleDeg >= 35 && rp23AngleDeg <= 80) rp23Level = 'L1';
      else rp23Level = 'FAIL';
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

  // Detect if overheads exist (for P9/P10 applicability)
  const hasOverheads = placedSpeakers.some(s => {
    const r = getCanonicalRole(s.role);
    return r.startsWith('T'); // TFL, TFR, TML, etc
  });

  // Pull per-seat RP22 metrics from analysisResult (single source of truth)
  const seatMetrics = analysisResult?.seatMetrics?.get?.(seat.id);
  if (seatMetrics) {
    if (seatMetrics.p9) {
      data.rp22.p9 = seatMetrics.p9;
      
      // Build compact explanation from structured gap data
      if (seatMetrics.p9.details?.gaps?.length) {
        const lines = seatMetrics.p9.details.gaps.map(
          g => `${g.pair} ${g.deg.toFixed(0)}°`
        );
        
        const worst = seatMetrics.p9.details.worst;
        if (worst) {
          data.rp22.p9Detail = `${lines.join(', ')} (worst: ${worst.deg.toFixed(0)}°)`;
        } else {
          data.rp22.p9Detail = lines.join(', ');
        }
      }
    }
    if (seatMetrics.p10) data.rp22.p10 = seatMetrics.p10;
    // P16 is computed locally below (skip analysisResult)
    if (seatMetrics.p17) data.rp22.p17 = seatMetrics.p17;
    if (seatMetrics.p20) data.rp22.p20 = seatMetrics.p20;
  }

  // P9: Set N/A if no overheads
  if (!hasOverheads && !data.rp22.p9.value) {
    data.rp22.p9 = {
      value: null,
      formatted: '—',
      level: 'N/A',
    };
  }

  // ALWAYS compute P16 locally using LIVE plan-view yaw logic (matches icon rotation)
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
        const currRank = levelRank[levelStr] || 0;
        const worstRank = levelRank[worstLevel] || 0;
        
        if (currRank < worstRank || (currRank === worstRank && offAxisFloor > (worstAngleDeg || 0))) {
          worstLevel = levelStr;
          worstLossLabel = lossLabel;
          worstRole = canon;
          worstAngleDeg = offAxisFloor;
        }
      }

      data.rp22.p16 = {
        value: null, // No numeric value, only step labels
        formatted: worstRole || '—', // Just the role (e.g., "FR")
        hudLabel: worstRole || '—',
        level: worstLevel || '—', // "FAIL" or "L4"/"L2"/"L1"
        perSpeaker,
        worstRole,
        worstAngleDeg,
        worstLossLabel,
      };
    }
  }

  // ALWAYS compute P17 locally using LIVE plan-view yaw logic (matches icon rotation)
  {
    const surroundAndOverheadRoles = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']);
    const extraSurroundPattern = /^(SL|SR)\d+$/;
    
    const groupForRole = (role) => {
      const roleUpper = String(role || '').toUpperCase();
      if (extraSurroundPattern.test(roleUpper)) return 'Extra Surrounds';
      if (role === 'LW' || role === 'RW') return 'Front Wides';
      if (role === 'SL' || role === 'SR') return 'Side Surrounds';
      if (role === 'SBL' || role === 'SBR') return 'Rear Surrounds';
      if (String(role).startsWith('T')) return 'Overheads';
      return 'Other';
    };
    
    const relevantSpeakers = (placedSpeakers || []).filter(sp => {
      const canon = getCanonicalRole(sp.role);
      const roleUpper = String(sp.role || '').toUpperCase();
      return (surroundAndOverheadRoles.has(canon) || extraSurroundPattern.test(roleUpper)) && sp.position;
    });

    if (relevantSpeakers.length > 0) {
      // Local yaw helper: FROM -> TO (0° = +Y, +90° = +X, -90° = -X, 180° = -Y)
      const yawFromToDeg = (from, to) => {
        const dx = (to?.x ?? 0) - (from?.x ?? 0);
        const dy = (to?.y ?? 0) - (from?.y ?? 0);
        return Math.atan2(dx, dy) * (180 / Math.PI);
      };

      const perSpeaker = [];
      let worstLossDb = -Infinity;
      let worstRole = null;
      let worstAngleDeg = null;
      let worstGroup = null;

      for (const sp of relevantSpeakers) {
        const canon = getCanonicalRole(sp.role);
        const pos = sp.position;
        
        // Calculate direction from speaker to seat
        const dx = seatX - pos.x;
        const dy = seatY - pos.y;
        const dirDeg = yawFromToDeg(pos, { x: seatX, y: seatY });
        
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

          // Store for later use (we bypass 2D yaw math for overheads)
          sp.__p17_overheadOffAxisDeg = angleFromDownDeg;

          // Skip 2D dirDeg/aimDeg calculation for overheads
        } else if (isLW_RW) {
          // Front Wides: check toggle (LIVE)
          if (aimFrontWidesAtMLP) {
            aimDeg = safeYawToMLP(pos, mlp);
          } else {
            // Wall-flat: left wall = -90, right wall = +90
            aimDeg = (canon === 'LW') ? -90 : 90;
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

        // Overheads keep their 3D off-axis result.
        // ALL wall speakers must use the smaller angle (eg 151° -> 29°).
        const offAxisDegRaw = isOverhead && Number.isFinite(sp.__p17_overheadOffAxisDeg)
          ? sp.__p17_overheadOffAxisDeg
          : Math.abs(offAxisRaw);

        const offAxisDeg = isOverhead
          ? offAxisDegRaw
          : smallestOffAxisDeg(offAxisDegRaw);

        const offAxisDegInt = Math.floor(offAxisDeg + 1e-9);
        
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
        // Use FLOORED integer angle for bucket decisions to avoid boundary twitch
        const offAxisForBucket = Math.floor(offAxisDeg + 1e-9);
        const offAxisClamped = Math.min(180, Math.max(0, offAxisForBucket));

        // Default: assume we're outside the -3 dB window -> treat as ">=4 dB down" (L2)
        // This ensures we can actually produce L2 under the new spec.
        let lossDb = 4.0;

        if (disp && disp.minus1p5dB != null && disp.minus3dB != null) {
          // disp values are already half-angles via halfDispersionDeg(...)
          if (offAxisClamped <= disp.minus1p5dB) {
            lossDb = 1.5;  // "no more than 1.5 dB down" => L4
          } else if (offAxisClamped <= disp.minus3dB) {
            lossDb = 3.0;  // "no more than 3 dB down" => L3
          } else {
            lossDb = 4.0;  // outside -3 window => L2 (>=4 dB down)
          }
        } else {
          // No dispersion data: still enforce the same 3-state rule using safe generic half-angle thresholds
          // (These are conservative defaults and keep the system stable.)
          if (offAxisClamped <= 28) lossDb = 1.5;
          else if (offAxisClamped <= 41) lossDb = 3.0;
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
      
      // P17 LEVELS (ONLY L4/L3/L2, no L1, no FAIL) using floored integer dB
      let level17 = '—';
      if (Number.isFinite(worstLossDb)) {
        // worstLossDb is already an integer bucket (1, 3, or 4+)
        if (worstLossDb <= 1) level17 = 'L4';     // (shouldn't occur with our buckets, but safe)
        else if (worstLossDb <= 2) level17 = 'L4'; // treat 2 as L4 (conservative)
        else if (worstLossDb <= 3) level17 = 'L3'; // 3 => L3
        else level17 = 'L2';                       // 4+ => L2
      }
      
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

  // NEW: Use centralized SPL calculation (single source of truth)
  const seatSplData = getSeatSplMetrics(allSeatSplMetrics, seat.id);
  
  data.splAtSeat = {
    lcr: seatSplData?.screen || {},
    surrounds: seatSplData?.surrounds || {},
    overheads: seatSplData?.uppers || {},
  };

  // HUD-local P10 – Maximum SPL difference between upper speakers
  {
    if (!hasOverheads) {
      data.rp22.p10 = {
        value: null,
        formatted: '—',
        level: 'N/A',
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
          formatted: '—',
          level:     'NO DATA',
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
  if (Number.isFinite(seatX) && Number.isFinite(seatY)) {
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
  if (placedLCR.length >= 2 && seatSplData?.screen) {
    const lcrSplValues = Object.values(seatSplData.screen)
      .map(s => s.value)
      .filter(Number.isFinite);
    
    const valueDb = maxPairwiseDelta(lcrSplValues);
    
    if (Number.isFinite(valueDb)) {
      data.rp22.p4 = {
        valueDb,
        level: rp22LevelForP4(valueDb),
        formatted: `${floorDeg(valueDb) || 0} dB`
      };
    }
  }

  // --- P5: Max horizontal gap between adjacent surrounds/wides (INCLUDE WRAP, MATCH PLAN ANGLES) ---
  {
    const extraSurroundPattern = /^(SL|SR)\d+$/;

    const p5Speakers = (placedSpeakers || []).filter(s => {
      const canon = getCanonicalRole(s?.role);
      const roleUpper = String(s?.role || '').toUpperCase();

      const isStandard = ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(canon);
      const isExtraSide = extraSurroundPattern.test(roleUpper);

      return (isStandard || isExtraSide) &&
        s?.position &&
        Number.isFinite(s.position.x) &&
        Number.isFinite(s.position.y);
    });

    if (p5Speakers.length >= 2) {
      // Azimuth from seat → speaker, mapped to 0..360 (same convention as plan maths)
      const azList = p5Speakers.map(s => {
        const dx = (s.position.x - seatX);
        const dy = (s.position.y - seatY);
        let az = Math.atan2(dx, dy) * (180 / Math.PI);
        az = ((az % 360) + 360) % 360;
        return { canon: getCanonicalRole(s.role), az };
      });

      azList.sort((a, b) => a.az - b.az);

      // Compute max gap between adjacent speakers INCLUDING WRAP (last → first)
      let maxGap = -Infinity;

      for (let i = 0; i < azList.length; i++) {
        const a = azList[i];
        const b = azList[(i + 1) % azList.length];

        let gap = b.az - a.az;
        if (gap < 0) gap += 360;

        if (gap > maxGap) maxGap = gap;
      }

      if (!Number.isFinite(maxGap)) maxGap = null;

      let level = '—';
      if (Number.isFinite(maxGap)) {
        const gapFloor = Math.floor(maxGap + 1e-9);

        // RP22 P5 thresholds (keep existing app thresholds)
        if (gapFloor <= 50) level = 'L4';
        else if (gapFloor <= 60) level = 'L3';
        else if (gapFloor <= 80) level = 'L2';
        else level = 'L1';

        data.rp22.p5 = {
          valueDeg: maxGap,
          formatted: `${gapFloor}°`,
          level,
        };
      }
    }
  }

  // --- P6: Surround SPL delta (requires ≥2 surrounds) ---
  if (placedSur.length >= 2 && seatSplData?.surrounds) {
    const surSplValues = Object.values(seatSplData.surrounds)
      .map(s => s.value)
      .filter(Number.isFinite);

    const p6ValueDb = maxPairwiseDelta(surSplValues);
    if (Number.isFinite(p6ValueDb)) {
      // OPTION B: always round DOWN to nearest integer BEFORE grading and display
      const p6FloorDb = Math.floor(p6ValueDb);

      let level = '—';
      if (p6FloorDb <= 2) level = 'L4';
      else if (p6FloorDb <= 4) level = 'L3';
      else if (p6FloorDb <= 6) level = 'L2';
      else if (p6FloorDb <= 10) level = 'L1';
      else level = 'FAIL';

      data.rp22.p6 = {
        valueDb: p6ValueDb,                 // keep raw value for any future deep-dive
        valueDbFloor: p6FloorDb,            // explicit floored value (for consistency/debug)
        level,
        formatted: `${p6FloorDb} dB`        // DISPLAY MUST MATCH GRADE INPUT
      };
    }
  }

  // Legacy bridge
  data.p1NearestM = data.rp22.p1.valueM;

  return data;
}