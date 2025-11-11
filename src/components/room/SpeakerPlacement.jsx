
"use client";

import React, { useMemo, useState, Suspense, useEffect, useCallback, useRef } from 'react';
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
import { getSpeakerModelMeta, getModelsByCategoryOrdered } from "@/components/models/speakers/registry";
import { safeComputeLcrSpl } from '@/components/utils/splMathSafe';
import SurroundsSelector from '../speakers/SurroundsSelector';
import OverheadChannelSelector from '@/components/speakers/OverheadChannelSelector';
import { calibratedSplAtSeat, euclideanDistance } from "@/components/utils/splMath";
import { timeNowMs } from "@/components/utils/timeNow";
import AmplifierPowerSelector from '@/components/spl/AmplifierPowerSelector';
import EqHeadroomSelector from '@/components/spl/EqHeadroomSelector';
import LcrSplCard from '@/components/speakers/LcrSplCard';
import { rolesForLayout } from "@/components/utils/surroundRoleMap";

// RP22 P12 thresholds (strict)
const P12_THRESHOLDS = { L1: 102, L2: 105, L3: 108, L4: 111 };

// RP22 P13 thresholds (strict)
const P13_THRESHOLDS = { L1: 99, L2: 102, L3: 105, L4: 108 };

// --- Canonical role mapping + helpers ---
const CANONICAL_ROLE_MAP = {
  // Sides
  SL:"SL", LS:"SL",

  SR:"SR", RS:"SR",

  // Rears
  SBL:"SBL", RL:"SBL", RSL:"SBL", LR:"SBL", LRS:"SBL",
  SBR:"SBR", RR:"SBR", RSR:"SBR", RRS:"SBR",

  // Wides
  LW:"LW", FWL:"LW",
  RW:"RW", FWR:"RW",

  // Overheads
  TFL:"TFL",
  TFR:"TFR",
  TL:"TL", TML:"TL", // Top Middle Left
  TR:"TR", TMR:"TR", // Top Middle Right
  TBL:"TBL",
  TBR:"TBR",

  // LCR
  FL:"FL", L:"FL",
  FC:"FC", C:"FC",
  FR:"FR", R:"FR",
};

// Function to get the canonical role for any given role string (alias or canonical).
function getCanonicalRole(role) {
  return CANONICAL_ROLE_MAP[String(role || "").toUpperCase()] || String(role || "").toUpperCase();
}

// Build a reverse map from canonical role to all its aliases for easy lookup.
const CANONICAL_TO_ALIASES_MAP = new Map();
for (const alias in CANONICAL_ROLE_MAP) {
    const canonical = CANONICAL_ROLE_MAP[alias];
    if (!CANONICAL_TO_ALIASES_MAP.has(canonical)) {
        CANONICAL_TO_ALIASES_MAP.set(canonical, new Set());
    }
    CANONICAL_TO_ALIASES_MAP.get(canonical).add(alias);
}

// Function to get all known aliases for a given role (canonical or alias).
// Returns an array including the canonical role and all its defined synonyms.
function allAliases(role) {
    const canonical = getCanonicalRole(role); // Use getCanonicalRole here
    return Array.from(CANONICAL_TO_ALIASES_MAP.get(canonical) || new Set([String(role || "").toUpperCase()]));
}

// Helper to find a speaker object from a `byRoleMap` using any of its potential aliased roles.
function getByAnyRole(aliases, byRoleMap) {
    for (const alias of aliases) {
        const speaker = byRoleMap.get(alias);
        if (speaker) return speaker;
    }
    return null;
}

// Apply a model to a set of speaker roles immutably, considering role aliases for matching.
// `preferredRoles` are the roles that define the group (e.g., ["SL", "SR"],
// and the function will match any speaker whose role's canonical form matches one of these.
function applyModelToAnyRoles(list, preferredRoles, model) {
  const targets = new Set(preferredRoles.map(getCanonicalRole));
  return (Array.isArray(list) ? list : []).map(s => {
    const canon = getCanonicalRole(s.role);
    return targets.has(canon) ? { ...s, model } : s;
  });
}

// Apply a model to ALL bed-surrounds (SL, SR, SBL, SBR, LW, RW)
// This function might become less used if controls are more granular, but useful for broad resets.
function applyToAllSurrounds(prev, model) {
  const BED_SURROUND = new Set(["SL","SR","SBL","SBR","LW","RW"]);
  return (Array.isArray(prev)? prev: []).map(s => {
    const canon = getCanonicalRole(s.role);
    return BED_SURROUND.has(canon) ? { ...s, model } : s;
  });
}

// Safe debug logging function
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
// --- END GLOBAL UTILITY FUNCTIONS ---

// Helper to build role map that indexes both raw and canonical
function buildRoleMap(list) {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((s) => {
    const raw = String(s.role || "").toUpperCase();
    const canon = getCanonicalRole(raw);
    m.set(raw, s);
    m.set(canon, s); // Also map by canonical role, without redundant `if (canon)`
  });
  return m;
}

// Helper angle conversion
const degToRad = (deg) => (deg * Math.PI) / 180;

// Cast a ray from MLP at angleDeg and find first intersection with room rectangle
function projectToWallFromMLP(mlpX, mlpY, angleDeg, room) {
  const angle = degToRad(angleDeg);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const margin = 0.01;

  let t = Infinity;

  // left wall
  if (dx < 0) t = Math.min(t, (room.left + margin - mlpX) / dx);
  // right wall
  if (dx > 0) t = Math.min(t, (room.right - margin - mlpX) / dx);
  // front wall (screen)
  if (dy < 0) t = Math.min(t, (room.front + margin - mlpY) / dy);
  // back wall
  if (dy > 0) t = Math.min(t, (room.back - margin - mlpY) / dy);

  if (!isFinite(t) || t <= 0) {
    return { x: mlpX, y: mlpY }; // safe fallback
  }

  return {
    x: mlpX + dx * t,
    y: mlpY + dy * t,
  };
}

// Helper to ensure a speaker object exists for a role
function ensureSpeaker(spk, role) {
  return spk && spk.role === role
    ? spk
    : { id: `${role}-${Date.now()}`, role };
}

// Proper angle calculation for LCR aiming
function yawDegToMLP(spkPos, mlpPos) {
  const dx = mlpPos.x - spkPos.x;
  const dy = mlpPos.y - spkPos.y; // MLP deeper (+y)
  const yawRad = Math.atan2(dx, dy); // reference is -Y
  return yawRad * 180 / Math.PI;     // +ve turns *inwards* on the left, -ve on the right
}

// Apply LCR aiming rotation
function applyLcrAim(placedSpeakers, mlpPoint, mode /* "flat"|"angled" */) {
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
    // use Y for yaw in a right-handed XYZ
    return { ...s, rotation: { ...(s.rotation||{}), y: angle } };
  });
}

// Canonical list of surround roles (no heights, no LCR)
const ALL_SURROUND_ROLES = new Set(["SL","SR","SBL","SBR","LW","RW"]);

// Convert const helpers to function declarations (fixes TDZ/hoisting issues)
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
  return 4; // Should not happen for valid inputs
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

// Safe console helper for logging
function safeLog(label, data) {
  if (typeof console !== 'undefined' && typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(label);
    if (typeof console.table === 'function' && data) console.table(data);
    if (typeof console.groupEnd === 'function') console.groupEnd();
  } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log(label, data || '');
  }
}

// Helper function to calculate the best possible max SPL at 1m.
// It considers sensitivity, max power handling, and any excursion-limited SPL.
function bestMaxSPL1m({ sensitivity_dB_1W1m, max_power_W, excursionMax1m }) {
  const sens = safeNum(sensitivity_dB_1W1m);
  const maxW = safeNum(max_power_W);
  const xMax = safeNum(excursionMax1m);

  let powerCalc = 0;
  if (sens > 0 && maxW > 0) {
    powerCalc = sens + 10 * Math.log10(maxW);
  }

  // If excursion limit is provided and it's lower than the power calculation, it's the true limit.
  if (xMax > 0 && (xMax < powerCalc || powerCalc === 0)) {
    return xMax;
  }
  return powerCalc;
}

// --- Stable, sticky whole-dB readout for SPL cards.
// – median window
// – exponential smoothing
// – symmetric hysteresis (up + down)
// – consecutive confirmations before committing a step
function useStickyDb(rawValue, opts = {}) {
  const windowSize = opts.windowSize ?? 9;            // odd number for median
  const alpha = opts.alpha ?? 0.35;                   // 0..1 (higher = more responsive)
  const upMargin = opts.upMargin ?? 0.40;             // need this much above next integer to step up
  const downMargin = opts.downMargin ?? 0.60;         // need this much below prev integer to step down
  const upConsecutive = opts.upConsecutive ?? 2;      // consecutive frames to confirm an up step
  const downConsecutive = opts.downConsecutive ?? 3;  // consecutive frames to confirm a down step

  const bufRef = useRef([]); // Buffer for raw values
  const smoothRef = useRef(0); // Ref for the exponentially smoothed value
  const shownRef = useRef(0); // Ref for the final stable dB value that is displayed
  const upCountRef = useRef(0); // Counter for upward confirmations
  const downCountRef = useRef(0); // Counter for downward confirmations

  // State to hold the current median value calculated from the buffer.
  const [currentMedian, setCurrentMedian] = useState(0);

  // Effect to manage the buffer (pushing rawValue) and compute current median.
  useEffect(() => {
    const b = bufRef.current;

    // Only push if finite; otherwise, ignore for median calculation
    if (Number.isFinite(rawValue)) {
      b.push(rawValue);
    }
    // Maintain window size
    if (b.length > windowSize) {
      b.shift();
    }

    // Compute median from the current buffer
    const sortedBuffer = b.slice().sort((a, b) => a - b);
    const n = sortedBuffer.length;
    let newMedian = 0;
    if (n > 0) {
      const mid = Math.floor(n / 2);
      newMedian = n % 2 ? sortedBuffer[mid] : (sortedBuffer[mid - 1] + sortedBuffer[mid]) / 2;
    }
    setCurrentMedian(newMedian); // Update state
  }, [rawValue, windowSize]); // Dependencies for buffer management and median calculation

  // Exponential smoothing calculation based on `currentMedian`.
  const smoothed = useMemo(() => {
    // If rawValue is not finite, reset smoothing and median for a clean start when valid data returns.
    if (!Number.isFinite(rawValue)) {
        smoothRef.current = 0; // Reset smoothing accumulator
        return 0; // Return 0, which SplBox will render as "—"
    }
    const prev = smoothRef.current;
    // Initialize smoothing if it's the first valid median or reset needed.
    const next = (prev === 0 && currentMedian === 0) ? 0 : (prev === 0 ? currentMedian : (alpha * currentMedian + (1 - alpha) * prev));
    smoothRef.current = next; // Update the ref for the next iteration
    return next;
  }, [currentMedian, alpha, rawValue]); // rawValue as dependency to reset smoothing if it becomes invalid

  // Candidate using CEIL, derived from `smoothed`.
  const candidate = useMemo(() => Math.ceil(smoothed), [smoothed]);

  // Effect to apply hysteresis and update the final stable displayed value.
  useEffect(() => {
    const currentShown = shownRef.current; // Get current displayed value from ref for comparison

    if (!Number.isFinite(rawValue) || smoothed === 0) {
        if (shownRef.current !== 0) shownRef.current = 0;
        upCountRef.current = 0;
        downCountRef.current = 0;
        return;
    }

    // STEP UP: only if clearly beyond next integer + margin, for enough frames
    if (smoothed >= (currentShown + 1) + upMargin) {
      upCountRef.current += 1;
      if (upCountRef.current >= upConsecutive) {
        shownRef.current = Math.max(currentShown + 1, candidate); // Ensure non-decreasing jump, but no more than candidate
        upCountRef.current = 0;
        downCountRef.current = 0;
      }
    } else {
      upCountRef.current = 0; // Reset counter if condition not met
    }

    // STEP DOWN: only if clearly below previous integer − margin, for enough frames
    if (smoothed <= (currentShown - 1) - downMargin) {
      downCountRef.current += 1;
      if (downCountRef.current >= downConsecutive) {
        shownRef.current = Math.min(currentShown - 1, candidate); // Ensure non-decreasing jump, but no less than candidate
        downCountRef.current = 0;
        upCountRef.current = 0;
      }
    } else {
      downCountRef.current = 0; // Reset counter if condition not met
    }

  }, [smoothed, candidate, upMargin, downMargin, upConsecutive, downConsecutive, rawValue]);

  return shownRef.current;
}


const splCardStyles = {
  card: {
    border: "1px solid #E6E4DD",
    borderRadius: 12,
    padding: 16,
    background: "#fff",
  },
  title: {
    fontSize: 16,
    lineHeight: "22px",
    color: "#3E4349",
    marginBottom: 6,
  },
  value: {
    fontSize: 40,
    lineHeight: "40px",
    fontWeight: 700,
    color: "#1B1A1A",
  },
  foot: {
    fontSize: 12, // same as footnote text
    lineHeight: "16px",
    color: "#61656B",
    marginTop: 6,
  },
  boldFoot: {
    fontSize: 12,
    lineHeight: "16px",
    color: "#1B1A1A",
    marginTop: 6,
    fontWeight: 700, // requested BOLD for the RP22 reference line
  },
};

export function SplBox({ channel, rawDb }) {
  // rawDb is the full-calculation result (unchanged math)
  const fullDb = useStickyDb(rawDb);        // stable WHOLE-dB as before
  const displayDb = Math.max(0, fullDb - 6); // headline shows -6 dB

  const level = rp22P12Level(displayDb); // RP22 level is based on the -6 dB working number

  return (
    <div style={splCardStyles.card}>
      <div style={splCardStyles.title}>{prettyChannel(channel)}</div>

      {/* HEADLINE: minus 6 dB */}
      <div style={splCardStyles.value}>{displayDb > 0 ? `${displayDb} dB` : '—'}</div>

      {/* MOVE CURRENT READING UNDER THE NUMBER */}
      <div style={splCardStyles.foot}>
        Maximum SPL @ MLP: {fullDb > 0 ? `${fullDb} dB` : '—'}
      </div>

      {/* RP22 P12 REFERENCE + LEVEL */}
      <div style={splCardStyles.boldFoot}>RP22 P12 Level {level > 0 ? level : "—"}</div>

      {/* Full RP22 text with "post calibration EQ" in bold only */}
      <div style={splCardStyles.foot}>
        12. Screen speakers SPL capability at RSP (
        <span style={{ fontWeight: 700 }}>post calibration EQ</span>, within assigned bandwidth)
        without clipping — dB SPL (C). Thresholds: L1 102, L2 105, L3 108, L4 111
      </div>
    </div>
  );
}

// RP22 P13 SPL card (stable readout, -6 dB headline)
export function SplBoxP13({ title, rawDbFull }) {
  const fullDb = useStickyDb(rawDbFull);
  const displayDb = Math.max(0, fullDb - 6);
  const level = rp22P13Level(displayDb);
  return (
    <div style={splCardStyles.card}>
      <div style={splCardStyles.title}>{title}</div>
      <div style={splCardStyles.value}>{displayDb > 0 ? `${displayDb} dB` : '—'}</div>
      <div style={splCardStyles.foot}>Maximum SPL @ MLP: {fullDb > 0 ? `${fullDb} dB` : '—'}</div>
      <div style={splCardStyles.boldFoot}>RP22 P13 Level {level > 0 ? level : "—"}</div>
      <div style={splCardStyles.foot}>
        RP22 P13. Non-screen speakers SPL capability at RSP (
        <span style={{ fontWeight: 700 }}>post calibration EQ</span> within assigned bandwidth) without clipping
        (includes amplifier headroom) — dB SPL (C). Thresholds: L1 99, L2 102, L3 105, L4 108
      </div>
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

  // 5.x: only sides required
  if (major === 5) return groups.map(g =>
    g.key === "sides" ? { ...g, required: true } : { ...g, required: false });

  // 7.x: either rears OR wides depending on toggle
  if (major === 7) {
    const wantWides = false; // This was a hardcoded `false` before, now it's derived from `useWidesInsteadOfRears` in parent
    return groups.map(g => {
      if (g.key === "sides") return { ...g, required: true }; // Sides always required for 7.x
      if (g.key === "rears") return { ...g, required: !wantWides };
      if (g.key === "wides") return { ...g, required: wantWides };
      return g;
    });
  }

  // 9.x+: sides + rears + wides all required
  if (major >= 9) return groups.map(g => ({ ...g, required: true }));

  return groups;
}

// Overhead groups by .2 / .4 / .6 (always visible; mark required accordingly)
function getOverheadGroups(dolbyPreset) {
  const parts = String(dolbyPreset || "").split(".");
  const overheadCount = Number(parts[2] || 0);

  const base = [
    { key: "oh-front",  label: "Front Overhead",  roles: ["TFL", "TFR"], required: false },
    { key: "oh-middle", label: "Middle Overhead", roles: ["TL", "TR"],   required: false },
    { key: "oh-rear",   label: "Rear Overhead",   roles: ["TBL", "TBR"], required: false },
  ];

  if (overheadCount >= 6) {
    return base.map(g => ({ ...g, required: true }));
  }
  if (overheadCount === 4) {
    return base.map(g =>
      g.key === "oh-front" || g.key === "oh-rear"
        ? { ...g, required: true }
        : { ...g, required: false }
    );
  }
  if (overheadCount === 2) {
    return base.map(g =>
      g.key === "oh-middle" ? { ...g, required: true } : { ...g, required: false }
    );
  }
  return base; // none required, all shown as not required
}

// Small inline UI bits
const groupHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0" };
const noteStyle = { fontSize: 12, color: "#8a8e93", marginLeft: 8 };
const rowStyle = { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 12 };

// applyLcrModel — single model applied across FL/FC/FR
const LCR_ROLES = new Set(["FL", "FC", "FR"]);

export function applyLcrModel(placed, model) {
  if (!Array.isArray(placed)) return Array.isArray(placed) ? placed : [];
  return placed.map((spk) => {
    const role = String(spk?.role || "").toUpperCase();
    if (LCR_ROLES.has(role)) return { ...spk, model };
    return spk;
  });
}

// optional alias if a different casing was used elsewhere
export const applyLCRModel = applyLcrModel;

// Move ROLE_TO_KEY outside component since it's constant
const ROLE_TO_KEY = new Map([
  ["FL", "L"],
  ["FC", "C"],
  ["FR", "R"],
]);

// --- rear-only canonical + alias matchers
const REAR_CANON = new Set(["SBL", "SBR"]);
const REAR_ALIASES = new Set([
  "SBL","SBR","RL","RR","RSL","RSR","LR","LRS","RRS","LB","RB"
]);

const isRearByAnyRole = (role) => {
  const r = String(role||"").toUpperCase();
  return REAR_ALIASES.has(r) || REAR_CANON.has(getCanonicalRole(r));
};

/* === Unified Surrounds Configuration === */
function UnifiedSurroundsConfig({
  placedSpeakers,
  setSpeakers,
  mlpPoint, // USE THIS PROP INSTEAD OF COMPUTING
  dolbyPreset,
  sevenBedLayoutType, // ADDED PROP
  dimensions,
  getHuggingCenterLines,
  applyCornerClearance,
  applyRoomBoundsClamp,
  disabled,
  allowedRoles, // NEW
  canSides,     // NEW
  canRears,     // NEW
  canWides,     // NEW
  is7xOrHigher, // NEW, passed from parent
  safePos,      // NEW: passed from parent
}) {
  // `activeRoles` should represent what speaker *types* are conceptually active for this layout.
  // This is now directly derived from `allowedRoles`.
  const activeRoles = useMemo(() => {
    const roles = [];
    if (allowedRoles.has('SL')) roles.push('SL', 'SR');
    if (allowedRoles.has('SBL')) roles.push('SBL', 'SBR');
    if (allowedRoles.has('LW')) roles.push('LW', 'RW');
    return roles;
  }, [allowedRoles]);

  // Log on render
  // console.log('[FW UI]', { canSides, canRears, canWides, allowedRoles: Array.from(allowedRoles), activeRoles });

  // Helper to index speakers by canonical role
  const indexByCanonicalRole = useCallback((speakers) => {
    const map = {};
    (speakers || []).forEach(s => {
      const canon = getCanonicalRole(s.role);
      map[canon] = s;
    });
    return map;
  }, []);

  const speakersByRole = useMemo(() => indexByCanonicalRole(placedSpeakers), [placedSpeakers, indexByCanonicalRole]);
  const modelOf = useCallback((r) => speakersByRole[r]?.model ?? 'off', [speakersByRole]);

  // Helper to get current models from speaker list with canonical role mapping
  const getCurrentSurroundModels = useCallback(() => {
    let currentSideModel = 'off';
    let currentRearModel = 'off';
    let currentWideModel = 'off';

    if (canSides) {
      currentSideModel = modelOf('SL');
    }
    if (canRears) {
      currentRearModel = modelOf('SBL');
    }
    if (canWides) {
      currentWideModel = modelOf('LW');
    }

    // Master model should be the most prevalent or the side one if others are off
    const masterModel = currentSideModel !== 'off' ? currentSideModel :
                        (currentRearModel !== 'off' ? currentRearModel :
                        (currentWideModel !== 'off' ? currentWideModel : 'off'));

    return {
      master: masterModel,
      side: currentSideModel,
      rear: currentRearModel,
      wide: currentWideModel,
    };
  }, [modelOf, canSides, canRears, canWides]);
  
  // Initialize surroundConfig state
  const [surroundConfig, setSurroundConfig] = useState(() => {
    const models = getCurrentSurroundModels();
    return {
      value: models,
      override: { side: false, rear: false, wide: false },
    };
  });
  
  // Update state when underlying speakers or config changes
  useEffect(() => {
    const models = getCurrentSurroundModels();
    if (surroundConfig.value.side !== models.side ||
        surroundConfig.value.rear !== models.rear ||
        surroundConfig.value.wide !== models.wide ||
        surroundConfig.value.master !== models.master) {
        setSurroundConfig(prev => ({
            ...prev,
            value: models
        }));
    }
  }, [getCurrentSurroundModels, surroundConfig.value]);

  // Helper to get default positions for rear surrounds using the new pipeline
  const getRearSurroundDefaultPositions = useCallback(() => {
    if (!dimensions || !mlpPoint) return {};

    // These angles should now be Dolby angles (0=front, +CCW)
    const sblDolbyAngle = 142.5; // Rear Left
    const sbrDolbyAngle = -142.5; // Rear Right
    
    const defaultModel = 'off'; // A dummy model to get dimensions/hugging for calculation
    const WALL_BUFFER_M = 0.01;

    // This internal rayCast needs to use the projectToWallFromMLP logic now
    const internalRayCast = (dolbyAngle, mlpPt, roomDims) => {
        // Convert Dolby angle (0=front, +CCW) to projectToWallFromMLP angle (0=+X, 90=+Y)
        const projectAngleDeg = (270 - dolbyAngle + 360) % 360;
        const room = {
            left: 0,
            right: roomDims.width,
            front: 0,
            back: roomDims.length
        };
        return projectToWallFromMLP(mlpPt.x, mlpPt.y, projectAngleDeg, room);
    };
    
    let sblPos = internalRayCast(sblDolbyAngle, mlpPoint, dimensions);
    const hugging = getHuggingCenterLines(defaultModel, dimensions);
    sblPos.y = hugging.backWallY; // Snap to back wall
    sblPos = applyCornerClearance(sblPos, 'SBL', defaultModel, dimensions, {});
    sblPos = applyRoomBoundsClamp(sblPos, defaultModel, dimensions); 

    let sbrPos = internalRayCast(sbrDolbyAngle, mlpPoint, dimensions);
    sbrPos.y = hugging.backWallY; // Snap to back wall
    sbrPos = applyCornerClearance(sbrPos, 'SBR', defaultModel, dimensions, {}); 
    sbrPos = applyRoomBoundsClamp(sbrPos, defaultModel, dimensions);

    return {
      SBL: { x: sblPos.x, y: sblPos.y, z: 1.1 },
      SBR: { x: sbrPos.x, y: sbrPos.y, z: 1.1 }
    };
  }, [dimensions, mlpPoint, getHuggingCenterLines, applyCornerClearance, applyRoomBoundsClamp]);
  
  // Handler for SurroundsSelector onChange
  const handleSurroundModelChange = useCallback((config) => {
    const safeConfig = {
      value: {
        master: String(config?.value?.master || 'off'),
        side: String(config?.value?.side || 'off'),
        rear: String(config?.value?.rear || 'off'),
        wide: String(config?.value?.wide || 'off')
      },
      override: {
        side: !!config?.override?.side,
        rear: !!config?.override?.rear,
        wide: !!config?.override?.wide
      }
    };

    // console.log('[FW UI] onChange ->', safeConfig);
    setSurroundConfig(safeConfig);
    
    const { value, override } = safeConfig;

    // No longer manipulating enableFrontWides directly from here.
    // The parent component's `useWidesInsteadOfRears` switch drives `allowedRoles`.
    
    const effectiveSide = override.side ? value.side : value.master;
    const effectiveRearSelectedByUser = override.rear ? value.rear : value.master;
    const effectiveWideSelectedByUser = override.wide ? value.wide : value.master;

    setSpeakers(prev => {
      // console.log('[FW UI] onChange before=', prev);
      
      const speakerMap = new Map((prev || []).map(s => [getCanonicalRole(s.role), s]));
      const WALL_BUFFER_M = 0.01;

      // This internal calculateDefaultPosition now uses projectToWallFromMLP
      const calculateDefaultPosition = (dolbyAngleDegrees, mlpPt, roomDims) => {
        // Convert Dolby angle (0=front, +CCW) to projectToWallFromMLP angle (0=+X, 90=+Y)
        const projectAngleDeg = (270 - dolbyAngleDegrees + 360) % 360;
        const room = {
            left: 0,
            right: roomDims.width,
            front: 0,
            back: roomDims.length
        };
        return projectToWallFromMLP(mlpPt.x, mlpPt.y, projectAngleDeg, room);
      };

      const processRole = (role, nextModel, defaultPos = null) => {
        const safeModel = typeof nextModel === 'string' ? nextModel.trim() : String(nextModel || 'off').trim();
        
        const canon = getCanonicalRole(role);
        // Only process if the role is NOT required by the current layout configuration
        if (!allowedRoles.has(canon)) {
          speakerMap.delete(canon); // Ensure it's removed if it somehow ended up there
          return;
        }

        const existingSpeaker = speakerMap.get(canon);
        
        if (safeModel === 'off' || !safeModel) {
          // If this role is NOT required by the current layout, remove it.
          if (!allowedRoles.has(canon)) {
            speakerMap.delete(canon);
          } else {
            // If layout expects this role (e.g. SBL/SBR in 7.1),
            // keep the speaker entry but clear its model.
            const existing = speakerMap.get(canon);
            if (existing) {
              speakerMap.set(canon, { ...existing, model: null });
            }
          }
        } else {
          // Valid model chosen → ensure speaker exists + positioned
          let position = existingSpeaker?.position || defaultPos;

          if (!position && mlpPoint && dimensions) {
            let dolbyAngleDegrees; // Use Dolby angles here (0=front, +CCW)
            switch (canon) {
              case 'SBL': dolbyAngleDegrees = 142.5; break;
              case 'SBR': dolbyAngleDegrees = -142.5; break;
              case 'SL':  dolbyAngleDegrees = 90;  break; // Dolby side left
              case 'SR':  dolbyAngleDegrees = -90;   break; // Dolby side right
              case 'LW':  dolbyAngleDegrees = 60;   break; // Dolby front wide left
              case 'RW':  dolbyAngleDegrees = -60;    break; // Dolby front wide right
              default:    dolbyAngleDegrees = 0; // Should not happen for these roles
            }
            position = calculateDefaultPosition(dolbyAngleDegrees, mlpPoint, dimensions);
          }

          // 🔐 clamp out any NaNs
          position = safePos(position, mlpPoint);

          speakerMap.set(canon, {
            ...(existingSpeaker || {}),
            role: canon,
            id: existingSpeaker?.id || `${canon}-${timeNowMs()}`,
            draggable: true,
            model: safeModel,
            position,
            rotation: existingSpeaker?.rotation || { x: 0, y: 0, z: 0 },
          });
        }
      };

      // Process roles conditionally based on `canSides`, `canRears`, `canWides`
      if (canSides) {
        processRole('SL', effectiveSide);
        processRole('SR', effectiveSide);
      } else {
        speakerMap.delete('SL');
        speakerMap.delete('SR');
      }
      
      if (canRears) {
        const defaultPositions = getRearSurroundDefaultPositions();
        processRole('SBL', effectiveRearSelectedByUser, defaultPositions?.SBL);
        processRole('SBR', effectiveRearSelectedByUser, defaultPositions?.SBR);
      } else {
        speakerMap.delete('SBL');
        speakerMap.delete('SBR');
      }
      
      if (canWides) {
        processRole('LW', effectiveWideSelectedByUser);
        processRole('RW', effectiveWideSelectedByUser);
      } else {
        speakerMap.delete('LW');
        speakerMap.delete('RW');
      }

      const next = Array.from(speakerMap.values());
      // console.log('[FW UI] onChange after=', next);
      return next;
    });
  }, [setSurroundConfig, setSpeakers, getRearSurroundDefaultPositions, mlpPoint, dimensions, allowedRoles, canSides, canRears, canWides, safePos]); // Added safePos to dependencies

  // Auto-apply master surround model to new surrounds without a model
  useEffect(() => {
    const master = surroundConfig?.value?.master;
    if (!master || master === 'off') return;

    setSpeakers(prev => {
      let changed = false;
      const next = (Array.isArray(prev) ? prev : []).map(s => {
        const role = String(s?.role || "").toUpperCase();
        const canon = getCanonicalRole(role);
        const isBedSurround = ALL_SURROUND_ROLES.has(canon); // Use the pre-defined ALL_SURROUND_ROLES
        
        if (isBedSurround && !s.model && allowedRoles.has(canon)) { // Only apply if role is allowed
          changed = true;
          return { ...s, model: master };
        }
        return s;
      });
      return changed ? next : prev;
    });
  }, [surroundConfig?.value?.master, setSpeakers, allowedRoles]);
  
  const surroundChoices = useMemo(() => {
    const byCat = getModelsByCategoryOrdered();
    const surrounds = byCat['SURROUNDS'] || [];
    return [
      { value: 'off', label: 'Off' },
      ...surrounds.map(s => ({ value: s.key, label: s.label }))
    ];
  }, []);

  return (
    <div className="space-y-3 p-2">
      <SurroundsSelector
        layout={dolbyPreset} // Pass original dolbyPreset
        choices={surroundChoices}
        value={surroundConfig.value}
        override={surroundConfig.override}
        onChange={handleSurroundModelChange}
        activeRoles={activeRoles} // This is used by SurroundsSelector internally to highlight active selectors.
        canSides={canSides} // NEW
        canRears={canRears} // NEW
        canWides={canWides} // NEW
        disabled={disabled}
      />
    </div>
  );
}

const MemoizedUnifiedSurroundsConfig = React.memo(UnifiedSurroundsConfig);


/* === OVERHEADS (RP22 P13) === */
function OverheadsSection({
  placedSpeakers,
  setSpeakers,
  mlpPoint,
  dolbyPreset,
}) {
  const { ARCHITECT: architectModelOptions } = getModelsByCategoryOrdered();

  const groups = React.useMemo(
    () => getOverheadGroups(dolbyPreset),
    [dolbyPreset]
  );

  const byRole = React.useMemo(() => {
    const m = new Map();
    (Array.isArray(placedSpeakers) ? placedSpeakers : []).forEach((s) =>
      m.set(String(s.role || "").toUpperCase(), s)
    );
    return m;
  }, [placedSpeakers]);

  const calc = React.useCallback(
    (spk) => {
      if (!spk || !spk.model) return null;
      
      const modelMeta = getSpeakerModelMeta(spk.model);
      
      let ceiling1m;
      // If it's an Architect model and metadata doesn't provide max_spl, use fallback
      if (architectModelOptions.some(m => m.label === spk.model) && (!modelMeta || !Number.isFinite(modelMeta.max_spl))) {
        ceiling1m = 105; // Placeholder SPL for Architect models, as per original logic
      } else if (modelMeta) {
        const sens = safeNum(modelMeta.sensitivity);
        const maxW = safeNum(modelMeta.max_power);
        const xMax1m = safeNum(modelMeta.max_spl);

        ceiling1m = bestMaxSPL1m({
          sensitivity_dB_1W1m: sens,
          max_power_W: maxW,
          excursionMax1m: xMax1m
        });
      } else {
        return null; // No metadata and not a special Architect fallback case
      }

      const dz = Number.isFinite(spk.position?.z) && Number.isFinite(mlpPoint.z) ? (spk.position.z - mlpPoint.z) : 0;
      const d = Math.hypot((spk.position.x - mlpPoint.x), (spk.position.y - mlpPoint.y), dz);
      return (Number.isFinite(d) && Number.isFinite(ceiling1m)) ? ceilDb(splAtDistanceFrom1m(ceiling1m, d)) : null;
    },
    [mlpPoint, architectModelOptions]
  );

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1B1A1A", marginBottom: 6 }}>Overheads</div>

      {groups.map((g) => { // SHOW ALL; disable when not required
        // Use getByAnyRole and allAliases to robustly infer the current model
        const leftModel  = getByAnyRole(allAliases(g.roles[0]), byRole)?.model || "";
        const rightModel = getByAnyRole(allAliases(g.roles[1]), byRole)?.model || "";
        const currentModel = leftModel && rightModel && leftModel === rightModel ? leftModel : "";

        return (
          <div key={g.key} style={{ marginBottom: 12 }}>
            <div style={groupHeaderStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#3E4349" }}>{g.label}</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {!g.required && <span style={noteStyle}>not required in this layout</span>}
                <div style={{ width: 260, marginLeft: 10 }}>
                  <Select
                    value={currentModel || undefined}
                    onValueChange={(v) => {
                      // Use the alias-aware applyModelToAnyRoles here
                      setSpeakers(prev => applyModelToAnyRoles(prev, g.roles, v));
                    }}
                    disabled={!g.required}
                  >
                    <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
                      <SelectValue placeholder="Choose overhead model" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[#DCDBD6]">
                      {architectModelOptions.map((m) => (
                        <SelectItem
                          key={m.key}
                          value={m.label}
                          className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]"
                        >
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div style={rowStyle}>
              {/* Use getByAnyRole and allAliases for SPL calculation */}
              <SplBoxP13 title={`${g.label} — Left`}  rawDbFull={calc(getByAnyRole(allAliases(g.roles[0]), byRole))} />
              <SplBoxP13 title={`${g.label} — Right`} rawDbFull={calc(getByAnyRole(allAliases(g.roles[1]), byRole))} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ensure LCR speakers exist when selecting a model - atomic and unique
function ensureLcrWhenSelectingModel(modelLabel, dimensions, setSpeakers) {
  setSpeakers(prev => {
    const list = Array.isArray(prev) ? prev : [];
    const by   = buildRoleMap(list);

    // Remove ALL existing LCR (raw & any dupes) first
    const LCR_ROLES_SET = new Set(["FL","FC","FR"]); // Using a local set for clarity
    const filtered = list.filter(s => !LCR_ROLES_SET.has(getCanonicalRole(s.role)));

    const roomW = Number(dimensions?.width)  || 4.5;
    const roomH = Number(dimensions?.height) || 2.8;

    // Basic geometry defaults (front wall at y=0; speakers face +y when flat)
    const defaultY = 0.20;         // baffle ~ to front wall
    const defaultZ = roomH * 0.5;  // mid height
    const spread   = Math.min(1.2, roomW * 0.22); // 1.2m or ~22% width

    // Keep prior positions if present; otherwise seed deterministic ones
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

// Drop-in replacement LCR component
function LCRPanel({ setSpeakers, dimensions, lcrAimMode, onChangeLcrAimMode, lcrAngleDeg, mlpPoint, disabled }) {
  const { speakerSystem, setScreen, splConfig, updateGlobalSpl } = useAppState();
  const { LCR: lcrModelOptions } = getModelsByCategoryOrdered();

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

  const [lcrModel, setLcrModel] = useState(initialModel);
  // Removed selectedLcrRole state as it's no longer used for individual card selection

  useEffect(() => {
    if (initialModel && initialModel !== lcrModel) setLcrModel(initialModel);
  }, [initialModel, lcrModel]);

  const onChooseModel = useCallback((modelLabel) => {
    if (!lcrModelOptions.some(opt => opt.label === modelLabel)) return;
    setLcrModel(modelLabel);
    ensureLcrWhenSelectingModel(modelLabel, dimensions, setSpeakers);
  }, [dimensions, setSpeakers, lcrModelOptions]);

  // Removed lcrSplAtMlp useMemo and its useEffect that calls setScreen,
  // as SPL calculation and display are now handled by LcrSplCard and
  // global screen state P12/P4 values should be derived upstream if needed.

  const angled = lcrAimMode === "angled";

  return (
    <div className="space-y-2 p-2">
      {/* Global SPL Controls */}
      <div className="space-y-3 p-3 rounded-lg border border-[#E6E4DD] bg-[#F8F8F7]">
        <h4 className="text-sm font-medium text-[#1B1A1A]">Global Settings</h4>
        
        <div className="space-y-2">
          <Label className="text-xs text-[#625143]">Amplifier Power (All)</Label>
          <AmplifierPowerSelector
            value={splConfig?.globalPowerW || 100}
            onChange={(powerW) => updateGlobalSpl?.({ globalPowerW: powerW })}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-[#625143]">EQ Headroom (All)</Label>
          <EqHeadroomSelector
            value={splConfig?.globalEqHeadroomDb || 0}
            onChange={(eqHeadroomDb) => updateGlobalSpl?.({ globalEqHeadroomDb: eqHeadroomDb })}
            disabled={disabled}
          />
        </div>
      </div>

      <Label htmlFor="lcr-model" className="text-[#3E4349] font-medium">LCR Model</Label>
      <Select value={lcrModel || undefined} onValueChange={onChooseModel} disabled={disabled}>
        <SelectTrigger id="lcr-model" className="w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
          <SelectValue placeholder="Select LCR model" />
        </SelectTrigger>
        <SelectContent className="bg-white border-[#DCDBD6]">
          {lcrModelOptions.map(model => (
            <SelectItem key={model.key} value={model.label} className="text-[#1B1A1A] hover:bg-[#F8F8F7] focus:bg-[#F1F0EE]">{model.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* NEW: Flat / Angled toggle */}
      <div className="mt-2 flex items-center justify-between">
        <Label htmlFor="lcr-angle-toggle" className="text-sm text-[#3E4349] font-medium">
          Orientation
        </Label>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${!angled ? "text-[#1B1A1A]" : "text-[#625143]"}`}>Flat</span>
          <Switch
            id="lcr-angle-toggle"
            checked={angled}
            onCheckedChange={(on) => onChangeLcrAimMode(on ? "angled" : "flat")}
            disabled={disabled}
          />
          <span className={`text-xs ${angled ? "text-[#1B1A1A]" : "text-[#625143]"}`}>Angled</span>
        </div>
      </div>

      {/* Angle readout */}
      <p className="text-xs text-[#625143] mt-1">
        Angle to MLP: <span className="font-semibold text-[#1B1A1A]">{Math.round(lcrAngleDeg)}°</span>
      </p>

      {/* NEW LCR Cards from outline */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {lcrRoles.map((role) => (
          <LcrSplCard
            key={role}
            role={role}
            speaker={getByRole(role)}
            mlpPoint={mlpPoint}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}


function formatDolbyLabel(key) {
  const [a = "5", b = "1", c = "0"] = String(key).split(".");
  const overheads = Number(c) || 0;
  return overheads > 0 ? `${a}.${b}.${overheads} Dolby Atmos` : `${a}.${b} Surround`;
}

// Helper function to seed a single speaker with the full placement pipeline
// NOTE: This function is not used by the new `resetSurroundPositions` implementation,
// which now defines an internal helper to achieve the same result with more specific logic.
const seedSingleSpeakerWithPipeline = (
  role,
  angleDegrees,
  model,
  mlp,
  dims,
  zones,
  placeSurroundByRayCast,
  getHuggingCenterLines,
  applyCornerClearance,
  applyRoomBoundsClamp,
  existingSpeaker = null
) => {
  if (!model || model === 'off') return null;

  // Step 1: ANGLE - Ray-cast to get initial position
  let position = placeSurroundByRayCast(angleDegrees, mlp, dims);
  
  // Step 2: HUG - Snap to target wall center line
  const hugging = getHuggingCenterLines(model, dims);
  const absAngle = Math.abs(angleDegrees);

  // Apply hugging logic based on wall proximity and angle
  if (absAngle >= 130) { // Rear surrounds (SBL/SBR) typically hug back wall
      position.y = hugging.backWallY;
  } else if (absAngle >= 70 && absAngle < 130) { // Side surrounds (SL/SR) typically hug side walls
      position.x = angleDegrees < 0 ? hugging.leftWallX : hugging.rightWallX;
  } else if (absAngle < 70 && absAngle > 0) { // Front Wides (LW/RW) typically hug side walls
      position.x = angleDegrees < 0 ? hugging.leftWallX : hugging.rightWallX;
  }
  
  // Step 3: ZONE & CORNER
  position = applyCornerClearance(position, role, model, dims, zones);
  
  // Step 4: ROOM
  position = applyRoomBoundsClamp(position, model, dims);
  
  return {
    id: existingSpeaker?.id || `${role}-${timeNowMs()}`,
    role,
    label: role,
    model,
    position,
    defaultPosition: position,
    draggable: true,
    rotation: existingSpeaker?.rotation || { x: 0, y: 0, z: 0 }
  };
};

function SpeakerPlacementImpl(props) {
  // Safe destructuring inside the function body
  const {
    disabled = false,
    sevenBedLayoutType,
    onSevenBedLayoutTypeChange,
    dolbyPreset,
    onDolbyPresetChange,
    lcrAimMode = "flat",
    onChangeLcrAimMode = () => {},
    lcrAngleDeg = 0,
  } = props;

  // NEW: safe access to app state (always call the hook)
  const app = useAppState();

  const {
    speakerSystem, setSpeakerSystem, dimensions, seatingPositions, setDolbyConfig, dolbyConfig,
    showToast,
    useWidesInsteadOfRears,
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
  } = app || {};

  const frontSubsCfg = app?.frontSubsCfg || props?.frontSubsCfg || { 
    enabled: false, 
    count: 0, 
    model: null, 
    placement: "front" 
  };

  const rearSubsCfg = app?.rearSubsCfg || props?.rearSubsCfg || { 
    enabled: false, 
    count: 0, 
    model: null, 
    placement: "rear" 
  };

  const subWarnings = app?.subWarnings || { front: [], rear: [] };

  // All bed-layer surrounds we control here
  const SURROUND_BED_ROLES = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);

  // --- Canonical layout + toggle resolution (Set-based) ---
  const effectivePreset = (typeof dolbyPreset === "string" && dolbyPreset) 
    || (typeof app?.dolbyLayout === "string" && app.dolbyLayout) 
    || "5.1";

  // Accept either naming; normalise to boolean
  // `app?.useFrontWidesInsteadOfRear` was not destructured from `app` in the original file,
  // making its evaluation `undefined` and `!!undefined` to `false`.
  // Consolidating to use the explicitly managed `useWidesInsteadOfRears`.
  const useWides = (
    (typeof sevenBedLayoutType === "string" && sevenBedLayoutType.toLowerCase() === "wides") ||
    !!app?.useWidesInsteadOfRears
  );

  // Allowed roles for the current preset/toggle (returns Set for .has() compatibility)
  const allowedRoles = React.useMemo(() => {
    try {
      const arr = rolesForLayout({
        dolbyLayout: effectivePreset,
        useFrontWidesInsteadOfRear: !!useWides,
      });
      return new Set(arr);              // ✅ convert array → Set
    } catch (e) {
      console.warn("[SpeakerPlacement] rolesForLayout failed; falling back to 5.1", e);
      return new Set(rolesForLayout({ dolbyLayout: "5.1", useFrontWidesInsteadOfRear: false }));
    }
  }, [effectivePreset, useWides]);

  // Debug line
  try {
    // console.debug("[SpeakerPlacement] preset:", effectivePreset, 
    //               "useWides:", !!useWides, 
    //               "allowedRoles:", allowedRoles); // Changed to log the Set directly as requested
  } catch {}

  const placedSpeakers = useMemo(() => speakerSystem?.placedSpeakers || [], [speakerSystem?.placedSpeakers]);
  const lastPresetRef = useRef(effectivePreset);

  // NEW: Overhead count from dolbyPreset
  const overheadCount = useMemo(() => {
    if (!effectivePreset) return 0;
    const parts = effectivePreset.split('.');
    if (parts.length < 3) return 0;
    return parseInt(parts[2]) || 0;
  }, [effectivePreset]);

  // Constants
  const CORNER_CLEARANCE_M = 0.50;
  const WALL_BUFFER_M = 0.01;

  // Helper to get speaker dimensions
  const getModelDimsM = useCallback((speakerModel) => {
    // Default fallback, e.g., for 'off' or unknown models
    if (!speakerModel || speakerModel === 'off') return { widthM: 0.27, depthM: 0.082 };
    
    const meta = getSpeakerModelMeta(speakerModel);
    if (!meta) return { widthM: 0.27, depthM: 0.082 };

    return {
      widthM: meta.widthM || 0.27,
      depthM: meta.depthM || 0.082
    };
  }, []);

  // Helper to compute hugging positions (centre lines)
  const getHuggingCenterLines = useCallback((speakerModel, roomDimensions) => {
    const { width: W, length: L } = roomDimensions;
    const { widthM, depthM } = getModelDimsM(speakerModel);
    const shortEdge = Math.min(widthM, depthM); // The dimension that determines how close to wall it can be.
    const longEdge = Math.max(widthM, depthM);

    return {
      leftWallX: shortEdge / 2 + WALL_BUFFER_M,
      rightWallX: W - shortEdge / 2 - WALL_BUFFER_M,
      backWallY: L - shortEdge / 2 - WALL_BUFFER_M,
      shortEdge,
      longEdge
    };
  }, [getModelDimsM]); // WALL_BUFFER_M is a constant, no need to list

  // Ray-cast placement function - exact implementation per specification
  const placeSurroundByRayCast = useCallback((angleDegrees, mlpPoint, roomDimensions) => {
    const { width: W, length: L } = roomDimensions;
    const { x: xm, y: ym } = mlpPoint;

    // Angle is relative to MLP forward axis. 0 deg is typically front (+Y in our system)
    // Positive angles are counter-clockwise from the +Y axis.
    // If 0 deg is front/-Y, and angles increase CCW, this setup is common:
    // dx = sin(angle), dy = -cos(angle)
    // If 0 deg is +Y, and angles increase CCW, then:
    // dx = sin(angle), dy = cos(angle)
    // The previous implementation used dy = -cos(a), implying 0 deg is front/-Y,
    // and angles were -120, -100, etc. (CW from -Y). Let's keep that convention for consistency.
    const a = angleDegrees * (Math.PI / 180);
    const dx = Math.sin(a);
    const dy = -Math.cos(a); // Keeps consistency with prior logic interpretation

    let t = Infinity; // Parameter t for the ray equation P = P_mlp + t * V

    // Left wall (x = WALL_BUFFER_M)
    // Ray moving left (towards 0 on X axis, so dx < 0)
    if (dx < 0) {
      const tL = (WALL_BUFFER_M - xm) / dx;
      if (tL > 0) t = Math.min(t, tL);
    }
    
    // Right wall (x = W - WALL_BUFFER_M)
    // Ray moving right (towards W on X axis, so dx > 0)
    if (dx > 0) {
      const tR = (W - WALL_BUFFER_M - xm) / dx;
      if (tR > 0) t = Math.min(t, tR);
    }
    
    // Front wall (y = WALL_BUFFER_M)
    // Ray moving front (towards 0 on Y axis, so dy < 0)
    if (dy < 0) {
      const tF = (WALL_BUFFER_M - ym) / dy;
      if (tF > 0) t = Math.min(t, tF);
    }
    
    // Rear wall (y = L - WALL_BUFFER_M)
    // Ray moving back (towards L on Y axis, so dy > 0)
    if (dy > 0) {
      const tB = (L - WALL_BUFFER_M - ym) / dy;
      if (tB > 0) t = Math.min(t, tB);
    }

    // Choose smallest positive t (first wall hit)
    if (t === Infinity || t <= 0) {
      return { x: xm, y: ym, z: 1.1 }; // Failsafe: return MLP coords at 1.1m height
    }

    // Final coordinates at wall
    return {
      x: xm + dx * t,
      y: ym + dy * t,
      z: 1.1
    };
  }, []); // WALL_BUFFER_M is a constant, no need to list

  // Apply corner clearance after zone clamp - exact specification
  const applyCornerClearance = useCallback((position, role, speakerModel, roomDimensions, zones) => {
    const { width: W, length: L } = roomDimensions;
    const hugging = getHuggingCenterLines(speakerModel, roomDimensions);
    const { shortEdge, longEdge } = hugging; // Use longEdge for side walls if speaker is deep
    
    let { x, y, z } = position;
    
    // Determine which wall the speaker is hugging (check against the computed hugging lines)
    const isOnLeftWall = Math.abs(x - hugging.leftWallX) < 0.001; // Small epsilon for float comparison
    const isOnRightWall = Math.abs(x - hugging.rightWallX) < 0.001;
    const isOnBackWall = Math.abs(y - hugging.backWallY) < 0.001;
    
    // Get zone for this role
    const zone = zones?.[role] || {};
    
    if (isOnBackWall) {
      // REAR SURROUNDS (SBL, SBR) — BACK WALL
      // Y is already fixed to the back-wall centre-line by 'hugging' step, if speaker is facing 'forward'.
      // If speaker is placed against the wall, its actual center is at 'hugging.backWallY'.
      
      // Determine allowed X span with zone and corner clearance
      const zoneXMin = zone.xMin || 0;
      const zoneXMax = zone.xMax || W;
      
      // Shrink both ends by CORNER_CLEARANCE_M from back corners
      // Speaker's horizontal extent from its center is shortEdge / 2.
      const xMinWithClearance = Math.max(
        zoneXMin,
        CORNER_CLEARANCE_M + (shortEdge / 2), // 50cm from wall end, plus speaker half-width
        shortEdge / 2 // Ensure not sticking out past room origin
      );
      const xMaxWithClearance = Math.min(
        zoneXMax,
        W - (CORNER_CLEARANCE_M + (shortEdge / 2)), // 50cm from wall end, plus speaker half-width
        W - (shortEdge / 2) // Ensure not sticking out past room end
      );
      
      // Clamp X to effective bounds
      x = Math.max(xMinWithClearance, Math.min(xMaxWithClearance, x));
      
    } else if (isOnLeftWall || isOnRightWall) {
      // SIDE SURROUNDS (SL, SR, LW, RW) — SIDE WALLS
      // X is already fixed to the side-wall centre-line by 'hugging' step.
      
      // Determine allowed Y span with zone and rear corner clearance
      const zoneYMin = zone.yMin || 0;
      const zoneYMax = zone.yMax || L;
      
      // Shrink REAR end by CORNER_CLEARANCE_M (back corner only)
      // Speaker's vertical extent from its center is longEdge / 2 (assuming speaker points forward).
      const yMinFromZone = Math.max(zoneYMin, longEdge / 2); // Ensure not sticking out past room origin
      const yMaxWithRearClearance = Math.min(
        zoneYMax,
        L - (CORNER_CLEARANCE_M + (longEdge / 2)), // 50cm from back wall, plus speaker half-depth
        L - (longEdge / 2) // Ensure not sticking out past room end
      );
      
      // Clamp Y to effective bounds
      y = Math.max(yMinFromZone, Math.min(yMaxWithRearClearance, y));
    }
    
    return { x, y, z };
  }, [getHuggingCenterLines]); // CORNER_CLEARANCE_M is a constant, no need to list

  // Apply room bounds clamp (for drag behavior)
  const applyRoomBoundsClamp = useCallback((position, speakerModel, roomDimensions) => {
    const { width: W, length: L } = roomDimensions;
    const { shortEdge } = getHuggingCenterLines(speakerModel, roomDimensions);
    
    let { x, y, z } = position;
    
    // Inside room clamp: speaker's rectangle never crosses a wall
    // This assumes the speaker's 'width' for horizontal clamping and 'depth' for vertical.
    // Given 'shortEdge' is the min of width/depth, it's used for the buffer.
    x = Math.max(shortEdge / 2, Math.min(W - shortEdge / 2, x));
    y = Math.max(shortEdge / 2, Math.min(L - shortEdge / 2, y));
    
    return { x, y, z };
  }, [getHuggingCenterLines]);

  // NEW: Safety helper to ensure positions are never NaN
  function safePos(pos, mlp, fallbackZ = 1.1) {
    const x = Number.isFinite(pos?.x) ? pos.x : (Number.isFinite(mlp?.x) ? mlp.x : 0.5);
    const y = Number.isFinite(pos?.y) ? pos.y : (Number.isFinite(mlp?.y) ? mlp.y : 0.5);
    const z = Number.isFinite(pos?.z) ? pos.z : fallbackZ;
    return { x, y, z };
  }

  // CENTRALIZED MLP CALCULATION
  const mlpPoint = useMemo(() => {
    return computeMLPAndPrimary(
      seatingPositions || [], 
      Number(dimensions?.width) || 0, 
      Number(dimensions?.length) || 0, 
      "front"
    )?.mlp || null;
  }, [seatingPositions, dimensions]);

  const setSpeakers = useCallback((updater) => {
    setSpeakerSystem(prev => ({
      ...prev, 
      placedSpeakers: typeof updater === 'function' ? updater(prev?.placedSpeakers || []) : updater
    }));
  }, [setSpeakerSystem]);

  // The `canSides`, `canRears`, `canWides` variables now use the new `allowedRoles`
  const canSides = allowedRoles.has('SL') && allowedRoles.has('SR');
  const canRears = allowedRoles.has('SBL') && allowedRoles.has('SBR');
  const canWides = allowedRoles.has('LW') && allowedRoles.has('RW');
  const isNineBed = canRears && canWides; // This is now a more precise definition for 9-bed.

  const is7xOrHigher = useMemo(() => {
    const major = Number(String(effectivePreset).split(".")[0]) || 5;
    return major >= 7;
  }, [effectivePreset]);

  // Single function: RESET_SURROUND_POSITIONS with full pipeline: ANGLE → HUG → ZONE → CORNER → ROOM
  const resetSurroundPositions = useCallback(
    (layoutString, mlp, dims, currentSpeakers) => {
      if (!mlp || !dims || !Array.isArray(currentSpeakers)) {
        return currentSpeakers || [];
      }

      // Normalize layout string
      const layoutNormalized = (typeof layoutString === "string" && layoutString.trim()) 
        ? layoutString.trim()
        : (typeof dolbyConfig === "string" && dolbyConfig.trim()) 
          ? dolbyConfig.trim()
          : (dolbyConfig && typeof dolbyConfig === "object" && typeof dolbyConfig.layout === "string")
            ? dolbyConfig.layout.trim()
            : "5.1";

      // Extract major channel count, e.g. "9.1.6" -> 9, "7.1" -> 7
      const major = parseInt(layoutNormalized.split(".")[0], 10) || 5;

      const { width: W, length: L } = dims;

      // Define room bounds for projectToWallFromMLP helper
      const room = {
        left: 0,
        right: W,
        front: 0,
        back: L
      };

      // Map existing by canonical role so we can reuse ids/models
      const byRole = new Map();
      currentSpeakers.forEach((s) => {
        const canon = getCanonicalRole(s.role);
        byRole.set(canon, s);
      });

      // Start from all non-surround-bed speakers (LCR, heights, subs, etc)
      const next = currentSpeakers.filter(
        (s) => !SURROUND_BED_ROLES.has(getCanonicalRole(s.role))
      );

      // Utility: snap to walls using existing hugging / clearance helpers
      const finalisePos = (pos, canon, model) => {
        const safeModel = model || 'evolve-2-1_s';
        let p = { x: pos.x, y: pos.y, z: 1.1 };

        const hug = getHuggingCenterLines(safeModel, dims);
        
        // LEFT / RIGHT wall snapping for surrounds & wides
        if (canon === "SL" || canon === "LW") {
          p.x = hug.leftWallX;
        }
        if (canon === "SR" || canon === "RW") {
          p.x = hug.rightWallX;
        }

        // Rear surrounds must be on back wall
        if (canon === "SBL" || canon === "SBR") {
          p.y = hug.backWallY;
        }

        // Corner clearance + bounds
        p = applyCornerClearance(p, canon, safeModel, dims, zones);
        p = applyRoomBoundsClamp(p, safeModel, dims);

        // Ensure finite numbers; fall back to MLP if something went wrong
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          p.x = mlp.x;
          p.y = mlp.y;
        }

        // keep existing z if present, else ear height / generic
        const z = Number.isFinite(pos.z) ? pos.z : (mlp.z || 1.1);

        return { x: p.x, y: p.y, z };
      };

      // Reverting `seed` function parameter and angle conversion to maintain geometric correctness,
      // while adopting the outline's model fallback and yaw logic.
      const seed = (role, dolbyAngleDeg) => { // dolbyAngleDeg: 0=front, +CCW
        const canon = getCanonicalRole(role);
        const existing = byRole.get(canon);
        
        // NEW FALLBACK MODEL LOGIC from outline
        const fallbackModel = byRole.get("SL")?.model || byRole.get("SR")?.model || existing?.model;
        const model = existing?.model || fallbackModel;

        if (!model || model === "off" || model === "none") return;
        if (!allowedRoles.has(canon)) return;

        // Convert Dolby angle (0=front, +CCW) to projectToWallFromMLP angle (0=+X, 90=+Y)
        const projectAngleDeg = (270 - dolbyAngleDeg + 360) % 360;
        const base = projectToWallFromMLP(mlp.x, mlp.y, projectAngleDeg, room);
        const position = finalisePos(base, canon, model);

        let yawDeg = 0;
        // NEW YAW LOGIC from outline (rears now face sideways as per outline)
        if (canon === "SL" || canon === "SBL" || canon === "LW") yawDeg = 90;
        else if (canon === "SR" || canon === "SBR" || canon === "RW") yawDeg = -90;

        next.push({
          id: existing?.id || `${canon}-${Date.now()}`,
          role: canon,
          model,
          position,
          draggable: true,
          rotation: existing?.rotation || { x: 0, y: yawDeg, z: 0 },
        });
      };

      // --- Layout-specific seeding with Dolby-compliant angles ----------------------------------------
      // Using Dolby standard angles: 0=front, +CCW. Reverting seed angles to original correct Dolby angles.
      if (major === 5) {
        seed("SL", 90);  // Dolby 90 deg CCW (left side)
        seed("SR", -90); // Dolby 90 deg CW (right side)
      }

      if (major === 7) {
        seed("SL", 90);
        seed("SR", -90);
        seed("SBL", 142.5); // Dolby 142.5 deg CCW (left rear)
        seed("SBR", -142.5); // Dolby 142.5 deg CW (right rear)
      }

      if (major >= 9) {
        seed("SL", 90);
        seed("SR", -90);
        seed("SBL", 142.5);
        seed("SBR", -142.5);
        seed("LW", 60);  // Dolby 60 deg CCW (left wide)
        seed("RW", -60); // Dolby 60 deg CW (right wide)
      }

      return next;
    },
    [zones, getHuggingCenterLines, applyCornerClearance, applyRoomBoundsClamp, allowedRoles, dolbyConfig]
  );

  // Handler for reset button (full surround reset)
  const handleResetPositions = useCallback(() => {
    if (!mlpPoint || !dimensions) {
      if (showToast) showToast('Cannot reset speakers: Room dimensions or MLP not set.', 'error');
      return;
    }
    
    setSpeakers(currentSpeakers => resetSurroundPositions(effectivePreset, mlpPoint, dimensions, currentSpeakers));
    
    if (showToast) {
      const layoutKey = effectivePreset.startsWith('5.1') ? '5.1' : effectivePreset.startsWith('9.') ? '9.x' : '7.1';
      showToast(`Speaker positions reset for ${layoutKey} layout with 50cm corner clearance.`, 'success');
    }
  }, [effectivePreset, mlpPoint, dimensions, resetSurroundPositions, setSpeakers, showToast]);

  // Effect to auto-reset when layout changes (guarded by lastPresetRef)
  useEffect(() => {
    if (effectivePreset !== lastPresetRef.current) {
      if (mlpPoint && dimensions) {
        setSpeakers(currentSpeakers => resetSurroundPositions(effectivePreset, mlpPoint, dimensions, currentSpeakers));
        
        if (showToast) {
          const layoutKey = effectivePreset.startsWith('5.1') ? '5.1' : effectivePreset.startsWith('9.') ? '9.x' : '7.1';
          showToast(`Layout changed to ${layoutKey} - speakers repositioned with corner clearance.`, 'success');
        }
      }
      lastPresetRef.current = effectivePreset;
    }
  }, [effectivePreset, mlpPoint, dimensions, resetSurroundPositions, setSpeakers, showToast]);

  const is7ChannelBed = effectivePreset && (effectivePreset.startsWith('7.1') || effectivePreset.startsWith('7.2'));

  // Dedicated reset for Front Wides (triggered by custom event)
  const resetOnlyFrontWidesToDefaults = useCallback(() => {
    // Only reset if Front Wides are logically active in the current configuration
    if (!mlpPoint || !dimensions || !canWides) {
        if (showToast) showToast('Front-Wide speakers are not enabled or room data missing.', 'info');
        return;
    }

    setSpeakers(currentSpeakers => {
        // Filter out existing LW/RW speakers, keep others
        const otherSpeakers = currentSpeakers.filter(s => {
            const canonicalRole = getCanonicalRole(s.role);
            return !['LW', 'RW'].includes(canonicalRole);
        });

        // Get current models for potential inheritance or to re-apply
        const existingSpeakersMap = new Map();
        currentSpeakers.forEach(s => existingSpeakersMap.set(getCanonicalRole(s.role), s));

        const newFWSpeakers = [];
        const fwRoles = ['LW', 'RW'];

        const W = Number(dimensions?.width) || 4.5;
        const L = Number(dimensions?.length) || 6.0;
        // const WALL_BUFFER = 0.02; // Not directly used in this snippet, but kept for context

        fwRoles.forEach(role => {
            const existing = existingSpeakersMap.get(role);
            // Inherit model from existing LW/RW, or if none, from SL/SR
            let model = existing?.model || existingSpeakersMap.get(role === 'LW' ? 'SL' : 'SR')?.model || 'off';
            
            if (model === 'off') return; // Don't place if no model

            // Get model dimensions
            // const modelDims = getModelDimsM(model) || {}; // Not used directly in this specific calculation
            // const halfDepth = (Number(modelDims.depthM) || 0.082) / 2; // Not used directly in final calculation
            // const halfWidth = (Number(modelDims.widthM) || 0.27) / 2; // Not used directly in final calculation

            let xAtWall;
            // The median Y is relative to the room length.
            const medianY = L / 2;

            if (role === 'LW') {
                const hugging = getHuggingCenterLines(model, dimensions);
                xAtWall = hugging.leftWallX; // Use the hugging line for X
            } else if (role === 'RW') {
                const hugging = getHuggingCenterLines(model, dimensions);
                xAtWall = hugging.rightWallX; // Use the hugging line for X
            } else {
                return; // Should not happen
            }

            newFWSpeakers.push({
                id: existing?.id || `${role}-${timeNowMs()}`,
                role,
                model,
                position: {
                    x: xAtWall,
                    y: medianY, // Place at median Y for simplicity
                    z: 1.1
                },
                rotation: { x: 0, y: 0, z: 0 },
                draggable: true
            });
        });

        return [...otherSpeakers, ...newFWSpeakers];
    });
    if (showToast) showToast('Front-Wide speakers reset to median positions.', 'success');
  }, [mlpPoint, dimensions, canWides, setSpeakers, showToast, getModelDimsM, getHuggingCenterLines]);

  // Custom event listener for Front-Wide reset button
  useEffect(() => {
    const handler = () => {
      resetOnlyFrontWidesToDefaults();
    };
    window.addEventListener('b44:fw:resetToMedian', handler);
    return () => {
      window.removeEventListener('b44:fw:resetToMedian', handler);
    };
  }, [resetOnlyFrontWidesToDefaults]);


  return (
    <div className="space-y-4 font-sans" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>

      <div className="space-y-3">
        <Label htmlFor="system-config" className="text-[#1B1A1A] font-bold text-base block">System Configuration</Label>
        <Select 
          value={effectivePreset} 
          onValueChange={(v) => { 
            if (setDolbyConfig) setDolbyConfig(v); 
            if (onDolbyPresetChange) onDolbyPresetChange(v);
            // The useEffect will catch this change and trigger the reset
          }}
          disabled={disabled}
        >
          <SelectTrigger id="system-config" className="w-full h-10 px-3 py-2 mt-1 bg-white border border-[#DCDBD6] rounded-md text-[#1B1A1A] hover:border-[#213428] focus:border-[#213428] focus:ring-1 focus:ring-[#213428] focus:outline-none">
            <SelectValue placeholder="Select configuration" />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(audioConfigurations).map(preset => (
              <SelectItem key={preset} value={preset}>
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
          disabled={disabled || !mlpPoint || !dimensions}
          className="flex-1 border-[#DCDBD6] text-[#1B1A1A] hover:bg-[#F8F8F7]"
          aria-label="Reset speaker positions to layout defaults"
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
        />
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Surround Channels"
        icon={<Speaker className="w-5 h-5 text-[#625143]" />}
        defaultOpen={false}
      >
        {/* 7-bed XOR switch - only show for 7.x layouts, hide for 9-bed */}
        {!isNineBed && is7xOrHigher && (
          <div className="mb-4 p-3 rounded-lg border border-[#E6E4DD] bg-[#F8F8F7]">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-[#1B1A1A]">Use Front Wides instead of Rear Surrounds</Label>
                <p className="text-xs text-[#625143] mt-1">Toggles the 7-bed layer between SBL/SBR and LW/RW.</p>
              </div>
              <Switch
                checked={app?.useWidesInsteadOfRears === true}
                onCheckedChange={(v) => {
                  if (app?.setUseWidesInsteadOfRears) {
                    app.setUseWidesInsteadOfRears(!!v);
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
          sevenBedLayoutType={sevenBedLayoutType} // ADDED
          dimensions={dimensions}
          getHuggingCenterLines={getHuggingCenterLines}
          applyCornerClearance={applyCornerClearance}
          applyRoomBoundsClamp={applyRoomBoundsClamp}
          disabled={disabled}
          allowedRoles={allowedRoles}
          canSides={canSides}
          canRears={canRears}
          canWides={canWides}
          is7xOrHigher={is7xOrHigher} // ADDED
          safePos={safePos} // NEW: Pass safePos to UnifiedSurroundsConfig
        />

        {canWides && (
          <div className="mt-4 pt-4 border-t border-[#E5E5E5]">
            <Button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('b44:fw:resetToMedian'));
              }}
              variant="outline"
              size="sm"
              className="w-full border-[#DCDBD6] text-[#1B1A1A] hover:bg-[#F8F8F7]"
              disabled={disabled || !mlpPoint || !dimensions}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Front-Wide to Median
            </Button>
          </div>
        )}
      </CollapsiblePanel>

      {overheadCount > 0 && (
        <CollapsiblePanel title="Overhead Channels" defaultOpen={true}>
          <div className="space-y-3 p-2">
            <OverheadChannelSelector
              overheadCount={overheadCount}
              globalModel={overheadGlobalModel}
              onGlobalModelChange={setOverheadGlobalModel}
              frontOverride={overheadFrontOverride}
              midOverride={overheadMidOverride} // Corrected: was `midOverride`
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
          </div>
        </CollapsiblePanel>
      )}

      <CollapsiblePanel
        title="Subwoofers"
        defaultOpen={false}
      >
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
                      if (app?.setFrontSubsCfg) {
                        app.setFrontSubsCfg(prev => ({ ...prev, model }))
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-full px-3 text-sm justify-between bg-white border-[#DCDBD6]">
                      <SelectValue placeholder="Select model" />
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
                      if (app?.setFrontSubsCfg) {
                        app.setFrontSubsCfg(prev => ({ ...prev, count: Number(v) }))
                      }
                    }}
                    disabled={!frontSubsCfg?.model}
                  >
                    <SelectTrigger className="h-8 w-[64px] px-2 text-sm justify-between bg-white border-[#DCDBD6]">
                      <SelectValue placeholder="0" />
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
                      if (app?.setRearSubsCfg) {
                        app.setRearSubsCfg(prev => ({ ...prev, model }))
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-full text-sm px-3 bg-white border-[#DCDBD6]">
                      <SelectValue placeholder="Select model" />
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
                      if (app?.setRearSubsCfg) {
                        app.setRearSubsCfg(prev => ({ ...prev, count: Number(v) }))
                      }
                    }}
                    disabled={!rearSubsCfg?.model}
                  >
                    <SelectTrigger className="h-8 w-[64px] px-2 text-sm justify-between bg-white border-[#DCDBD6]">
                      <SelectValue />
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

            <div className="col-span-12 pt-1">
              <p className="text-[12px] leading-snug text-[#625143]">
                Select model and quantity (0–2) for front and rear subwoofers. Changes are reflected immediately in the plan view.
              </p>
            </div>
          </div>
        </div>
      </CollapsiblePanel>
    </div>
  );
}

// Parse-proof default export
export default function SpeakerPlacement(props) {
  return <SpeakerPlacementImpl {...props} />;
}
