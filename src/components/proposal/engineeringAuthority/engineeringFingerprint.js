/**
 * engineeringFingerprint.js
 * -------------------------
 * Full Engineering Fingerprint — Phase 1A.5
 *
 * Replaces the bass-only publication fingerprint with a fingerprint that
 * represents the ENTIRE published engineering summary, not just bass.
 *
 * The fingerprint changes whenever any published engineering result could
 * change, including:
 *   - room geometry
 *   - seating (positions + priorities)
 *   - speaker selection (LCR, surrounds, overheads)
 *   - subwoofers (instances, positions, models, tuning)
 *   - screen (size, aspect ratio, mount mode, height)
 *   - RSP (mode, manual position, designated seat)
 *   - RP22 assumptions (P15, P21)
 *   - Dolby config
 *   - target SPL
 *   - acoustic treatment
 *   - SPL config
 *   - engine / RP22 / algorithm revision
 *
 * Design rules (mirrors bassAnalysisFingerprints.js):
 *   - Deterministic: stable canonical serialization (sorted keys) + FNV-1a hash.
 *   - Independent of JavaScript object key insertion order.
 *   - Numeric inputs are rounded to absorb harmless floating-point noise.
 *   - No external dependencies. No raw JSON.stringify without sorted keys.
 *   - Result carries a version prefix: "eng:v1:hash".
 *   - NaN, Infinity, and non-serializable values are coerced to null.
 */

export const ENGINEERING_FINGERPRINT_VERSION = 1;

// ---------------------------------------------------------------------------
// Stable serialization primitives (self-contained — no cross-module imports)
// ---------------------------------------------------------------------------

function num(v, decimals = 6) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function fnv1a32Seeded(str, offsetBasis) {
  let hash = offsetBasis;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fingerprint64(canonical) {
  const str = stableStringify(canonical);
  const hashA = fnv1a32Seeded(str, 0x811c9dc5);
  const hashB = fnv1a32Seeded(str, 0x40007a67);
  return hashA + hashB;
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeRoomDims(roomDims) {
  if (!roomDims || typeof roomDims !== "object") return null;
  return {
    widthM: num(roomDims.widthM),
    lengthM: num(roomDims.lengthM),
    heightM: num(roomDims.heightM),
  };
}

function normalizeSeat(s) {
  if (!s || typeof s !== "object") return null;
  return {
    id: s.id || null,
    x: num(s.x),
    y: num(s.y),
    z: num(s.z),
    row: num(s.row ?? s.rowNumber, 0),
    column: num(s.indexInRow ?? s.column, 0),
    priority: s.priority || null,
    isPrimary: s.isPrimary === true ? true : null,
    earHeightM: num(s.earHeightM),
    platformHeightM: num(s.platformHeightM),
  };
}

function normalizeSeats(seats) {
  if (!Array.isArray(seats)) return [];
  return seats
    .map(normalizeSeat)
    .filter(Boolean)
    .sort((a, b) => {
      const aId = a.id || "";
      const bId = b.id || "";
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      return 0;
    });
}

function normalizeSpeakerByRole(role) {
  if (!role || typeof role !== "object") return null;
  return {
    role: role.role || null,
    modelKey: role.modelKey || role.model || null,
    manufacturer: role.manufacturer || null,
  };
}

function normalizeSpeakersByRole(byRole) {
  if (!byRole || typeof byRole !== "object") return {};
  const normalized = {};
  for (const [key, value] of Object.entries(byRole)) {
    if (Array.isArray(value)) {
      normalized[key] = value.map(normalizeSpeakerByRole).filter(Boolean);
    } else {
      normalized[key] = normalizeSpeakerByRole(value);
    }
  }
  return normalized;
}

function normalizeSubwooferInstance(inst) {
  if (!inst || typeof inst !== "object") return null;
  return {
    id: inst.id || null,
    model: inst.model || null,
    enabled: inst.enabled !== false,
    position: {
      x: num(inst.position?.x),
      y: num(inst.position?.y),
    },
    bottomHeightM: num(inst.bottomHeightM),
    rotationDeg: num(inst.rotationDeg, 3),
    positionSource: inst.positionSource || null,
    gainDb: num(inst.tuning?.gainDb ?? inst.gainDb),
    delayMs: num(inst.tuning?.delayMs ?? inst.delayMs, 3),
    polarity: inst.tuning?.polarity ?? inst.polarity ?? 0,
  };
}

function normalizeSubwooferInstances(instances) {
  if (!Array.isArray(instances)) return [];
  return instances
    .map(normalizeSubwooferInstance)
    .filter(Boolean)
    .sort((a, b) => {
      const aId = a.id || "";
      const bId = b.id || "";
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      return 0;
    });
}

function normalizeScreen(screen) {
  if (!screen || typeof screen !== "object") return null;
  return {
    size: num(screen.size ?? screen.screen_size),
    aspectRatio: screen.aspectRatio ?? screen.aspect_ratio ?? null,
    mountMode: screen.mountMode ?? screen.screen_mount_mode ?? null,
    heightFromFloor: num(screen.heightFromFloor ?? screen.screen_height_from_floor),
    manualDimensions: screen.manualDimensions === true,
    manualWidthM: num(screen.manualWidthM ?? screen.manual_width_m),
    manualHeightM: num(screen.manualHeightM ?? screen.manual_height_m),
    floatDepthM: num(screen.floatDepthM ?? screen.float_depth_m),
    borderThicknessM: num(screen.borderThicknessM ?? screen.border_thickness_m),
  };
}

function normalizeSplConfig(splConfig) {
  if (!splConfig || typeof splConfig !== "object") return null;
  return {
    globalPowerW: num(splConfig.globalPowerW, 1),
    globalEqHeadroomDb: num(splConfig.globalEqHeadroomDb, 2),
    radiationMode: splConfig.radiationMode || "half_space",
  };
}

// ---------------------------------------------------------------------------
// Full Engineering Fingerprint
// ---------------------------------------------------------------------------

/**
 * Build a full engineering fingerprint from the design state.
 *
 * The fingerprint represents the entire published engineering summary —
 * not just bass. It changes whenever any input that feeds the engineering
 * summary changes.
 *
 * @param {Object} designState — curated design state from appState + project
 * @param {Object} versions — { engineVersion, rp22Version, algorithmVersion, instanceAuthorityVersion, summarySchemaVersion }
 * @returns {string} fingerprint with prefix "eng:v1:hash"
 */
export function computeEngineeringFingerprint(designState, versions = {}) {
  const ds = designState || {};
  const v = versions || {};

  const canonical = {
    // Version stamps — a revision change must invalidate all publications
    engineVersion: v.engineVersion || null,
    rp22Version: v.rp22Version || null,
    algorithmVersion: v.algorithmVersion || null,
    instanceAuthorityVersion: v.instanceAuthorityVersion || null,
    summarySchemaVersion: v.summarySchemaVersion || null,

    // Room geometry
    room: {
      dims: normalizeRoomDims(ds.roomDims),
      orientation: ds.roomOrientation || ds.room_orientation || null,
      screenWall: ds.screenWall || ds.screen_wall || null,
    },

    // Seating (positions + priorities)
    seats: normalizeSeats(ds.seatingPositions),
    rowSpacingM: num(ds.rowSpacingM),
    seatsPerRowByRow: Array.isArray(ds.seatsPerRowByRow)
      ? ds.seatsPerRowByRow.map((n) => num(n, 0))
      : null,
    seatingBlockOffset: num(ds.seatingBlockOffset),
    mlpBasis: ds.mlpBasis || null,
    linkEarPlatformHeights: ds.linkEarPlatformHeights !== false,

    // Speaker selection
    speakersByRole: normalizeSpeakersByRole(ds.selectedSpeakersByRole),
    globalSurroundModel: ds.globalSurroundModel || null,
    sevenBedLayoutType: ds.sevenBedLayoutType || null,
    enableFrontWides: ds.enableFrontWides === true,
    extraSurroundCount: num(ds.extraSurroundCount, 0),

    // Overhead models
    overhead: {
      globalModel: ds.overheadGlobalModel || null,
      frontOverride: ds.overheadFrontOverride || null,
      midOverride: ds.overheadMidOverride || null,
      rearOverride: ds.overheadRearOverride || null,
      useFrontGlobal: ds.useFrontGlobal !== false,
      useMidGlobal: ds.useMidGlobal !== false,
      useRearGlobal: ds.useRearGlobal !== false,
    },

    // Subwoofers (instances — the sole bass analysis authority)
    subwooferInstances: normalizeSubwooferInstances(ds.subwooferInstances),

    // Screen
    screen: normalizeScreen(ds.screen),
    screenFrontPlaneM: num(ds.screenFrontPlaneM),
    lcrAimMode: ds.lcrAimMode || null,

    // RSP
    rsp: {
      mode: ds.rspMode || null,
      manualX_m: num(ds.manualRspX_m),
      manualY_m: num(ds.manualRspY_m),
      designatedRspSeatId: ds.designatedRspSeatId || null,
    },

    // SPL config
    splConfig: normalizeSplConfig(ds.splConfig),
    targetSpl: num(ds.targetSpl ?? ds.target_spl, 1),

    // RP22 assumptions
    assumedP15Level: ds.assumedP15Level || ds.assumed_p15_level || null,
    assumedP21Level: ds.assumedP21Level || ds.assumed_p21_level || null,
    p15ConstructionLevel: ds.p15ConstructionLevel || null,

    // Acoustic treatment
    acousticTreatment: {
      enabled: ds.acousticTreatmentEnabled === true,
      abfuserQty: num(ds.selectedAbfuserQty ?? ds.selected_abfuser_qty, 0),
    },

    // Aiming
    aimFrontWidesAtMLP: ds.aimFrontWidesAtMLP === true,
    aimRearSurroundsAtMLP: ds.aimRearSurroundsAtMLP === true,
    aimSideSurroundsAtMLP: ds.aimSideSurroundsAtMLP === true,
  };

  return `eng:v${ENGINEERING_FINGERPRINT_VERSION}:${fingerprint64(canonical)}`;
}

/**
 * Validate that a fingerprint string is well-formed.
 */
export function isValidEngineeringFingerprint(fp) {
  if (typeof fp !== "string" || fp.length === 0) return false;
  const parts = fp.split(":");
  if (parts.length < 3) return false;
  if (parts[0] !== "eng") return false;
  if (!parts[1].startsWith("v")) return false;
  const hash = parts[parts.length - 1];
  if (!/^[0-9a-f]+$/.test(hash)) return false;
  return hash.length === 16;
}