// rp22HfOffAxis.js
// RP22 P16 + P17 – HF off-axis attenuation per seat
// P16: LCR speakers
// P17: Surrounds, Wides, Overheads
// Uses speaker.yaw as the aim direction and computes true off-axis angle
// between the speaker's front axis and the seat direction.

import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";
import { resolveSpeakerYaw } from "@/components/utils/speakerAimResolver";
// RP22 P17 MEASURED ENGINE — Stage 1 scaffolding (inactive until a registry model declares
// polarModel.type === "measured" with real PAS/FRD data). See measuredP17Engine.jsx header.
import { computeMeasuredP17Response } from "@/components/utils/rp22/measuredP17Engine";
import { validatePolarModel } from "@/components/utils/rp22/polarModelValidation";

const LCR_ROLES = new Set(["FL", "L", "FC", "C", "FR", "R"]);
const OVERHEAD_ROLES = new Set(["TFL", "TFR", "TL", "TR", "TML", "TMR", "TBL", "TBR", "TFC", "TBC", "TRL", "TRR"]);
const SURROUND_ROLES = new Set(["SL", "SR", "SBL", "SBR", "LW", "RW"]);

// Returns true for any bed-layer surround/wide role, including numbered variants (SL2, SR2, SL3, SR3...)
const isBedLayerSurround = (role) => {
  if (SURROUND_ROLES.has(role)) return true;
  if (/^SL\d+$/.test(role)) return true;
  if (/^SR\d+$/.test(role)) return true;
  return false;
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Quantise degrees to 0.5° steps (floor, favourable + stable)
const q05 = (deg) => (typeof deg === "number" && Number.isFinite(deg) ? Math.floor(deg * 2) / 2 : deg);

// 3D vector helpers for overhead aim calculation
const seatXYZ = (seat) => ({
  x: Number(seat?.x ?? seat?.position?.x),
  y: Number(seat?.y ?? seat?.position?.y),
  z: Number(seat?.z ?? seat?.position?.z ?? 1.2),
});

const spkXYZ = (spk, roomHeightM) => ({
  x: Number(spk?.position?.x),
  y: Number(spk?.position?.y),
  z: Number.isFinite(roomHeightM) ? Number(roomHeightM) : Number(spk?.position?.z),
});

const norm3 = (v) => {
  const m = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(m) || m <= 1e-9) return null;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
};

const dot3 = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;

const angleBetweenDeg = (a, b) => {
  const na = norm3(a);
  const nb = norm3(b);
  if (!na || !nb) return null;
  let d = dot3(na, nb);
  d = Math.max(-1, Math.min(1, d));
  return Math.acos(d) * 180 / Math.PI;
};

const isOverheadRole = (role) => {
  const r = String(role || "");
  return r.startsWith("T");
};

// Plan-view yaw convention (MUST match icon rotation in RoomVisualisation)
// 0° = +Y (into room), clockwise positive, range -180..+180
const yawFromToPlan = (from, to) => {
  if (!from || !to) return null;
  const dx = (to.x - from.x);
  const dy = (to.y - from.y);
  if (!isNum(dx) || !isNum(dy)) return null;
  return (-(Math.atan2(dx, dy) * 180) / Math.PI);
};

// Canonical role normaliser (must match AppState aliases)
const canonRole = (role, getCanonicalRole) => {
  const raw = String(role || "").trim();
  const upper = raw.toUpperCase();

  // aliases seen elsewhere in the app
  const aliasMap = {
    LR: "SBL",
    RR: "SBR",
    FWL: "LW",
    FWR: "RW",
  };

  const mapped = aliasMap[upper] || upper;

  try {
    return String(getCanonicalRole ? getCanonicalRole(mapped) : mapped).trim().toUpperCase();
  } catch {
    return String(mapped).trim().toUpperCase();
  }
};

// Normalise to -180..+180
const norm180 = (deg) => {
  if (!isNum(deg)) return null;
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
};

// Smallest absolute angle between two headings (0..180)
const shortestAngleDeg = (aDeg, bDeg) => {
  const d = norm180((Number(aDeg) || 0) - (Number(bDeg) || 0));
  return Math.abs(d);
};

// Helper: pass through the registry dispersion value unchanged.
// IMPORTANT: Registry dispersion values (minus1p5dB, minus3dB, minus5dB) are ALREADY
// stored as half-angle off-axis limits (±degrees from centre line).
// They must NOT be divided by 2 again — do not halve them.
// e.g. registry value 30 → threshold 30°, NOT 15°.
function halfDispersionDeg(fullDeg) {
  if (!Number.isFinite(fullDeg)) return null;
  return Math.ceil(fullDeg); // no division — value is already a half-angle
}

// Continuous (interpolated) HF loss estimate for P16 delta comparison only.
// Returns a smooth dB value that continues rising beyond the -5 dB window.
// Uses the same dispersion thresholds as mapAngleToHfLossDb for the inner knots,
// then extends with a linear tail so seat-to-seat deltas remain meaningful
// when both the seat and RSP are outside the nominal coverage window.
// Hard ceiling: 12.0 dB (avoids absurd values while preserving relative ordering).
function continuousHfLossDb(angleDeg, modelMeta = null) {
  const a = Math.abs(Number(angleDeg) || 0);

  // Resolve thresholds from model or fall back to generic RP22 implied points
  let p0 = 0, p1 = 28, p2 = 41, p3 = 55;
  let l0 = 0, l1 = 1.5, l2 = 3.0, l3 = 5.0;

  if (modelMeta?.dispersion?.horizontal) {
    const disp = modelMeta.dispersion.horizontal;
    const m1p5 = halfDispersionDeg(disp.minus1p5dB ?? disp.minus1p5);
    const m3   = halfDispersionDeg(disp.minus3dB ?? disp.minus3);
    const m5   = halfDispersionDeg(disp.minus5dB ?? disp.minus5);
    if (m1p5 != null && m3 != null && m5 != null) {
      p1 = m1p5; p2 = m3; p3 = m5;
    }
  }

  // Linear interpolation between the four inner knot points
  if (a <= p0) return l0;
  if (a <= p1) return l0 + (l1 - l0) * (a - p0) / (p1 - p0);
  if (a <= p2) return l1 + (l2 - l1) * (a - p1) / (p2 - p1);
  if (a <= p3) return l2 + (l3 - l2) * (a - p2) / (p3 - p2);

  // Beyond the -5 dB window: continue rising with a linear tail.
  // Slope is derived from the final segment (p2→p3) so the curve is continuous
  // and doesn't flatten abruptly. Clamped at 12.0 dB.
  const tailSlope = (l3 - l2) / Math.max(1, p3 - p2); // dB per degree
  const tailLoss = l3 + tailSlope * (a - p3);
  return Math.min(12.0, tailLoss);
}

// Centralized angle → HF loss mapping using new RP22 thresholds
// Uses model-specific dispersion if available, otherwise defaults to generic thresholds
function mapAngleToHfLossDb(angleDeg, modelMeta = null) {
  const a = Math.abs(Number(angleDeg) || 0);

  // Try to use model-specific dispersion data
  if (modelMeta?.dispersion?.horizontal) {
    const disp = modelMeta.dispersion.horizontal;
    const minus1p5 = halfDispersionDeg(disp.minus1p5dB ?? disp.minus1p5);
    const minus3 = halfDispersionDeg(disp.minus3dB ?? disp.minus3);
    const minus5 = halfDispersionDeg(disp.minus5dB ?? disp.minus5);

    if (minus1p5 != null && minus3 != null && minus5 != null) {
      if (a <= minus1p5) return 1.5;
      if (a <= minus3) return 3.0;
      if (a <= minus5) return 5.0;
      return null; // Beyond model's −5 dB window
    }
  }

  // Fallback to generic RP22 thresholds
  if (a <= 28) return 1.5;
  if (a <= 41) return 3.0;
  if (a <= 55) return 5.0;

  // Above 55° we are beyond our reference window.
  // Callers decide how to classify this for RP22.
  return null; // use null to mean "beyond 55° reference"
}

// Convert radians to degrees
const rad2deg = (rad) => rad * 180 / Math.PI;

// Quantise angle DOWN to the nearest step (default 0.5°) to prevent jitter.
// Slightly favourable by design (floors rather than rounds).
const quantiseAngleDown = (deg, step = 0.5) => {
  const v = Math.abs(Number(deg) || 0);
  const s = Number(step) || 0.5;
  if (!Number.isFinite(v) || !Number.isFinite(s) || s <= 0) return 0;
  // tiny epsilon so values like 1.0000000002 don't jump up a step
  const q = Math.floor((v + 1e-9) / s) * s;
  // Keep one decimal so HUD stays clean (0.5° granularity)
  return Number(q.toFixed(1));
};

// 0° = into room (+Y). Positive = clockwise. MUST match RenderPrimitives.yawDegToMLP
const angleFromTo = (from, to) => {
  if (!from || !to) return null;
  const dx = (to.x - from.x);
  const dy = (to.y - from.y);
  if (!isNum(dx) || !isNum(dy)) return null;
  return -(Math.atan2(dx, dy) * 180) / Math.PI; // -180..+180
};

// P16 level mapping based on loss
const classifyP16 = (lossDb) => {
  if (!isNum(lossDb)) return null;
  if (lossDb > 5) return null;   // FAIL
  if (lossDb > 3) return 1;      // 3–5 dB
  if (lossDb > 1.5) return 2;    // 1.5–3 dB
  return 4;                      // ≤1.5 dB
};

// Helper: compute raw lossDb for one LCR speaker at a given seat point
// lcrAimMode: 'flat' (default) → all LCR aim straight ahead (0°)
//             'angled'         → FL/FR aim at mlpPos; FC always 0°
function computeLcrLossAtPoint(spk, point, mlpPos, lcrAimMode) {
  if (!point || !isNum(point.x) || !isNum(point.y)) return null;
  const pos = spk.position;

  const seatAzDeg = yawFromToPlan(pos, point);
  if (!isNum(seatAzDeg)) return null;

  // Resolve LCR aim from live mode — never use stale spk.yaw for P16
  const role = String(spk.role || '').toUpperCase();
  const isFC = role === 'FC' || role === 'C';
  let aimDegRaw;
  if (isFC) {
    // Center always fires straight ahead
    aimDegRaw = 0;
  } else if (lcrAimMode === 'angled' && mlpPos && isNum(mlpPos.x) && isNum(mlpPos.y)) {
    // FL/FR aimed at RSP when toggle is on
    aimDegRaw = yawFromToPlan(pos, mlpPos) ?? 0;
  } else {
    // Flat-to-wall: fire straight ahead
    aimDegRaw = 0;
  }

  const offAxisRaw = shortestAngleDeg(seatAzDeg, aimDegRaw);
  const offAxisDeg = Math.abs(offAxisRaw);
  if (!isNum(offAxisDeg)) return null;

  const angleDeg = quantiseAngleDown(offAxisDeg, 0.5);
  const meta = spk.model ? getSpeakerModelMeta(spk.model) : null;
  const lossFromAngle = mapAngleToHfLossDb(angleDeg, meta);
  const continuousLossDb = continuousHfLossDb(offAxisDeg, meta); // uses raw angle, not quantised

  if (lossFromAngle == null) {
    return { lossDb: 5.0, continuousLossDb, angleDeg, isBeyondLcrLimit: true, seatAzDeg, aimDegRaw, offAxisRaw: offAxisDeg };
  }
  return { lossDb: lossFromAngle, continuousLossDb, angleDeg, isBeyondLcrLimit: false, seatAzDeg, aimDegRaw, offAxisRaw: offAxisDeg };
}

export function computeP16ForSeat(seat, allSpeakers, getSpeakerModelMeta, mlpPos = null, lcrAimMode = 'flat') {
  if (!seat || !isNum(seat.x) || !isNum(seat.y)) return null;
  if (!Array.isArray(allSpeakers) || !allSpeakers.length) return null;

  // RSP is mlpPos; if not provided fall back to the seat itself (RSP → 0 dB)
  const rspPoint = (mlpPos && isNum(mlpPos.x) && isNum(mlpPos.y)) ? mlpPos : seat;

  // 1) Pick LCR speakers that have valid positions
  const lcrSpeakers = allSpeakers.filter((spk) => {
    const role = String(spk.role || "").toUpperCase();
    const pos = spk.position;
    return (
      LCR_ROLES.has(role) &&
      pos &&
      isNum(pos.x) &&
      isNum(pos.y)
    );
  });

  if (!lcrSpeakers.length) return null;

  const perSpeaker = {};
  let worstDelta = -Infinity;
  let worstRole = null;

  // 2) Evaluate each LCR: compute loss at seat AND at RSP, take delta
  for (const spk of lcrSpeakers) {
    const role = String(spk.role || "").toUpperCase();

    const atSeat = computeLcrLossAtPoint(spk, seat, mlpPos, lcrAimMode);
    if (!atSeat) continue;

    const atRsp = computeLcrLossAtPoint(spk, rspPoint, mlpPos, lcrAimMode);
    if (!atRsp) continue;

    // Stricter P16 comparison: keep the RSP delta term, but retain part of the
    // seat's absolute off-axis loss so outer seats do not collapse too easily.
    const seatLoss = Number(atSeat.continuousLossDb) || 0;
    const rspLoss = Number(atRsp.continuousLossDb) || 0;
    const normalizedDelta = Math.abs(seatLoss - rspLoss);
    const delta = normalizedDelta + (seatLoss * 0.5);

    const isBeyondLcrLimit = atSeat.isBeyondLcrLimit || atRsp.isBeyondLcrLimit;

    perSpeaker[role] = {
      angleDeg: atSeat.angleDeg,
      lossDb: Number(delta.toFixed(1)),         // weighted seat-vs-RSP delta
      isBeyondLcrLimit,
      // Debug fields
      lossAtSeat: Number(seatLoss.toFixed(2)),
      lossAtRsp: Number(rspLoss.toFixed(2)),
      continuousLossAtSeat: Number(atSeat.continuousLossDb.toFixed(2)),
      continuousLossAtRsp: Number(atRsp.continuousLossDb.toFixed(2)),
      normalizedDelta: Number(normalizedDelta.toFixed(1)),
      weightedDelta: Number(delta.toFixed(1)),
      // Aim debug fields
      seatAzDeg: Number(isNum(atSeat.seatAzDeg) ? atSeat.seatAzDeg.toFixed(1) : 0),
      aimDegRaw: Number(isNum(atSeat.aimDegRaw) ? atSeat.aimDegRaw.toFixed(1) : 0),
      offAxisRaw: Number(isNum(atSeat.offAxisRaw) ? atSeat.offAxisRaw.toFixed(1) : 0),
    };

    const isBetter =
      delta > worstDelta ||
      (delta === worstDelta && atSeat.angleDeg > (perSpeaker[worstRole]?.angleDeg ?? -Infinity)) ||
      (delta === worstDelta && atSeat.angleDeg === (perSpeaker[worstRole]?.angleDeg ?? -Infinity) && atSeat.continuousLossDb > (perSpeaker[worstRole]?.continuousLossAtSeat ?? -Infinity));

    if (isBetter) {
      worstDelta = delta;
      worstRole = role;
    }
  }

  if (!worstRole || !isNum(worstDelta) || worstDelta === -Infinity) return null;

  const value = Number(worstDelta.toFixed(1));

  // Check if any LCR exceeds 55° off-axis (at the current seat)
  const hasLcrBeyondLimit = Object.values(perSpeaker).some(
    (spk) => spk.isBeyondLcrLimit === true
  );

  // Force Level 1 if any LCR is beyond 55°
  let level = classifyP16(value);
  if (hasLcrBeyondLimit) {
    level = 1;
  }

  const worstAngle = perSpeaker[worstRole]?.angleDeg ?? null;

  return {
    value,
    formatted: `±${value.toFixed(1)} dB`,
    hudLabel: `${worstRole} ±${value.toFixed(1)} dB`,
    level,
    p16BeyondLcrLimit: hasLcrBeyondLimit,
    debug: {
      perSpeaker,
      worst: {
        role: worstRole,
        angleDeg: worstAngle,
        lossDb: value,
      },
    },
  };
}

// --- P17 HELPERS ---

// Map overhead models to their built-in tilt (towards the MLP), in degrees
function getOverheadTiltDeg(modelKey) {
  const key = (modelKey || "").toString().toLowerCase();

  // Mikro: flat baffle, no tilt
  if (key.includes("mikro")) return 0;

  // Architect 2-1: ~5° angled tweeter
  if (key.includes("architect-2-1")) return 5;

  // Architect 4-2: ~5° angled tweeter
  if (key.includes("architect-4-2")) return 5;

  // Architect PAS2-2: ~20° angled baffle
  if (key.includes("pas2-2") || key.includes("architect pas")) {
    return 20;
  }

  // Default: no built-in tilt
  return 0;
}



/**
 * Compute vertical off-axis angle for a ceiling-mounted overhead speaker relative to the listener.
 *
 * Physical model: overhead speakers are mounted in the ceiling and face straight DOWN by default.
 * rawAngleDeg = angle between the straight-down axis (0,0,-1) and the speaker→seat vector.
 * effectiveAngleDeg = rawAngleDeg - builtInTiltDeg (scalar reduction; floor at 0).
 *
 * - speakerPos: { x, y, z? }  (z overridden by roomHeightM if provided)
 * - seatPos: { x, y, z? }
 * - rspPos: unused (kept in signature for call-site compatibility)
 * - earHeightM: listener ear height in metres
 * - modelKey: string used to look up built-in tilt and dispersion
 * - roomHeightM: current room ceiling height (if finite, overrides speakerPos.z)
 */
function computeVerticalOffAxisDeg(speakerPos, seatPos, rspPos, earHeightM, modelKey, roomHeightM) {
  if (!seatPos || !speakerPos) {
    return { offAxisDeg: 0, lossDb: 1.5, rawAngleDeg: 0 };
  }

  const earZ = Number.isFinite(Number(earHeightM))
    ? Number(earHeightM)
    : 1.2;

  // Work out which Z we're using for the speaker:
  // 1) explicit room height from dimensions
  // 2) speaker's own z
  // 3) fallback to 1 m above the ear
  const speakerZRaw = Number.isFinite(Number(roomHeightM))
    ? Number(roomHeightM)
    : (Number.isFinite(Number(speakerPos.z)) ? Number(speakerPos.z) : (earZ + 1.0));

  // Ensure the speaker is always above the listener
  const speakerZ = Math.max(earZ + 0.01, speakerZRaw);

  // Overhead speakers are ceiling-mounted. Default acoustic axis is straight DOWN.
  // rawAngleDeg = angle between the straight-down axis (0,0,-1) and the speaker→seat vector.
  const spk = spkXYZ({ position: speakerPos }, roomHeightM);
  const seat = seatXYZ(seatPos);

  // Straight-down axis (unit vector pointing downward from ceiling)
  const downAxis = { x: 0, y: 0, z: -1 };

  // Vector from speaker to seat (not normalised yet — angleBetweenDeg normalises internally)
  const seatVec = { x: seat.x - spk.x, y: seat.y - spk.y, z: seat.z - spk.z };

  const ang = angleBetweenDeg(downAxis, seatVec);
  const rawAngleDeg = Number.isFinite(ang) ? ang : 0;

  // Get model metadata for aim offset and dispersion
  const meta = getSpeakerModelMeta(modelKey);
  const aimOffsetDeg = meta?.builtInTiltDeg ?? getOverheadTiltDeg(modelKey) ?? 0;

  // Built-in tilt reduces effective off-axis angle (simple discount)
  const tiltDeg = Number.isFinite(aimOffsetDeg) ? Number(aimOffsetDeg) : 0;
  const effectiveAngleDeg = Math.max(0, rawAngleDeg - tiltDeg);

  // Use model-specific dispersion windows if available
  // For overheads: use MAX(horizontal, vertical) per threshold (forgiving approach)
  let lossDb;
  if (meta?.dispersion?.horizontal) {
    const dispH = meta.dispersion.horizontal;
    const dispV = meta.dispersion.vertical;
    
    // Extract horizontal limits
    const h1p5 = halfDispersionDeg(dispH.minus1p5dB ?? dispH.minus1p5);
    const h3 = halfDispersionDeg(dispH.minus3dB ?? dispH.minus3);
    const h5 = halfDispersionDeg(dispH.minus5dB ?? dispH.minus5);
    
    // Use MAX(horizontal, vertical) for each threshold (honest but forgiving)
    let minus1p5, minus3, minus5;
    if (dispV) {
      const v1p5 = halfDispersionDeg(dispV.minus1p5dB ?? dispV.minus1p5);
      const v3 = halfDispersionDeg(dispV.minus3dB ?? dispV.minus3);
      const v5 = halfDispersionDeg(dispV.minus5dB ?? dispV.minus5);
      
      // Use the wider (more forgiving) limit per threshold
      minus1p5 = (h1p5 != null && v1p5 != null) ? Math.max(h1p5, v1p5) : (h1p5 ?? v1p5);
      minus3 = (h3 != null && v3 != null) ? Math.max(h3, v3) : (h3 ?? v3);
      minus5 = (h5 != null && v5 != null) ? Math.max(h5, v5) : (h5 ?? v5);
    } else {
      // No vertical data: use horizontal only
      minus1p5 = h1p5;
      minus3 = h3;
      minus5 = h5;
    }

    if (minus1p5 != null && minus3 != null && minus5 != null) {
      // Use averaged dispersion windows on effective angle
      if (effectiveAngleDeg <= minus1p5) lossDb = 1.5;
      else if (effectiveAngleDeg <= minus3) lossDb = 3.0;
      else if (effectiveAngleDeg <= minus5) lossDb = 5.0;
      else lossDb = 5.0; // Beyond −5 dB window
    } else {
      // Fallback to legacy thresholds if dispersion incomplete
      const key = (modelKey || "").toString().toLowerCase();
      if (key.includes("mikro")) {
        if (effectiveAngleDeg <= 40) lossDb = 1.5;
        else if (effectiveAngleDeg <= 50) lossDb = 3.0;
        else lossDb = 5.0;
      } else {
        if (effectiveAngleDeg <= 45) lossDb = 1.5;
        else if (effectiveAngleDeg <= 55) lossDb = 3.0;
        else lossDb = 5.0;
      }
    }
  } else {
    // No dispersion data: use legacy thresholds
    const key = (modelKey || "").toString().toLowerCase();
    if (key.includes("mikro")) {
      if (effectiveAngleDeg <= 40) lossDb = 1.5;
      else if (effectiveAngleDeg <= 50) lossDb = 3.0;
      else lossDb = 5.0;
    } else {
      if (effectiveAngleDeg <= 45) lossDb = 1.5;
      else if (effectiveAngleDeg <= 55) lossDb = 3.0;
      else lossDb = 5.0;
    }
  }

  return {
    offAxisDeg: effectiveAngleDeg,  // effective angle for P17 scoring
    rawAngleDeg: rawAngleDeg,       // geometric angle for display
    lossDb,
    // Debug data — straight-down axis model
    debug: {
      modelKey,
      rawAngleDeg,        // angle between straight-down axis and speaker→seat vector
      aimOffsetDeg,       // built-in scalar tilt reduction (5° or 20°)
      effectiveAngleDeg,  // rawAngleDeg - aimOffsetDeg (clamped to 0)
      dispersionWindows: meta?.dispersion?.horizontal ? {
        minus1p5dB: meta.dispersion.horizontal.minus1p5dB ?? meta.dispersion.horizontal.minus1p5 ?? null,
        minus3dB: meta.dispersion.horizontal.minus3dB ?? meta.dispersion.horizontal.minus3 ?? null,
        minus5dB: meta.dispersion.horizontal.minus5dB ?? meta.dispersion.horizontal.minus5 ?? null,
      } : null,
      // Geometry inputs
      roomHeightMUsed: roomHeightM,
      earHeightMUsed: earZ,
      speakerX: spk.x,
      speakerY: spk.y,
      speakerZUsed: spk.z,
      seatX: seat.x,
      seatY: seat.y,
      seatZUsed: seat.z,
      // Axis vectors used
      downAxisX: 0,
      downAxisY: 0,
      downAxisZ: -1,
      seatVecX: seatVec.x,
      seatVecY: seatVec.y,
      seatVecZ: seatVec.z,
    },
  };
}

// CRITICAL: Single source of truth for effective yaw — delegates to resolveSpeakerYaw.
// Both plan-view (getPlanAimDeg) and P17 (computeSurroundLikeHfLoss) call this path,
// guaranteeing identical aim for the same speaker object.
const getEffectiveYawDeg = (speaker, seatPos, mlpPos, appState, getCanonicalRole) => {
  return resolveSpeakerYaw({ speaker, mlpPos, appState, getCanonicalRole });
};

// Unified helper: compute HF loss for one non-LCR speaker at one seat
function computeSurroundLikeHfLoss({ speaker, seat, mlpPos, earHeightM, modelMeta, roomHeightM, appState, getCanonicalRole }) {
  if (!speaker || !seat) return null;
  
  const role = canonRole(speaker?.role, getCanonicalRole);
  const pos = speaker?.position;
  
  // [B44 DEBUG] Log filter decisions
  if (globalThis.__B44_RV_DEBUG === true && ["LW", "RW", "SBL", "SBR"].includes(role)) {
    console.log(`[P17 FILTER] ${role}:`, {
      hasRole: !!speaker.role,
      isLCR: LCR_ROLES.has(role),
      isSub: role.includes("LFE") || role.includes("SUB"),
      hasPosition: !!(pos && isNum(pos.x) && isNum(pos.y)),
      inSurroundRoles: SURROUND_ROLES.has(role),
      inOverheadRoles: OVERHEAD_ROLES.has(role),
      willProcess: !LCR_ROLES.has(role) && !role.includes("LFE") && !role.includes("SUB") && pos && isNum(pos.x) && isNum(pos.y)
    });
  }
  
  // Skip LCR and subs
  if (LCR_ROLES.has(role) || role.includes("LFE") || role.includes("SUB")) {
    return null;
  }
  
  if (!pos || !isNum(pos.x) || !isNum(pos.y)) return null;

  // --- DUAL-MODE: measured polar model support (Stage 1 scaffolding) ---
  // If this speaker model declares polarModel.type === "measured" AND its dataset is complete,
  // use the measured P17 engine instead of the estimated dispersion-window path below. If
  // polarModel is missing/incomplete (true for every current speaker), we safely fall through
  // to the existing estimated path — guaranteeing zero behaviour change for existing speakers.
  if (modelMeta?.polarModel?.type === "measured" && validatePolarModel(modelMeta.polarModel).readyForMeasuredP17) {
    // Horizontal off-axis: reuse the same azimuth geometry already used for bed-layer surrounds.
    const seatAzDeg = angleFromTo(pos, seat);
    const resolvedYaw = resolveSpeakerYaw({ speaker, mlpPos, appState, getCanonicalRole });
    const horizontalOffAxisAngle = (isNum(seatAzDeg) && isNum(resolvedYaw))
      ? shortestAngleDeg(seatAzDeg, resolvedYaw)
      : null;

    // Vertical off-axis: reuse the same straight-axis + tilt geometry already used for
    // overheads, using the polarModel's own axisTiltDeg instead of the registry's builtInTiltDeg.
    const spk3 = spkXYZ({ position: speaker.position }, roomHeightM);
    const seat3 = seatXYZ(seat);
    const downAxis = { x: 0, y: 0, z: -1 };
    const seatVec3 = { x: seat3.x - spk3.x, y: seat3.y - spk3.y, z: seat3.z - spk3.z };
    const rawVertAngle = angleBetweenDeg(downAxis, seatVec3);
    const tiltDeg = isNum(modelMeta.polarModel.axisTiltDeg) ? modelMeta.polarModel.axisTiltDeg : 0;
    const verticalOffAxisAngle = isNum(rawVertAngle) ? Math.max(0, rawVertAngle - tiltDeg) : null;

    // RSP reference angles, for the seat-vs-RSP comparison inside the measured engine.
    const rspAzDeg = (mlpPos && isNum(mlpPos.x) && isNum(mlpPos.y)) ? angleFromTo(pos, mlpPos) : seatAzDeg;
    const rspHorizontalOffAxisAngle = (isNum(rspAzDeg) && isNum(resolvedYaw))
      ? shortestAngleDeg(rspAzDeg, resolvedYaw)
      : horizontalOffAxisAngle;
    const rspSeat3 = mlpPos ? seatXYZ(mlpPos) : seat3;
    const rspSeatVec3 = { x: rspSeat3.x - spk3.x, y: rspSeat3.y - spk3.y, z: rspSeat3.z - spk3.z };
    const rspRawVertAngle = angleBetweenDeg(downAxis, rspSeatVec3);
    const rspVerticalOffAxisAngle = isNum(rspRawVertAngle) ? Math.max(0, rspRawVertAngle - tiltDeg) : verticalOffAxisAngle;

    // Development-only validation mode override — forces the measured lookup to a specific
    // measured angle. Inactive in production; set via globalThis for dev testing only.
    const devOverride = (typeof globalThis.__B44_P17_VALIDATION_OVERRIDE__ === "object" && globalThis.__B44_P17_VALIDATION_OVERRIDE__)
      ? globalThis.__B44_P17_VALIDATION_OVERRIDE__
      : null;

    const measured = computeMeasuredP17Response({
      polarModel: modelMeta.polarModel,
      seatHorizontalOffAxisAngle: horizontalOffAxisAngle,
      seatVerticalOffAxisAngle: verticalOffAxisAngle,
      rspHorizontalOffAxisAngle,
      rspVerticalOffAxisAngle,
      devOverride,
    });

    if (!measured.missingMeasuredData) {
      return {
        role,
        offAxisDeg: quantiseAngleDown(horizontalOffAxisAngle ?? 0, 0.5),
        rawAngleDeg: quantiseAngleDown(horizontalOffAxisAngle ?? 0, 0.5),
        lossDb: isNum(measured.maximumDeviationDb) ? Number(measured.maximumDeviationDb.toFixed(1)) : 0,
        measured: true,
        measuredDiagnostics: measured,
      };
    }
    // Missing measured data at this angle: fall through to the estimated path below.
  }
  // --- END DUAL-MODE BRANCH ---

  let offAxisDeg = null;

  // Overhead speakers: use vertical off-axis with RSP aim
  if (OVERHEAD_ROLES.has(role)) {
    // Overheads: use room height + model tilt + RSP position for aim
    const vert = computeVerticalOffAxisDeg(
      speaker.position,
      seat,
      mlpPos, // Pass RSP/MLP position for aim calculation
      earHeightM,
      speaker.model,
      roomHeightM
    );

    if (!vert || !Number.isFinite(vert.offAxisDeg) || !Number.isFinite(vert.lossDb)) {
      return null;
    }

    return {
      role,
      offAxisDeg: quantiseAngleDown(vert.offAxisDeg, 0.5), // for scoring
      rawAngleDeg: quantiseAngleDown((vert.rawAngleDeg ?? vert.offAxisDeg), 0.5), // for display
      lossDb: Number(vert.lossDb.toFixed(1)),
      debug: vert.debug, // Pass through debug data
    };
  } 
  // Bed-layer surrounds/wides: use physical wall-normal as the reference axis
  else if (isBedLayerSurround(role)) {
    // Seat azimuth from speaker position (signed heading, -180..+180)
    const seatAzDeg = angleFromTo(pos, seat);
    if (!isNum(seatAzDeg)) return null;

    // Physical wall-normal on-axis direction per role (degrees, same convention as angleFromTo)
    // 0° = into room (+Y), clockwise positive
    // Left-wall speakers face +X  → -90°
    // Right-wall speakers face -X → +90°
    // Rear-wall speakers face -Y  → 180°
    const WALL_NORMAL = {
      SL:  -90,
      SR:   90,
      LW:  -90,
      RW:   90,
      SBL:  180,
      SBR:  180,
    };

    // Resolve wall-normal for numbered surrounds (SL2, SR2, SL3... inherit from SL/SR)
    const getWallNormal = (r) => {
      if (r in WALL_NORMAL) return WALL_NORMAL[r];
      if (/^SL\d+$/.test(r)) return -90; // side-left numbered → same as SL
      if (/^SR\d+$/.test(r)) return  90; // side-right numbered → same as SR
      return 0;
    };

    // Default reference: physical wall-normal, but LW/RW use shared visualiser aim logic
    // and SBL/SBR respect the rear-surround aim toggle.
    let referenceDeg;
    if (role === 'LW' || role === 'RW') {
      const resolvedYaw = resolveSpeakerYaw({
        speaker,
        mlpPos,
        appState,
        getCanonicalRole,
      });
      referenceDeg = isNum(resolvedYaw) ? resolvedYaw : getWallNormal(role);
    } else if ((role === 'SBL' || role === 'SBR') && appState?.aimRearSurroundsAtMLP) {
      // Toggle ON: aim at MLP/RSP
      const mlpYaw = isNum(mlpPos?.x) && isNum(mlpPos?.y) ? angleFromTo(pos, mlpPos) : null;
      referenceDeg = isNum(mlpYaw) ? mlpYaw : 180;
    } else {
      referenceDeg = getWallNormal(role);
    }

    // Manual rotation override — only when user explicitly aimed the speaker
    // (rotation?.y excluded — it's an unreliable default object field)
    if (speaker.positionSource === 'user') {
      const manualYaw =
        (isNum(speaker.yaw)          ? speaker.yaw          : null) ??
        (isNum(speaker.rotationDeg)  ? speaker.rotationDeg  : null) ??
        (isNum(speaker.rotation_deg) ? speaker.rotation_deg : null);
      if (manualYaw != null) {
        referenceDeg = manualYaw;
      }
    }

    // Off-axis magnitude (0..180)
    const offAxisRaw = shortestAngleDeg(seatAzDeg, referenceDeg);
    if (!isNum(offAxisRaw)) return null;

    // Floor DOWN to integer degrees for display + stability
    const offAxis = Math.max(0, Math.floor(offAxisRaw + 1e-9));
    const effectiveAngleDeg = offAxis;

    // Get model metadata for dispersion
    const meta = modelMeta || (speaker.model ? getSpeakerModelMeta(speaker.model) : null);

    // Use centralized mapping with model-specific dispersion
    const lossFromAngle = mapAngleToHfLossDb(effectiveAngleDeg, meta);

    let lossDb;
    let isBeyondNonLcrLimit = false;

    // Determine limit based on model-specific dispersion or fallback to 41°
    const nonLcrLimit = halfDispersionDeg(
      meta?.dispersion?.horizontal?.minus3dB ?? 
      meta?.dispersion?.horizontal?.minus3
    ) ?? 41;

    if (Math.abs(effectiveAngleDeg) > nonLcrLimit) {
      // Beyond the model's −3 dB window
      isBeyondNonLcrLimit = true;
      // For RP22 we still want P17 to land at Level 2, so use 3 dB as the nominal value
      lossDb = 3.0;
    } else {
      // Within the model's coverage: use the normal dispersion-based values
      lossDb = lossFromAngle != null ? lossFromAngle : 5.0;
    }

    if (globalThis.__B44_RV_DEBUG === true) {
      console.log("[P17 SURROUND]", role, {
        seatAzDeg,
        referenceDeg,
        offAxis,
        lossDb,
      });
    }

    // [DIAGNOSTIC] For bed-layer surrounds: expose calculation inputs for HUD debug readout
    const isBedDebugRole = isBedLayerSurround(role);
    const diagnosticDebug = isBedDebugRole ? {
      seatAzDeg,
      aimDegRaw: referenceDeg,   // kept as aimDegRaw for HUD compat (now = wall-normal or manual)
      offAxisDegComputed: offAxis,
      referenceDeg,
      canonRoleUsed: role,
    } : undefined;

    return {
      role,
      angleDeg: offAxis, // CRITICAL: must be quantised value for HUD display
      offAxisDeg: offAxis,
      lossDb: Number(lossDb.toFixed(1)),
      isBeyondNonLcrLimit,
      debug: diagnosticDebug,
    };
  }
}

// RP22 classification for the MEASURED P17 engine only (Stage 1 scaffolding — not yet wired
// into any speaker, since no registry model currently declares polarModel.type === "measured").
// The measured engine (measuredP17Engine.jsx) intentionally does NOT assign RP22 levels itself —
// this is the single place that maps a measured maximum seat-to-RSP spread to an RP22 level.
export function classifyMeasuredP17Level(maxDeviationDb) {
  if (!isNum(maxDeviationDb)) return null;
  if (maxDeviationDb <= 3) return 4;
  if (maxDeviationDb <= 6) return 3;
  return 2;
}

// P17: Compute surround/wide/overhead HF variance across all non-LCR speakers for all seats
export function computeP17ForAllSeats({ seats, speakers, mlpPos, getSpeakerModelMeta: modelIndex, roomHeightM, debug, appState, getCanonicalRole, allowedP17Roles }) {
  if (!Array.isArray(seats) || !seats.length) return {};
  if (!Array.isArray(speakers) || !speakers.length) return {};

  // ONLY speakers that actually exist in the drawing (source of truth)
  const isFinitePos = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const EXCLUDE_LCR = new Set(["FL","FC","FR","FCL","FCR"]);

  const p17Speakers = (speakers || [])
    .filter(s => s && s.role && s.model && isFinitePos(s.position))
    .filter(s => !EXCLUDE_LCR.has(String(s.role).toUpperCase()))
    .filter(s => !allowedP17Roles || allowedP17Roles.has(canonRole(s.role, getCanonicalRole)));

  // RSP point — use mlpPos if valid, otherwise no normalization is possible
  const rspPoint = (mlpPos && isNum(mlpPos.x) && isNum(mlpPos.y)) ? mlpPos : null;
  // RSP ear height: use standard 1.2 m (mlpPos.z if provided)
  const rspEarHeightM = (rspPoint && isNum(rspPoint.z)) ? rspPoint.z : 1.2;

  // Pre-compute loss at RSP for every eligible speaker (once, outside seat loop)
  const lossAtRspBySpeakerRole = new Map();
  if (rspPoint) {
    const rspSeatArg = { x: rspPoint.x, y: rspPoint.y, z: rspEarHeightM };
    for (const spk of p17Speakers) {
      const result = computeSurroundLikeHfLoss({
        speaker: spk,
        seat: rspSeatArg,
        mlpPos,
        earHeightM: rspEarHeightM,
        modelMeta: spk.model ? modelIndex(spk.model) : null,
        roomHeightM,
        appState,
        getCanonicalRole,
      });
      if (result) {
        lossAtRspBySpeakerRole.set(spk, result);
      }
    }
  }

  const perSeat = {};

  for (const seat of seats) {
    const seatId = seat.id || `seat-${seat.x}-${seat.y}`;
    if (!isNum(seat.x) || !isNum(seat.y)) continue;

    const seatPos = seat.position || {};
    const earHeightM =
      Number(seat.earHeightM) && Number.isFinite(seat.earHeightM)
        ? seat.earHeightM
        : (Number(seatPos.z) && Number.isFinite(seatPos.z) ? seatPos.z : 1.2);

    let maxDelta = -Infinity;
    let worstRole = null;
    let worstAngleDeg = -Infinity;
    let worstLossDb = null;
    const perSpeaker = [];
    let p17HasNaAngles = false;

    // Loop over ONLY speakers in the drawing (p17Speakers filtered above)
    for (const spk of p17Speakers) {
      const resultAtSeat = computeSurroundLikeHfLoss({
        speaker: spk,
        seat: { x: seatPos.x || seat.x, y: seatPos.y || seat.y, z: seatPos.z || seat.z },
        mlpPos,
        earHeightM,
        modelMeta: spk.model ? modelIndex(spk.model) : null,
        roomHeightM,
        appState,
        getCanonicalRole,
      });

      if (!resultAtSeat) continue;

      // Get pre-computed RSP loss for this speaker
      const resultAtRsp = lossAtRspBySpeakerRole.get(spk);

      const seatLoss = Number(resultAtSeat.lossDb) || 0;
      const rspLoss = Number(resultAtRsp ? resultAtRsp.lossDb : resultAtSeat.lossDb) || 0;
      const normalizedDelta = Math.abs(seatLoss - rspLoss);
      const delta = normalizedDelta + (seatLoss * 0.5);

      // isBeyondNonLcrLimit: flag from the seat result (used for N/A display)
      const isBeyondNonLcrLimit = resultAtSeat.isBeyondNonLcrLimit || false;
      if (isBeyondNonLcrLimit) {
        p17HasNaAngles = true;
      }

      // Collect per-speaker data — lossDb is now the weighted delta
      perSpeaker.push({
        role: resultAtSeat.role,
        angleDeg: resultAtSeat.offAxisDeg,
        rawAngleDeg: resultAtSeat.rawAngleDeg ?? resultAtSeat.offAxisDeg,
        lossDb: Number(delta.toFixed(1)),
        isBeyondNonLcrLimit,
        debug: resultAtSeat.debug,
        lossAtSeat: Number(seatLoss.toFixed(1)),
        lossAtRsp: Number(rspLoss.toFixed(1)),
        normalizedDelta: Number(normalizedDelta.toFixed(1)),
        weightedDelta: Number(delta.toFixed(1)),
      });

      // Track worst delta: highest delta; if tie, largest angle
      if (
        delta > maxDelta ||
        (delta === maxDelta && resultAtSeat.offAxisDeg > worstAngleDeg)
      ) {
        maxDelta = delta;
        worstRole = resultAtSeat.role;
        worstAngleDeg = resultAtSeat.offAxisDeg;
        worstLossDb = delta;
      }

      // Store in debug if provided
      if (debug && debug.perSpeaker) {
        if (!debug.perSpeaker[resultAtSeat.role]) {
          debug.perSpeaker[resultAtSeat.role] = {};
        }
        debug.perSpeaker[resultAtSeat.role].p17 = {
          offAxisDeg: resultAtSeat.offAxisDeg,
          lossDb: delta,
          isBeyondNonLcrLimit,
        };
      }
    }

    // Guard: if no valid speakers processed, return null for this seat
    if (maxDelta === -Infinity) {
      perSeat[seatId] = null;
      continue;
    }

    perSeat[seatId] = {
      p17Db: Number(Math.max(0, maxDelta).toFixed(1)),  // clamp to 0 (RSP yields 0.0 dB)
      worstRole,
      worstAngleDeg: isNum(worstAngleDeg) ? Number(worstAngleDeg.toFixed(1)) : null,
      worstLossDb: isNum(worstLossDb) ? Number(worstLossDb.toFixed(1)) : null,
      perSpeaker,
      p17HasNaAngles,
    };
  }

  return perSeat;
}