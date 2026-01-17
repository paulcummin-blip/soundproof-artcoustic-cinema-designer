// hooks/useRP22AnalysisEngine.js
import { useMemo } from 'react';
import { degreesBetweenVectors } from '../utils/geometryUtils';
import { pickMLP } from '../utils/seatingUtils';
import { RP22_CATALOG } from "@/components/data/rp22Catalog";
import { computeBackArc, param5LevelFromGap } from "@/components/utils/RP22Geometry";
import { computeSeatRoles } from "@/components/utils/seatRoles";
import { getUpperSpeakersForSeat, computeUpperVerticalAnglesForSeat, computeUpperSplSpreadForSeat } from "../utils/rp22UpperSeatMetrics";
import { computeScreenVarianceMetrics, computeWideSurroundUpperVarianceMetrics, computeBassVarianceMetrics } from "../utils/rp22SeatResponseConsistency";
import { computeP16ForSeat, computeP17ForAllSeats } from "../utils/rp22HfOffAxis";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { getSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones";

// Safe helpers
const asArr = (x) => (Array.isArray(x) ? x : []);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// plan view: x = lateral, y = fore/aft
function azimuthFromMLP(mlp, p) {
  if (!mlp || !p || !isNum(mlp.x) || !isNum(mlp.y) || !isNum(p.x) || !isNum(p.y)) return 0;
  const dx = p.x - mlp.x;   // lateral
  const dy = p.y - mlp.y;   // fore/aft
  const deg = Math.atan2(dx, dy) * 180 / Math.PI; // left -, right +
  return (deg + 360) % 360; // 0..360
}

function evaluateParameter5AllLayouts(placedSpeakers, seatingPositions, mlpBasis = "front") {
  const speakers = asArr(placedSpeakers);
  const seats = asArr(seatingPositions);
  if (!speakers.length || !seats.length) return null;

  const seatsWithRoles = computeSeatRoles(seats);
  const primarySeats = seatsWithRoles.filter(s => s.isPrimary);
  const src = primarySeats.length ? primarySeats : seatsWithRoles;

  const mlp = pickMLP(mlpBasis, src);
  
  // NULL-SAFE GUARD
  if (!mlp || !Number.isFinite(mlp.x) || !Number.isFinite(mlp.y)) {
    return null;
  }

  // Bed-layer surrounds including wides/sides/rears
  const surroundRegex = /^(LS|RS|LSS|RSS|LRS|RRS|LW|RW|SL|SR|SBL|SBR|LR|RR|FWL|FWR)$/i;
  const surrounds = speakers
    .filter(s => surroundRegex.test(String(s.role)))
    .map(s => ({ id: s.id || s.role, role: s.role, position: s.position }))
    .filter(s => isNum(s?.position?.x) && isNum(s?.position?.y));

  if (surrounds.length < 2) return null;

  // Use CW back-arc gaps (drop the front wrap)
  const { backArcAngles } = computeBackArc(surrounds, mlp);
  const innerAngles = Array.isArray(backArcAngles) ? backArcAngles.slice() : [];
  if (!innerAngles.length) return null;

  const maxGap = Math.max(...innerAngles);

  const p5CatalogEntry = RP22_CATALOG["5"];
  const lvlP5 = p5CatalogEntry.levels;
  let level5 = 1;
  if (lvlP5.L4 != null && maxGap <= lvlP5.L4) level5 = 4;
  else if (lvlP5.L3 != null && maxGap <= lvlP5.L3) level5 = 3;
  else if (lvlP5.L2 != null && maxGap <= lvlP5.L2) level5 = 2;

  return {
    number: 5,
    title: p5CatalogEntry.title,
    level: level5,
    value: Number(maxGap.toFixed(1)),
    unit: p5CatalogEntry.unit,
    gaps: innerAngles,
    note: "Back-arc gaps (MLP)"
  };
}

function evaluateFrontWideDeviation(speakers, seating, mlpBasis = "front", mlpPointOverride = null, dimensions = null) {
  const seatsWithRoles = computeSeatRoles(asArr(seating));
  const primarySeats = seatsWithRoles.filter(s => s.isPrimary);
  const src = primarySeats.length ? primarySeats : seatsWithRoles;
  
  // Use passed mlpPoint (green dot) if available, else fall back to seat-based MLP
  const mlpUsed = mlpPointOverride && Number.isFinite(mlpPointOverride.x) && Number.isFinite(mlpPointOverride.y)
    ? mlpPointOverride
    : pickMLP(mlpBasis, src);
  
  // NULL-SAFE GUARD
  if (!mlpUsed || !Number.isFinite(mlpUsed.x) || !Number.isFinite(mlpUsed.y)) {
    return { number: 7, title: RP22_CATALOG["7"].title, level: null, value: null, unit: RP22_CATALOG["7"].unit, overlay: null, note: "Front Wide angular deviation", deviation: null, perSide: null, status: "no_data" };
  }

  // Helper to get position from any format
  const getPos = (s) => {
    if (!s) return null;
    if (s.position && isNum(s.position.x) && isNum(s.position.y)) return s.position;
    if (s.pos && isNum(s.pos.x) && isNum(s.pos.y)) return s.pos;
    if (isNum(s.x) && isNum(s.y)) return { x: s.x, y: s.y };
    return null;
  };

  // Normalize role (handle aliases)
  const normalizeRole = (role) => {
    const r = String(role || '').toUpperCase();
    if (r === 'L' || r === 'FL') return 'L';
    if (r === 'R' || r === 'FR') return 'R';
    if (r === 'LS' || r === 'SL') return 'LS';
    if (r === 'RS' || r === 'SR') return 'RS';
    if (r === 'LW' || r === 'FWL' || r === 'WL' || r === 'LFW') return 'LW';
    if (r === 'RW' || r === 'FWR' || r === 'WR' || r === 'RFW') return 'RW';
    return r;
  };

  // Find speakers by normalized role
  const findSpeaker = (targetRole) => {
    const spk = speakers.find(s => normalizeRole(s.role) === targetRole);
    if (!spk) return null;
    const pos = getPos(spk);
    return pos ? { ...spk, position: pos } : null;
  };

  const LW = findSpeaker('LW');
  const RW = findSpeaker('RW');

  // Helper for azimuth calculation (0° = +Y, 90° = +X)
  const azimuthDeg = (from, to) => {
    if (!from || !to || !isNum(from.x) || !isNum(from.y) || !isNum(to.x) || !isNum(to.y)) return NaN;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  };

  // Helper for circular delta (0..180)
  const circDelta = (a, b) => {
    if (!isNum(a) || !isNum(b)) return NaN;
    let diff = Math.abs(a - b);
    if (diff > 180) diff = 360 - diff;
    return diff;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW PATH: Compute overlay median truth internally (same util as overlay)
  // ═══════════════════════════════════════════════════════════════════════════
  if (LW && RW && dimensions) {
    const roomWidthM = Number(dimensions.widthM || dimensions.width);
    const roomLengthM = Number(dimensions.lengthM || dimensions.length);
    
    if (isNum(roomWidthM) && roomWidthM > 0 && isNum(roomLengthM) && roomLengthM > 0) {
      try {
        // Call the SAME utility the overlay uses
        const fwZones = computeFrontWideZonesStrict({
          mlpPoint: mlpUsed,
          dimensions: { width: roomWidthM, length: roomLengthM },
          placedSpeakers: speakers,
          getModelDims: getSpeakerModelMeta,
          rp22BoundDeg: 10
        });
        
        // If overlay truth is valid, use it
        if (fwZones?.status === 'ok' && 
            fwZones?.left?.status === 'ok' && 
            fwZones?.right?.status === 'ok' &&
            isNum(fwZones.left.medianY) && 
            isNum(fwZones.right.medianY)) {
          
          // CRITICAL: Use actual speaker X (not hardcoded wall inset)
          // This eliminates the final 2.2° because ideal X now matches where reset places the speaker
          const idealLWPoint = { 
            x: LW.position.x,  // Use actual speaker X
            y: fwZones.left.medianY 
          };
          const idealRWPoint = { 
            x: RW.position.x,  // Use actual speaker X
            y: fwZones.right.medianY 
          };
          
          const azActualLW = azimuthDeg(mlpUsed, LW.position);
          const azIdealLW = azimuthDeg(mlpUsed, idealLWPoint);
          const devLW = circDelta(azActualLW, azIdealLW);
          
          const azActualRW = azimuthDeg(mlpUsed, RW.position);
          const azIdealRW = azimuthDeg(mlpUsed, idealRWPoint);
          const devRW = circDelta(azActualRW, azIdealRW);
          
          const validDevs = [devLW, devRW].filter(v => isNum(v));
          if (validDevs.length > 0) {
            const maxDev = Math.max(...validDevs);
            
            // Grade using RP22 thresholds
            const p7CatalogEntry = RP22_CATALOG["7"];
            const lvlP7 = p7CatalogEntry.levels;
            let level7 = 1;
            if (lvlP7.L4 != null && maxDev <= lvlP7.L4) level7 = 4;
            else if (lvlP7.L3 != null && maxDev <= lvlP7.L3) level7 = 3;
            else if (lvlP7.L2 != null && maxDev <= lvlP7.L2) level7 = 2;
            
            return {
              number: 7,
              title: p7CatalogEntry.title,
              level: level7,
              value: Number(maxDev.toFixed(1)),
              unit: p7CatalogEntry.unit,
              overlay: null,
              note: "Deviation from RP22 median (overlay truth)",
              deviation: maxDev,
              perSide: {
                LW: { deviation: devLW, targetAngle: azIdealLW, actualAngle: azActualLW },
                RW: { deviation: devRW, targetAngle: azIdealRW, actualAngle: azActualRW }
              },
              status: "ok",
              p7MlpUsed: { x: mlpUsed.x, y: mlpUsed.y },
              p7MlpSource: mlpPointOverride ? "override" : "seat",
              // Debug verification
              p7IdealSource: "overlayTruth",
              p7IdealLW: idealLWPoint,
              p7IdealRW: idealRWPoint,
              p7ActualLW: LW.position,
              p7ActualRW: RW.position
            };
          }
        }
      } catch (e) {
        // Silently fall through to bisector method on error
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[P7] Overlay truth calculation failed, using bisector fallback:', e);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK PATH: Use bisector method (legacy)
  // ═══════════════════════════════════════════════════════════════════════════
  const L  = findSpeaker('L');
  const R  = findSpeaker('R');
  const LS = findSpeaker('LS');
  const RS = findSpeaker('RS');

  const calcSide = (front, side, wide) => {
    if (!front || !side || !wide) return { deviation: null, targetAngle: null, actualAngle: null };
    
    const mlpPos = mlpUsed;
    const frontVec = { x: front.position.x - mlpPos.x, y: front.position.y - mlpPos.y };
    const sideVec  = { x: side.position.x  - mlpPos.x, y: side.position.y  - mlpPos.y };
    const wideVec  = { x: wide.position.x  - mlpPos.x, y: wide.position.y  - mlpPos.y };

    const magFront = Math.hypot(frontVec.x, frontVec.y) || 1;
    const magSide = Math.hypot(sideVec.x, sideVec.y) || 1;
    const magWide = Math.hypot(wideVec.x, wideVec.y) || 1;

    const bisector = {
      x: (frontVec.x / magFront) + (sideVec.x / magSide),
      y: (frontVec.y / magFront) + (sideVec.y / magSide)
    };
    const bisectorNorm = Math.hypot(bisector.x, bisector.y) || 1;
    const bisectorUnit = { x: bisector.x / bisectorNorm, y: bisector.y / bisectorNorm };
    
    const wideUnit = { x: wideVec.x / magWide, y: wideVec.y / magWide };

    const deviation = degreesBetweenVectors(bisectorUnit, wideUnit);
    
    const getAngle = (vec) => (vec.x === 0 && vec.y === 0) ? 0 : (Math.atan2(vec.x, vec.y) * 180 / Math.PI + 360) % 360;

    return {
      deviation,
      targetAngle: getAngle(bisectorUnit),
      actualAngle: getAngle(wideUnit),
    };
  };

  const detailsL = calcSide(L, LS, LW);
  const detailsR = calcSide(R, RS, RW);

  const deviations = [detailsL.deviation, detailsR.deviation].filter(v => v !== null && isNum(v));
  if (!deviations.length) {
    return {
      number: 7,
      title: RP22_CATALOG["7"].title,
      level: null,
      value: null,
      unit: RP22_CATALOG["7"].unit,
      overlay: null,
      note: "Front Wide angular deviation from bisector",
      deviation: null,
      perSide: { LW: detailsL, RW: detailsR },
      status: "no_data"
    };
  }

  const avgDev = deviations.reduce((a,b)=>a+b,0) / deviations.length;

  const p7CatalogEntry = RP22_CATALOG["7"];
  const lvlP7 = p7CatalogEntry.levels;
  let level7 = 1;
  if (lvlP7.L4 != null && avgDev <= lvlP7.L4) level7 = 4;
  else if (lvlP7.L3 != null && avgDev <= lvlP7.L3) level7 = 3;
  else if (lvlP7.L2 != null && avgDev <= lvlP7.L2) level7 = 2;

  return {
    number: 7,
    title: p7CatalogEntry.title,
    level: level7,
    value: isNum(avgDev) ? Number(avgDev.toFixed(1)) : null,
    unit: p7CatalogEntry.unit,
    overlay: null,
    note: "Front Wide angular deviation from bisector (fallback)",
    deviation: avgDev,
    perSide: {
      LW: detailsL,
      RW: detailsR
    },
    status: "ok",
    p7MlpUsed: { x: mlpUsed.x, y: mlpUsed.y },
    p7MlpSource: mlpPointOverride ? "override" : "seat",
    p7IdealSource: "bisectorFallback"
  };
}

// Helper to normalize role names
const getCanonicalRole = (role) => String(role || "").toUpperCase();

export const useRP22AnalysisEngine = ({ placedSpeakers, seatingPositions, dimensions, mlpBasis, mlpPointOverride, seatSplMetrics, overheadState, aimState }) => {

  const evaluateOverheads = (speakers, seats, roomHeight) => {
    // This is where real P9, P10, P11, P13 logic would go.
    // For now, return dummy placeholder levels to unblock the UI.
    return {
        P9Level: 2,
        P10Level: 3,
        P11Level: 4,
        P13Level: 2,
    };
  };

  // Helper to resolve overhead model (same logic as RoomVisualisation)
  const resolveOverheadModel = (speaker, overheadState) => {
    if (!speaker || !speaker.role) return speaker.model || null;
    
    const role = String(speaker.role).toUpperCase();
    if (!role.startsWith('T')) return speaker.model || null;
    
    // Determine zone position
    let zonePosition = null;
    if (['TFL', 'TFR', 'TFC'].includes(role)) {
      zonePosition = 'front';
    } else if (['TL', 'TR', 'TML', 'TMR'].includes(role)) {
      zonePosition = 'mid';
    } else if (['TBL', 'TBR', 'TBC'].includes(role)) {
      zonePosition = 'rear';
    }
    
    if (!zonePosition) return speaker.model || null;
    
    // Get effective model for this position
    const global = overheadState?.globalModel;
    
    if (zonePosition === 'front') {
      return overheadState?.useFrontGlobal 
        ? global 
        : (overheadState?.frontOverride || global);
    }
    if (zonePosition === 'mid') {
      return overheadState?.useMidGlobal 
        ? global 
        : (overheadState?.midOverride || global);
    }
    if (zonePosition === 'rear') {
      return overheadState?.useRearGlobal 
        ? global 
        : (overheadState?.rearOverride || global);
    }
    
    return speaker.model || null;
  };

  const memoizedResult = useMemo(() => {
    const gradedParameters = { primary: {}, secondary: null };

    const safeSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    const safeSeats = Array.isArray(seatingPositions) ? seatingPositions : [];

    // Extract room height early for use throughout
    // Prefer explicit heightM, fallback to generic height, then default 2.5 m
    const rawHeight =
      dimensions && (dimensions.heightM ?? dimensions.height);

    const roomHeightM = Number.isFinite(Number(rawHeight))
      ? Number(rawHeight)
      : 2.5;

    if (safeSpeakers.length === 0 || safeSeats.length === 0) {
      return { gradedParameters, analysisDetails: { hasSecondarySeating: false } };
    }

    const seatsWithRoles = computeSeatRoles(safeSeats);
    const primarySeats = seatsWithRoles.filter(s => s.isPrimary);
    const secondarySeats = seatsWithRoles.filter(s => s.isSecondary);

    const hasSecondarySeating = secondarySeats.length > 0;

    // RP22 Parameter 5 — graded entry
    const p5Result = evaluateParameter5AllLayouts(safeSpeakers, safeSeats, mlpBasis);
    if (p5Result) {
      gradedParameters.primary[p5Result.number] = {
        title: p5Result.title,
        level: p5Result.level,
        value: p5Result.value,
        unit: p5Result.unit,
        overlay: null,
        note: p5Result.note
      };
    } else {
      gradedParameters.primary[5] = null;
    }

    // Detailed Param 5 (pairs list and stats) using CW back-arc gaps (wrap omitted)
    const surroundRegex = /^(LS|RS|LSS|RSS|LRS|RRS|LW|RW|SL|SR|SBL|SBR|LR|RR|FWL|FWR)$/i;
    const mlpSrc = primarySeats.length ? primarySeats : seatsWithRoles;
    const mlp = pickMLP(mlpBasis, mlpSrc);
    const surrounds = safeSpeakers
      .filter(s => surroundRegex.test(String(s.role)))
      .filter(s => isNum(s?.position?.x) && isNum(s?.position?.y))
      .map(s => ({ id: String(s.id || s.role), role: String(s.role), position: { x: Number(s.position.x), y: Number(s.position.y) } }));

    let param5 = { gaps: [], maxGap: 0, std: 0, level: 4, target: 80, label: "Back-arc gaps (MLP)" };
    let surroundGaps = null;

    if (mlp && Number.isFinite(mlp.x) && Number.isFinite(mlp.y) && surrounds.length >= 2) { // Added check for mlp coordinates
      const { backArcAngles, backArcPairs } = computeBackArc(surrounds, mlp);
      const inner = Array.isArray(backArcAngles) ? backArcAngles : [];

      const maxGap = inner.length ? Math.max(...inner) : 0;
      const mean = inner.length ? inner.reduce((a, g) => a + g, 0) / inner.length : 0;
      const std = inner.length ? Math.sqrt(inner.reduce((a, g) => a + Math.pow(g - mean, 2), 0) / inner.length) : 0;

      param5 = {
        gaps: inner.map(g => Number((+g).toFixed(1))),
        maxGap: Number((+maxGap).toFixed(1)),
        std: Number((+std).toFixed(2)),
        level: param5LevelFromGap(maxGap),
        target: 80,
        label: "Back-arc gaps (MLP)"
      };

      const lines = backArcPairs.map(([a, b], i) => `${a.role} → ${b.role} ~${(inner[i] ?? 0).toFixed(0)}° (target 80°)`);
      const n = inner.length;
      surroundGaps = {
        ordered: surrounds,
        angles: inner,
        stats: {
          n,
          min: n ? Math.min(...inner) : 0,
          max: n ? Math.max(...inner) : 0,
          std: Number((+std).toFixed(2))
        },
        lines
      };
    }

    // RP22 Parameter 7 — Front Wides (use overlay median truth computed internally)
    const p7Result = evaluateFrontWideDeviation(
      safeSpeakers, 
      safeSeats, 
      mlpBasis, 
      mlpPointOverride,
      dimensions
    );
    if (p7Result.level !== null) {
      gradedParameters.primary[p7Result.number] = {
        title: p7Result.title,
        level: p7Result.level,
        value: p7Result.value,
        unit: p7Result.unit,
        overlay: p7Result.overlay,
        note: p7Result.note
      };
    } else {
      gradedParameters.primary[7] = null;
    }

    // RP22 Parameter 11 — Speaker Zone Compliance (always L4, app enforces zones)
    const p11CatalogEntry = RP22_CATALOG["11"];
    gradedParameters.primary[11] = {
      title: p11CatalogEntry?.title || "Speaker zone compliance",
      level: "L4",
      value: 0,
      unit: p11CatalogEntry?.unit || "",
      status: "ok",
      note: "App enforces zone compliance"
    };

    // RP22 Parameter 12 — Screen speakers SPL at RSP
    const p12CatalogEntry = RP22_CATALOG["12"];
    let p12Result = null;
    
    if (mlp && isNum(mlp.x) && isNum(mlp.y) && seatSplMetrics) {
      // Find RSP/MLP seat
      const mlpSeat = primarySeats.length > 0 
        ? primarySeats.find(s => s.isPrimary) || primarySeats[0]
        : seatsWithRoles[0];
      
      if (mlpSeat) {
        const seatId = mlpSeat.id || `seat-${mlpSeat.x}-${mlpSeat.y}`;
        const seatMetrics = getSeatSplMetrics(seatSplMetrics, seatId);
        
        if (seatMetrics && seatMetrics.screen) {
          const lSpl = seatMetrics.screen.L?.value;
          const cSpl = seatMetrics.screen.C?.value;
          const rSpl = seatMetrics.screen.R?.value;
          
          if (isNum(lSpl) && isNum(cSpl) && isNum(rSpl)) {
            const minSpl = Math.min(lSpl, cSpl, rSpl);
            
            let level12 = 1;
            if (minSpl >= 111) level12 = 4;
            else if (minSpl >= 108) level12 = 3;
            else if (minSpl >= 105) level12 = 2;
            else if (minSpl >= 102) level12 = 1;
            
            p12Result = {
              title: p12CatalogEntry?.title || "Screen speakers SPL capability at RSP",
              level: `L${level12}`,
              value: minSpl,
              formatted: `${minSpl.toFixed(1)} dB`,
              unit: p12CatalogEntry?.unit || "dB SPL (C)",
              status: "ok"
            };
          }
        }
      }
    }
    
    gradedParameters.primary[12] = p12Result || {
      title: p12CatalogEntry?.title || "Screen speakers SPL capability at RSP",
      level: null,
      value: null,
      unit: p12CatalogEntry?.unit || "dB SPL (C)",
      status: "no_data"
    };

    gradedParameters.secondary = null;

    // Compute per-seat RP22 metrics (P9, P10, P16, P17, P20)
    const seatMetrics = new Map();
    const roomCenterX = (dimensions?.widthM || 0) / 2;

    // Resolve overhead models before passing to P17
    const speakersWithResolvedOverheads = safeSpeakers.map(speaker => {
      const role = String(speaker.role || '').toUpperCase();
      if (!role.startsWith('T')) return speaker;
      
      const resolvedModel = resolveOverheadModel(speaker, overheadState);
      if (resolvedModel && resolvedModel !== speaker.model) {
        return { ...speaker, model: resolvedModel };
      }
      return speaker;
    });

    // Compute P17 for all seats (non-LCR HF variance) - PASS appState for aim toggles

    const p17Results = computeP17ForAllSeats({
      seats: seatsWithRoles,
      speakers: speakersWithResolvedOverheads,
      mlpPos: mlp,
      getSpeakerModelMeta,
      roomHeightM,
      appState: aimState || overheadState,
      getCanonicalRole,
    });

    // Helper to get SPL at seat for a specific role
    const getSplAtSeat = (seatId, role) => {
      if (!seatSplMetrics) return null;
      const metrics = seatSplMetrics.get(seatId);
      if (!metrics || !metrics.spl) return null;
      
      // Check in all categories
      const allSpl = { ...metrics.spl.screen, ...metrics.spl.surrounds, ...metrics.spl.uppers };
      const splObj = allSpl[role];
      return splObj?.value ?? null;
    };

    // Find MLP seat for P16 reference
    const mlpSeat = mlp && isNum(mlp.x) && isNum(mlp.y) ? mlp : null;

    for (const seat of seatsWithRoles) {
      const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
      const metrics = { p1: null, p4: null, p5: null, p6: null, p9: null, p10: null, p16: null, p17: null, p20: null };

      // P9 - Maximum vertical angle between adjacent upper speakers
      const upperSpeakers = getUpperSpeakersForSeat(seat, safeSpeakers, getCanonicalRole);
      if (upperSpeakers.length >= 2) {
        const { maxVerticalGapDeg } = computeUpperVerticalAnglesForSeat(seat, upperSpeakers, roomCenterX);
        
        if (isNum(maxVerticalGapDeg)) {
          let level9 = 1;
          if (maxVerticalGapDeg <= 50) level9 = 4;
          else if (maxVerticalGapDeg <= 60) level9 = 3;
          else if (maxVerticalGapDeg <= 80) level9 = 2;
          
          metrics.p9 = {
            value: maxVerticalGapDeg,
            formatted: `${maxVerticalGapDeg.toFixed(1)}°`,
            level: level9,
          };
        }
      }

      // P10 – Maximum SPL difference between upper speakers (upper SPL spread)
      // Uses the same SPL data source as the HUD (getSeatSplMetrics → .uppers)
      {
        let upperValues = [];

        if (seatSplMetrics) {
          // Use the same helper + key as RoomVisualisation / HUD:
          // getSeatSplMetrics(allSeatSplMetrics, effectiveHoveredSeat.id)
          const seatSpl = getSeatSplMetrics(seatSplMetrics, seatId);

          if (seatSpl && seatSpl.uppers) {
            // seatSpl.uppers is an object like { TFL: { value, formatted }, ... }
            upperValues = Object.values(seatSpl.uppers)
              .map((o) => (o && typeof o.value === 'number' ? o.value : null))
              .filter((v) => isNum(v));
          }
        }

        if (upperValues.length >= 2) {
          const maxSpl = Math.max(...upperValues);
          const minSpl = Math.min(...upperValues);
          const delta = Math.abs(maxSpl - minSpl);

          // Round to 0.1 dB for display, keep numeric for value
          const deltaRounded = Math.round(delta * 10) / 10;

          // RP22 P10 levels:
          // L4: ≤ 2 dB, L3: ≤ 5 dB, L2: ≤ 8 dB, L1: > 8 dB
          let level10 = 1;
          if (deltaRounded <= 2) level10 = 4;
          else if (deltaRounded <= 5) level10 = 3;
          else if (deltaRounded <= 8) level10 = 2;
          else level10 = 1;

          metrics.p10 = {
            value: deltaRounded,
            formatted: `±${deltaRounded.toFixed(1)} dB`,
            level: level10,
          };
        } else {
          // Less than 2 valid upper SPL values – keep HUD honest but neutral
          metrics.p10 = {
            value: null,
            formatted: 'N/A (insufficient data)',
            level: '—',
          };
        }
      }

      // P16 – LCR horizontal off-axis HF loss (RP22 Param 16)
      {
        const p16 = computeP16ForSeat(seat, safeSpeakers, getSpeakerModelMeta, mlp);

        if (p16) {
          // Add note if any LCR is beyond 55°
          let hudLabel = p16.hudLabel;
          if (p16.p16BeyondLcrLimit) {
            hudLabel = `${p16.hudLabel} (>55° off-axis – fail)`;
          }

          metrics.p16 = {
            ...p16,
            hudLabel,
          };
        } else {
          metrics.p16 = {
            value: null,
            formatted: "—",
            hudLabel: null,
            level: "—",
          };
        }
      }

      // P17 – Non-LCR (surrounds/wides/overheads) HF off-axis variance
      {
        const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
        const p17Data = p17Results[seatId];

        if (p17Data && isNum(p17Data.p17Db)) {
          const valueDb = p17Data.p17Db;

          // P17 level mapping
          let level17 = 2; // Default
          if (valueDb <= 1.5) level17 = 4;
          else if (valueDb <= 3.0) level17 = 3;

          // If any speaker is beyond 41°, cap at Level 2
          if (p17Data.p17HasNaAngles) {
            level17 = Math.min(level17, 2);
          }

          metrics.p17 = {
            value: valueDb,
            formatted: `±${valueDb.toFixed(1)} dB`,
            level: level17,
            worstRole: p17Data.worstRole,
            worstAngleDeg: p17Data.worstAngleDeg,
            worstLossDb: p17Data.worstLossDb,
            perSpeaker: p17Data.perSpeaker || [],
            p17HasNaAngles: p17Data.p17HasNaAngles || false,
          };
        } else {
          metrics.p17 = {
            value: null,
            formatted: "—",
            level: "—",
            perSpeaker: [],
            p17HasNaAngles: false,
          };
        }
      }

      // P20 - Reserved for future FR implementation (LF variance)
      // requires per-seat frequency-response prediction
      
      seatMetrics.set(seatId, metrics);
    }

    // Build perSeatRp22 - reusable structure for all consumers
    const perSeatRp22 = {};
    for (const seat of seatsWithRoles) {
      const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
      const metrics = seatMetrics.get(seatId) || {};
      
      perSeatRp22[seatId] = {
        seatId,
        isPrimary: seat.isPrimary || false,
        isSecondary: seat.isSecondary || false,
        rp22: {}
      };

      // Map p9 -> parameter 9, p10 -> parameter 10, etc.
      if (metrics.p1) perSeatRp22[seatId].rp22[1] = metrics.p1;
      if (metrics.p4) perSeatRp22[seatId].rp22[4] = metrics.p4;
      if (metrics.p5) perSeatRp22[seatId].rp22[5] = metrics.p5;
      if (metrics.p6) perSeatRp22[seatId].rp22[6] = metrics.p6;
      if (metrics.p9) perSeatRp22[seatId].rp22[9] = metrics.p9;
      if (metrics.p10) perSeatRp22[seatId].rp22[10] = metrics.p10;
      if (metrics.p16) perSeatRp22[seatId].rp22[16] = metrics.p16;
      if (metrics.p17) perSeatRp22[seatId].rp22[17] = metrics.p17;
      if (metrics.p20) perSeatRp22[seatId].rp22[20] = metrics.p20;
    }

    console.log(
      "[ENGINE P16]",
      {
        seats: perSeatRp22 ? Object.keys(perSeatRp22) : null,
        sampleSeat: primarySeats[0]?.id,
        sampleP16: perSeatRp22?.[primarySeats[0]?.id]?.rp22?.[16]
          || perSeatRp22?.[primarySeats[0]?.id]?.p16
          || null,
      }
    );

    return {
      gradedParameters,
      p7Details: (evaluateFrontWideDeviation(safeSpeakers, safeSeats, mlpBasis) || {}).perSide,
      param5,
      surroundGaps,
      seatMetrics,
      perSeatRp22, // New: structured per-seat RP22 data
      analysisDetails: {
        hasSecondarySeating: hasSecondarySeating,
        totalSpeakers: safeSpeakers.length,
        totalSeats: safeSeats.length,
        primarySeats: primarySeats.length,
        secondarySeats: secondarySeats.length,
      }
    };
  }, [
    placedSpeakers,
    seatingPositions,
    mlpBasis,
    mlpPointOverride?.x,
    mlpPointOverride?.y,
    dimensions?.heightM,
    dimensions?.height,
    dimensions?.lengthM,
    dimensions?.widthM,
    seatSplMetrics,
    overheadState?.globalModel,
    overheadState?.frontOverride,
    overheadState?.midOverride,
    overheadState?.rearOverride,
    overheadState?.useFrontGlobal,
    overheadState?.useMidGlobal,
    overheadState?.useRearGlobal,
    overheadState?.aimFrontWidesAtMLP,
    overheadState?.aimSideSurroundsAtMLP,
    overheadState?.aimRearSurroundsAtMLP,
    aimState?.aimFrontWidesAtMLP,
    aimState?.aimSideSurroundsAtMLP,
    aimState?.aimRearSurroundsAtMLP,
  ]);

  return { ...memoizedResult, evaluateOverheads };
};