// hooks/useRP22AnalysisEngine.js
import { useMemo } from 'react';
import { degreesBetweenVectors } from '../utils/geometryUtils';
import { pickMLP } from '../utils/seatingUtils';
import { RP22_CATALOG } from "@/components/data/rp22Catalog";
import { computeBackSweepGaps, levelFromGap } from "@/components/utils/RP22Geometry";
import { computeSurroundRingGaps, rp22LevelForP5, isEligibleP5Surround } from "@/components/utils/p5SurroundGaps";
import { computeSeatRoles } from "@/components/utils/seatRoles";
import { getUpperSpeakersForSeat, computeUpperVerticalAnglesForSeat, computeUpperSplSpreadForSeat } from "../utils/rp22UpperSeatMetrics";
import { computeScreenVarianceMetrics, computeWideSurroundUpperVarianceMetrics, computeBassVarianceMetrics } from "../utils/rp22SeatResponseConsistency";
import { computeP16ForSeat, computeP17ForAllSeats } from "../utils/rp22HfOffAxis";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { getSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';
import { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones";
import { rp23LevelForAngleDeg, rp23DisplayAngleDeg } from '@/components/utils/viewingAngleUtils';
import { useSeatResponses } from "@/components/room/hooks/useSeatResponses";
import {
  computeTransitionFrequencyHz,
  computeParam14LfeCapability,
  computeParam18BassExtension,
  computeParam19Deviation,
  computeParam20SeatConsistency,
  applyDesignEqCurve,
} from "@/components/utils/rp22BassMetrics";

// Safe helpers
const asArr = (x) => (Array.isArray(x) ? x : []);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const hasRealModel = (s) => {
  const ms = String(s?.model ?? "").trim().toLowerCase();
  return !!ms && ms !== "off" && ms !== "none";
};

// plan view: x = lateral, y = fore/aft
function azimuthFromMLP(mlp, p) {
  if (!mlp || !p || !isNum(mlp.x) || !isNum(mlp.y) || !isNum(p.x) || !isNum(p.y)) return 0;
  const dx = p.x - mlp.x;   // lateral
  const dy = p.y - mlp.y;   // fore/aft
  const deg = Math.atan2(dx, dy) * 180 / Math.PI; // left -, right +
  return (deg + 360) % 360; // 0..360
}

function evaluateParameter5AllLayouts(placedSpeakers, seatingPositions, mlpBasis = "front", visiblePlanSpeakers = null) {
  const speakers = Array.isArray(visiblePlanSpeakers)
    ? visiblePlanSpeakers
    : asArr(placedSpeakers);
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

  // Bed-layer surrounds including wides/sides/rears + extra surrounds (SL2/SR2...)
  const surrounds = speakers
    .filter(s => isEligibleP5Surround(String(s.role)))
    .map(s => ({ id: s.id || s.role, role: s.role, position: s.position }))
    .filter(s => isNum(s?.position?.x) && isNum(s?.position?.y));

  if (surrounds.length < 2) return null;

  // P5 RP22 rule: adjacent visible gaps only, no wraparound.
  // Use the same no-wrap azimuth logic as the HUD/drawing path.
  const items = [];
  for (const s of surrounds) {
    const dx = s.position.x - mlp.x;
    const dy = s.position.y - mlp.y;
    const rad = Math.atan2(dx, -dy);
    let a = rad * (180 / Math.PI);
    if (a > 180) a -= 360;
    if (a <= -180) a += 360;
    const theta = (a + 360) % 360;
    items.push({ role: s.role, theta });
  }
  items.sort((a, b) => a.theta - b.theta);

  const adjGaps = [];
  for (let i = 0; i < items.length - 1; i++) {
    adjGaps.push(items[i + 1].theta - items[i].theta);
  }

  if (!adjGaps.length) return null;

  const maxGap = Math.max(...adjGaps);

  const p5CatalogEntry = RP22_CATALOG["5"];
  const lvlP5 = p5CatalogEntry.levels;
  let level5 = 1;
  if (lvlP5.L4 != null && maxGap <= lvlP5.L4) level5 = 4;   // <= 50 = L4
  else if (lvlP5.L3 != null && maxGap <= lvlP5.L3) level5 = 3; // <= 60 = L3
  else if (lvlP5.L2 != null && maxGap <= lvlP5.L2) level5 = 2; // <= 80 = L2

  return {
    number: 5,
    title: p5CatalogEntry.title,
    level: level5,
    value: Number(maxGap.toFixed(1)),
    unit: p5CatalogEntry.unit,
    gaps: adjGaps,
    note: "Back-arc gaps (MLP)"
  };
}

function evaluateFrontWideDeviation(speakers, seating, mlpBasis = "front", mlpPointOverride = null, dimensions = null, visiblePlanSpeakers = null) {
  // Use visiblePlanSpeakers when provided
  const speakersToUse = Array.isArray(visiblePlanSpeakers)
    ? visiblePlanSpeakers
    : (Array.isArray(speakers) ? speakers : []);
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
    const spk = speakersToUse.find(s => normalizeRole(s.role) === targetRole);
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
          placedSpeakers: speakersToUse,
          getModelDimsM: getSpeakerModelMeta,
          rp22BoundDeg: 10
        });
        
        // If overlay truth is valid, use it
        if (fwZones?.status === 'ok' && 
            fwZones?.left?.status === 'ok' && 
            fwZones?.right?.status === 'ok' &&
            isNum(fwZones.left.medianY) && 
            isNum(fwZones.right.medianY)) {
          
          const idealLWPoint = {
            x: Number.isFinite(fwZones.left.xWall) ? fwZones.left.xWall : 0.01,
            y: fwZones.left.medianY
          };

          const idealRWPoint = {
            x: Number.isFinite(fwZones.right.xWall) ? fwZones.right.xWall : roomWidthM - 0.01,
            y: fwZones.right.medianY
          };

          if (
            !Number.isFinite(idealLWPoint.x) ||
            !Number.isFinite(idealLWPoint.y) ||
            !Number.isFinite(idealRWPoint.x) ||
            !Number.isFinite(idealRWPoint.y)
          ) {
            throw new Error('Invalid front wide median marker point');
          }
          
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

export const useRP22AnalysisEngine = ({ placedSpeakers, seatingPositions, dimensions, mlpBasis, mlpPointOverride, seatSplMetrics, overheadState, aimState, p15ConstructionLevel, screen, visiblePlanSpeakers }) => {
  // Per-seat bass response curves from the CURRENT bass engine (no maths changed).
  const seatResponses = useSeatResponses();
  // RP22 P14 is always post-EQ — it does not follow the Bass Response graph's visual
  // raw/EQ toggle (that toggle is display-only). See computeParam14LfeCapability call below.

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
    const p5Result = evaluateParameter5AllLayouts(safeSpeakers, safeSeats, mlpBasis, visiblePlanSpeakers);
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
    // Uses isEligibleP5Surround to match the per-seat grader — includes SL2/SR2/SL3/SR3...
    const mlpSrc = primarySeats.length ? primarySeats : seatsWithRoles;
    const mlp = pickMLP(mlpBasis, mlpSrc);
    const speakersForP5Detail = Array.isArray(visiblePlanSpeakers) ? visiblePlanSpeakers : safeSpeakers;

    const surrounds = speakersForP5Detail
      .filter(s => isEligibleP5Surround(String(s.role)))
      .filter(s => isNum(s?.position?.x) && isNum(s?.position?.y))
      .filter(hasRealModel) // CRITICAL: NO MODEL = NO SPEAKER (NO GHOSTS)
      .map(s => ({
        id: String(s.id || s.role),
        role: String(s.role),
        position: { x: Number(s.position.x), y: Number(s.position.y) }
      }));

    let param5 = { gaps: [], maxGap: 0, std: 0, level: 4, target: 80, label: "Back-arc gaps (MLP)" };
    let surroundGaps = null;

    if (mlp && Number.isFinite(mlp.x) && Number.isFinite(mlp.y) && surrounds.length >= 2) { // Added check for mlp coordinates
      const result = computeBackSweepGaps(surrounds, mlp);
      const inner = Array.isArray(result.gaps) ? result.gaps : [];
      const backArcPairs = Array.isArray(result.pairs) ? result.pairs : [];

      const maxGap = inner.length ? Math.max(...inner) : 0;
      const mean = inner.length ? inner.reduce((a, g) => a + g, 0) / inner.length : 0;
      const std = inner.length ? Math.sqrt(inner.reduce((a, g) => a + Math.pow(g - mean, 2), 0) / inner.length) : 0;

      param5 = {
        gaps: inner.map(g => Number((+g).toFixed(1))),
        maxGap: Number((+maxGap).toFixed(1)),
        std: Number((+std).toFixed(2)),
        level: levelFromGap(maxGap),
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
      dimensions,
      visiblePlanSpeakers
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

    // RP22 Parameter 3 — Screen wall speakers in LCR zones (binary: L4 or FAIL)
    (() => {
      // Only skip if screen is completely missing
      if (!screen) {
        gradedParameters.primary[3] = {
          title: "Number of screen wall speakers allowed outside of recommended zonal locations",
          level: null,
          value: null,
          unit: "speakers",
          formatted: null,
          status: "no_data"
        };
        return;
      }

      const mlpForP3 = mlpPointOverride && isNum(mlpPointOverride.x) && isNum(mlpPointOverride.y)
        ? mlpPointOverride
        : (mlp && isNum(mlp.x) && isNum(mlp.y) ? mlp : null);

      if (!mlpForP3) {
        gradedParameters.primary[3] = {
          title: "Number of screen wall speakers allowed outside of recommended zonal locations",
          level: null,
          value: null,
          unit: "speakers",
          formatted: null,
          status: "no_data"
        };
        return;
      }

      const rawDepth = Number(screen?.floatDepthM) || 0.20;
      const zoneDepthM = Math.max(0.10, Math.min(0.60, rawDepth));
      const spanY = mlpForP3.y - zoneDepthM;
      const tan22_5 = Math.tan(22.5 * Math.PI / 180);
      const tan30   = Math.tan(30.0 * Math.PI / 180);

      const xIL = mlpForP3.x - spanY * tan22_5;
      const xOL = mlpForP3.x - spanY * tan30;
      const xIR = mlpForP3.x + spanY * tan22_5;
      const xOR = mlpForP3.x + spanY * tan30;

      const zoneLeft  = { xMin: Math.min(xIL, xOL), xMax: Math.max(xIL, xOL) };
      const zoneRight = { xMin: Math.min(xIR, xOR), xMax: Math.max(xIR, xOR) };

      const speakersForP3 = Array.isArray(visiblePlanSpeakers) ? visiblePlanSpeakers : safeSpeakers;
      const fl = speakersForP3.find(s => { const r = String(s.role || '').toUpperCase(); return r === 'FL' || r === 'L'; });
      const fr = speakersForP3.find(s => { const r = String(s.role || '').toUpperCase(); return r === 'FR' || r === 'R'; });

      const checkSpk = (spk, zone) => {
        if (!spk || !isNum(spk.position?.x)) return null;
        const cx = Number(spk.position.x);
        const meta = getSpeakerModelMeta(spk.model) || {};
        const halfW = (Number(meta.widthM) || 0.20) / 2;
        return cx >= (zone.xMin - halfW) && cx <= (zone.xMax + halfW);
      };

      const flPass = checkSpk(fl, zoneLeft);
      const frPass = checkSpk(fr, zoneRight);

      if (!fl && !fr) {
        gradedParameters.primary[3] = {
          title: "Number of screen wall speakers allowed outside of recommended zonal locations",
          level: null,
          value: null,
          unit: "speakers",
          formatted: null,
          status: "no_data"
        };
        return;
      }

      const failCount =
        (flPass === false || flPass === null ? 1 : 0) +
        (frPass === false || frPass === null ? 1 : 0);
      gradedParameters.primary[3] = {
        title: "Number of screen wall speakers allowed outside of recommended zonal locations",
        level: failCount > 0 ? "FAIL" : "L4",
        value: failCount,
        unit: "speakers",
        formatted: failCount > 0 ? "Outside permitted zone tolerance" : "0 speakers",
        status: "ok"
      };
    })();

    // RP22 Parameter 12 — Screen speakers SPL at RSP (rounded UP to whole dB)
    const p12CatalogEntry = RP22_CATALOG["12"];
    let p12Result = null;
    
    if (seatSplMetrics) {
      // Use synthetic "mlp" entry (green dot) preferentially, fallback to first primary seat
      const mlpMetrics = getSeatSplMetrics(seatSplMetrics, "mlp");
      const seatMetrics = mlpMetrics || (primarySeats.length > 0 
        ? getSeatSplMetrics(seatSplMetrics, primarySeats[0].id || `seat-${primarySeats[0].x}-${primarySeats[0].y}`)
        : null);
      
      if (seatMetrics && seatMetrics.screen) {
        const lSpl = seatMetrics.screen.FL?.value || seatMetrics.screen.L?.value;
        const cSpl = seatMetrics.screen.FC?.value || seatMetrics.screen.C?.value;
        const rSpl = seatMetrics.screen.FR?.value || seatMetrics.screen.R?.value;
        
        if (isNum(lSpl) && isNum(cSpl) && isNum(rSpl)) {
          const minSplRaw = Math.min(lSpl, cSpl, rSpl);
          const minSpl = Math.ceil(minSplRaw); // Round UP to whole dB
          
          let level12 = 1;
          if (minSpl >= 111) level12 = 4;
          else if (minSpl >= 108) level12 = 3;
          else if (minSpl >= 105) level12 = 2;
          else if (minSpl >= 102) level12 = 1;
          
          p12Result = {
            title: p12CatalogEntry?.title || "Screen speakers SPL capability at RSP",
            level: `L${level12}`,
            value: minSpl,
            formatted: `${minSpl} dB`,
            unit: p12CatalogEntry?.unit || "dB SPL (C)",
            status: "ok"
          };
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

    // RP22 Parameter 13 — Non-screen speakers SPL at RSP (with limiter attribution)
    const p13CatalogEntry = RP22_CATALOG["13"];
    let p13Result = null;
    
    if (seatSplMetrics) {
      // Use synthetic "mlp" entry (green dot) preferentially, fallback to first primary seat
      const mlpMetrics = getSeatSplMetrics(seatSplMetrics, "mlp");
      const seatMetrics = mlpMetrics || (primarySeats.length > 0 
        ? getSeatSplMetrics(seatSplMetrics, primarySeats[0].id || `seat-${primarySeats[0].x}-${primarySeats[0].y}`)
        : null);
      
      if (seatMetrics) {
        // Collect SPL values by group with canonical role mapping
        const groups = [];
        
        // Helper to find min SPL for specific roles in surrounds/uppers
        const getSplForRoles = (category, roles) => {
          if (!seatMetrics[category]) return null;
          const values = roles
            .map(role => seatMetrics[category][role]?.value)
            .filter(isNum);
          return values.length > 0 ? Math.min(...values) : null;
        };
        
        // Front Wides (FW) - Priority 1
        const fwSpl = getSplForRoles('surrounds', ['LW', 'RW', 'FWL', 'FWR']);
        if (fwSpl !== null) groups.push({ spl: fwSpl, label: 'FW', priority: 1 });
        
        // Side Surrounds (SS) - Priority 2
        const ssSpl = getSplForRoles('surrounds', ['SL', 'SR', 'LS', 'RS']);
        if (ssSpl !== null) groups.push({ spl: ssSpl, label: 'SS', priority: 2 });
        
        // Rear Surrounds (RS) - Priority 3
        const rsSpl = getSplForRoles('surrounds', ['SBL', 'SBR', 'LR', 'RR']);
        if (rsSpl !== null) groups.push({ spl: rsSpl, label: 'RS', priority: 3 });
        
        // Overheads (OH) - Priority 4 (all T-prefixed roles)
        const ohValues = seatMetrics.uppers ? 
          Object.entries(seatMetrics.uppers)
            .filter(([role]) => role.startsWith('T'))
            .map(([_, data]) => data?.value)
            .filter(isNum) : [];
        if (ohValues.length > 0) {
          groups.push({ spl: Math.min(...ohValues), label: 'OH', priority: 4 });
        }
        
        if (groups.length > 0) {
          // Find minimum SPL across all groups (raw)
          const minSplRaw = Math.min(...groups.map(g => g.spl));
          const minSpl = Math.ceil(minSplRaw); // Round UP to whole dB
          
          // Find limiting group (with tie-breaking by priority) - use raw for detection
          const limitingGroup = groups
            .filter(g => Math.abs(g.spl - minSplRaw) < 0.001) // Match within 0.001 dB
            .sort((a, b) => a.priority - b.priority)[0]; // Lowest priority wins
          
          // P13 thresholds (Recommended: 99/102/105/108) - use rounded value
          let level13 = 1;
          if (minSpl >= 108) level13 = 4;
          else if (minSpl >= 105) level13 = 3;
          else if (minSpl >= 102) level13 = 2;
          else if (minSpl >= 99) level13 = 1;
          
          p13Result = {
            title: p13CatalogEntry?.title || "Non-screen speakers SPL capability at RSP",
            level: `L${level13}`,
            value: minSpl,
            formatted: `${minSpl} dB (${limitingGroup.label})`,
            unit: p13CatalogEntry?.unit || "dB SPL (C)",
            limitingGroup: limitingGroup.label,
            status: "ok"
          };
        }
      }
    }
    
    gradedParameters.primary[13] = p13Result || {
      title: p13CatalogEntry?.title || "Non-screen speakers SPL capability at RSP",
      level: null,
      value: null,
      unit: p13CatalogEntry?.unit || "dB SPL (C)",
      status: "no_data"
    };

    // RP22 Parameter 15 — Background noise floor (design estimate)
    const p15CatalogEntry = RP22_CATALOG["15"];
    const p15LevelKey = p15ConstructionLevel || 'standard';
    
    // Map construction level to NCB value and RP22 level
    const p15Mapping = {
      'standard': { value: 26, level: 1 },
      'purpose-built': { value: 22, level: 2 },
      'reference': { value: 18, level: 3 },
      'studio': { value: 15, level: 4 }
    };
    
    const p15Data = p15Mapping[p15LevelKey] || p15Mapping['standard'];
    
    gradedParameters.primary[15] = {
      title: p15CatalogEntry?.title || "Background noise floor",
      level: `L${p15Data.level}`,
      value: p15Data.value,
      formatted: `NCB ${p15Data.value} (estimate)`,
      unit: p15CatalogEntry?.unit || "NCB",
      status: "ok"
    };

    gradedParameters.secondary = null;

    // ── RP22 Bass Parameters (18 / 19 / 20) — from current bass engine output ──
    // Source-of-truth: per-seat { frequency, spl } curves from BassResponseEngine.
    let bassP14 = null;
    let bassP18 = null;
    let bassP19 = null;
    let bassP20 = null;
    let __p18DebugData = null; // TEMP debug capture (read-only)
    // Declared OUTSIDE the try so the per-seat P20 block below can read it.
    const rspSeatIdForBass =
      (primarySeats.length > 0 && primarySeats[0]?.id) ||
      (safeSeats[0]?.id) ||
      null;
    try {
      const transitionHz = computeTransitionFrequencyHz({
        widthM: dimensions?.widthM ?? dimensions?.width,
        lengthM: dimensions?.lengthM ?? dimensions?.length,
        heightM: dimensions?.heightM ?? dimensions?.height,
      });

      const rspBassResponse = rspSeatIdForBass
        ? (seatResponses.find((r) => String(r?.seatId) === String(rspSeatIdForBass))?.responseData) || null
        : null;
      const usableSeatResponses = Array.isArray(seatResponses) ? seatResponses : [];

      if (rspBassResponse && Array.isArray(rspBassResponse) && rspBassResponse.length > 0) {
        // RP22 P14/P18/P19 are compliance/design estimates and always use the
        // post-EQ design curve. The Bass Response EQ toggle is visual only.
        // Design EQ is applied once here; P14 receives designEqEnabled=false
        // to avoid a second application.
        const rp22BassComplianceUsesDesignEq = true;
        const finalRspBassCurve = rp22BassComplianceUsesDesignEq
          ? applyDesignEqCurve(rspBassResponse)
          : rspBassResponse;
        bassP14 = computeParam14LfeCapability(finalRspBassCurve, false);
        bassP18 = computeParam18BassExtension(finalRspBassCurve);
        // TEMP P18 debug capture (inside try where finalRspBassCurve is in scope)
        __p18DebugData = (() => {
          const curve = Array.isArray(finalRspBassCurve) ? finalRspBassCurve : [];
          const valAtF = (f) => {
            if (curve.length === 0 || !isNum(f)) return null;
            if (f <= curve[0].frequency) return curve[0].spl;
            if (f >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
            for (let i = 0; i < curve.length - 1; i++) {
              if (f >= curve[i].frequency && f <= curve[i + 1].frequency) {
                const span = curve[i + 1].frequency - curve[i].frequency;
                if (span === 0) return curve[i].spl;
                const r = (f - curve[i].frequency) / span;
                return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * r;
              }
            }
            return null;
          };
          const freqs = [10, 15, 16, 20, 22, 25, 31.5, 40, 60, 80, 100];
          const splAtFreqs = {};
          for (const f of freqs) splAtFreqs[f] = valAtF(f);
          const dbg = bassP18?.__debug || null;
          return {
            rspSeatId: rspSeatIdForBass,
            responseDataLength: Array.isArray(rspBassResponse) ? rspBassResponse.length : 0,
            splAtFreqs,
            refDb: dbg?.refDb ?? null,
            thresholdDb: dbg?.thresholdDb ?? null,
            sorted0: dbg?.sorted0 ?? null,
            branch: dbg?.branch ?? (bassP18 ? "unknown" : "null/no_data"),
            returnedP18: bassP18,
          };
        })();
        if (transitionHz != null) {
          bassP19 = computeParam19Deviation(finalRspBassCurve, transitionHz);
          bassP20 = computeParam20SeatConsistency({
            rspResponse: rspBassResponse,
            perSeatResponses: usableSeatResponses,
            transitionHz,
            rspSeatId: rspSeatIdForBass,
          });
        }
      }
    } catch (e) {
      // Audits must NEVER crash the engine/UI
      bassP14 = null; bassP18 = null; bassP19 = null; bassP20 = null;
    }

    const p14CatalogEntry = RP22_CATALOG["14"];
    gradedParameters.primary[14] = bassP14
      ? {
          title: p14CatalogEntry?.title || "LFE frequencies total SPL capability at RSP",
          level: bassP14.level,
          value: bassP14.value,
          formatted: bassP14.formatted,
          unit: p14CatalogEntry?.unit || "dB SPL (C)",
          status: "ok",
          designEqEnabled: true,
          note: bassP14.note,
        }
      : {
          title: p14CatalogEntry?.title || "LFE frequencies total SPL capability at RSP",
          level: null,
          value: null,
          unit: p14CatalogEntry?.unit || "dB SPL (C)",
          status: "no_data",
          designEqEnabled: true,
          note: "Post-EQ design estimate at RSP using selected subwoofer product data.",
        };

    const p18CatalogEntry = RP22_CATALOG["18"];
    gradedParameters.primary[18] = bassP18
      ? {
          title: p18CatalogEntry?.title || "In-room bass extension -3 dB cutoff frequency point",
          level: bassP18.level,
          value: bassP18.value,
          formatted: bassP18.formatted,
          unit: p18CatalogEntry?.unit || "Hz",
          status: "ok",
          note: bassP18.note,
        }
      : {
          title: p18CatalogEntry?.title || "In-room bass extension -3 dB cutoff frequency point",
          level: null,
          value: null,
          unit: p18CatalogEntry?.unit || "Hz",
          status: "no_data",
          note: "Predicted design-stage value from current bass engine.",
        };

    if (__p18DebugData) __p18DebugData.gradedPrimary18 = gradedParameters.primary[18] ?? null;

    const p19CatalogEntry = RP22_CATALOG["19"];
    gradedParameters.primary[19] = bassP19
      ? {
          title: p19CatalogEntry?.title || "Frequency response below transition frequency at RSP",
          level: bassP19.level,
          value: bassP19.maxDevDb,
          formatted: bassP19.formatted,
          unit: p19CatalogEntry?.unit || "± dB",
          status: "ok",
          transitionHz: bassP19.transitionHz,
          note: bassP19.note,
        }
      : {
          title: p19CatalogEntry?.title || "Frequency response below transition frequency at RSP",
          level: null,
          value: null,
          unit: p19CatalogEntry?.unit || "± dB",
          status: "no_data",
          note: "Calculated from 1/3-octave smoothed predicted response.",
        };

    // Compute per-seat RP22 metrics (P9, P10, P16, P17, P20)
    const seatMetrics = new Map();
    const roomCenterX = (dimensions?.widthM || 0) / 2;

    // Synthetic RSP point for headline RP22 lookup (id="mlp").
    // This is analysis-only — it never enters seatingPositions or the UI seat grid.
    const syntheticMlpSeat = (() => {
      const pt = (mlpPointOverride && isNum(mlpPointOverride.x) && isNum(mlpPointOverride.y))
        ? mlpPointOverride
        : (mlp && isNum(mlp.x) && isNum(mlp.y) ? mlp : null);
      if (!pt) return null;
      return {
        id: "mlp",
        x: pt.x,
        y: pt.y,
        z: isNum(pt.z) ? pt.z : 1.2,
        isPrimary: true,
        __isSyntheticMLP: true,
      };
    })();

    // seatsToEvaluate = real seats + optional synthetic RSP point
    // seatsWithRoles is intentionally left unchanged for all other consumers
    const seatsToEvaluate = syntheticMlpSeat
      ? [...seatsWithRoles, syntheticMlpSeat]
      : seatsWithRoles;

    // IF visiblePlanSpeakers IS PROVIDED (EVEN EMPTY), IT IS THE SOURCE OF TRUTH.
    // DO NOT FALL BACK TO safeSpeakers, OR GHOST SPEAKERS RETURN.
    const speakersForP17 = Array.isArray(visiblePlanSpeakers)
      ? visiblePlanSpeakers
      : safeSpeakers;

    // ONLY RESOLVE OVERHEAD MODELS IF THE SPEAKER ALREADY HAS A REAL MODEL.
    // IF MODEL IS EMPTY/UNDEFINED, DO NOT INVENT ONE FOR ANALYSIS.
    const speakersWithResolvedOverheads = speakersForP17.map((speaker) => {
      const role = String(speaker.role || "").toUpperCase();
      if (!role.startsWith("T")) return speaker;

      if (!hasRealModel(speaker)) return speaker;

      const resolvedModel = resolveOverheadModel(speaker, overheadState);
      if (resolvedModel && resolvedModel !== speaker.model) {
        return { ...speaker, model: resolvedModel };
      }
      return speaker;
    });

    // Parse bed count from layout string (5.1, 7.1, 9.1, etc.)
    const parseLayoutBedCount = (layoutStr) => {
      const m = String(layoutStr || "").match(/^(\d+)\./);
      return m ? Number(m[1]) : null;
    };

    // Authoritative layout selector
    const layoutStr =
      aimState?.speakerSystem?.layout ||
      overheadState?.speakerSystem?.layout ||
      aimState?.speakerSystem?.format ||
      overheadState?.speakerSystem?.format ||
      aimState?.speakerSystem?.layoutName ||
      overheadState?.speakerSystem?.layoutName ||
      "";

    const bedCount = parseLayoutBedCount(layoutStr);

    // Allowed roles for P17 based on bed count (non-LCR only)
    const allowedP17Roles = new Set();

    // Always allow side surrounds when any surround bed exists
    allowedP17Roles.add("SL");
    allowedP17Roles.add("SR");

    // 7.x and above: allow rear surrounds
    if (bedCount >= 7) {
      allowedP17Roles.add("SBL");
      allowedP17Roles.add("SBR");
    }

    // 9.x and above: allow wides
    if (bedCount >= 9) {
      allowedP17Roles.add("LW");
      allowedP17Roles.add("RW");
    }

    // Also include physically present front wides in the evaluated P17 speaker list,
    // even in layouts where bedCount is below 9 (e.g. 7.1 with wides instead of rears)
    for (const spk of speakersWithResolvedOverheads) {
      if (!hasRealModel(spk)) continue;
      if (!isNum(spk?.position?.x) || !isNum(spk?.position?.y)) continue;
      const r = getCanonicalRole(spk.role);
      if (r === "LW" || r === "RW") {
        allowedP17Roles.add(r);
      }
    }

    // Dynamically include any numbered side-surround roles that actually exist
    // in the drawing with real models (SL2, SR2, SL3, SR3, etc.)
    for (const spk of speakersWithResolvedOverheads) {
      if (!hasRealModel(spk)) continue;
      const r = String(spk.role || "").toUpperCase();
      if (/^SL\d+$/.test(r) || /^SR\d+$/.test(r)) {
        allowedP17Roles.add(r);
      }
    }

    // Overheads are always part of P17 (when present)
    allowedP17Roles.add("TFL");
    allowedP17Roles.add("TFR");
    allowedP17Roles.add("TML");
    allowedP17Roles.add("TMR");
    allowedP17Roles.add("TRL");
    allowedP17Roles.add("TRR");
    allowedP17Roles.add("TBL");
    allowedP17Roles.add("TBR");
    allowedP17Roles.add("TFC");
    allowedP17Roles.add("TBC");
    allowedP17Roles.add("TL");
    allowedP17Roles.add("TR");

    // Compute P17 for all seats (non-LCR HF variance) - PASS allowedP17Roles for layout-based filtering

    const p17Results = computeP17ForAllSeats({
      seats: seatsToEvaluate,
      speakers: speakersWithResolvedOverheads.filter(hasRealModel), // CRITICAL: NO MODEL = NO P17
      mlpPos: mlp,
      getSpeakerModelMeta,
      roomHeightM,
      appState: { ...(aimState || overheadState), getSpeakerVisibility: aimState?.getSpeakerVisibility || overheadState?.getSpeakerVisibility },
      getCanonicalRole,
      allowedP17Roles,
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

    // Compute screenPlaneOffsetM once for all seats (same as seating generation)
    const screenPlaneOffsetM = screen?.mountMode === "floating" ? (Number(screen?.floatDepthM) || 0) : 0;

    for (const seat of seatsToEvaluate) {
      const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
      const metrics = { p1: null, p4: null, p5: null, p6: null, p9: null, p10: null, p16: null, p17: null, p20: null };

      // P1 - Nearest boundary distance (physical walls, not screen plane)
      if (isNum(seat.x) && isNum(seat.y)) {
        const yPhysical = seat.y + screenPlaneOffsetM;
        
        const distLeft = seat.x;
        const distRight = (dimensions?.widthM || 0) - seat.x;
        const distFront = yPhysical;
        const distBack = (dimensions?.lengthM || 0) - yPhysical;
        
        const p1ValueM = Math.min(distLeft, distRight, distFront, distBack);
        
        if (isNum(p1ValueM) && p1ValueM >= 0) {
          let level1 = 1;
          if (p1ValueM >= 1.2) level1 = 4;
          else if (p1ValueM >= 0.9) level1 = 3;
          else if (p1ValueM >= 0.6) level1 = 2;
          
          metrics.p1 = {
            valueM: p1ValueM,
            level: level1,
            formatted: `${p1ValueM.toFixed(2)}m`
          };
        }
      }

      // P4 - Max SPL difference between screen speakers
      if (seatSplMetrics) {
        const seatSpl = getSeatSplMetrics(seatSplMetrics, seatId);
        if (seatSpl?.screen) {
          const lcrSplValues = Object.values(seatSpl.screen)
            .map(s => s.value)
            .filter(isNum);
          
          if (lcrSplValues.length >= 2) {
            let maxDelta = 0;
            for (let i = 0; i < lcrSplValues.length; i++) {
              for (let j = i + 1; j < lcrSplValues.length; j++) {
                const delta = Math.abs(lcrSplValues[i] - lcrSplValues[j]);
                if (delta > maxDelta) maxDelta = delta;
              }
            }
            
            if (isNum(maxDelta)) {
              let level4 = 1;
              if (maxDelta <= 2) level4 = 4;
              else if (maxDelta <= 4) level4 = 3;
              else if (maxDelta <= 6) level4 = 2;
              
              metrics.p4 = {
                valueDb: maxDelta,
                level: level4,
                formatted: `${Math.floor(maxDelta)} dB`
              };
            }
          }
        }
      }

      // P5 - Max horizontal gap between adjacent surrounds (no wrap, RP22-correct)
      // Uses shared utility: computeSurroundRingGaps + rp22LevelForP5 (single source of truth)
      {
        const p5Result = computeSurroundRingGaps({
          seat,
          speakers: speakersWithResolvedOverheads,
          getCanonicalRole,
        });

        if (Number.isFinite(p5Result.worstGapDeg)) {
          const rawGap = p5Result.worstGapDeg;

          // RP22 requirement: ALWAYS round DOWN (floor)
          const flooredGap = Math.floor(rawGap);

          // Use floored value for BOTH scoring and display
          const levelStr = rp22LevelForP5(flooredGap);
          const level5 = levelStr === '—' ? 1 : Number(levelStr.replace('L', ''));

          metrics.p5 = {
            valueDeg: flooredGap,
            level: level5,
            formatted: `${flooredGap}°`
          };
        }
      }

      // P6 - Surround SPL consistency, normalised to RSP (MLP seat)
      // Correct formula: max(abs((SPL_i_seat - SPL_i_rsp) - (SPL_j_seat - SPL_j_rsp)))
      if (seatSplMetrics) {
        const seatSpl = getSeatSplMetrics(seatSplMetrics, seatId);
        const rspSpl = getSeatSplMetrics(seatSplMetrics, "mlp") || (
          primarySeats.length > 0
            ? getSeatSplMetrics(
                seatSplMetrics,
                primarySeats[0].id || `seat-${primarySeats[0].x}-${primarySeats[0].y}`
              )
            : null
        );

        if (seatSpl?.surrounds && rspSpl?.surrounds) {
          const P6_ROLES = ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'];

          // Build normalised values for roles present in BOTH seat and RSP
          const normalizedByRole = {};
          const seatByRole       = {};
          const rspByRole        = {};

          for (const role of P6_ROLES) {
            const seatVal = seatSpl.surrounds[role]?.value;
            const rspVal  = rspSpl.surrounds[role]?.value;
            if (isNum(seatVal) && isNum(rspVal)) {
              normalizedByRole[role] = seatVal - rspVal;
              seatByRole[role]       = seatVal;
              rspByRole[role]        = rspVal;
            }
          }

          const rolesUsed      = Object.keys(normalizedByRole);
          const normValues     = Object.values(normalizedByRole);

          if (normValues.length >= 2) {
            let maxDeltaRaw = 0;
            for (let i = 0; i < normValues.length; i++) {
              for (let j = i + 1; j < normValues.length; j++) {
                const delta = Math.abs(normValues[i] - normValues[j]);
                if (delta > maxDeltaRaw) maxDeltaRaw = delta;
              }
            }

            // Grade from raw float — do NOT floor/round before grading
            let level6 = 1;
            if      (maxDeltaRaw <= 2)  level6 = 4;
            else if (maxDeltaRaw <= 4)  level6 = 3;
            else if (maxDeltaRaw <= 6)  level6 = 2;
            else if (maxDeltaRaw <= 10) level6 = 1;

            if (globalThis.__B44_LOGS) {
              console.log('[RP22 P6 normalized]', {
                seatId,
                rolesUsed,
                normalizedByRole,
                maxDeltaRaw,
                level: level6,
              });
            }

            metrics.p6 = {
              valueDb:         maxDeltaRaw,
              level:           level6,
              formatted:       `${Math.floor(maxDeltaRaw)} dB`,
              // Debug payload
              rolesUsed,
              normalizedByRole,
              rspByRole,
              seatByRole,
              maxDeltaRaw,
            };
          }
        }
      }

      // P9 - Maximum vertical angle between adjacent upper speakers
      const upperSpeakers = getUpperSpeakersForSeat(seat, safeSpeakers, getCanonicalRole);
      if (upperSpeakers.length >= 2) {
        const result = computeUpperVerticalAnglesForSeat(seat, upperSpeakers, roomCenterX);
        const { maxVerticalGapDeg, gaps, worstGap, rowElevations } = result;
        
        if (isNum(maxVerticalGapDeg)) {
          let level9 = 1;
          if (maxVerticalGapDeg <= 50) level9 = 4;
          else if (maxVerticalGapDeg <= 60) level9 = 3;
          else if (maxVerticalGapDeg <= 80) level9 = 2;
          
          metrics.p9 = {
            value: maxVerticalGapDeg,
            formatted: `${maxVerticalGapDeg.toFixed(1)}°`,
            level: level9,
            details: {
              gaps,
              worst: worstGap,
              rowElevations,
            },
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
        const lcrAimMode = aimState?.lcrAimMode || overheadState?.lcrAimMode || 'flat';
        const p16 = computeP16ForSeat(seat, safeSpeakers.filter(hasRealModel), getSpeakerModelMeta, mlp, lcrAimMode);

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

      // P20 — Seat-to-seat bass consistency below transition frequency
      //   Source: per-seat smoothed bass curves vs RSP from current bass engine.
      //   The locked RSP seat (and the synthetic "mlp") carry the worst-seat
      //   summary so the existing panel "Achieved (RSP):" line surfaces the
      //   room-level result. Other real seats carry their own per-seat deviation.
      if (bassP20) {
        const isRspSeat =
          (rspSeatIdForBass != null && String(seat.id) === String(rspSeatIdForBass)) ||
          !!seat.__isSyntheticMLP;
        if (isRspSeat) {
          const worstDev = bassP20.worstSeatDeviationDb;
          const worstLvl = bassP20.worstSeatLevel; // 4/3/2 or null
          const worstDbTxt = `Worst: ±${worstDev.toFixed(1)} dB${bassP20.isSingleSeat ? ' (single seat)' : (bassP20.worstSeatId ? ` (${bassP20.worstSeatId})` : '')}${worstLvl == null ? ' · Below L2' : ''}`;
          metrics.p20 = {
            valueDb: worstDev,
            level: worstLvl,
            formatted: worstDbTxt,
            worstSeatId: bassP20.worstSeatId,
            worstSeatDeviationDb: worstDev,
            worstSeatLevel: worstLvl,
            isSingleSeat: !!bassP20.isSingleSeat,
            transitionHz: bassP20.transitionHz,
            note: bassP20.note,
          };
        } else {
          const perSeat = bassP20.perSeat.find((s) => String(s.seatId) === String(seat.id));
          if (perSeat) {
            metrics.p20 = {
              valueDb: perSeat.deviationDb,
              level: perSeat.level,
              formatted: `±${perSeat.deviationDb.toFixed(1)} dB`,
              transitionHz: bassP20.transitionHz,
              note: bassP20.note,
            };
          }
        }
      }
      // else: metrics.p20 stays null → existing "Not Calculated" fallback
      
      seatMetrics.set(seatId, metrics);
    }

    // Build perSeatRp22 - reusable structure for all consumers
    // seatsToEvaluate includes real seats + synthetic "mlp" RSP point for headline lookup
    const perSeatRp22 = {};
    for (const seat of seatsToEvaluate) {
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

    // Build perSeatRp23 - RP23 horizontal viewing angle for each seat
    // Use the SAME calculation as buildSeatHudSnapshot to ensure consistency
    const perSeatRp23 = {};
    
    for (const seat of seatsWithRoles) {
      const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
      
      // Import the HUD calculation for RP23 from buildSeatHudSnapshot
      // Screen width in meters (from screen.visibleWidthInches)
      const screenWidthInches = screen?.visibleWidthInches || 100;
      const screenWidthM = screenWidthInches * 0.0254;
      
      // Distance from seat to screen (screen is at Y coordinate near front of room)
      const screenFrontY = screen?.frontPlaneM || 0;
      const seatY = seat.y || 0;
      const distanceToScreenM = Math.abs(seatY - screenFrontY);
      
      if (distanceToScreenM > 0.1 && screenWidthM > 0) {
        // Calculate horizontal viewing angle (RP23)
        const rp23AngleRad = 2 * Math.atan((screenWidthM / 2) / distanceToScreenM);
        
        // Convert radians to degrees (handle both cases)
        const rp23AngleDeg = rp23AngleRad < 6.5 ? (rp23AngleRad * 180 / Math.PI) : rp23AngleRad;
        const rp23DisplayDeg = Math.round(rp23AngleDeg);
        
        const displayDeg = rp23DisplayAngleDeg(rp23AngleDeg);
        const level = rp23LevelForAngleDeg(rp23AngleDeg);

        perSeatRp23[seatId] = {
          angleDeg: rp23AngleDeg,
          displayDeg,
          formatted: displayDeg != null ? `${displayDeg}°` : '—',
          level,
        };
      } else {
        perSeatRp23[seatId] = {
          angleDeg: null,
          displayDeg: null,
          level: null,
          formatted: '—'
        };
      }
    }



    return {
      gradedParameters,
      __p18Debug: __p18DebugData,
      p7Details: (evaluateFrontWideDeviation(safeSpeakers, safeSeats, mlpBasis) || {}).perSide,
      param5,
      surroundGaps,
      seatMetrics,
      perSeatRp22, // New: structured per-seat RP22 data
      perSeatRp23, // New: structured per-seat RP23 data
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
    dimensions?.length,
    dimensions?.widthM,
    dimensions?.width,
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
    aimState?.lcrAimMode,
    overheadState?.lcrAimMode,
    p15ConstructionLevel,
    screen?.mountMode,
    screen?.floatDepthM,
    seatResponses,
  ]);

  return { ...memoizedResult, evaluateOverheads };
};