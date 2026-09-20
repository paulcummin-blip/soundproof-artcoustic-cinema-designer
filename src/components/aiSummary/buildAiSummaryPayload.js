/**
 * buildAiSummaryPayload.js
 * ------------------------
 * Builds the ONE canonical AI-summary payload from the settled Design Rating
 * authority (published Design Review handoff snapshot) + project data.
 *
 * The AI layer is a CONSUMER, not an authority. This builder never recalculates
 * category floors, DPI scores, P14/P18/P19/P20, or any engineering value. It
 * reads the already-published Engineering Summary and extracts a stable,
 * explicit schema for the AI generation prompt.
 *
 * Exclusion rules:
 *   - N/A, Not applicable, Not assessed → excluded
 *   - Not calculated, pending, provisional → excluded
 *   - Only genuine L4, L3, L2, L1, FAIL are included
 *
 * Never invents missing values. If a field is not available, it is omitted.
 *
 * Pure: no React, no side effects.
 */

const GENUINE_LEVELS = new Set(["L4", "L3", "L2", "L1", "FAIL"]);

const RP22_CATEGORIES = ["Spatial Resolution", "Dynamic Range", "Timbre Matching"];

function isFiniteNumber(v) {
  return v !== null && v !== undefined && Number.isFinite(Number(v));
}

function extractCategoryFloors(categories) {
  if (!Array.isArray(categories)) return [];
  return categories
    .filter((cat) => RP22_CATEGORIES.includes(cat?.name))
    .map((cat) => ({
      name: cat.name,
      floorLevel: cat.floorLevel || null,
    }));
}

function extractParameterLevel(parameter, seatIds = null) {
  if (!parameter || parameter.state !== "scored") return null;
  if (parameter.scope !== "seat") return parameter.level || null;
  // Seat-scoped: floor across included seats
  const included = Array.isArray(seatIds) ? new Set(seatIds.map(String)) : null;
  const levels = Object.entries(parameter.seats || {})
    .filter(([seatId, seat]) => (!included || included.has(String(seatId))) && seat?.state === "scored")
    .map(([, seat]) => seat?.level)
    .filter((level) => GENUINE_LEVELS.has(level));
  if (!levels.length) return null;
  const rank = { FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
  return levels.reduce((worst, level) => rank[level] < rank[worst] ? level : worst);
}

function extractGenuineParameters(parameterAuthority, seatIds = null) {
  const result = {};
  for (const [key, parameter] of Object.entries(parameterAuthority || {})) {
    if (key === "screen") continue;
    const level = extractParameterLevel(parameter, seatIds);
    if (!level || !GENUINE_LEVELS.has(level)) continue;
    result[key] = {
      key,
      scope: parameter.scope || null,
      level,
    };
  }
  return result;
}

function extractBassSummary(engineeringSummary, parameterAuthority) {
  const bass = {};

  // P14 — room-scoped
  const p14 = parameterAuthority?.p14;
  if (p14 && p14.state === "scored") {
    bass.p14 = { level: p14.level || null, value: p14.rawValue ?? null };
  }

  // P18 — room-scoped
  const p18 = parameterAuthority?.p18;
  if (p18 && p18.state === "scored") {
    bass.p18 = { level: p18.level || null, value: p18.rawValue ?? null };
  }

  // P19 — seat-scoped, per-seat results
  const p19 = parameterAuthority?.p19;
  if (p19 && p19.state === "scored" && p19.scope === "seat") {
    const perSeat = {};
    for (const [seatId, seat] of Object.entries(p19.seats || {})) {
      if (seat?.state === "scored" && GENUINE_LEVELS.has(seat.level)) {
        perSeat[seatId] = {
          level: seat.level,
          value: seat.rawValue ?? null,
        };
      }
    }
    if (Object.keys(perSeat).length) {
      bass.p19 = {
        primaryFloor: extractParameterLevel(p19, engineeringSummary?.primary?.seatIds),
        secondaryFloor: extractParameterLevel(p19, engineeringSummary?.secondary?.seatIds),
        perSeat,
      };
    }
  }

  // P20 — seat-scoped, per-seat results
  const p20 = parameterAuthority?.p20;
  if (p20 && p20.state === "scored" && p20.scope === "seat") {
    const perSeat = {};
    for (const [seatId, seat] of Object.entries(p20.seats || {})) {
      if (seat?.state === "scored" && GENUINE_LEVELS.has(seat.level)) {
        perSeat[seatId] = {
          level: seat.level,
          value: seat.rawValue ?? null,
        };
      }
    }
    if (Object.keys(perSeat).length) {
      bass.p20 = {
        primaryFloor: extractParameterLevel(p20, engineeringSummary?.primary?.seatIds),
        secondaryFloor: extractParameterLevel(p20, engineeringSummary?.secondary?.seatIds),
        perSeat,
      };
    }
  }

  return Object.keys(bass).length ? bass : null;
}

function extractViewing(engineeringSummary) {
  const viewing = engineeringSummary?.viewing;
  if (!viewing || !viewing.available) return null;
  return {
    primaryFloor: viewing.primary_floor || null,
    secondaryFloor: viewing.secondary_floor || null,
    projectFloor: viewing.project_floor || null,
    summary: viewing.summary || null,
    perSeatCount: Array.isArray(viewing.per_seat) ? viewing.per_seat.length : 0,
  };
}

function extractSystemInfo(snapshot, projectDetails) {
  const system = {};

  // Channel configuration
  const dolbyLayout = snapshot?.dolbyLayout;
  if (dolbyLayout) {
    system.dolbyLayout = dolbyLayout;
  }

  // Subwoofer info
  const subInstances = projectDetails?.subwooferInstances;
  if (Array.isArray(subInstances) && subInstances.length > 0) {
    const enabled = subInstances.filter((s) => s?.enabled !== false);
    system.subwooferCount = enabled.length;
    const models = [...new Set(enabled.map((s) => s?.model).filter(Boolean))];
    if (models.length) system.subwooferModels = models;
  }

  // Screen info
  const screen = snapshot?.screen;
  if (screen) {
    system.screen = {
      size: screen.size || projectDetails?.screen_size || null,
      aspectRatio: screen.aspectRatio || projectDetails?.aspect_ratio || null,
    };
  }

  // Room dimensions
  if (projectDetails) {
    system.roomDimensions = {
      widthM: projectDetails.room_width ?? null,
      lengthM: projectDetails.room_length ?? null,
      heightM: projectDetails.room_height ?? null,
    };
  }

  // Placed speakers count
  const placedSpeakers = snapshot?.placedSpeakers;
  if (Array.isArray(placedSpeakers)) {
    system.placedSpeakerCount = placedSpeakers.length;
  }

  return Object.keys(system).length ? system : null;
}

/**
 * Build the canonical AI-summary payload from the settled Design Rating
 * authority and project data.
 *
 * @param {Object} params
 * @param {Object} params.publishedSnapshot  - From readDesignReviewHandoff
 * @param {Object} params.projectDetails      - Merged Project + ProjectVersion
 * @param {string} params.projectId
 * @param {string} params.versionId
 * @returns {Object|null} Canonical payload, or null if not ready
 */
export function buildAiSummaryPayload({ publishedSnapshot, projectDetails, projectId, versionId }) {
  if (!publishedSnapshot) return null;
  const summary = publishedSnapshot.engineeringSummary;
  if (!summary) return null;

  const parameterAuthority = summary.parameterAuthority || {};

  // ── Identity ──
  const identity = {
    projectId: String(projectId || publishedSnapshot.projectId || ""),
    versionId: String(versionId || publishedSnapshot.versionId || ""),
    calculationFingerprint: publishedSnapshot.calculationFingerprint || null,
    seatPriorityFingerprint:
      publishedSnapshot.rating?.seatPriorityFingerprint ||
      summary.seatPriorityFingerprint ||
      null,
  };

  // ── Project ──
  const project = {
    name: projectDetails?.name || null,
    clientName: projectDetails?.client_name || null,
    versionName: projectDetails?.version_name || null,
    roomDimensions: {
      widthM: projectDetails?.room_width ?? null,
      lengthM: projectDetails?.room_length ?? null,
      heightM: projectDetails?.room_height ?? null,
    },
  };

  // ── Design Rating ──
  const designRating = {
    primary: isFiniteNumber(summary.primary?.designPerformanceIndex)
      ? Number(summary.primary.designPerformanceIndex) : null,
    secondary: isFiniteNumber(summary.secondary?.designPerformanceIndex)
      ? Number(summary.secondary.designPerformanceIndex) : null,
    all: isFiniteNumber(summary.project?.designPerformanceIndex)
      ? Number(summary.project.designPerformanceIndex) : null,
  };

  // ── Category Floors ──
  const categoryFloors = {
    primary: extractCategoryFloors(summary.primary?.categories),
    secondary: extractCategoryFloors(summary.secondary?.categories),
  };

  // ── Genuine Parameters (excluding N/A, pending, provisional) ──
  const parameters = {
    primary: extractGenuineParameters(parameterAuthority, summary.primary?.seatIds),
    secondary: extractGenuineParameters(parameterAuthority, summary.secondary?.seatIds),
    all: extractGenuineParameters(parameterAuthority, summary.project?.seatIds),
  };

  // ── Bass ──
  const bass = extractBassSummary(summary, parameterAuthority);

  // ── Viewing ──
  const viewing = extractViewing(summary);

  // ── System ──
  const system = extractSystemInfo(publishedSnapshot, projectDetails);

  return {
    identity,
    project,
    system,
    designRating,
    categoryFloors,
    parameters,
    bass,
    viewing,
  };
}