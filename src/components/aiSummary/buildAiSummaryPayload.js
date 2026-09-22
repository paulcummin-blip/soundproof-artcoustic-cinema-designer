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
    .map((cat) => ({
      name: cat?.name || cat?.label || null,
      floorLevel: cat?.floorLevel || null,
    }))
    .filter((cat) => RP22_CATEGORIES.includes(cat.name));
}

function extractGenuineParameters(parameterAuthority, parameterSummary = null) {
  const result = {};
  for (const [key, parameter] of Object.entries(parameterAuthority || {})) {
    if (key === "screen") continue;
    const level = parameter?.scope === "seat"
      ? parameterSummary?.[key]?.level
      : parameter?.level;
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
  const roomResults = engineeringSummary?.roomResultsByParameter || {};
  const seatResults = engineeringSummary?.project?.reportCounts?.seatResultsByParameter || {};

  const roomValue = (parameterNumber, parameter) =>
    parameter?.rawValue ??
    roomResults?.[parameterNumber]?.value ??
    roomResults?.[String(parameterNumber)]?.value ??
    null;

  const seatValueMap = (parameterKey) =>
    Object.fromEntries(
      (seatResults?.[parameterKey] || []).map((seat) => [String(seat?.seatId), seat?.value ?? null]),
    );

  // P14 — room-scoped. Copy the already-published value; never recalculate.
  const p14 = parameterAuthority?.p14;
  if (p14 && p14.state === "scored") {
    bass.p14 = { level: p14.level || null, value: roomValue(14, p14) };
  }

  // P18 — room-scoped. Copy the already-published value; never recalculate.
  const p18 = parameterAuthority?.p18;
  if (p18 && p18.state === "scored") {
    bass.p18 = { level: p18.level || null, value: roomValue(18, p18) };
  }

  // P19 — seat-scoped, copied from the canonical engineering summary.
  const p19 = parameterAuthority?.p19;
  if (p19 && p19.state === "scored" && p19.scope === "seat") {
    const perSeat = {};
    const values = seatValueMap("p19");
    for (const [seatId, seat] of Object.entries(p19.seats || {})) {
      if (seat?.state === "scored" && GENUINE_LEVELS.has(seat.level)) {
        perSeat[seatId] = {
          level: seat.level,
          value: seat.rawValue ?? values[String(seatId)] ?? null,
        };
      }
    }
    if (Object.keys(perSeat).length) {
      bass.p19 = {
        primaryFloor: engineeringSummary?.parameterSummaries?.primary?.p19?.level || null,
        secondaryFloor: engineeringSummary?.parameterSummaries?.secondary?.p19?.level || null,
        perSeat,
      };
    }
  }

  // P20 — seat-scoped, copied from the canonical engineering summary.
  const p20 = parameterAuthority?.p20;
  if (p20 && p20.state === "scored" && p20.scope === "seat") {
    const perSeat = {};
    const values = seatValueMap("p20");
    for (const [seatId, seat] of Object.entries(p20.seats || {})) {
      if (seat?.state === "scored" && GENUINE_LEVELS.has(seat.level)) {
        perSeat[seatId] = {
          level: seat.level,
          value: seat.rawValue ?? values[String(seatId)] ?? null,
        };
      }
    }
    if (Object.keys(perSeat).length) {
      bass.p20 = {
        primaryFloor: engineeringSummary?.parameterSummaries?.primary?.p20?.level || null,
        secondaryFloor: engineeringSummary?.parameterSummaries?.secondary?.p20?.level || null,
        perSeat,
      };
    }
  }

  return Object.keys(bass).length ? bass : null;
}

function extractDesignAssumptions(engineeringSummary) {
  const roomResults = engineeringSummary?.roomResultsByParameter || {};
  const p15 = roomResults?.[15] || roomResults?.["15"] || null;
  const p21 = roomResults?.[21] || roomResults?.["21"] || null;
  const p15Measured = p15?.status === "measured";
  const p21Measured = p21?.status === "measured";
  return {
    p15: {
      level: p15?.level || "L2",
      status: p15Measured ? "Measured" : "Assumed",
      value: p15?.formatted || (p15Measured ? null : "NCB 22"),
      note: p15Measured ? null : "Design target: NCB 22",
    },
    p21: {
      level: p21?.level || "L2",
      status: p21Measured ? "Measured" : "Assumed",
      value: p21Measured ? (p21?.formatted || null) : null,
      note: p21Measured ? null : "Early reflections have not been measured. Level 2 is used as the design assumption.",
    },
  };
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
    primary: extractGenuineParameters(parameterAuthority, summary.parameterSummaries?.primary),
    secondary: extractGenuineParameters(parameterAuthority, summary.parameterSummaries?.secondary),
    all: extractGenuineParameters(parameterAuthority, summary.parameterSummaries?.project),
  };

  // ── Bass ──
  const bass = extractBassSummary(summary, parameterAuthority);

  // ── Permanent unmeasured design assumptions ──
  const assumptions = extractDesignAssumptions(summary);

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
    assumptions,
    viewing,
  };
}