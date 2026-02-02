"use client";

import React, { useMemo, useState, Suspense, useEffect, useCallback, useRef } from 'react';

// ---- B44: local surround hydrator (keeps RV simple + avoids missing import) ----
// Creates/updates x,y,z for bed surround roles when a real model is selected.
// If model is OFF/NONE, we intentionally do NOT create positions (blank slate).
function resetSurroundPositions(layout, mlpPoint, dimensions, speakers, modelKey) {
  const W = Number(dimensions?.width ?? dimensions?.widthM) || 0;
  const L = Number(dimensions?.length ?? dimensions?.lengthM) || 0;

  safeLog("[resetSurroundPositions] INPUT", {
    modelKey,
    W, L,
    dimsKeys: dimensions ? Object.keys(dimensions) : null,
    dimensions,
  });

  // If room is not valid, return unchanged
  if (!(W > 0 && L > 0)) {
    safeLog("[resetSurroundPositions] ABORT (invalid W/L)", { W, L, dimensions });
    return Array.isArray(speakers) ? speakers : [];
  }

  const m = String(modelKey || "").trim().toLowerCase();
  const modelOn = !!m && m !== "off" && m !== "none";

  // If model is off/none, keep speakers as stubs (no positions)
  if (!modelOn) return Array.isArray(speakers) ? speakers : [];

  const earZ = 1.1;
  const INSET = 0.02; // 2cm inset to keep inside bounds

  const mlpY = Number.isFinite(mlpPoint?.y) ? mlpPoint.y : L * 0.58;

  // Reasonable defaults (simple + stable)
  const ySide = Math.max(INSET, Math.min(L - INSET, mlpY));
  const yWide = Math.max(INSET, Math.min(L - INSET, L * 0.40));
  const yRear = Math.max(INSET, Math.min(L - INSET, L - INSET));

  const xSL = INSET;
  const xSR = W - INSET;

  // Explicit symmetry: use same distance-from-left for LW, mirror for RW
  const xWideFromLeft = Math.max(INSET, Math.min(W - INSET, W * 0.15));
  const xLW = xWideFromLeft;
  const xRW = W - xWideFromLeft;

  // Explicit symmetry: use same distance-from-left for SBL, mirror for SBR
  const xRearFromLeft = Math.max(INSET, Math.min(W - INSET, W * 0.25));
  const xSBL = xRearFromLeft;
  const xSBR = W - xRearFromLeft;

  const next = (Array.isArray(speakers) ? speakers : []).map((spk) => {
    const role = String(spk?.role || "").toUpperCase();

    // Only touch bed surround roles
    if (!["SL", "SR", "LW", "RW", "SBL", "SBR"].includes(role)) return spk;

    // Only hydrate if model is actually set on this speaker
    const sm = String(spk?.model || "").trim().toLowerCase();
    if (!sm || sm === "off" || sm === "none") return spk;

    let x = spk?.position?.x;
    let y = spk?.position?.y;

    // If missing/invalid, assign defaults
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (role === "SL") { x = xSL; y = ySide; }
      if (role === "SR") { x = xSR; y = ySide; }
      if (role === "LW") { x = xLW; y = yWide; }
      if (role === "RW") { x = xRW; y = yWide; }
      if (role === "SBL") { x = xSBL; y = yRear; }
      if (role === "SBR") { x = xSBR; y = yRear; }
    }

    // Clamp just in case
    x = Math.max(INSET, Math.min(W - INSET, Number(x)));
    y = Math.max(INSET, Math.min(L - INSET, Number(y)));

    return {
      ...spk,
      position: { ...(spk.position || {}), x, y, z: earZ },
    };
  });

  return next;
}
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Volume2, ListChecks, SlidersHorizontal, Waves, Speaker, RotateCcw } from 'lucide-react';
import { useAppState } from '@/components/AppStateProvider';
import { audioConfigurations } from '../data/audioConfigurations';
import { optimiseSurroundAngles } from '../utils/aimingUtils';
import SevenLayoutSwitcher from './SevenLayoutSwitcher';
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel';
import { ceilDb, splAtDistanceFrom1m, safeNum } from '@/components/utils/splMath';
import { artcousticSpeakers } from '@/components/data/speakerData';
import { computeMLPAndPrimary } from '@/components/utils/computeMLPAndPrimary';
import { safeGroup, safeTable, safeGroupEnd } from "@/components/utils/safeLog";
import { getSpeakerModelMeta, getModelsByCategoryOrdered, normaliseModelKey, displayModelKey } from "@/components/models/speakers/registry";
import { safeComputeLcrSpl } from '@/components/utils/splMathSafe';
import { getLevelColors } from '@/components/utils/rp22Colors';
import SurroundsSelector from '../speakers/SurroundsSelector';
import OverheadChannelSelector from '@/components/speakers/OverheadChannelSelector';
import { calibratedSplAtSeat, euclideanDistance } from "@/components/utils/splMath";
import { timeNowMs } from "@/components/utils/timeNow";
import EqHeadroomSelector from '@/components/spl/EqHeadroomSelector';
import LcrSplCard from '@/components/speakers/LcrSplCard';
import { getCanonicalRole, rolesForLayout } from "@/components/utils/surroundRoleMap";
import { computeAllSeatSplMetrics, getMlpSeat } from "@/components/utils/spl/centralSplEngine";
import SurroundSplStrip from '@/components/speakers/SurroundSplStrip';
import OverheadSplStrip from '@/components/speakers/OverheadSplStrip';

const __b44SigFor = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

function __b44SameSpeakers(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const A = a[i] || {};
    const B = b[i] || {};

    // Use stable identity fields first
    if ((A.id ?? null) !== (B.id ?? null)) return false;
    if ((A.role ?? null) !== (B.role ?? null)) return false;
    if ((A.model ?? null) !== (B.model ?? null)) return false;

    // Position compare (guarded)
    const Ap = A.position || {};
    const Bp = B.position || {};
    if (!Number.isFinite(Ap.x) || !Number.isFinite(Ap.y) || !Number.isFinite(Bp.x) || !Number.isFinite(Bp.y)) {
      if (A.position || B.position) return false;
    } else {
      if (Math.abs(Ap.x - Bp.x) > 1e-4) return false;
      if (Math.abs(Ap.y - Bp.y) > 1e-4) return false;
      if (Number.isFinite(Ap.z) || Number.isFinite(Bp.z)) {
        if (Math.abs((Ap.z ?? 0) - (Bp.z ?? 0)) > 1e-4) return false;
      }
    }
  }

  return true;
}

const P12_THRESHOLDS_REC = { L1: 102, L2: 105, L3: 108, L4: 111 };
const P12_THRESHOLDS_MIN = { L1: 99, L2: 102, L3: 105, L4: 108 };
const P13_THRESHOLDS_REC = { L1: 99, L2: 102, L3: 105, L4: 108 };
const P13_THRESHOLDS_MIN = { L1: 96, L2: 99, L3: 102, L4: 105 };

// Helper: compute RP22 level from SPL thresholds
function computeRP22Level(splDb, thresholds) {
  if (!Number.isFinite(splDb)) return null;
  if (splDb >= thresholds.L4) return 4;
  if (splDb >= thresholds.L3) return 3;
  if (splDb >= thresholds.L2) return 2;
  if (splDb >= thresholds.L1) return 1;
  return 'FAIL';
}

// RP22 Level Pill Component
function RP22LevelPill({ parameter, level, label }) {
  const colors = getLevelColors(level);
  
  return (
    <div 
      style={{
        marginTop: 12,
        padding: '8px 16px',
        borderRadius: 8,
        border: `1px solid ${colors.border || '#E6E4DD'}`,
        background: colors.bg,
        display: 'inline-block',
        width: '100%',
      }}
    >
      <div style={{ 
        fontSize: 13, 
        fontWeight: 600, 
        color: colors.text
      }}>
        {label}: {typeof level === 'number' && level >= 1 ? `Level ${level}` : 'FAIL'}
      </div>
    </div>
  );
}

// --- idempotence helpers -----------------------------------------------------
const EPS = 1e-4;
const almostEq = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) <= EPS;

function speakersEqual(a = [], b = []) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const byRole = (arr) => {
    const m = new Map();
    arr.forEach(s => m.set(String(s.role).toUpperCase(), s));
    return m;
  };
  const A = byRole(a), B = byRole(b);

  if (A.size !== B.size) return false;

  for (const [role, sa] of A) {
    const sb = B.get(role);
    if (!sb) return false;
    if ((sa.model || 'off') !== (sb.model || 'off')) return false;
    if ((sa.id || '') !== (sb.id || '')) return false;
    if (sa.draggable !== sb.draggable) return false;

    const pa = sa.position || {}, pb = sb.position || {};
    if (!almostEq(pa.x, pb.x) || !almostEq(pa.y, pb.y) || !almostEq(pa.z, pb.z)) return false;

    const ra = sa.rotation || {}, rb = sb.rotation || {};
    if (!almostEq(ra.x, rb.x) || !almostEq(ra.y, rb.y) || !almostEq(ra.z, rb.z)) return false;
  }
  return true;
}


// ---- robust ray -> wall projector (no MLP fallbacks) -----------------------
function projectToWallFromMLP_xy(mlp, angleDeg, room) {
  const a = (angleDeg % 360 + 360) % 360;
  const rad = (a * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const EPS_LOCAL = 1e-6;
  const ts = [];

  if (Math.abs(dx) > EPS_LOCAL) {
    const tL = (room.left  - mlp.x) / dx;
    const tR = (room.right - mlp.x) / dx;
    if (tL > EPS_LOCAL) ts.push({ t: tL, wall: 'L' });
    if (tR > EPS_LOCAL) ts.push({ t: tR, wall: 'R' });
  }
  if (Math.abs(dy) > EPS_LOCAL) {
    const tF = (room.front - mlp.y) / dy;
    const tB = (room.back  - mlp.y) / dy;
    if (tF > EPS_LOCAL) ts.push({ t: tF, wall: 'F' });
    if (tB > EPS_LOCAL) ts.push({ t: tB, wall: 'B' });
  }

  if (!ts.length) {
    return { x: mlp.x, y: room.back, wall: 'B' };
  }

  ts.sort((a, b) => a.t - b.t);
  const hit = ts[0];
  const x = mlp.x + hit.t * dx;
  const y = mlp.y + hit.t * dy;
  return { x, y, wall: hit.wall };
}

// --- NEW: Force rear surrounds to always project to the BACK wall ---------
function projectToBackWallFromMLP_xy(mlp, angleDeg, room, speakerModel, getModelDimsM, WALL_BUFFER_M) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  // Robust dims: getModelDimsM may return {} or partial values when a model isn't found
  const rawDims = (() => {
    try { return getModelDimsM?.(speakerModel); }
    catch (e) { return null; }
  })();

  const widthM = Number.isFinite(rawDims?.widthM) ? rawDims.widthM : 0.20;
  const depthM = Number.isFinite(rawDims?.depthM) ? rawDims.depthM : 0.082;

  const halfShortEdge = Math.min(widthM, depthM) / 2;

  if (globalThis.__B44_LOGS) {
    console.log('[SP] backWall projector dims', { speakerModel, rawDims, widthM, depthM, halfShortEdge });
  }

  const backWallY = room.back - (WALL_BUFFER_M + halfShortEdge);

  const EPS = 1e-6;
  
  // Check if ray actually intersects back wall (dy must be positive)
  if (dy < EPS) { // Check if dy is negative or near zero. If so, ray is not pointing towards back.
    // Ray is horizontal or pointing away from back wall - use generic projector as fallback
    return projectToWallFromMLP_xy(mlp, angleDeg, room);
  }

  // Calculate t for back wall intersection
  const t = (backWallY - mlp.y) / dy;

  // If t is negative or zero, ray points away from back wall - use fallback
  if (t <= EPS) {
    return projectToWallFromMLP_xy(mlp, angleDeg, room);
  }

  // Calculate X at back wall intersection
  let x = mlp.x + t * dx;

  // Clamp X to stay within room and away from side walls
  const minX = WALL_BUFFER_M + halfShortEdge;
  const maxX = room.right - (WALL_BUFFER_M + halfShortEdge);
  x = Math.max(minX, Math.min(maxX, x));

  return { x, y: backWallY, wall: 'B' };
}

// --- Canonical role mapping + helpers ---
const CANONICAL_ROLE_MAP = {
  // LCR
  FL: "FL", L: "FL",
  FC: "FC", C: "FC",
  FR: "FR", R: "FR",
  
  // Side surrounds
  SL: "SL", LS: "SL",
  SR: "SR", RS: "SR",
  
  // Rear surrounds
  SBL: "SBL", RL: "SBL", RSL: "SBL", LR: "SBL", LRS: "SBL", BL: "SBL",
  SBR: "SBR", RR: "SBR", RSR: "SBR", RRS: "SBR", BR: "SBR", RB: "SBR",
  
  // Wides
  LW: "LW", FWL: "LW",
  RW: "RW", FWR: "RW",
  
  // Height / Atmos - Front
  TFL: "TFL", TF: "TFL",
  TFR: "TFR",
  
  // Height / Atmos - Middle/Side
  TL: "TL", TML: "TL", TSL: "TL",
  TR: "TR", TMR: "TR", TSR: "TR",
  
  // Height / Atmos - Rear
  TBL: "TBL", TRL: "TBL",
  TBR: "TBR", TRR: "TBR",
  
  // Up-firing (if used)
  UFL: "UFL",
  UFR: "UFR",
  UBL: "UBL",
  UBR: "UBR",
};

// getCanonicalRole is imported from "@/components/utils/surroundRoleMap";
// function getCanonicalRole(role) {
//   return CANONICAL_ROLE_MAP[String(role || "").toUpperCase()] || String(role || "").toUpperCase();
// }

const CANONICAL_TO_ALIASES_MAP = new Map();
for (const alias in CANONICAL_ROLE_MAP) {
    const canonical = CANONICAL_ROLE_MAP[alias];
    if (!CANONICAL_TO_ALIASES_MAP.has(canonical)) {
        CANONICAL_TO_ALIASES_MAP.set(canonical, new Set());
    }
    CANONICAL_TO_ALIASES_MAP.get(canonical).add(alias);
}

function allAliases(role) {
    const canonical = getCanonicalRole(role);
    return Array.from(CANONICAL_TO_ALIASES_MAP.get(canonical) || new Set([String(role || "").toUpperCase()]));
}

function getByAnyRole(aliases, byRoleMap) {
    for (const alias of aliases) {
        const speaker = byRoleMap.get(alias);
        if (speaker) return speaker;
    }
    return null;
}

function applyModelToAnyRoles(list, preferredRoles, model) {
  const targets = new Set(preferredRoles.map(getCanonicalRole));
  return (Array.isArray(list) ? list : []).map(s => {
    const canon = getCanonicalRole(s.role);
    return targets.has(canon) ? { ...s, model } : s;
  });
}

function applyToAllSurrounds(prev, model) {
  const BED_SURROUND = new Set(["SL","SR","SBL","SBR","LW","RW"]);
  return (Array.isArray(prev)? prev: []).map(s => {
    const canon = getCanonicalRole(s.role);
    return BED_SURROUND.has(canon) ? { ...s, model } : s;
  });
}

function logPlacedSpeakers(message, speakers) {
  const rows = (speakers || []).map(s => ({
    roleRaw: s.role,
    roleCanon: getCanonicalRole(s.role),
    model: s.model || "(none)"
  }));
  safeGroup(message);
  safeTable(rows);
  safeGroupEnd();
}

function buildRoleMap(list) {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((s) => {
    const raw = String(s.role || "").toUpperCase();
    const canon = getCanonicalRole(raw);
    m.set(raw, s);
    m.set(canon, s);
  });
  return m;
}

const degToRad = (deg) => (deg * Math.PI) / 180;

const isValidModel = (m) => {
  const s = String(m ?? "").trim().toLowerCase();
  return !!s && s !== "off" && s !== "none";
};

// Preserve surround bed models across any position/rotation-only updates
const preserveSurroundModels = (prevList, nextList, appState) => {
  const prev = Array.isArray(prevList) ? prevList : [];
  const next = Array.isArray(nextList) ? nextList : [];

  const surroundCanon = new Set(["SL", "SR", "SBL", "SBR", "LW", "RW"]);

  const prevByCanon = new Map();
  prev.forEach((s) => {
    prevByCanon.set(getCanonicalRole(s?.role), s);
  });

  return next.map((s) => {
    const canon = getCanonicalRole(s?.role);
    if (!surroundCanon.has(canon)) return s;

    // keep next if already valid
    if (isValidModel(s?.model)) return s;

    // inherit previous same-role model if valid
    const pm = prevByCanon.get(canon)?.model;
    if (isValidModel(pm)) return { ...s, model: pm };

    // inherit global surround model if valid
    const gm = appState?.globalSurroundModel;
    if (isValidModel(gm)) return { ...s, model: gm };

    return s;
  });
};

function projectToWallFromMLP(mlpX, mlpY, angleDeg, room) {
  const angle = degToRad(angleDeg);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const margin = 0.01;

  let t = Infinity;
  if (dx < 0) t = Math.min(t, (room.left + margin - mlpX) / dx);
  if (dx > 0) t = Math.min(t, (room.right - margin - mlpX) / dx);
  if (dy < 0) t = Math.min(t, (room.front + margin - mlpY) / dy);
  if (dy > 0) t = Math.min(t, (room.back - margin - mlpY) / dy);

  if (!isFinite(t) || t <= 0) {
    return { x: mlpX, y: mlpY };
  }

  return { x: mlpX + dx * t, y: mlpY + dy * t };
}

function ensureSpeaker(spk, role) {
  return spk && spk.role === role ? spk : { id: `${role}-${Date.now()}`, role };
}

function yawDegToMLP(spkPos, mlpPos) {
  const dx = mlpPos.x - spkPos.x;
  const dy = mlpPos.y - spkPos.y;
  const yawRad = Math.atan2(dx, dy);
  return yawRad * 180 / Math.PI;
}

const SURROUND_BED_ROLES = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
const ALL_SURROUND_ROLES = new Set(["SL","SR","SBL","SBR","LW","RW"]);
const LCR_ROLES = new Set(["FL", "FC", "FR"]);
const ROLE_TO_KEY = new Map([["FL", "L"], ["FC", "C"], ["FR", "R"]]);
const REAR_CANON = new Set(["SBL", "SBR"]);
const REAR_ALIASES = new Set(["SBL","SBR","RL","RR","RSL","RSR","LR","LRS","RRS","LB","RB"]);

const isRearByAnyRole = (role) => {
  const r = String(role||"").toUpperCase();
  return REAR_ALIASES.has(r) || REAR_CANON.has(getCanonicalRole(r));
};

function applyLcrAim(placedSpeakers, mlpPoint, mode) {
  const speakers = Array.isArray(placedSpeakers) ? [...placedSpeakers] : [];
  if (!mlpPoint) return speakers;

  if (mode !== "angled") {
    return speakers.map(s =>
      LCR_ROLES.has(getCanonicalRole(s.role)) ? { ...s, rotation: { x:0, y:0, z:0 } } : s
    );
  }
  return speakers.map(s => {
    if (!LCR_ROLES.has(getCanonicalRole(s.role))) return s;
    if (!s.position) return s;
    const angle = yawDegToMLP(s.position, mlpPoint);
    return { ...s, rotation: { ...(s.rotation||{}), y: angle } };
  });
}

function rp22P12Level(db) {
  if (!db || db <= 102) return 1;
  if (db <= 105) return 2;
  if (db <= 108) return 3;
  return 4;
}

function rp22P13Level(db) {
  if (!db || db <= 99) return 1;
  if (db <= 102) return 2;
  if (db <= 105) return 3;
  if (db <= 108) return 4;
  return 4;
}

function normalizeName(s) {
  return String(s || "").trim();
}

function prettyChannel(ch) {
  const m = {
    FL: "Front Left", FR: "Front Right", FC: "Front Center",
    SL: "Side Left", SR: "Side Right",
    SBL: "Rear Left", SBR: "Rear Right",
    LW: "Front Wide Left", RW: "Front Wide Right",
    TFL: "Top Front Left", TFR: "Top Front Right",
    TL: "Top Middle Left", TR: "Top Middle Right",
    TBL: "Top Back Left", TBR: "Top Back Right",
  };
  return m[String(ch).toUpperCase()] || ch;
}

// Pure helper: compute FW median positions without side effects
function applyFrontWideMedianPositions(list, dimensions, applyCornerClearance, applyRoomBoundsClamp, getCanonicalRole) {
  const speakers = Array.isArray(list) ? list : [];
  if (!speakers.length) return { list: speakers, changed: false };

  const byCanon = new Map();
  speakers.forEach((s) => {
    byCanon.set(getCanonicalRole(s.role), s);
  });

  const FL = byCanon.get("FL");
  const FR = byCanon.get("FR");
  const SL = byCanon.get("SL");
  const SR = byCanon.get("SR");

  // We need all anchors with valid positions
  const anchorsOk =
    Number.isFinite(FL?.position?.x) && Number.isFinite(FL?.position?.y) &&
    Number.isFinite(FR?.position?.x) && Number.isFinite(FR?.position?.y) &&
    Number.isFinite(SL?.position?.x) && Number.isFinite(SL?.position?.y) &&
    Number.isFinite(SR?.position?.x) && Number.isFinite(SR?.position?.y);

  if (!anchorsOk) return { list: speakers, changed: false };

  let changed = false;

  // Helper: get hugging center lines (defined in parent scope, we receive via closure or re-implement)
  const getHugging = (model, dims) => {
    const WALL_BUFFER_M = 0.01;
    const meta = typeof window !== 'undefined' && window.__GET_SPEAKER_META 
      ? window.__GET_SPEAKER_META(model) 
      : null;
    
    const widthM = meta?.widthM || 0.27;
    const depthM = meta?.depthM || 0.082;
    const shortEdge = Math.min(widthM, depthM);
    
    return {
      leftWallX: shortEdge / 2 + WALL_BUFFER_M,
      rightWallX: dims.width - shortEdge / 2 - WALL_BUFFER_M,
    };
  };

  const updated = speakers.map((s) => {
    const canon = getCanonicalRole(s.role);
    if (canon !== "LW" && canon !== "RW") return s;

    const front = canon === "LW" ? FL : FR;
    const side  = canon === "LW" ? SL : SR;

    const fx = front.position.x;
    const fy = front.position.y;
    const sx = side.position.x;
    const sy = side.position.y;

    // 1) Median Y (front-back): halfway between front and side surround
    const medianY = (fy + sy) / 2;
    const medianX = (fx + sx) / 2;

    // 2) Pin X to the side wall using hugging logic
    const hugging = getHugging(s.model, dimensions);
    const sideWallX = canon === "LW" ? hugging.leftWallX : hugging.rightWallX;

    let pos = {
      x: Number.isFinite(sideWallX) ? sideWallX : medianX,
      y: medianY,
      z: Number.isFinite(s.position?.z) ? s.position.z : 1.1,
    };

    // 3) Respect corner clearance and room bounds
    pos = applyCornerClearance(pos, canon, s.model, dimensions, {});
    pos = applyRoomBoundsClamp(pos, s.model, dimensions);

    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      return s;
    }

    const old = s.position || {};
    const dx = Math.abs((old.x ?? 0) - pos.x);
    const dy = Math.abs((old.y ?? 0) - pos.y);

    // Avoid tiny float churn
    if (dx < 0.001 && dy < 0.001) {
      return s;
    }

    changed = true;
    return { ...s, position: pos };
  });

  return { list: updated, changed };
}

function safeLog(label, data) {
  if (typeof console !== 'undefined' && typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(label);
    if (typeof console.table === 'function' && data) console.table(data);
    if (typeof console.groupEnd === 'function') console.groupEnd();
  } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
    if (globalThis.__B44_LOGS) console.log(label, data || '');
  }
}

function bestMaxSPL1m({ sensitivity_dB_1W1m, max_power_W, excursionMax1m }) {
  const sens = safeNum(sensitivity_dB_1W1m);
  const maxW = safeNum(max_power_W);
  const xMax = safeNum(excursionMax1m);

  let powerCalc = 0;
  if (sens > 0 && maxW > 0) {
    powerCalc = sens + 10 * Math.log10(maxW);
  }

  if (xMax > 0 && (xMax < powerCalc || powerCalc === 0)) {
    return xMax;
  }
  return powerCalc;
}

function useStickyDb(rawValue, opts = {}) {
  const windowSize = opts.windowSize ?? 9;
  const alpha = opts.alpha ?? 0.35;
  const upMargin = opts.upMargin ?? 0.40;
  const downMargin = opts.downMargin ?? 0.60;
  const upConsecutive = opts.upConsecutive ?? 2;
  const downConsecutive = opts.downConsecutive ?? 3;

  const bufRef = useRef([]);
  const smoothRef = useRef(0);
  const shownRef = useRef(0);
  const upCountRef = useRef(0);
  const downCountRef = useRef(0);
  const [currentMedian, setCurrentMedian] = useState(0);

  useEffect(() => {
    const b = bufRef.current;
    if (Number.isFinite(rawValue)) {
      b.push(rawValue);
    }
    if (b.length > windowSize) {
      b.shift();
    }

    const sortedBuffer = b.slice().sort((a, b) => a - b);
    const n = sortedBuffer.length;
    let newMedian = 0;
    if (n > 0) {
      const mid = Math.floor(n / 2);
      newMedian = n % 2 ? sortedBuffer[mid] : (sortedBuffer[mid - 1] + sortedBuffer[mid]) / 2;
    }
    setCurrentMedian(newMedian);
  }, [rawValue, windowSize]);

  const smoothed = useMemo(() => {
    if (!Number.isFinite(rawValue)) {
        smoothRef.current = 0;
        return 0;
    }
    const prev = smoothRef.current;
    const next = (prev === 0 && currentMedian === 0) ? 0 : (prev === 0 ? currentMedian : (alpha * currentMedian + (1 - alpha) * prev));
    smoothRef.current = next;
    return next;
  }, [currentMedian, alpha, rawValue]);

  const candidate = useMemo(() => Math.ceil(smoothed), [smoothed]);

  useEffect(() => {
    const currentShown = shownRef.current;

    if (!Number.isFinite(rawValue) || smoothed === 0) {
        if (shownRef.current !== 0) shownRef.current = 0;
        upCountRef.current = 0;
        downCountRef.current = 0;
        return;
    }

    if (smoothed >= (currentShown + 1) + upMargin) {
      upCountRef.current += 1;
      if (upCountRef.current >= upConsecutive) {
        shownRef.current = Math.max(currentShown + 1, candidate);
        upCountRef.current = 0;
        downCountRef.current = 0;
      }
    } else {
      upCountRef.current = 0;
    }

    if (smoothed <= (currentShown - 1) - downMargin) {
      downCountRef.current += 1;
      if (downCountRef.current >= downConsecutive) {
        shownRef.current = Math.min(currentShown - 1, candidate);
        downCountRef.current = 0;
        upCountRef.current = 0;
      }
    } else {
      downCountRef.current = 0;
    }

  }, [smoothed, candidate, upMargin, downMargin, upConsecutive, downConsecutive, rawValue]);

  return shownRef.current;
}

const splCardStyles = {
  card: { border: "1px solid #E6E4DD", borderRadius: 12, padding: 16, background: "#fff" },
  title: { fontSize: 16, lineHeight: "22px", color: "#3E4349", marginBottom: 6 },
  value: { fontSize: 40, lineHeight: "40px", fontWeight: 700, color: "#1B1A1A" },
  foot: { fontSize: 12, lineHeight: "16px", color: "#61656B", marginTop: 6 },
  boldFoot: { fontSize: 12, lineHeight: "16px", color: "#1B1A1A", marginTop: 6, fontWeight: 700 },
};

export function SplBox({ channel, rawDb }) {
  const fullDb = useStickyDb(rawDb);
  const displayDb = Math.max(0, fullDb - 6);
  const level = rp22P12Level(displayDb);

  return (
    <div style={splCardStyles.card}>
      <div style={splCardStyles.title}>{prettyChannel(channel)}</div>
      <div style={splCardStyles.value}>{displayDb > 0 ? `${displayDb} dB` : '—'}</div>
      <div style={splCardStyles.foot}>Maximum SPL @ MLP: {fullDb > 0 ? `${fullDb} dB` : '—'}</div>
      <div style={splCardStyles.boldFoot}>RP22 P12 Level {level > 0 ? level : "—"}</div>
      <div style={splCardStyles.foot}>
        12. Screen speakers SPL capability at Reference Seating Position (RSP) (<span style={{ fontWeight: 700 }}>post calibration EQ</span>, within assigned bandwidth)
        without clipping — dB SPL (C). Thresholds: L1 102, L2 105, L3 108, L4 111
      </div>
    </div>
  );
}

export function SplBoxP13({ title, rawDbFull }) {
  const fullDb = useStickyDb(rawDbFull);
  const displayDb = Math.max(0, fullDb - 6);
  const level = rp22P13Level(displayDb);
  return (
    <div style={splCardStyles.card}>
      <div style={splCardStyles.title}>{title}</div>
      <div style={splCardStyles.value}>{displayDb > 0 ? `${displayDb} dB` : '—'}</div>
      <div style={splCardStyles.foot}>Maximum SPL @ RSP: {fullDb > 0 ? `${fullDb} dB` : '—'}</div>
      <div style={splCardStyles.boldFoot}>RP22 P13 Level {level > 0 ? level : "—"}</div>
    </div>
  );
}

function getSurroundGroups(dolbyPreset) {
  const major = Number(String(dolbyPreset || "5.1").split(".")[0]) || 5;
  const groups = [
    { key: "wides", label: "Front Wides", roles: ["LW", "RW"], required: false },
    { key: "sides", label: "Side Surrounds", roles: ["SL", "SR"], required: false },
    { key: "rears", label: "Rear Surrounds", roles: ["SBL", "SBR"], required: false },
  ];

  if (major === 5) return groups.map(g => g.key === "sides" ? { ...g, required: true } : { ...g, required: false });
  if (major === 7) {
    const wantWides = false;
    return groups.map(g => {
      if (g.key === "sides") return { ...g, required: true };
      if (g.key === "rears") return { ...g, required: !wantWides };
      if (g.key === "wides") return { ...g, required: wantWides };
      return g;
    });
  }
  if (major >= 9) return groups.map(g => ({ ...g, required: true }));
  return groups;
}

function getOverheadGroups(dolbyPreset) {
  const parts = String(dolbyPreset || "").split(".");
  const overheadCount = Number(parts[2] || 0);

  const base = [
    { key: "oh-front",  label: "Front Overhead",  roles: ["TFL", "TFR"], required: false },
    { key: "oh-middle", label: "Middle Overhead", roles: ["TL", "TR"],   required: false },
    { key: "oh-rear",   label: "Rear Overhead",   roles: ["TBL", "TBR"], required: false },
  ];

  if (overheadCount >= 6) return base.map(g => ({ ...g, required: true }));
  if (overheadCount === 4) return base.map(g => g.key === "oh-front" || g.key === "oh-rear" ? { ...g, required: true } : { ...g, required: false });
  if (overheadCount === 2) return base.map(g => g.key === "oh-middle" ? { ...g, required: true } : { ...g, required: false });
  return base;
}

const groupHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0" };
const noteStyle = { fontSize: 12, color: "#8a8e93", marginLeft: 8 };
const rowStyle = { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 12 };

export function applyLcrModel(placed, model) {
  if (!Array.isArray(placed)) return Array.isArray(placed) ? placed : [];
  return placed.map((spk) => {
    const role = String(spk?.role || "").toUpperCase();
    if (LCR_ROLES.has(role)) return { ...spk, model };
    return spk;
  });
}

export const applyLCRModel = applyLcrModel;

function UnifiedSurroundsConfig({
  placedSpeakers,
  setSpeakers,
  mlpPoint,
  dolbyPreset,
  sevenBedLayoutType,
  dimensions,
  getHuggingCenterLines,
  applyCornerClearance,
  applyRoomBoundsClamp,
  disabled,
  allowedRoles,
  canSides,
  canRears,
  canWides,
  is7xOrHigher,
  safePos,
  effectivePreset,
  useWides,
  resetSurroundPositions,
  surroundConfig,
  setSurroundConfig,
  needsSurroundResetRef,
  lastSurroundModelKeyRef,
  extraSurroundCount,
  onExtraSurroundCountChange,
  allowExtraSurrounds,
}) {
  // Local dimsSafe for UnifiedSurroundsConfig scope
  const dimsSafe = React.useMemo(() => {
    const src = dimensions || {};
    return {
      width: Number(src.width ?? src.widthM) || 4.5,
      length: Number(src.length ?? src.lengthM) || 6.0,
      height: Number(src.height ?? src.heightM) || 2.4,
    };
  }, [dimensions]);
  
  const app = useAppState();
  const activeRoles = useMemo(() => {
    const roles = [];
    if (allowedRoles.has('SL')) roles.push('SL', 'SR');
    if (allowedRoles.has('SBL')) roles.push('SBL', 'SBR');
    if (allowedRoles.has('LW')) roles.push('LW', 'RW');
    return roles;
  }, [allowedRoles]);

  const handleSurroundModelChange = useCallback((config) => {
    const safeConfig = {
      value: {
        master: String(config?.value?.master || "off"),
        side: String(config?.value?.side || "off"),
        rear: String(config?.value?.rear || "off"),
        wide: String(config?.value?.wide || "off"),
      },
      override: {
        side: !!config?.override?.side,
        rear: !!config?.override?.rear,
        wide: !!config?.override?.wide,
      },
    };

    setSurroundConfig(safeConfig);

    const modelKeyRaw = safeConfig.value.master;
    let modelKey = String(modelKeyRaw || "").trim();
    modelKey = normaliseModelKey(modelKey);
    const modelKeyLower = modelKey.toLowerCase();

    // Keep global model in app state if available (do not crash if missing)
    // Strip _s suffix for UI hygiene (internal registry uses _s, but UI should not)
    const cleanModelKey = modelKey && modelKey.endsWith("_s") ? modelKey.slice(0, -2) : modelKey;
    if (app && typeof app.setGlobalSurroundModel === "function") {
      app.setGlobalSurroundModel(modelKeyLower === "off" ? "off" : cleanModelKey);
    }

    if (globalThis.__B44_LOGS) {
      console.log("[SP handleSurroundModelChange]", {
        modelKey,
        effectivePreset,
        useWides,
      });
    }

    setSpeakers((prev) => {
      const layout = String(effectivePreset || "5.1").split(" ")[0].split("_")[0];

      // Only bed surround roles
      const layoutMajor = parseInt(String(layout || "5.1").split(".")[0], 10) || 5;

      // IMPORTANT:
      // - In 7.x, useWides swaps between rears and wides.
      // - In 9.x+, we must keep BOTH rears and wides, so DO NOT swap rears out.
      const useWidesInsteadOfRearsForThisLayout = (layoutMajor === 7) ? !!useWides : false;

      const layoutRoles = rolesForLayout({
        dolbyLayout: layout,
        useWidesInsteadOfRears: useWidesInsteadOfRearsForThisLayout,
      }).filter((r) => ["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(r));

      const byRole = new Map();
      for (const s of Array.isArray(prev) ? prev : []) {
        byRole.set(getCanonicalRole(s.role), { ...s });
      }

      // Always ensure the required roles exist as entries (stubs are fine)
      for (const role of layoutRoles) {
        if (!byRole.has(role)) {
          byRole.set(role, {
            id: `${role.toLowerCase()}-${timeNowMs()}`,
            role,
            label: role,
            model: null,
            position: null,
            rotation: { x: 0, y: 0, z: 0 },
            draggable: true,
          });
        }
      }

      // Remove surround roles that are not required by this layout
      for (const role of ["SL", "SR", "SBL", "SBR", "LW", "RW"]) {
        if (!layoutRoles.includes(role)) byRole.delete(role);
      }

      // OFF = keep stubs but clear model (blank slate, nothing will render)
      if (!modelKey || modelKeyLower === "off" || modelKeyLower === "none") {
        for (const role of layoutRoles) {
          const s = byRole.get(role);
          if (!s) continue;
          byRole.set(role, { ...s, model: null });
        }
        
        // Clear hydration flags
        if (needsSurroundResetRef) needsSurroundResetRef.current = false;
        if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = null;
        
        const result = Array.from(byRole.values());
        if (globalThis.__B44_LOGS) {
          console.log("[SP] Surrounds OFF -> kept stubs:", result
            .filter(s => ["SL","SR","SBL","SBR","LW","RW"].includes(getCanonicalRole(s.role)))
            .map(s => ({ role: s.role, model: s.model }))
          );
        }
        return result;
      }

      // MODEL ON = write modelKey onto all required surround roles
      for (const role of layoutRoles) {
        const s = byRole.get(role);
        if (!s) continue;
        byRole.set(role, { ...s, model: modelKey });
      }

      const draft = Array.from(byRole.values());

      // Tell SpeakerPlacementImpl to hydrate surround positions centrally (where resetSurroundPositions exists)
      if (needsSurroundResetRef) needsSurroundResetRef.current = true;
      if (lastSurroundModelKeyRef) lastSurroundModelKeyRef.current = modelKey;

      if (globalThis.__B44_LOGS) {
        console.log("[SP] Surrounds ON -> draft (positions will be hydrated centrally):", draft
          .filter(s => ["SL","SR","SBL","SBR","LW","RW"].includes(getCanonicalRole(s.role)))
          .map(s => ({ role: s.role, model: s.model }))
        );
      }

      // Hydrate positions now (centrally, inside this handler)
      const hydrated = resetSurroundPositions(
        effectivePreset,
        mlpPoint,
        dimsSafe,
        draft,
        modelKey
      );

      // — REAR RESCUE: guarantee SBL/SBR exist + have valid positions when layout expects rears —
      // Use already-declared layoutMajor from line 907
      const useWidesInsteadOfRears = sevenBedLayoutType === "wides";
      const expectsRears = (layoutMajor >= 9) || (layoutMajor === 7 && !useWidesInsteadOfRears);

      const list0 = Array.isArray(hydrated) && hydrated.length ? hydrated : draft;
      const byCanon0 = new Map(list0.map(s => [getCanonicalRole(s?.role), s]));

      const hasFiniteXY = (p) =>
        !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

      if (expectsRears) {
        const W = Number(dimensions?.width ?? dimensions?.widthM) || 0;
        const L = Number(dimensions?.length ?? dimensions?.lengthM) || 0;
        const earZ = 1.1;

        // Only attempt rescue if room dims are valid
        if (W > 0 && L > 0) {
          const backY = Math.max(0.01, L - 0.10);

          const ensureRear = (role, xFrac) => {
            const canon = role;
            const existing = byCanon0.get(canon);

            if (existing && hasFiniteXY(existing.position)) return;

            const x = Math.max(0.01, Math.min(W - 0.01, W * xFrac));
            const fixed = {
              ...(existing || {}),
              id: existing?.id || `${canon.toLowerCase()}-${timeNowMs()}`,
              role: canon,
              label: canon,
              model: existing?.model || modelKey,
              position: { x, y: backY, z: earZ },
              rotation: existing?.rotation || { x: 0, y: 0, z: 0 },
              draggable: true,
            };

            byCanon0.set(canon, fixed);
          };

          ensureRear('SBL', 0.25);
          ensureRear('SBR', 0.75);
        }
      }

      const hydratedWithRears = Array.from(byCanon0.values());

      if (globalThis.__B44_LOGS) {
        console.log('[SP] Rear rescue check:', hydratedWithRears
          .filter(s => ['SBL','SBR'].includes(getCanonicalRole(s.role)))
          .map(s => ({ role: s.role, model: s.model, pos: s.position }))
        );
      }

      return hydratedWithRears;
    });
  }, [
    app,
    setSurroundConfig,
    setSpeakers,
    effectivePreset,
    useWides,
    mlpPoint,
    dimensions,
    needsSurroundResetRef,
    lastSurroundModelKeyRef,
  ]);
  
  // [B44 FIX] REMOVED: Removed the backfill effect that was setting master model on null speakers.
  // This effect was redundant and could conflict with user selections.
  // useEffect(() => {
  //   const master = surroundConfig?.value?.master;
  //   if (!master || master === 'off') return;
  //
  //   setSpeakers(prev => {
  //     let changed = false;
  //     const next = (Array.isArray(prev) ? prev : []).map(s => {
  //       const role = String(s?.role || "").toUpperCase();
  //       const canon = getCanonicalRole(role);
  //       const isBedSurround = ALL_SURROUND_ROHAS(canon);
  //       
  //       if (isBedSurround && !s.model && allowedRoles.has(canon)) {
  //         changed = true;
  //         return { ...s, model: master };
  //       }
  //       return s;
  //     });
  //     return changed ? next : prev;
  //   });
  // }, [surroundConfig?.value?.master, setSpeakers, allowedRoles]);
  
  const surroundChoices = useMemo(() => {
    const byCat = getModelsByCategoryOrdered();
    const surrounds = byCat['SURROUNDS'] || [];
    return [
      { value: 'off', label: 'Off' },
      ...surrounds.map(s => ({ value: s.key, label: displayModelKey(s.label) }))
    ];
  }, [getModelsByCategoryOrdered]);

  return (
    <div className="space-y-3 p-2">
      <SurroundsSelector
        layout={dolbyPreset}
        choices={surroundChoices}
        value={surroundConfig.value}
        override={surroundConfig.override}
        onChange={handleSurroundModelChange}
        activeRoles={activeRoles}
        disabled={disabled}
        extraSurroundCount={extraSurroundCount}
        onExtraSurroundCountChange={onExtraSurroundCountChange}
        allowExtraSurrounds={allowExtraSurrounds}
      />
    </div>
  );
}

const MemoizedUnifiedSurroundsConfig = React.memo(UnifiedSurroundsConfig);

function OverheadsSection({ placedSpeakers, setSpeakers, mlpPoint, dolbyPreset, allSeatSplMetrics, mlpSeat }) {
  return (
    <div style={{ marginTop: 8 }}>
      <OverheadSplStrip
        allSeatSplMetrics={allSeatSplMetrics}
        mlpSeat={mlpSeat}
        dolbyLayout={dolbyPreset}
      />
    </div>
  );
}

function ensureLcrWhenSelectingModel(modelLabel, dimensions, setSpeakers) {
  setSpeakers(prev => {
    const list = Array.isArray(prev) ? prev : [];
    const by   = buildRoleMap(list);

    const LCR_ROLES_SET = new Set(["FL","FC","FR"]);
    const filtered = list.filter(s => !LCR_ROLES_SET.has(getCanonicalRole(s.role)));

    const roomW = Number(dimensions?.width ?? dimensions?.widthM) || 4.5;
    const roomH = Number(dimensions?.height ?? dimensions?.heightM) || 2.8;

    const defaultY = 0.20;
    const defaultZ = roomH * 0.5;
    const spread   = Math.min(1.2, roomW * 0.22);

    const FL = by.get("FL") || { role:"FL", id:"FL-1", draggable:true };
    const FC = by.get("FC") || { role:"FC", id:"FC-1", draggable:true };
    const FR = by.get("FR") || { role:"FR", id:"FR-1", draggable:true };

    const midX = roomW / 2;

    const seeded = [
      {
        ...FL,
        role:"FL",
        id: FL.id || "FL-1",
        model: modelLabel,
        position: FL.position || { x: midX - spread, y: defaultY, z: defaultZ },
        rotation: FL.rotation || { x:0, y:0, z:0 },
      },
      {
        ...FC,
        role:"FC",
        id: FC.id || "FC-1",
        model: modelLabel,
        position: FC.position || { x: midX, y: defaultY, z: defaultZ },
        rotation: FC.rotation || { x:0, y:0, z:0 },
      },
      {
        ...FR,
        role:"FR",
        id: FR.id || "FR-1",
        model: modelLabel,
        position: FR.position || { x: midX + spread, y: defaultY, z: defaultZ },
        rotation: FR.rotation || { x:0, y:0, z:0 },
      },
    ];

    return [...filtered, ...seeded];
  });
}

function LCRPanel({ setSpeakers, dimensions, lcrAimMode, onChangeLcrAimMode, lcrAngleDeg, mlpPoint, disabled, allSeatSplMetrics }) {
  const appState = useAppState();
  const { speakerSystem, setScreen, splConfig = {}, updateGlobalSpl, seatingPositions } = appState || {};
  const { LCR: lcrModelOptions = [] } = getModelsByCategoryOrdered() || {};

  const LCR_CANONICAL_ROLES = useMemo(() => new Set(["FL", "FC", "FR"]), []);
  const lcrRoles = useMemo(() => ['FL', 'FC', 'FR'], []);

  const byRole = useMemo(() => buildRoleMap(speakerSystem?.placedSpeakers || []),
    [speakerSystem?.placedSpeakers]);

  const getByRole = useCallback(r => byRole.get(getCanonicalRole(r)), [byRole]);
  
  const initialModel = useMemo(() => {
    for (const r of LCR_CANONICAL_ROLES) {
      const m = getByRole(r)?.model;
      if (m && lcrModelOptions.some(opt => opt.label === m)) return m;
    }
    return "";
  }, [getByRole, LCR_CANONICAL_ROLES, lcrModelOptions]);

  // Helper to get clean display label for any model
  const getDisplayLabel = useCallback((modelKey) => {
    if (!modelKey) return "";
    
    // Look up in LCR models first
    const lcrMatch = lcrModelOptions.find(m => m.key === modelKey || m.label === modelKey);
    if (lcrMatch) return lcrMatch.label;
    
    // If ends with _s, try without suffix
    if (String(modelKey).endsWith('_s')) {
      const withoutS = String(modelKey).slice(0, -2);
      const fallback = lcrModelOptions.find(m => m.key === withoutS);
      if (fallback) return fallback.label;
    }
    
    return modelKey;
  }, [lcrModelOptions]);

  const [lcrModel, setLcrModel] = useState(initialModel);
  const [lcrPowerInputValue, setLcrPowerInputValue] = useState(String(splConfig?.lcrW || 100));

  useEffect(() => {
    if (initialModel && initialModel !== lcrModel) setLcrModel(initialModel);
  }, [initialModel, lcrModel]);

  useEffect(() => {
    setLcrPowerInputValue(String(splConfig?.lcrW || 100));
  }, [splConfig?.lcrW]);

  const handleLcrPowerChange = useCallback((e) => {
    const newValue = e.target.value;
    // Allow only digits while typing
    if (newValue !== '' && !/^\d+$/.test(newValue)) return;
    
    setLcrPowerInputValue(newValue);
    
    if (newValue === '') return;
    
    const val = parseInt(newValue, 10);
    if (Number.isFinite(val) && val >= 1 && val <= 5000) {
      updateGlobalSpl?.({ lcrW: val });
    }
  }, [updateGlobalSpl]);

  const handleLcrPowerBlur = useCallback((e) => {
    const val = parseInt(e.target.value, 10);
    if (!Number.isFinite(val) || val < 1 || val > 5000) {
      const lastValid = splConfig?.lcrW || 100;
      setLcrPowerInputValue(String(lastValid));
    } else {
      const clamped = Math.max(1, Math.min(5000, val));
      setLcrPowerInputValue(String(clamped));
      if (clamped !== (splConfig?.lcrW || 100)) {
        updateGlobalSpl?.({ lcrW: clamped });
      }
    }
  }, [splConfig?.lcrW, updateGlobalSpl]);

  const onChooseModel = useCallback((modelLabel) => {
    if (!lcrModelOptions.some(opt => opt.label === modelLabel)) return;
    setLcrModel(modelLabel);
    ensureLcrWhenSelectingModel(modelLabel, dimensions, setSpeakers);
  }, [dimensions, setSpeakers, lcrModelOptions]);

  const angled = lcrAimMode === "angled";

  return (
    <div className="space-y-2 p-2">
      <Label htmlFor="lcr-model" className="text-[#3E4349] font-medium">LCR Model</Label>
      <Select value={lcrModel || undefined} onValueChange={onChooseModel} disabled={disabled}>
        <SelectTrigger id="lcr-model" className="w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
          <span className="text-2xl font-semibold" style={{ color: "#213428" }}>
            {lcrModel ? (getSpeakerModelMeta(lcrModel)?.label || lcrModel) : "Select LCR model"}
          </span>
        </SelectTrigger>
        <SelectContent className="bg-white border-[#DCDBD6]">
          {lcrModelOptions.map(model => (
            <SelectItem key={model.key} value={model.label} className="hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]" style={{ color: "#213428" }}>{model.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-[#625143] mt-1">
        Angle to MLP: <span className="font-semibold text-[#1B1A1A]">{Math.round(lcrAngleDeg)}°</span>
      </p>

      <div className="mt-4">
        <Label className="text-xs text-[#625143] mb-2 block">SPL @ RSP</Label>
        <div className="grid grid-cols-3 gap-3">
        {lcrRoles.map((role) => (
          <LcrSplCard
            key={role}
            role={role}
            label={role === 'FL' ? 'Left' : role === 'FC' ? 'Center' : 'Right'}
            allSeatSplMetrics={allSeatSplMetrics}
          />
        ))}
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <Label className="text-xs text-[#625143]">Amplifier Power (LCR)</Label>
        <div className="relative">
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={lcrPowerInputValue}
            onChange={handleLcrPowerChange}
            onBlur={handleLcrPowerBlur}
            disabled={disabled}
            className="pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none">
            W
          </span>
        </div>
      </div>

      <div className="space-y-2 mt-4">
        <Label className="text-xs text-[#625143]">Parameter 12. Screen speakers SPL capability at RSP</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={splConfig?.radiationMode === 'half-space' || !splConfig?.radiationMode ? 'default' : 'outline'}
            className={
              splConfig?.radiationMode === 'half-space' || !splConfig?.radiationMode
                ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
            }
            onClick={() => updateGlobalSpl?.({ radiationMode: 'half-space' })}
            disabled={disabled}
          >
            Minimum
          </Button>
          <Button
            type="button"
            size="sm"
            variant={splConfig?.radiationMode === 'anechoic' ? 'default' : 'outline'}
            className={
              splConfig?.radiationMode === 'anechoic'
                ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
            }
            onClick={() => updateGlobalSpl?.({ radiationMode: 'anechoic' })}
            disabled={disabled}
          >
            Recommended
          </Button>
        </div>
      </div>

      {(() => {
        // Compute worst-case LCR SPL for P12 using the exact tile values
        if (!allSeatSplMetrics) return null;

        // Use synthetic "mlp" entry (green dot), fallback to mlpSeat
        const mlpMetrics = allSeatSplMetrics.get("mlp");
        const seatMetrics = mlpMetrics || (() => {
          const mlp = getMlpSeat(seatingPositions || []);
          return mlp ? allSeatSplMetrics.get(mlp.id) : null;
        })();

        if (!seatMetrics?.spl?.screen) return null;

        // Get the same ceiled values shown in LcrSplCard tiles (formatDb ceils)
        const lcrTileSplDb = ['FL', 'FC', 'FR']
          .map(role => seatMetrics.spl.screen[role]?.value)
          .filter(v => Number.isFinite(v))
          .map(v => Math.ceil(v)); // formatDb uses Math.ceil

        if (lcrTileSplDb.length === 0) return null;

        const pillBasisDb = Math.min(...lcrTileSplDb);
        
        // Use different thresholds based on mode (state values kept for backwards compat)
        const isMinimumMode = splConfig?.radiationMode === 'half-space' || !splConfig?.radiationMode;
        const thresholds = isMinimumMode ? P12_THRESHOLDS_MIN : P12_THRESHOLDS_REC;
        
        const level = computeRP22Level(pillBasisDb, thresholds);

        return (
          <RP22LevelPill 
            parameter="P12" 
            level={level} 
            label="RP22 P12"
          />
        );
      })()}
    </div>
  );
}

function formatDolbyLabel(key) {
  const [a = "5", b = "1", c = "0"] = String(key).split(".");
  const overheads = Number(c) || 0;
  return overheads > 0 ? `${a}.${b}.${overheads} Dolby Atmos` : `${a}.${b} Surround`;
}

function SpeakerPlacementImpl(props) {
  const dimensions = props?.dimensions; // legacy alias to prevent ReferenceError
  
  // Get app state with splConfig early (before any usage)
  const appStateContext = useAppState();
  const { splConfig = {}, updateGlobalSpl } = appStateContext || {};
  
  // Local state for Surrounds and Overheads power inputs
  const [surroundsPowerInputValue, setSurroundsPowerInputValue] = useState(String(splConfig?.surroundsW || 100));
  const [overheadsPowerInputValue, setOverheadsPowerInputValue] = useState(String(splConfig?.overheadsW || 100));

  useEffect(() => {
    setSurroundsPowerInputValue(String(splConfig?.surroundsW || 100));
  }, [splConfig?.surroundsW]);

  useEffect(() => {
    setOverheadsPowerInputValue(String(splConfig?.overheadsW || 100));
  }, [splConfig?.overheadsW]);
  
  // Define dimsSafe early - always exists, always has valid numbers
  const dimsSafe = React.useMemo(() => {
    const src = dimensions || props.roomDimensions || {};
    return {
      width: Number(src.width ?? src.widthM) || 4.5,
      length: Number(src.length ?? src.lengthM) || 6.0,
      height: Number(src.height ?? src.heightM) || 2.4,
    };
  }, [dimensions, props.roomDimensions]);
  
  const {
    disabled = false,
    dimensions: dimensionsProp, // NEW: Room dimensions from parent
    sevenBedLayoutType,
    onSevenBedLayoutTypeChange,
    dolbyPreset,
    onDolbyPresetChange,
    lcrAimMode = "flat",
    onChangeLcrAimMode = () => {},
    lcrAngleDeg = 0,
    allSeatSplMetrics, // NEW: SPL data from parent
    extraSurroundCount,
    onExtraSurroundCountChange,
    allowExtraSurrounds,
  } = props;



  const app = useAppState();
  const appState = app;

  const {
    speakerSystem, setSpeakerSystem, seatingPositions, setDolbyConfig, dolbyConfig,
    showToast,
    setUseWidesInsteadOfRears, 
    overheadGlobalModel,
    setOverheadGlobalModel,
    overheadFrontOverride,
    setOverheadFrontOverride,
    overheadMidOverride,
    setOverheadMidOverride,
    overheadRearOverride,
    setOverheadRearOverride,
    useFrontGlobal,
    setUseFrontGlobal,
    useMidGlobal,
    setUseMidGlobal,
    useRearGlobal,
    setUseRearGlobal,
    enableFrontWides, // <-- FW overlay state
  } = appState || {};

  // CRITICAL: Effective room dimensions - NEVER empty, always has valid numbers
  // This ensures resetSurroundPositions always gets usable W/L/H values
  // NOTE: dimsSafe is already defined at top of function - this is effectiveDims
  const effectiveDims = React.useMemo(() => {
    const propW = Number(dimensionsProp?.width ?? dimensionsProp?.widthM);
    const propL = Number(dimensionsProp?.length ?? dimensionsProp?.lengthM);
    const propH = Number(dimensionsProp?.height ?? dimensionsProp?.heightM);
    
    const appW = Number(appState?.roomDims?.widthM ?? appState?.roomDims?.width);
    const appL = Number(appState?.roomDims?.lengthM ?? appState?.roomDims?.length);
    const appH = Number(appState?.roomDims?.heightM ?? appState?.roomDims?.height);
    
    const DEFAULT_WIDTH = 4.5;
    const DEFAULT_LENGTH = 6.0;
    const DEFAULT_HEIGHT = 2.4;
    
    const finalWidth = (Number.isFinite(propW) && propW > 0) ? propW 
                     : (Number.isFinite(appW) && appW > 0) ? appW 
                     : DEFAULT_WIDTH;
    
    const finalLength = (Number.isFinite(propL) && propL > 0) ? propL 
                      : (Number.isFinite(appL) && appL > 0) ? appL 
                      : DEFAULT_LENGTH;
    
    const finalHeight = (Number.isFinite(propH) && propH > 0) ? propH 
                      : (Number.isFinite(appH) && appH > 0) ? appH 
                      : DEFAULT_HEIGHT;
    
    const result = {
      width: finalWidth,
      length: finalLength,
      height: finalHeight,
      widthM: finalWidth,
      lengthM: finalLength,
      heightM: finalHeight,
    };
    
    // DEBUG: Show dimension sources
    if (globalThis.__B44_LOGS) {
      console.log('[SP effectiveDims]', {
        propDims: dimensionsProp,
        appDims: appState?.roomDims,
        effectiveDims: result,
        W: finalWidth,
        L: finalLength,
        H: finalHeight,
      });
    }
    
    return result;
  }, [
    dimensionsProp?.width, dimensionsProp?.widthM,
    dimensionsProp?.length, dimensionsProp?.lengthM,
    dimensionsProp?.height, dimensionsProp?.heightM,
    appState?.roomDims?.widthM, appState?.roomDims?.width,
    appState?.roomDims?.lengthM, appState?.roomDims?.length,
    appState?.roomDims?.heightM, appState?.roomDims?.height,
  ]);

  if (globalThis.__B44_LOGS) console.log("[B44] DIMENSIONS CHECK", {
    propDims: dimensionsProp,
    effectiveDims: effectiveDims,
    width: effectiveDims?.width,
    length: effectiveDims?.length,
    height: effectiveDims?.height,
  });

  const frontSubsCfg = appState?.frontSubsCfg || props?.frontSubsCfg || { 
    enabled: false, count: 0, model: null, placement: "front" 
  };

  const rearSubsCfg = appState?.rearSubsCfg || props?.rearSubsCfg || { 
    enabled: false, count: 0, model: null, placement: "rear" 
  };

  const subWarnings = appState?.subWarnings || { front: [], rear: [] };

  const effectivePreset = (typeof dolbyPreset === "string" && dolbyPreset) 
    || (typeof appState?.dolbyLayout === "string" && appState.dolbyLayout) 
    || "5.1";

  // Is the current bed layout a 7.x variant?
  const is7xBed = React.useMemo(() => {
    const preset = String(effectivePreset || "");
    return preset.startsWith("7.1") || preset.startsWith("7.2");
  }, [effectivePreset]);

  // For 7.x layouts, sevenBedLayoutType is the single source of truth.
  // For 5.x and 9.x we don't use "instead of" logic – 5.x has no rears/wides, 9.x has both.
  const useWides = React.useMemo(() => {
    if (!is7xBed) return false;
    return String(sevenBedLayoutType || "").toLowerCase() === "wides";
  }, [is7xBed, sevenBedLayoutType]);

  // Keep global appState.setUseWidesInsteadOfRears in sync with the 7.x layout toggle
  React.useEffect(() => {
    if (!appState || typeof appState.setUseWidesInsteadOfRears !== "function") return;
    if (!is7xBed) {
      // For non-7.x layouts, enforce "false" so 5.x and 9.x behave predictably
      appState.setUseWidesInsteadOfRears(false);
      return;
    }
    appState.setUseWidesInsteadOfRears(useWides);
  }, [appState, is7xBed, useWides]);

  const allowedRoles = React.useMemo(() => {
    const layout = String(effectivePreset || "5.1");
    const major = parseInt(layout.split(".")[0], 10) || 5;

    // Sides exist for any 5.x / 7.x / 9.x bed layout
    const roles = new Set();

    if (major >= 5) {
      roles.add("SL");
      roles.add("SR");
    }

    // 7.x – either rears OR wides, depending on useWides
    const showRears = (major === 7 && !useWides) || major >= 9;
    const showWides7 = major === 7 && !!useWides;

    if (showRears || major >= 9) {
      roles.add("SBL");
      roles.add("SBR");
    }

    if (showWides7 || major >= 9) {
      roles.add("LW");
      roles.add("RW");
    }

    return roles;
  }, [effectivePreset, useWides]);

  const placedSpeakers = useMemo(() => speakerSystem?.placedSpeakers || [], [speakerSystem?.placedSpeakers]);
  const lastPresetRef = useRef(effectivePreset);
  const lastEffectSigRef = React.useRef(null);
  const __b44LastApplySigRef = React.useRef(null);
  const __b44LastEffectSigRef = useRef({});

  // [B44] Surround reset flow (model selection -> central hydrate)
  const needsSurroundResetRef = React.useRef(false);
  const lastSurroundModelKeyRef = React.useRef(null);

  const globalSurroundModel = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return null;
    
    for (const spk of placedSpeakers) {
      const canon = getCanonicalRole(spk.role);
      if (SURROUND_BED_ROLES.has(canon) && spk.model && spk.model !== "off" && spk.model !== "none") {
        return spk.model;
      }
    }
    
    return null;
  }, [placedSpeakers]);

  const overheadCount = useMemo(() => {
    if (!effectivePreset) return 0;
    const parts = effectivePreset.split('.');
    if (parts.length < 3) return 0;
    return parseInt(parts[2]) || 0;
  }, [effectivePreset]);

  const CORNER_CLEARANCE_M = 0.50;
  const WALL_BUFFER_M = 0.01;

  // Local model-dim helper (SpeakerPlacement must not depend on RV helpers)
  const getModelDimsM = React.useCallback((model) => {
    const meta = getSpeakerModelMeta(model);
    return {
      widthM: Number(meta?.widthM) || 0.27,
      depthM: Number(meta?.depthM) || 0.082,
    };
  }, []);

  const getHuggingCenterLines = useCallback((speakerModel, roomDimensions) => {
    const W = Number(roomDimensions?.width ?? roomDimensions?.widthM) || 0;
    const L = Number(roomDimensions?.length ?? roomDimensions?.lengthM) || 0;
    const { widthM, depthM } = getModelDimsM(speakerModel);
    const shortEdge = Math.min(widthM, depthM);
    const longEdge = Math.max(widthM, depthM);

    return {
      leftWallX: shortEdge / 2 + WALL_BUFFER_M,
      rightWallX: W - shortEdge / 2 - WALL_BUFFER_M,
      backWallY: L - shortEdge / 2 - WALL_BUFFER_M,
      shortEdge,
      longEdge
    };
  }, [getModelDimsM, WALL_BUFFER_M]);

  // Expose getModelDimsM to window for applyFrontWideMedianPositions helper
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__GET_SPEAKER_META = getModelDimsM;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__GET_SPEAKER_META;
      }
    };
  }, [getModelDimsM]);

  const placeSurroundByRayCast = useCallback((angleDegrees, mlpPoint, roomDimensions) => {
    const W = Number(roomDimensions?.width ?? roomDimensions?.widthM) || 0;
    const L = Number(roomDimensions?.length ?? roomDimensions?.lengthM) || 0;
    const { x: xm, y: ym } = mlpPoint;
    const a = angleDegrees * (Math.PI / 180);
    const dx = Math.sin(a);
    const dy = -Math.cos(a);

    let t = Infinity;

    if (dx < 0) {
      const tL = (WALL_BUFFER_M - xm) / dx;
      if (tL > 0) t = Math.min(t, tL);
    }
    if (dx > 0) {
      const tR = (W - WALL_BUFFER_M - xm) / dx;
      if (tR > 0) t = Math.min(t, tR);
    }
    if (dy < 0) {
      const tF = (WALL_BUFFER_M - ym) / dy;
      if (tF > 0) t = Math.min(t, tF);
    }
    if (dy > 0) {
      const tB = (L - WALL_BUFFER_M - ym) / dy;
      if (tB > 0) t = Math.min(t, tB);
    }

    if (t === Infinity || t <= 0) {
      return { x: xm, y: ym, z: 1.1 };
    }

    return {
      x: xm + dx * t,
      y: ym + dy * t,
      z: 1.1
    };
  }, []);

  const applyCornerClearance = useCallback((position, role, speakerModel, roomDimensions, zones) => {
  const W = Number(roomDimensions?.width ?? roomDimensions?.widthM) || 0;
  const L = Number(roomDimensions?.length ?? roomDimensions?.lengthM) || 0;
    const hugging = getHuggingCenterLines(speakerModel, roomDimensions);
    const { shortEdge, longEdge } = hugging;
    
    let { x, y, z } = position;
    
    // [B44] Defensive check: if inputs are not finite, return position as-is
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(W) || !Number.isFinite(L) ||
        !Number.isFinite(shortEdge) || !Number.isFinite(longEdge)) {
      console.warn('[applyCornerClearance] Non-finite input detected', { x, y, W, L, shortEdge, longEdge });
      return { x, y, z };
    }
    
    const isOnLeftWall = Math.abs(x - hugging.leftWallX) < 0.001;
    const isOnRightWall = Math.abs(x - hugging.rightWallX) < 0.001;
    const isOnBackWall = Math.abs(y - hugging.backWallY) < 0.001;
    
    const zone = zones?.[role] || {};
    
    if (isOnBackWall) {
      // Zone boundaries (default to full room width if not specified)
      const zoneXMin = Number.isFinite(zone.xMin) ? zone.xMin : 0;
      const zoneXMax = Number.isFinite(zone.xMax) ? zone.xMax : W;
      
      // Calculate clearance bounds
      const cornerClearanceLeft = CORNER_CLEARANCE_M + (shortEdge / 2);
      const cornerClearanceRight = W - (CORNER_CLEARANCE_M + (shortEdge / 2));
      
      // Minimum X (furthest right we can push from left edge)
      const xMinWithClearance = Math.max(
        zoneXMin,
        cornerClearanceLeft,
        shortEdge / 2  // minimum room bounds
      );
      
      // Maximum X (furthest left we can push from right edge)
      const xMaxWithClearance = Math.min(
        zoneXMax,
        cornerClearanceRight,
        W - (shortEdge / 2)  // maximum room bounds
      );
      
      // [B44] If constraints are impossible (min > max), use safe mid-zone position
      if (xMinWithClearance >= xMaxWithClearance) {
        if (globalThis.__B44_LOGS) console.warn(`[applyCornerClearance] Impossible X range for ${role} on back wall. Using safe center.`, {
          xMinWithClearance,
          xMaxWithClearance,
          W,
          shortEdge,
          CORNER_CLEARANCE_M
        });
        x = (xMinWithClearance + xMaxWithClearance) / 2;
        // Ensure x is still finite
        if (!Number.isFinite(x)) {
          x = W / 2;  // Ultimate fallback
        }
      } else {
        // Normal clamping
        x = Math.max(xMinWithClearance, Math.min(xMaxWithClearance, x));
      }
      
    } else if (isOnLeftWall || isOnRightWall) {
      // Zone boundaries (default to full room length if not specified)
      const zoneYMin = Number.isFinite(zone.yMin) ? zone.yMin : 0;
      const zoneYMax = Number.isFinite(zone.yMax) ? zone.yMax : L;
      
      // Calculate clearance bounds
      const cornerClearanceRear = L - (CORNER_CLEARANCE_M + (longEdge / 2));
      
      // Minimum Y (furthest back we can push from front edge)
      const yMinFromZone = Math.max(
        zoneYMin,
        longEdge / 2  // minimum room bounds
      );
      
      // Maximum Y (furthest forward we can push from rear edge)
      const yMaxWithRearClearance = Math.min(
        zoneYMax,
        cornerClearanceRear,
        L - (longEdge / 2)  // maximum room bounds
      );
      
      // [B44] If constraints are impossible (min > max), use safe mid-zone position
      if (yMinFromZone >= yMaxWithRearClearance) {
        if (globalThis.__B44_LOGS) console.warn(`[applyCornerClearance] Impossible Y range for ${role} on side wall. Using safe center.`, {
          yMinFromZone,
          yMaxWithRearClearance,
          L,
          longEdge,
          CORNER_CLEARANCE_M
        });
        y = (yMinFromZone + yMaxWithRearClearance) / 2;
        // Ensure y is still finite
        if (!Number.isFinite(y)) {
          y = L / 2;  // Ultimate fallback
        }
      } else {
        // Normal clamping
        y = Math.max(yMinFromZone, Math.min(yMaxWithRearClearance, y));
      }
    }
    
    // [B44] Final safety check
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (globalThis.__B44_LOGS) console.error('[applyCornerClearance] FINAL NaN DETECTED. Using room center fallback.', { x, y, role });
      return { x: W / 2, y: L / 2, z };
    }
    
    return { x, y, z };
  }, [getHuggingCenterLines, CORNER_CLEARANCE_M]);

  const applyRoomBoundsClamp = useCallback((position, speakerModel, roomDimensions) => {
    const W = Number(roomDimensions?.width ?? roomDimensions?.widthM) || 0;
    const L = Number(roomDimensions?.length ?? roomDimensions?.lengthM) || 0;
    const { shortEdge } = getHuggingCenterLines(speakerModel, roomDimensions);
    
    let { x, y, z } = position;
    
    // [B44] Defensive check: ensure all values are finite
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(W) || 
        !Number.isFinite(L) || !Number.isFinite(shortEdge)) {
      if (globalThis.__B44_LOGS) console.warn('[applyRoomBoundsClamp] Non-finite input detected', { x, y, W, L, shortEdge });
      // Return unclamped position to preserve any partial validity
      return { x, y, z };
    }
    
    const minX = shortEdge / 2;
    const maxX = W - shortEdge / 2;
    const minY = shortEdge / 2;
    const maxY = L - shortEdge / 2;
    
    // [B44] Safety check: if room is too small for speaker, use room center
    if (minX >= maxX || minY >= maxY) {
      if (globalThis.__B44_LOGS) console.warn('[applyRoomBoundsClamp] Room too small for speaker dimensions', {
        W, L, shortEdge, minX, maxX, minY, maxY
      });
      return { x: W / 2, y: L / 2, z };
    }
    
    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));
    
    // [B44] Final safety check
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (globalThis.__B44_LOGS) console.error('[applyRoomBoundsClamp] FINAL NaN DETECTED after clamping', { x, y });
      return { x: W / 2, y: L / 2, z };
    }
    
    return { x, y, z };
  }, [getHuggingCenterLines]);

  // [B44 CRITICAL]: Do NOT snap surrounds to MLP when x/y are missing.
  // Let bad coordinates stay bad so we can debug why ray-casting failed,
  // rather than silently teleporting speakers to the MLP.
  function safePos(pos, mlp, fallbackZ = 1.1) {
    const p = pos || {};

    const x = Number.isFinite(p.x) ? p.x : p.x; // pass through, even if undefined/NaN
    const y = Number.isFinite(p.y) ? p.y : p.y;
    const z = Number.isFinite(p.z) ? p.z : fallbackZ;

    // Debug warning when coordinates are invalid (temporary)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (globalThis.__B44_LOGS) console.warn('[SP safePos] Non-finite coordinates detected (will NOT fallback to MLP):', {
        pos: p,
        x,
        y,
        z
      });
    }

    return { x, y, z };
  }

  const mlpPoint = useMemo(() => {
    const W = Number(effectiveDims?.width ?? effectiveDims?.widthM) || 0;
    const L = Number(effectiveDims?.length ?? effectiveDims?.lengthM) || 0;
    return computeMLPAndPrimary(
      seatingPositions || [], 
      W, 
      L, 
      "front"
    )?.mlp || null;
  }, [seatingPositions, effectiveDims?.width, effectiveDims?.widthM, effectiveDims?.length, effectiveDims?.lengthM]);

  const setSpeakers = useCallback((updater) => {
    setSpeakerSystem(prev => {
      const current = Array.isArray(prev?.placedSpeakers) ? prev.placedSpeakers : [];
      const next = (typeof updater === "function") ? updater(current) : updater;
      const nextArr = Array.isArray(next) ? next : [];

      if (typeof __b44SameSpeakers === "function" && __b44SameSpeakers(nextArr, current)) {
        return prev;
      }

      return { ...prev, placedSpeakers: nextArr };
    });
  }, [setSpeakerSystem]);

  const canSides = allowedRoles.has('SL') && allowedRoles.has('SR');
  const canRears = allowedRoles.has('SBL') && allowedRoles.has('SBR');
  const canWides = allowedRoles.has('LW') && allowedRoles.has('RW');
  const isNineBed = canRears && canWides;

  const is7xOrHigher = useMemo(() => {
    const major = Number(String(effectivePreset).split(".")[0]) || 5;
    return major >= 7;
  }, [effectivePreset]);

  // NEW: Get MLP seat for SPL displays (use passed allSeatSplMetrics from parent)
  const mlpSeat = useMemo(() => {
    return getMlpSeat(seatingPositions || []);
  }, [seatingPositions]);

  // Surround config state (initialize from AppState if available)
  const [surroundConfig, setSurroundConfig] = useState(() => {
    const savedModel = appState?.globalSurroundModel;
    // Strip _s suffix for UI display
    const cleanedModel = savedModel && savedModel.endsWith && savedModel.endsWith("_s") 
      ? savedModel.slice(0, -2) 
      : savedModel;
    const master = cleanedModel && cleanedModel !== 'off' && cleanedModel !== 'none' ? cleanedModel : "off";
    return {
      value: { master, side: "off", rear: "off", wide: "off" },
      override: { side: false, rear: false, wide: false },
    };
  });

  // Input signature ref for idempotence
  const lastSurroundResetSigRef = React.useRef(null);

  // MOVE resetSurroundPositions HERE (before it's used in handlers/effects)
  const resetSurroundPositions = useCallback(
    (layoutString, mlp, dims, currentSpeakers, modelKeyParam) => {
      const list = Array.isArray(currentSpeakers) ? currentSpeakers : [];

      const W = Number(dims?.width);
      const L = Number(dims?.length);

      // GUARD 1: Input signature check - skip if inputs haven't changed
      const sig = JSON.stringify({
        layout: String(layoutString || ''),
        model: String(modelKeyParam || '').trim(),
        W: Math.round((W || 0) * 1000) / 1000,
        L: Math.round((L || 0) * 1000) / 1000,
        mode: sevenBedLayoutType,
        mlpX: Math.round((mlp?.x || 0) * 1000) / 1000,
        mlpY: Math.round((mlp?.y || 0) * 1000) / 1000,
      });

      if (lastSurroundResetSigRef.current === sig) {
        console.log('[SP resetSurroundPositions CALLBACK] NO-OP (same inputs)');
        return list;
      }

      lastSurroundResetSigRef.current = sig;

      console.log('[SP resetSurroundPositions CALLBACK] HIT', { layoutString, modelKeyParam, W, L, dims, speakerCount: Array.isArray(currentSpeakers) ? currentSpeakers.length : null });

      // If room dims are not usable, do nothing (do NOT null anything)
      if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
        if (globalThis.__B44_LOGS) console.warn('[SP resetSurroundPositions] ABORT: invalid dims', { W, L, dims });
        return list;
      }

      // Normalise / accept model keys like "evolve-2-1_s" before checks
      const rawKey = String(modelKeyParam || '').trim();
      const normKey = (typeof normaliseModelKey === 'function') ? normaliseModelKey(rawKey) : rawKey;
      const keyLower = String(normKey || '').trim().toLowerCase();
      const modelOn = !!keyLower && keyLower !== 'off' && keyLower !== 'none';

      if (!modelOn) {
        if (globalThis.__B44_LOGS) console.log('[SP resetSurroundPositions] model OFF -> no placement');
        return list;
      }

      const earZ = 1.1;
      const INSET = 0.02;

      // Layout: do we expect rears?
      const major = parseInt(String(layoutString || '5.1').split('.')[0], 10) || 5;
      const useWidesInsteadOfRears = (sevenBedLayoutType === 'wides');
      const expectsRears = (major >= 9) || (major === 7 && !useWidesInsteadOfRears);

      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const hasXY = (s) => Number.isFinite(s?.position?.x) && Number.isFinite(s?.position?.y);

      // Ensure we can look up by canonical role
      const byCanon = new Map();
      list.forEach(s => byCanon.set(getCanonicalRole(s?.role), s));

      const ensure = (canonRole, xFrac, yVal) => {
        const existing = byCanon.get(canonRole);
        if (!existing) return;

        // If model missing on the speaker, apply the global model key
        const sm = String(existing?.model || '').trim();
        const smLower = sm.toLowerCase();
        const speakerModelOn = !!smLower && smLower !== 'off' && smLower !== 'none';

        const finalModel = speakerModelOn ? existing.model : normKey;

        if (hasXY(existing) && speakerModelOn) return;

        const x = clamp(W * xFrac, INSET, W - INSET);
        const y = clamp(yVal, INSET, L - INSET);

        byCanon.set(canonRole, {
          ...existing,
          model: finalModel,
          position: { ...(existing.position || {}), x, y, z: earZ },
        });
      };

      // Sides always get sane defaults if present and model is on
      ensure('SL', 0.02 / W, (Number.isFinite(mlp?.y) ? mlp.y : L * 0.58));
      ensure('SR', 1 - (0.02 / W), (Number.isFinite(mlp?.y) ? mlp.y : L * 0.58));

      // Wides (if present) get a stable front-ish default
      ensure('LW', 0.15, L * 0.40);
      ensure('RW', 0.85, L * 0.40);

      // Rears MUST be forced when layout expects them
      if (expectsRears) {
        const backY = L - 0.10;
        ensure('SBL', 0.25, backY);
        ensure('SBR', 0.75, backY);
      }

      const out = Array.from(byCanon.values());

      // GUARD 2: Position comparison - only return new array if positions actually changed
      const EPS = 0.001;
      const posChanged = (a, b) => {
        if (!a || !b) return true;
        const dx = Math.abs((a.x ?? 0) - (b.x ?? 0));
        const dy = Math.abs((a.y ?? 0) - (b.y ?? 0));
        const dz = Math.abs((a.z ?? 0) - (b.z ?? 0));
        return dx > EPS || dy > EPS || dz > EPS;
      };

      const isSurroundRole = (role) => {
        const r = String(role || "").toUpperCase();
        return r === "SL" || r === "SR" || r === "SBL" || r === "SBR" || r === "LW" || r === "RW";
      };

      const currByRole = new Map();
      list.forEach(s => {
        const r = String(s?.role || "").toUpperCase();
        if (r) currByRole.set(r, s);
      });

      let anyChanged = false;
      out.forEach(s => {
        if (!isSurroundRole(s?.role)) return;
        const prev = currByRole.get(String(s.role).toUpperCase());
        if (!prev) { anyChanged = true; return; }
        if (posChanged(prev.position, s.position)) {
          anyChanged = true;
        }
      });

      if (!anyChanged) {
        console.log('[SP resetSurroundPositions CALLBACK] NO-OP (positions unchanged)');
        return list;
      }

      if (globalThis.__B44_LOGS) {
        const trace = out
          .filter(s => ['SBL','SBR'].includes(getCanonicalRole(s?.role)))
          .map(s => ({ role: s?.role, model: s?.model, x: s?.position?.x, y: s?.position?.y, z: s?.position?.z }));
        console.log('[SP resetSurroundPositions] OUTPUT rears:', trace, { W, L, expectsRears, model: normKey });
      }

      return out;
    },
    [sevenBedLayoutType]
  );

  // [B44] Central surround hydration (the ONLY place resetSurroundPositions is called)
  useEffect(() => {
    if (!needsSurroundResetRef.current) return;

    // Only hydrate if a real model is selected
    const modelKey = String(lastSurroundModelKeyRef.current || "").trim();
    const ms = modelKey.toLowerCase();
    if (!modelKey || ms === "off" || ms === "none") {
      needsSurroundResetRef.current = false;
      return;
    }

    // Hydrate positions now
    setSpeakers(prev => {
      const layout = String(effectivePreset || "5.1").split(" ")[0].split("_")[0];
      const next = resetSurroundPositions(layout, mlpPoint, effectiveDims, prev, modelKey);
      
      // IDEMPOTENT GUARD: only update if something actually changed
      if (__b44SameSpeakers(prev, next)) {
        console.log('[SP resetSurroundPositions CALLBACK] NO-OP (positions unchanged)');
        return prev;
      }
      
      return Array.isArray(next) ? next : prev;
    });

    // Consume the request
    needsSurroundResetRef.current = false;
  }, [setSpeakers, resetSurroundPositions, effectivePreset, mlpPoint, dimensions]);

  const handleResetPositions = useCallback(() => {
    const W = Number(effectiveDims?.width ?? effectiveDims?.widthM) || 0;
    const L = Number(effectiveDims?.length ?? effectiveDims?.lengthM) || 0;
    const H = Number(effectiveDims?.height ?? effectiveDims?.heightM) || 2.4;

    if (!mlpPoint || !effectiveDims ||
        !Number.isFinite(Number(effectiveDims?.width ?? effectiveDims?.widthM)) ||
        !Number.isFinite(Number(effectiveDims?.length ?? effectiveDims?.lengthM)) ||
        !Number.isFinite(Number(effectiveDims?.height ?? effectiveDims?.heightM))
    ) {
      if (showToast) {
        if (globalThis.__B44_LOGS) console.error('Cannot reset speakers: Room dimensions or MLP not set.');
        showToast('Cannot reset speakers: Room dimensions or MLP not set.', 'error');
      }
      return;
    }

    setSpeakers(currentSpeakers => {
      if (!Array.isArray(currentSpeakers) || currentSpeakers.length === 0) {
        return currentSpeakers;
      }

      // Use UI-selected model for reset, same as speakerApply effect
      const uiModelRaw = String(surroundConfig?.value?.master || "off").trim();
      const uiModelLower = uiModelRaw.toLowerCase();
      const modelKeyForPlacement = (uiModelLower === "off" || uiModelLower === "none") ? null : uiModelRaw;

      const reset = resetSurroundPositions(effectivePreset, mlpPoint, dimsSafe, currentSpeakers, modelKeyForPlacement);
      // Clear positionSource for all speakers (return to auto mode)
      return reset.map(s => ({ ...s, positionSource: 'auto' }));
    });

    if (showToast) {
      const layoutKey = effectivePreset.startsWith('5.1') ? '5.1' : effectivePreset.startsWith('9.') ? '9.x' : '7.1';
      showToast(`Speaker positions reset for ${layoutKey} layout with 50cm corner clearance.`, 'success');
    }
  }, [effectivePreset, mlpPoint, effectiveDims, resetSurroundPositions, setSpeakers, showToast, globalSurroundModel]);

  // NEW: Auto-hydrate surround positions when layout or 7.x toggle changes
  // This ensures SBL/SBR and LW/RW appear WITHOUT requiring zone toggles
  useEffect(() => {
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) return;
    if (!mlpPoint || !effectiveDims) return;
    if (!effectivePreset) return;

    const masterSurroundModel = String(surroundConfig?.value?.master || 'off');

    // Only run when layout changes OR when surround model becomes available
    const __layoutSig = __b44SigFor({
      preset: effectivePreset,
      useWides: useWides,
      globalModel: masterSurroundModel,
    });

    if (__b44LastEffectSigRef.current.layoutHydrate === __layoutSig) return;
    __b44LastEffectSigRef.current.layoutHydrate = __layoutSig;

    // GATE: If no surround model is selected yet, don't hydrate (wait for user to select)
    if (!masterSurroundModel || masterSurroundModel === 'off' || masterSurroundModel === 'none') {
      if (globalThis.__B44_LOGS) console.log('[SP HYDRATE] Skipping: no global surround model');
      return;
    }

    if (globalThis.__B44_LOGS) console.log('[SP HYDRATE] Running for layout change', {
      preset: effectivePreset,
      useWides: useWides,
      globalModel: masterSurroundModel,
    });

    // Force one hydration pass to ensure speakers exist with positions
    setSpeakers(current => {
    const reset = resetSurroundPositions(effectivePreset, mlpPoint, dimsSafe, current, masterSurroundModel);

      if (__b44SameSpeakers(current, reset)) return current;
      return reset;
    });
    }, [
    effectivePreset,
    useWides,
    surroundConfig?.value?.master,
    placedSpeakers?.length,
    mlpPoint,
    effectiveDims,
    resetSurroundPositions,
    setSpeakers,
    ]);

  useEffect(() => {
    // HARD GUARD: if there are no speakers, SpeakerPlacement must do nothing.
    // Subs can exist independently; we must not “seed” or “reset” surrounds here.
    if (!Array.isArray(placedSpeakers) || placedSpeakers.length === 0) {
      return;
    }
    if (!mlpPoint || !effectiveDims) return;

    // ---- build a stable input signature for this effect ----
    const __sig = __b44SigFor({
      w: (effectiveDims?.width ?? effectiveDims?.widthM) ?? null,
      l: (effectiveDims?.length ?? effectiveDims?.lengthM) ?? null,
      h: (effectiveDims?.height ?? effectiveDims?.heightM) ?? null,
      mlpX: mlpPoint?.x ?? null,
      mlpY: mlpPoint?.y ?? null,
      preset: effectivePreset ?? null,
      globalModel: globalSurroundModel ?? null,
      roles: Array.from(allowedRoles).sort(),
      speakers: placedSpeakers.map(s => ({
        role: s?.role ?? null,
        model: s?.model ?? null,
        x: s?.position?.x ?? null,
        y: s?.position?.y ?? null,
        source: s?.positionSource ?? null
      }))
    });

    if (__b44LastEffectSigRef.current.speakerApply === __sig) return;
    __b44LastEffectSigRef.current.speakerApply = __sig;

    // ---- early exit if room dimensions are not usable ----
    const W = Number(effectiveDims?.width ?? effectiveDims?.widthM);
    const L = Number(effectiveDims?.length ?? effectiveDims?.lengthM);
    if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
      if (globalThis.__B44_LOGS) console.warn('[SP speakerApply] ABORT: invalid room dimensions', { W, L });
      return;
    }

    // ---- existing logic: compute the next speakers array ----
    const preserveUserPositions = (placedSpeakers || []).filter(s => {
      const canon = getCanonicalRole(s.role);
      return SURROUND_BED_ROLES.has(canon) && s.positionSource === 'user';
    });

    // Use the UI-selected surround model (NOT globalSurroundModel) to drive placement
    const uiModelRaw = String(surroundConfig?.value?.master || "off").trim();
    const uiModelLower = uiModelRaw.toLowerCase();
    const modelKeyForPlacement = (uiModelLower === "off" || uiModelLower === "none") ? null : uiModelRaw;

    const resetOut = (Array.isArray(placedSpeakers) && placedSpeakers.length > 0)
      ? resetSurroundPositions(
          effectivePreset,
          mlpPoint,
          dimsSafe,
          placedSpeakers,
          modelKeyForPlacement
        )
      : (placedSpeakers || []);

    const nextSpeakers = resetOut.map(speaker => {
      const userVersion = preserveUserPositions.find(u =>
        getCanonicalRole(u.role) === getCanonicalRole(speaker.role)
      );
      return userVersion || speaker;
    });

    if (globalThis.__B44_LOGS) {
      console.log('[SP] speakerApply effect OUTPUT:', nextSpeakers.map(s => ({
        role: s.role,
        model: s.model,
        hasPos: !!s.position
      })));
    }

    // Only set when meaningfully changed - use functional update to prevent loops
    setSpeakers((current) => {
      if (!Array.isArray(nextSpeakers)) return current;
      if (__b44SameSpeakers(current, nextSpeakers)) return current;
      return nextSpeakers;
    });

    lastPresetRef.current = effectivePreset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
    effectivePreset,
    surroundConfig?.value?.master,
    mlpPoint?.x, mlpPoint?.y,
    effectiveDims?.width, effectiveDims?.widthM,
    effectiveDims?.length, effectiveDims?.lengthM,
    effectiveDims?.height, effectiveDims?.heightM,
    allowedRoles
    ]);

  const is7ChannelBed = effectivePreset && (effectivePreset.startsWith('7.1') || effectivePreset.startsWith('7.2'));

  // ---------------------------------------------------------------------------
  // FRONT-WIDE AUTO MEDIAN (RP22 - UNCONDITIONAL, but respects user lock)
  // LW / RW sit at the midpoint between FL/SL and FR/SR respectively.
  // This runs whenever speakers or effectiveDims change, independent of overlay state.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!canWides || !effectiveDims) return;

    const __sig = __b44SigFor({
      w: effectiveDims?.width ?? null,
      l: effectiveDims?.length ?? null,
      canWides,
      fl: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FL')?.position,
      fr: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FR')?.position,
      sl: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SL')?.position,
      sr: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SR')?.position,
      lw: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW'),
      rw: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW')
    });

    if (__b44LastEffectSigRef.current.fwMedian === __sig) return;
    __b44LastEffectSigRef.current.fwMedian = __sig;

    setSpeakers((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      if (!list.length) return prev;

      // Only bother if there are front-wides in the system
      const hasFW = list.some((s) => {
        const canon = getCanonicalRole(s.role);
        return canon === "LW" || canon === "RW";
      });
      if (!hasFW) return prev;

      const W = Number(effectiveDims?.width ?? effectiveDims?.widthM) || 0;
      const L = Number(effectiveDims?.length ?? effectiveDims?.lengthM) || 0;
      if (!W || !L) return prev;

      const byCanon = new Map();
      list.forEach((s) => {
        byCanon.set(getCanonicalRole(s.role), s);
      });

      let changed = false;

      // Shared Y for LW/RW (keeps them locked as a pair from the start)
      const FLy = byCanon.get("FL")?.position?.y;
      const FRy = byCanon.get("FR")?.position?.y;
      const SLy = byCanon.get("SL")?.position?.y;
      const SRy = byCanon.get("SR")?.position?.y;

      const hasYAnchors =
        Number.isFinite(FLy) && Number.isFinite(FRy) &&
        Number.isFinite(SLy) && Number.isFinite(SRy);

      const sharedMedianY = hasYAnchors
        ? (((FLy + SLy) / 2) + ((FRy + SRy) / 2)) / 2
        : null;

      const updated = list.map((s) => {
        const canon = getCanonicalRole(s.role);
        if (canon !== "LW" && canon !== "RW") return s;

        // [B44 POSITION LOCK] Skip user-positioned speakers
        if (s.positionSource === 'user') return s;

        const frontRole = canon === "LW" ? "FL" : "FR";
        const sideRole  = canon === "LW" ? "SL" : "SR";

        const front = byCanon.get(frontRole);
        const side  = byCanon.get(sideRole);

        const fx = front?.position?.x;
        const fy = front?.position?.y;
        const sx = side?.position?.x;
        const sy = side?.position?.y;

        // If anchors aren't both valid, leave this FW alone
        if (
          !Number.isFinite(fx) || !Number.isFinite(fy) ||
          !Number.isFinite(sx) || !Number.isFinite(sy)
        ) {
          return s;
        }

        // RP22 "median distance" along the listening plane: midpoint of Y
        const medianY = (Number.isFinite(sharedMedianY) ? sharedMedianY : (fy + sy) / 2);

        // X is pinned to the side wall using the hugging helpers
        const hugging = getHuggingCenterLines(s.model, effectiveDims);
        const wallX =
          canon === "LW"
            ? hugging.leftWallX
            : hugging.rightWallX;

        let pos = {
          x: wallX,
          y: medianY,
          z: Number.isFinite(s.position?.z) ? s.position.z : 1.1,
        };

        // Respect buffer / corners but keep it on the wall
        pos = applyCornerClearance(pos, canon, s.model, effectiveDims, {});
        pos = applyRoomBoundsClamp(pos, s.model, effectiveDims);

        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
          return s;
        }

        const old = s.position || {};
        const dx = Math.abs((old.x ?? 0) - pos.x);
        const dy = Math.abs((old.y ?? 0) - pos.y);

        if (dx < 0.001 && dy < 0.001) {
          return s;
        }

        changed = true;
        return { ...s, position: pos };
      });

      return changed ? updated : prev;
      });
      }, [
      canWides,
      effectiveDims?.width,
      effectiveDims?.widthM,
      effectiveDims?.length,
      effectiveDims?.lengthM,
      applyCornerClearance,
      applyRoomBoundsClamp,
      getHuggingCenterLines,
      setSpeakers,
      // React to changes in FL/FR/SL/SR positions
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FL')?.position?.x,
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FL')?.position?.y,
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FR')?.position?.x,
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FR')?.position?.y,
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SL')?.position?.x,
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SL')?.position?.y,
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SR')?.position?.x,
      placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SR')?.position?.y,
      ]);

      // --- FINAL FRONT-WIDE Y CORRECTION -----------------------------------------
      // Ensures LW and RW always sit at the true median between front and side
      // surrounds on their own side. We only touch the Y position; X is already
      // wall-pinned by the hugging logic.
      // [B44 POSITION LOCK] Only adjusts auto-positioned speakers
      useEffect(() => {
      const __sig = __b44SigFor({
      w: effectiveDims?.width ?? null,
      l: effectiveDims?.length ?? null,
      flY: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FL')?.position?.y,
      frY: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FR')?.position?.y,
      slY: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SL')?.position?.y,
      srY: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SR')?.position?.y,
      lwY: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW')?.position?.y,
      rwY: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW')?.position?.y,
      lwSrc: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW')?.positionSource,
      rwSrc: placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW')?.positionSource
    });

    if (__b44LastEffectSigRef.current.fwYCorrect === __sig) return;
    __b44LastEffectSigRef.current.fwYCorrect = __sig;

    setSpeakers(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      const get = (role) =>
        prev.find(s => s && s.role === role && s.position);

      const FL = get('FL');
      const FR = get('FR');
      const SL = get('SL');
      const SR = get('SR');
      const LW = get('LW');
      const RW = get('RW');

      // If any of the anchors are missing, do nothing.
      if (!FL || !FR || !SL || !SR || !LW || !RW) return prev;
      
      // [B44 POSITION LOCK] Skip if user has manually placed either FW speaker
      if (LW.positionSource === 'user' || RW.positionSource === 'user') return prev;

      const targetYL = (FL.position.y + SL.position.y) / 2;
      const targetYR = (FR.position.y + SR.position.y) / 2;
      const targetY = (targetYL + targetYR) / 2;

      const EPS = 0.001;
      const needsLeftAdjust  = LW.positionSource !== 'user' && Math.abs(LW.position.y - targetY) > EPS;
      const needsRightAdjust = RW.positionSource !== 'user' && Math.abs(RW.position.y - targetY) > EPS;

      if (!needsLeftAdjust && !needsRightAdjust) {
        return prev; // already correct — avoid infinite loops
      }

      return prev.map(sp => {
        if (!sp || !sp.position) return sp;

        if (sp.role === 'LW' && needsLeftAdjust) {
          return {
            ...sp,
            position: {
              ...sp.position,
              y: targetY,   // keep existing x (already wall-pinned)
            },
          };
        }

        if (sp.role === 'RW' && needsRightAdjust) {
          return {
            ...sp,
            position: {
              ...sp.position,
              y: targetY,
            },
          };
        }

        return sp;
        });
        });
        // Depend on room geometry / toggles so this runs when things change,
        // but the EPS guard above prevents unnecessary setState loops.
        }, [
        effectiveDims?.width,
        effectiveDims?.widthM,
        effectiveDims?.length,
        effectiveDims?.lengthM,
        setSpeakers,
        // React to FL/FR/SL/SR position changes
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FL')?.position?.y,
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'FR')?.position?.y,
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SL')?.position?.y,
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'SR')?.position?.y,
        ]);

        // --- FINAL FRONT-WIDE X-AXIS SYMMETRY CORRECTION --------------------------
        // Ensures LW and RW are perfectly mirrored on the X-axis around the room center.
        // This runs after all other positioning and clamping, correcting any asymmetries.
        useEffect(() => {
        if (!canWides || !effectiveDims) return;

        const W = Number(effectiveDims?.width ?? effectiveDims?.widthM);
        if (!Number.isFinite(W) || W <= 0) return;

        const lw = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW');
        const rw = placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW');

        // Only symmetrize auto-placed speakers with valid positions
        if (!lw || !rw || lw.positionSource === 'user' || rw.positionSource === 'user') return;
        if (!Number.isFinite(lw.position?.x) || !Number.isFinite(rw.position?.x)) return;

        const roomCenter = W / 2;
        const lwDist = roomCenter - lw.position.x;
        const rwDist = rw.position.x - roomCenter;
        const avgDist = (lwDist + rwDist) / 2;

        const EPS = 1e-4;
        if (Math.abs(lwDist - avgDist) > EPS || Math.abs(rwDist - avgDist) > EPS) {
        if (globalThis.__B44_LOGS) console.log('[SP] Applying FW X-symmetry correction');

        setSpeakers(prev => {
        let changed = false;
        const next = prev.map(s => {
          const canon = getCanonicalRole(s.role);
          if ((canon === 'LW' || canon === 'RW') && s.positionSource !== 'user' && Number.isFinite(s.position?.x)) {
            const newX = canon === 'LW' ? (roomCenter - avgDist) : (roomCenter + avgDist);
            if (Math.abs(s.position.x - newX) > EPS) {
              changed = true;
              return { ...s, position: { ...s.position, x: newX } };
            }
          }
          return s;
        });
        return changed ? next : prev;
        });
        }
        }, [
        canWides,
        effectiveDims?.width,
        effectiveDims?.widthM,
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW')?.position?.x,
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW')?.position?.x,
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'LW')?.positionSource,
        placedSpeakers?.find(s => getCanonicalRole(s.role) === 'RW')?.positionSource,
        setSpeakers
        ]);

        // Update overhead speaker models when overhead selection state changes
  useEffect(() => {
    if (overheadCount === 0) return;

    const __sig = __b44SigFor({
      count: overheadCount,
      global: overheadGlobalModel,
      frontOvr: overheadFrontOverride,
      midOvr: overheadMidOverride,
      rearOvr: overheadRearOverride,
      useFront: useFrontGlobal,
      useMid: useMidGlobal,
      useRear: useRearGlobal
    });

    if (__b44LastEffectSigRef.current.overheadModels === __sig) return;
    __b44LastEffectSigRef.current.overheadModels = __sig;
    
    const OVERHEAD_ROLES = new Set(['TFL', 'TFR', 'TFC', 'TL', 'TR', 'TML', 'TMR', 'TBL', 'TBR', 'TBC']);
    
    // Define which roles belong to which groups
    const FRONT_ROLES = new Set(['TFL', 'TFR', 'TFC']);
    const MID_ROLES = new Set(['TL', 'TR', 'TML', 'TMR']);
    const REAR_ROLES = new Set(['TBL', 'TBR', 'TBC']);
    
    setSpeakers(prev => {
      const list = Array.isArray(prev) ? prev : [];
      let changed = false;
      
      const updated = list.map(speaker => {
        const canon = getCanonicalRole(speaker.role);
        
        // Only process overhead speakers
        if (!OVERHEAD_ROLES.has(canon)) return speaker;
        
        // Determine which group this speaker belongs to
        let targetModel = null;
        
        if (FRONT_ROLES.has(canon)) {
          targetModel = (!useFrontGlobal && overheadFrontOverride) 
            ? overheadFrontOverride 
            : overheadGlobalModel;
        } else if (MID_ROLES.has(canon)) {
          targetModel = (!useMidGlobal && overheadMidOverride) 
            ? overheadMidOverride 
            : overheadGlobalModel;
        } else if (REAR_ROLES.has(canon)) {
          targetModel = (!useRearGlobal && overheadRearOverride) 
            ? overheadRearOverride 
            : overheadGlobalModel;
        }
        
        // If target model is null or 'OFF', clear the model
        if (!targetModel || targetModel === 'OFF') {
          if (speaker.model !== null) {
            changed = true;
            return { ...speaker, model: null };
          }
          return speaker;
        }
        
        // Update model if it's different
        if (speaker.model !== targetModel) {
          changed = true;
          return { ...speaker, model: targetModel };
        }
        
        return speaker;
      });
      
      return changed ? updated : prev;
    });
  }, [
    overheadCount,
    overheadGlobalModel,
    overheadFrontOverride,
    overheadMidOverride,
    overheadRearOverride,
    useFrontGlobal,
    useMidGlobal,
    useRearGlobal,
    setSpeakers
  ]);

  const resetOnlyFrontWidesToDefaults = useCallback(() => {
    if (!mlpPoint || !effectiveDims || !canWides) {
        if (showToast) {
        if (globalThis.__B44_LOGS) console.info('Front-Wide speakers are not enabled or room data missing.');
        showToast('Front-Wide speakers are not enabled or room data missing.', 'info');
    }
        return;
    }

    setSpeakers(currentSpeakers => {
        const otherSpeakers = currentSpeakers.filter(s => {
            const canonicalRole = getCanonicalRole(s.role);
            return !['LW', 'RW'].includes(canonicalRole);
        });

        const existingSpeakersMap = new Map();
        currentSpeakers.forEach(s => existingSpeakersMap.set(getCanonicalRole(s.role), s));

        const newFWSpeakers = [];
        const fwRoles = ['LW', 'RW'];

        const W = Number(effectiveDims?.width ?? effectiveDims?.widthM) || 4.5;
        const L = Number(effectiveDims?.length ?? effectiveDims?.lengthM) || 6.0;

        fwRoles.forEach(role => {
            const existing = existingSpeakersMap.get(role);
            let model = existing?.model || existingSpeakersMap.get(role === 'LW' ? 'SL' : 'SR')?.model || 'off';

            if (model === 'off') return;

            let xAtWall;
            const medianY = L / 2;

            if (role === 'LW') {
                const hugging = getHuggingCenterLines(model, effectiveDims);
                xAtWall = hugging.leftWallX;
            } else if (role === 'RW') {
                const hugging = getHuggingCenterLines(model, effectiveDims);
                xAtWall = hugging.rightWallX;
            } else {
                return;
            }

            newFWSpeakers.push({
                id: existing?.id || `${role}-${timeNowMs()}`,
                role,
                model,
                position: {
                    x: xAtWall,
                    y: medianY,
                    z: 1.1
                },
                rotation: { x: 0, y: 0, z: 0 },
                draggable: true
            });
        });

        return [...otherSpeakers, ...newFWSpeakers];
    });
    if (showToast) {
        if (globalThis.__B44_LOGS) console.log('Front-Wide speakers reset to median positions.');
        showToast('Front-Wide speakers reset to median positions.', 'success');
        }
        }, [mlpPoint, effectiveDims, canWides, setSpeakers, showToast, getHuggingCenterLines]);

  useEffect(() => {
    const handler = () => {
      window.dispatchEvent(new CustomEvent('b44:fw:resetToMedian'));
    };
    window.addEventListener('b44:fw:resetToMedian', handler);
    return () => {
      window.removeEventListener('b44:fw:resetToMedian', handler);
    };
  }, [resetOnlyFrontWidesToDefaults]);

  // --- FINAL SAFETY PASS ---
  useEffect(() => {
    setSpeakers(prevSpeakers => {
      let speakers = [...prevSpeakers];
      let changed = false;

      const W = Number(effectiveDims?.width ?? effectiveDims?.widthM) || 0;
      const L = Number(effectiveDims?.length ?? effectiveDims?.lengthM) || 0;

      // Skip if room dimensions are invalid (cannot calculate fallbacks)
      if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(L) || L <= 0) {
        return prevSpeakers;
      }

      const earZ = 1.1; // Standard listening height
      const EPS = 1e-4; // For float comparison

      // 1. SBL/SBR Invariant Check (each independently)
      // Derive rears expectation from layout, not allowedRoles
      const layoutMajor = parseInt(String(effectivePreset || '5.1').split('.')[0], 10) || 5;
      const expectsRears = (layoutMajor >= 9) || (layoutMajor === 7 && !useWides);

      // Get surround master model if available
      const masterModel = surroundConfig?.value?.master;
      const masterModelValid = masterModel && String(masterModel).toLowerCase() !== 'off' && String(masterModel).toLowerCase() !== 'none';

      // GATE: Only position rears when model is selected
      if (expectsRears && masterModelValid) {
        let SBL = speakers.find(s => getCanonicalRole(s.role) === 'SBL');
        let SBR = speakers.find(s => getCanonicalRole(s.role) === 'SBR');

        const hasFiniteXY = (s) => !!s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y);

        // Create SBL if missing
        if (!SBL) {
          const fixedX = Math.max(0.01, Math.min(W - 0.01, W * 0.25));
          const fixedY = Math.max(0.01, L - 0.10);
          SBL = {
            id: `sbl-${timeNowMs()}`,
            role: 'SBL',
            model: masterModelValid ? masterModel : null,
            position: { x: fixedX, y: fixedY, z: earZ },
            rotation: { x: 0, y: 0, z: 0 },
            draggable: true,
          };
          speakers.push(SBL);
          changed = true;
          if (globalThis.__B44_LOGS) console.warn('[SAFETY PASS] Created missing SBL speaker');
        }

        // Create SBR if missing
        if (!SBR) {
          const fixedX = Math.max(0.01, Math.min(W - 0.01, W * 0.75));
          const fixedY = Math.max(0.01, L - 0.10);
          SBR = {
            id: `sbr-${timeNowMs()}`,
            role: 'SBR',
            model: masterModelValid ? masterModel : null,
            position: { x: fixedX, y: fixedY, z: earZ },
            rotation: { x: 0, y: 0, z: 0 },
            draggable: true,
          };
          speakers.push(SBR);
          changed = true;
          if (globalThis.__B44_LOGS) console.warn('[SAFETY PASS] Created missing SBR speaker');
        }

        const fixRearSpeaker = (speaker, defaultXFraction) => {
          if (!speaker || speaker.positionSource === 'user') return speaker; // Don't touch user-placed

          // Only fix if model is not OFF/NONE AND position is missing/invalid
          const mk = String(speaker?.model || '').trim().toLowerCase();
          const modelOn = !!mk && mk !== 'off' && mk !== 'none';

          if (modelOn && !hasFiniteXY(speaker)) {
            // Generate a safe fallback position
            if (globalThis.__B44_LOGS) console.warn(`[SAFETY PASS] Fixing SBL/SBR position for ${speaker.role}`);
            const fixedX = Math.max(0.01, Math.min(W - 0.01, W * defaultXFraction));
            const fixedY = Math.max(0.01, L - 0.10); // Clamped near back wall
            changed = true;
            return {
              ...speaker,
              position: { x: fixedX, y: fixedY, z: earZ },
              rotation: speaker.rotation || { x: 0, y: 0, z: 0 },
            };
          }
          return speaker;
        };

        const newSBL = fixRearSpeaker(SBL, 0.25);
        const newSBR = fixRearSpeaker(SBR, 0.75);

        if (newSBL !== SBL) speakers = speakers.map(s => getCanonicalRole(s.role) === 'SBL' ? newSBL : s);
        if (newSBR !== SBR) speakers = speakers.map(s => getCanonicalRole(s.role) === 'SBR' ? newSBR : s);
        } else if (expectsRears && !masterModelValid) {
        // Layout expects rears but model is OFF - clear positions from any existing stubs
        speakers = speakers.map(s => {
          const canon = getCanonicalRole(s.role);
          if (canon === 'SBL' || canon === 'SBR') {
            if (s.position) {
              changed = true;
              return { ...s, position: null };
            }
          }
          return s;
        });
        }

      // 2. LW/RW Symmetry Invariant Check
      const LW = speakers.find(s => getCanonicalRole(s.role) === 'LW');
      const RW = speakers.find(s => getCanonicalRole(s.role) === 'RW');

      // Proceed only if both LW and RW exist and have valid position data
      if (LW && RW && LW.position && RW.position && Number.isFinite(LW.position.x) && Number.isFinite(LW.position.y) && Number.isFinite(RW.position.x) && Number.isFinite(RW.position.y)) {
        const lwUser = LW.positionSource === 'user';
        const rwUser = RW.positionSource === 'user';

        // If both are user-positioned, do nothing
        if (lwUser && rwUser) {
          return changed ? speakers : prevSpeakers;
        }

        let sharedY;
        if (lwUser && !rwUser) { // LW is user-positioned, RW is auto-positioned. LW leads for Y.
          sharedY = LW.position.y;
        } else if (!lwUser && rwUser) { // RW is user-positioned, LW is auto-positioned. RW leads for Y.
          sharedY = RW.position.y;
        } else { // Both auto - average their current Ys for a calm transition.
          sharedY = (LW.position.y + RW.position.y) / 2;
        }

        const roomCenter = W / 2;
        let targetLwX, targetRwX;

        // Determine X targets based on leader
        if (lwUser && !rwUser) { // LW leads for X
          targetLwX = LW.position.x;
          targetRwX = W - LW.position.x;
        } else if (!lwUser && rwUser) { // RW leads for X
          targetRwX = RW.position.x;
          targetLwX = W - RW.position.x;
        } else { // Both auto - mirror around center based on current average X distance
          const lwDistFromCenter = roomCenter - LW.position.x;
          const rwDistFromCenter = RW.position.x - roomCenter;
          const avgDistFromCenter = (lwDistFromCenter + rwDistFromCenter) / 2;
          targetLwX = roomCenter - avgDistFromCenter;
          targetRwX = roomCenter + avgDistFromCenter;
        }
        
        // Clamp X targets to stay within room bounds
        const minXClamp = 0.02;
        const maxXClamp = W - 0.02;
        targetLwX = Math.max(minXClamp, Math.min(maxXClamp, targetLwX));
        targetRwX = Math.max(minXClamp, Math.min(maxXClamp, targetRwX));

        let lwChanged = false;
        let rwChanged = false;

        const updatedSpeakers = speakers.map(s => {
          const canon = getCanonicalRole(s.role);
          if (canon === 'LW') {
            let newPos = { ...s.position };
            // Always update Y for LW
            if (Number.isFinite(sharedY) && Math.abs(newPos.y - sharedY) > EPS) {
              newPos.y = sharedY;
              lwChanged = true;
            }
            // Update X only if LW is not user-positioned
            if (lwUser && !rwUser) {
              // LW is leader, its X is fixed
            } else if (!lwUser && Number.isFinite(targetLwX) && Math.abs(newPos.x - targetLwX) > EPS) {
              newPos.x = targetLwX;
              lwChanged = true;
            }
            return lwChanged ? { ...s, position: newPos } : s;
          } else if (canon === 'RW') {
            let newPos = { ...s.position };
            // Always update Y for RW
            if (Number.isFinite(sharedY) && Math.abs(newPos.y - sharedY) > EPS) {
              newPos.y = sharedY;
              rwChanged = true;
            }
            // Update X only if RW is not user-positioned
            if (rwUser && !lwUser) {
              // RW is leader, its X is fixed
            } else if (!rwUser && Number.isFinite(targetRwX) && Math.abs(newPos.x - targetRwX) > EPS) {
              newPos.x = targetRwX;
              rwChanged = true;
            }
            return rwChanged ? { ...s, position: newPos } : s;
          }
          return s;
        });

        if (lwChanged || rwChanged) {
          if (globalThis.__B44_LOGS) console.log('[SAFETY PASS] Enforcing LW/RW symmetry and shared Y with enhanced user-lock logic');
          changed = true;
          speakers = updatedSpeakers;
        }
      }

      if (changed) {
        return speakers;
      }
      return prevSpeakers;
    });
  }, [
    placedSpeakers,
    effectivePreset,
    useWides,
    effectiveDims?.width, effectiveDims?.widthM,
    effectiveDims?.length, effectiveDims?.lengthM,
    allowedRoles,
    setSpeakers,
  ]);

  return (
    <div className="space-y-4 font-sans" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>
      <div className="space-y-3">
        <Label htmlFor="system-config" className="text-[#1B1A1A] font-bold text-base block">System Configuration</Label>
        <Select 
          value={effectivePreset} 
          onValueChange={(v) => { 
            if (setDolbyConfig) setDolbyConfig(v); 
            if (onDolbyPresetChange) onDolbyPresetChange(v);
          }}
          disabled={disabled}
        >
          <SelectTrigger id="system-config" className="w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
            <SelectValue placeholder="Select configuration" className="text-2xl font-semibold" style={{ color: "#213428" }} />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(audioConfigurations).map(preset => (
              <SelectItem key={preset} value={preset} style={{ color: "#213428" }}>
                {formatDolbyLabel(preset)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleResetPositions}
          variant="outline"
          size="sm"
          disabled={disabled || !mlpPoint || !effectiveDims}
          className="flex-1 border-[#DCDBD6] text-[#1B1A1A] hover:bg-[#F8F8F7]"
          title="Re-position surrounds for the current layout. 5.1.x = ±120°. 7.1.x = ±100° sides and ±142.5° rears."
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset Positions
        </Button>
      </div>
      
      {is7ChannelBed && (
        <SevenLayoutSwitcher
          layout={sevenBedLayoutType}
          onLayoutChange={onSevenBedLayoutTypeChange}
          disabled={disabled}
        />
      )}

      <CollapsiblePanel title="LCR" defaultOpen>
        <LCRPanel 
          setSpeakers={setSpeakers} 
          dimensions={dimensions}
          lcrAimMode={lcrAimMode}
          onChangeLcrAimMode={onChangeLcrAimMode}
          lcrAngleDeg={lcrAngleDeg}
          mlpPoint={mlpPoint}
          disabled={disabled}
          allSeatSplMetrics={allSeatSplMetrics}
        />
      </CollapsiblePanel>

      <CollapsiblePanel title="Surround Channels" defaultOpen={false}>
        {!isNineBed && is7xBed && ( 
          <div className="mb-4 p-3 rounded-lg border border-[#E6E4DD] bg-[#F8F8F7]">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-[#1B1A1A]">Use Front Wides instead of Rear Surrounds</Label>
                <p className="text-xs text-[#625143] mt-1">Toggles the 7-bed layer between SBL/SBR and LW/RW.</p>
              </div>
              <Switch
                checked={useWides} 
                onCheckedChange={(v) => {
                  if (onSevenBedLayoutTypeChange) {
                    onSevenBedLayoutTypeChange(v ? "wides" : "rears");
                  }
                }}
                disabled={disabled}
              />
            </div>
          </div>
        )}

        <MemoizedUnifiedSurroundsConfig
          placedSpeakers={placedSpeakers}
          setSpeakers={setSpeakers}
          mlpPoint={mlpPoint}
          dolbyPreset={effectivePreset}
          sevenBedLayoutType={sevenBedLayoutType}
          dimensions={dimensions}
          getHuggingCenterLines={getHuggingCenterLines}
          applyCornerClearance={applyCornerClearance}
          applyRoomBoundsClamp={applyRoomBoundsClamp}
          disabled={disabled}
          allowedRoles={allowedRoles}
          canSides={canSides}
          canRears={canRears}
          canWides={canWides}
          is7xOrHigher={is7xOrHigher}
          safePos={safePos}
          effectivePreset={effectivePreset} 
          useWides={useWides}
          resetSurroundPositions={resetSurroundPositions}
          surroundConfig={surroundConfig}
          setSurroundConfig={setSurroundConfig}
          needsSurroundResetRef={needsSurroundResetRef}
          lastSurroundModelKeyRef={lastSurroundModelKeyRef}
          extraSurroundCount={extraSurroundCount}
          onExtraSurroundCountChange={onExtraSurroundCountChange}
          allowExtraSurrounds={allowExtraSurrounds}
        />

        {/* NEW: Surround SPL @ RSP strip */}
        <div className="mt-4">
          <SurroundSplStrip
            allSeatSplMetrics={allSeatSplMetrics}
            mlpSeat={mlpSeat}
            dolbyLayout={effectivePreset}
            placedSpeakers={placedSpeakers}
            mlpPoint={mlpPoint}
            roomDims={effectiveDims}
            setSpeakers={setSpeakers}
            disabled={disabled}
            frontWideOverlay={props.frontWideOverlay}
          />

          {/* Amplifier Power (Surrounds) */}
          <div className="space-y-2 mt-4">
            <Label className="text-xs text-[#625143]">Amplifier Power (Surrounds)</Label>
            <div className="relative">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={surroundsPowerInputValue}
                onChange={(e) => {
                  const newValue = e.target.value;
                  // Allow only digits while typing
                  if (newValue !== '' && !/^\d+$/.test(newValue)) return;
                  
                  setSurroundsPowerInputValue(newValue);
                  
                  if (newValue === '') return;
                  
                  const val = parseInt(newValue, 10);
                  if (Number.isFinite(val) && val >= 1 && val <= 5000) {
                    updateGlobalSpl?.({ surroundsW: val });
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!Number.isFinite(val) || val < 1 || val > 5000) {
                    const lastValid = splConfig?.surroundsW || 100;
                    setSurroundsPowerInputValue(String(lastValid));
                  } else {
                    const clamped = Math.max(1, Math.min(5000, val));
                    setSurroundsPowerInputValue(String(clamped));
                    if (clamped !== (splConfig?.surroundsW || 100)) {
                      updateGlobalSpl?.({ surroundsW: clamped });
                    }
                  }
                }}
                disabled={disabled}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none">
                W
              </span>
            </div>
          </div>

          {/* P13 Mode toggle (independent from P12) */}
          <div className="space-y-2 mt-4">
            <Label className="text-xs text-[#625143]">Parameter 13. Non-screen speakers SPL capability at RSP</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={splConfig?.p13Mode === 'minimum' || !splConfig?.p13Mode ? 'default' : 'outline'}
                className={
                  splConfig?.p13Mode === 'minimum' || !splConfig?.p13Mode
                    ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                    : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
                }
                onClick={() => updateGlobalSpl?.({ p13Mode: 'minimum' })}
                disabled={disabled}
              >
                Minimum
              </Button>
              <Button
                type="button"
                size="sm"
                variant={splConfig?.p13Mode === 'recommended' ? 'default' : 'outline'}
                className={
                  splConfig?.p13Mode === 'recommended'
                    ? 'flex-1 bg-[#213428] text-white hover:bg-[#213428]/90'
                    : 'flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]'
                }
                onClick={() => updateGlobalSpl?.({ p13Mode: 'recommended' })}
                disabled={disabled}
              >
                Recommended
              </Button>
            </div>
          </div>
          
          {(() => {
            // Compute worst-case Surround SPL for P13 using the exact tile values
            if (!allSeatSplMetrics) return null;

            // Use synthetic "mlp" entry (green dot), fallback to mlpSeat
            const mlpMetrics = allSeatSplMetrics.get("mlp");
            const seatMetrics = mlpMetrics || (mlpSeat ? allSeatSplMetrics.get(mlpSeat.id) : null);

            if (!seatMetrics?.spl?.surrounds) return null;

            // Get the same ceiled values shown in SurroundSplStrip tiles (formatDb ceils)
            const surroundTileSplDb = Object.values(seatMetrics.spl.surrounds)
              .map(s => s?.value)
              .filter(v => Number.isFinite(v))
              .map(v => Math.ceil(v)); // formatDb uses Math.ceil

            if (surroundTileSplDb.length === 0) return null;

            const pillBasisDb = Math.min(...surroundTileSplDb);
            
            // Use P13-specific mode (independent from P12)
            const { splConfig } = useAppState() || {};
            const isMinimumMode = splConfig?.p13Mode === 'minimum' || !splConfig?.p13Mode;
            const thresholds = isMinimumMode ? P13_THRESHOLDS_MIN : P13_THRESHOLDS_REC;
            
            const level = computeRP22Level(pillBasisDb, thresholds);

            return (
              <RP22LevelPill 
                parameter="P13" 
                level={level} 
                label="RP22 P13 (Surrounds)"
              />
            );
          })()}
        </div>
      </CollapsiblePanel>

      {overheadCount > 0 && (
        <CollapsiblePanel title="Overhead Channels" defaultOpen={false}>
          <div className="space-y-3 p-2">
            <OverheadChannelSelector
              overheadCount={overheadCount}
              globalModel={overheadGlobalModel}
              onGlobalModelChange={setOverheadGlobalModel}
              frontOverride={overheadFrontOverride}
              midOverride={overheadMidOverride}
              rearOverride={overheadRearOverride}
              onFrontOverrideChange={setOverheadFrontOverride}
              onMidOverrideChange={setOverheadMidOverride}
              onRearOverrideChange={setOverheadRearOverride}
              useFrontGlobal={useFrontGlobal}
              useMidGlobal={useMidGlobal}
              onUseFrontGlobalChange={setUseFrontGlobal}
              onUseMidGlobalChange={setUseMidGlobal}
              onUseRearGlobalChange={setUseRearGlobal}
              disabled={disabled}
            />
            
            <OverheadsSection 
              placedSpeakers={placedSpeakers} 
              setSpeakers={setSpeakers} 
              mlpPoint={mlpPoint} 
              dolbyPreset={effectivePreset}
              allSeatSplMetrics={allSeatSplMetrics}
              mlpSeat={mlpSeat}
            />

            {/* Amplifier Power (Overheads) */}
            <div className="space-y-2 mt-4">
              <Label className="text-xs text-[#625143]">Amplifier Power (Overheads)</Label>
              <div className="relative">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={overheadsPowerInputValue}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    // Allow only digits while typing
                    if (newValue !== '' && !/^\d+$/.test(newValue)) return;
                    
                    setOverheadsPowerInputValue(newValue);
                    
                    if (newValue === '') return;
                    
                    const val = parseInt(newValue, 10);
                    if (Number.isFinite(val) && val >= 1 && val <= 5000) {
                      updateGlobalSpl?.({ overheadsW: val });
                    }
                  }}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!Number.isFinite(val) || val < 1 || val > 5000) {
                      const lastValid = splConfig?.overheadsW || 100;
                      setOverheadsPowerInputValue(String(lastValid));
                    } else {
                      const clamped = Math.max(1, Math.min(5000, val));
                      setOverheadsPowerInputValue(String(clamped));
                      if (clamped !== (splConfig?.overheadsW || 100)) {
                        updateGlobalSpl?.({ overheadsW: clamped });
                      }
                    }
                  }}
                  disabled={disabled}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#625143] pointer-events-none">
                  W
                </span>
              </div>
            </div>

            {(() => {
              if (!allSeatSplMetrics) return null;

              // Use synthetic "mlp" entry (green dot), fallback to mlpSeat
              const mlpMetrics = allSeatSplMetrics.get("mlp");
              const seatMetrics = mlpMetrics || (mlpSeat ? allSeatSplMetrics.get(mlpSeat.id) : null);

              if (!seatMetrics?.spl?.uppers) return null;

              const overheadTileSplDb = Object.values(seatMetrics.spl.uppers)
                .map(s => s?.value)
                .filter(v => Number.isFinite(v))
                .map(v => Math.ceil(v));

              if (overheadTileSplDb.length === 0) return null;

              const pillBasisDb = Math.min(...overheadTileSplDb);
              
              // Use P13-specific mode (independent from P12)
              const { splConfig } = useAppState() || {};
              const isMinimumMode = splConfig?.p13Mode === 'minimum' || !splConfig?.p13Mode;
              const thresholds = isMinimumMode ? P13_THRESHOLDS_MIN : P13_THRESHOLDS_REC;
              
              const level = computeRP22Level(pillBasisDb, thresholds);

              return (
                <RP22LevelPill 
                  parameter="P13" 
                  level={level} 
                  label="RP22 P13 (Overheads)"
                />
              );
            })()}
            </div>
            </CollapsiblePanel>
            )}

      <CollapsiblePanel title="Subwoofers" defaultOpen={false}>
        <div className="rounded-none border border-[#E7E4DF] bg-[#F7F4F0]/40 px-4 py-4">
          <div className="grid grid-cols-12 gap-x-4 gap-y-3">
            <div className="col-span-12 md:col-span-6">
              <h4 className="text-[15px] font-semibold text-[#1B1A1A] mb-2">Front Subwoofers</h4>
              <div className="grid grid-cols-12 items-end gap-x-3 gap-y-2">
                <label className="col-span-7 text-[12px] text-[#625143]">Model</label>
                <label className="col-span-5 text-[12px] text-[#625143]">Quantity</label>

                <div className="col-span-7">
                  <Select
                    value={frontSubsCfg?.model ?? ""}
                    onValueChange={(model) => {
                      if (appState?.setFrontSubsCfg) {
                        appState.setFrontSubsCfg(prev => ({ ...prev, model }))
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 w-full px-3 justify-between bg-white border-[#DCDBD6]">
                      <SelectValue placeholder="Select model" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>No Subwoofer</SelectItem>
                      <SelectItem value="SUB2-12">SUB2-12</SelectItem>
                      <SelectItem value="SUB3-12">SUB3-12</SelectItem>
                      <SelectItem value="SUB4-12">SUB4-12</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-5">
                  <Select
                    value={String(frontSubsCfg?.count ?? 0)}
                    onValueChange={(v) => {
                      if (appState?.setFrontSubsCfg) {
                        appState.setFrontSubsCfg(prev => ({ ...prev, count: Number(v) }))
                      }
                    }}
                    disabled={!frontSubsCfg?.model}
                  >
                    <SelectTrigger className="h-10 w-[90px] px-3 justify-between bg-white border-[#DCDBD6]">
                      <SelectValue placeholder="0" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {subWarnings?.front?.length > 0 && (
                <div className="mt-2 text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200">
                  {subWarnings.front[0]}
                </div>
              )}
            </div>

            <div className="col-span-12 md:col-span-6">
              <h4 className="text-[15px] font-semibold text-[#1B1A1A] mb-2">Rear Subwoofers</h4>
              <div className="grid grid-cols-12 items-end gap-x-3 gap-y-2">
                <label className="col-span-7 text-[12px] text-[#625143]">Model</label>
                <label className="col-span-5 text-[12px] text-[#625143]">Quantity</label>

                <div className="col-span-7">
                  <Select
                    value={rearSubsCfg?.model ?? ""}
                    onValueChange={(model) => {
                      if (appState?.setRearSubsCfg) {
                        appState.setRearSubsCfg(prev => ({ ...prev, model }))
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 w-full px-3 justify-between bg-white border-[#DCDBD6]">
                      <SelectValue placeholder="Select model" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>No Subwoofer</SelectItem>
                      <SelectItem value="SUB2-12">SUB2-12</SelectItem>
                      <SelectItem value="SUB3-12">SUB3-12</SelectItem>
                      <SelectItem value="SUB4-12">SUB4-12</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-5">
                  <Select
                    value={String(rearSubsCfg?.count ?? 0)}
                    onValueChange={(v) => {
                      if (appState?.setRearSubsCfg) {
                        appState.setRearSubsCfg(prev => ({ ...prev, count: Number(v) }))
                      }
                    }}
                    disabled={!rearSubsCfg?.model}
                  >
                    <SelectTrigger className="h-10 w-[90px] px-3 justify-between bg-white border-[#DCDBD6]">
                      <SelectValue placeholder="0" className="text-2xl font-semibold" style={{ color: "#213428" }} />
                    </SelectTrigger>
                    <SelectContent align="end" className="w-[64px]">
                      <SelectItem value="0">0</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {subWarnings?.rear?.length > 0 && (
                <div className="mt-2 text-xs px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200">
                  {subWarnings.rear[0]}
                </div>
              )}
            </div>


          </div>
        </div>
      </CollapsiblePanel>
    </div>
  );
}

export default function SpeakerPlacement(props) {
  const { extraSurroundCount, onExtraSurroundCountChange, allowExtraSurrounds, ...restProps } = props;
  
  return (
    <SpeakerPlacementImpl 
      {...restProps}
      extraSurroundCount={extraSurroundCount}
      onExtraSurroundCountChange={onExtraSurroundCountChange}
      allowExtraSurrounds={allowExtraSurrounds}
    />
  );
}