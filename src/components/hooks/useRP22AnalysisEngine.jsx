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
import { computePerSeatRP22Metrics } from '@/components/utils/seatRp22Computation';

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

function evaluateFrontWideDeviation(speakers, seating, mlpBasis = "front") {
  const seatsWithRoles = computeSeatRoles(asArr(seating));
  const primarySeats = seatsWithRoles.filter(s => s.isPrimary);
  const src = primarySeats.length ? primarySeats : seatsWithRoles;
  
  const mlp = pickMLP(mlpBasis, src);
  
  // NULL-SAFE GUARD
  if (!mlp || !Number.isFinite(mlp.x) || !Number.isFinite(mlp.y)) {
    return { number: 7, title: RP22_CATALOG["7"].title, level: null, value: null, unit: RP22_CATALOG["7"].unit, overlay: null, note: "Front Wide angular deviation from bisector", deviation: null, perSide: null };
  }

  // Helper to get azimuth consistent with azimuthFromMLP (0 deg is +Y, 90 deg is +X)
  const getAngle = (vec) => (vec.x === 0 && vec.y === 0) ? 0 : (Math.atan2(vec.x, vec.y) * 180 / Math.PI + 360) % 360;

  const L  = speakers.find(s => s.role === 'L' && s.position);
  const R  = speakers.find(s => s.role === 'R' && s.position);
  const LS = speakers.find(s => s.role === 'LS' && s.position);
  const RS = speakers.find(s => s.role === 'RS' && s.position);
  const LW = speakers.find(s => s.role === 'LW' && s.position);
  const RW = speakers.find(s => s.role === 'RW' && s.position);

  const calcSide = (front, side, wide) => {
    if (!front || !side || !wide) return { deviation: null, targetAngle: null, actualAngle: null };
    
    const mlpPos = mlp;
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
      perSide: { LW: detailsL, RW: detailsR }
    };
  }

  const avgDev = deviations.reduce((a,b)=>a+b,0) / deviations.length;

  // After computing avgDev (average absolute deviation from bisector for wides):
  const p7CatalogEntry = RP22_CATALOG["7"];
  const lvlP7 = p7CatalogEntry.levels;
  let level7 = 1; // Default to L1
  if (lvlP7.L4 != null && avgDev <= lvlP7.L4) level7 = 4;
  else if (lvlP7.L3 != null && avgDev <= lvlP7.L3) level7 = 3;
  else if (lvlP7.L2 != null && avgDev <= lvlP7.L2) level7 = 2;

  return {
    number: 7,
    title: p7CatalogEntry.title,
    level: level7,
    value: Number(avgDev.toFixed(1)),
    unit: p7CatalogEntry.unit,
    overlay: null,
    note: "Front Wide angular deviation from bisector",
    deviation: avgDev, // Keep for p7Details access
    perSide: {
      LW: detailsL,
      RW: detailsR
    }
  };
}

// Helper to normalize role names
const getCanonicalRole = (role) => String(role || "").toUpperCase();

export const useRP22AnalysisEngine = ({ placedSpeakers, seatingPositions, dimensions, mlpBasis, seatSplMetrics, overheadState, aimState, screen, screenFrontPlaneM, lcrAngleInfo }) => {

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

    // RP22 Parameter 7 — Front Wides (kept)
    const p7Result = evaluateFrontWideDeviation(safeSpeakers, safeSeats, mlpBasis);
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

    gradedParameters.secondary = null;

    // Compute per-seat RP22 metrics using shared computation logic
    const seatMetrics = new Map();
    const roomCenterX = (dimensions?.widthM || 0) / 2;
    
    // Extract screen front plane from dimensions or use default
    const screenFrontPlaneM = dimensions?.screenFrontPlaneM ?? 0;

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
      
      // Use shared computation for P1, P4, P5, P6, P16, P17, RP23
      const sharedMetrics = computePerSeatRP22Metrics({
        seat,
        seatingPositions: safeSeats,
        placedSpeakers: speakersWithResolvedOverheads,
        dimensions,
        mlp,
        screen: screen || dimensions?.screen || {},
        screenFrontPlaneM: screenFrontPlaneM ?? dimensions?.screenFrontPlaneM ?? 0,
        allSeatSplMetrics: seatSplMetrics,
        aimAtMLP: aimState?.aimAtMLP || false,
        aimFrontWidesAtMLP: aimState?.aimFrontWidesAtMLP || false,
        aimSideSurroundsAtMLP: aimState?.aimSideSurroundsAtMLP || false,
        aimRearSurroundsAtMLP: aimState?.aimRearSurroundsAtMLP || false,
        lcrAngleInfo: lcrAngleInfo || { L: 0, R: 0 },
      });
      
      const metrics = {
        p1: sharedMetrics?.p1,
        p4: sharedMetrics?.p4,
        p5: sharedMetrics?.p5,
        p6: sharedMetrics?.p6,
        p9: null,
        p10: sharedMetrics?.p10,
        p16: sharedMetrics?.p16,
        p17: sharedMetrics?.p17,
        p20: sharedMetrics?.p20,
      };

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

      // P9, P10 already computed by shared logic above (if applicable)
      // Override P10 with local calculation if not already set
      if (!metrics.p10 || metrics.p10.level === '—') {
        let upperValues = [];

        if (seatSplMetrics) {
          const seatSpl = getSeatSplMetrics(seatSplMetrics, seatId);

          if (seatSpl && seatSpl.uppers) {
            upperValues = Object.values(seatSpl.uppers)
              .map((o) => (o && typeof o.value === 'number' ? o.value : null))
              .filter((v) => isNum(v));
          }
        }

        if (upperValues.length >= 2) {
          const maxSpl = Math.max(...upperValues);
          const minSpl = Math.min(...upperValues);
          const delta = Math.abs(maxSpl - minSpl);
          const deltaRounded = Math.round(delta * 10) / 10;

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

      // Map p1..p20 and rp23 to numbered keys
      if (metrics.p1) perSeatRp22[seatId].rp22[1] = metrics.p1;
      if (metrics.p4) perSeatRp22[seatId].rp22[4] = metrics.p4;
      if (metrics.p5) perSeatRp22[seatId].rp22[5] = metrics.p5;
      if (metrics.p6) perSeatRp22[seatId].rp22[6] = metrics.p6;
      if (metrics.p9) perSeatRp22[seatId].rp22[9] = metrics.p9;
      if (metrics.p10) perSeatRp22[seatId].rp22[10] = metrics.p10;
      if (metrics.p16) perSeatRp22[seatId].rp22[16] = metrics.p16;
      if (metrics.p17) perSeatRp22[seatId].rp22[17] = metrics.p17;
      if (metrics.p20) perSeatRp22[seatId].rp22[20] = metrics.p20;
      
      // Add RP23 viewing angle
      if (sharedMetrics?.rp23) {
        perSeatRp22[seatId].rp23 = sharedMetrics.rp23;
      }
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