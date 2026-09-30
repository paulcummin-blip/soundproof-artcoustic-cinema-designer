// adiAbfuserRecommendation.js
// --------------------------------
// ADI STRATEGIC REFLECTION CONTROL — the single authority for how many
// Artcoustic Abfuser panels are recommended for a room.
//
// It replaces the previous broad surface-area percentage method, which
// over-specified treatment for normal domestic cinema rooms (20+ panels).
//
// The recommendation is strategic and geometry-aware:
//   1. Side-wall first reflections   — mirror points between the front LCR and
//                                      the listening area (2 panels per side)
//   2. Rear-wall reflection control  — 2 panels, up to 4 in larger rooms
//   3. Ceiling reflections           — optional / advisory only, never counted
//   4. Front / screen wall           — never automatic
//   5. Bass                          — Abfusers are never recommended as bass traps
//
// Quantity is bounded by professional bands and by a hard automatic cap of 12
// panels. Anything above the cap is classified as "Full acoustic treatment
// design required" and the excess is not carried into product or pricing.
//
// recommendedQuantity is ADI guidance. selectedQuantity is the designer's
// decision (0 until accepted), and only selectedQuantity is ever priced.

import {
  computeAbfuserTreatmentZones,
  deriveSeatRowCount,
  ZONE_DEPTH_M,
} from "./abfuserTreatmentZones";
import {
  ABFUSER_PRODUCT,
  ABFUSER_SKU,
  ABFUSER_LABEL,
  ABFUSER_BASS_NOTE,
  abfuserAbsorptionArea,
  abfuserTotalAreaM2,
} from "./adiAbfuserProduct";

export const ABFUSER_AUTHORITY = "ADI_STRATEGIC_REFLECTION_CONTROL";

export const ABFUSER_STATUS = Object.freeze({
  OK: "OK",
  NOT_CALCULATED: "NOT_CALCULATED",
  FULL_DESIGN_REQUIRED: "FULL_DESIGN_REQUIRED",
});

export const ABFUSER_MAX_AUTO_QTY = 12;
export const ABFUSER_SIDE_PANELS_PER_SIDE = 2;
export const ABFUSER_REAR_PANELS_BASE = 2;
export const ABFUSER_CEILING_ADVISORY_PANELS = 2;
export const ABFUSER_CEILING_ADVISORY_MAX_HEIGHT_M = 2.4;
export const ABFUSER_FULL_DESIGN_MESSAGE = "Full acoustic treatment design required";

// Professional quantity bands.
export const ABFUSER_BANDS = Object.freeze({
  small: { min: 4, max: 6, label: "Small room / one row" },
  medium: { min: 6, max: 8, label: "Medium room / one or two rows" },
  large: { min: 8, max: 12, label: "Large room / two or three rows" },
});

export { ABFUSER_SKU, ABFUSER_LABEL, ABFUSER_PRODUCT };

function resolveBand({ volumeM3, rowCount }) {
  if (volumeM3 >= 100 || rowCount >= 3) return "large";
  if (volumeM3 < 50 && rowCount <= 1) return "small";
  return "medium";
}

function readNumber(...candidates) {
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * ADI strategic Abfuser recommendation.
 *
 * @param {Object} params
 * @param {Object} params.room           - { widthM, lengthM, heightM }
 * @param {Array}  params.speakers       - placed speakers (role + position)
 * @param {Array}  params.seating        - seating positions (x, y)
 * @param {Object} params.screen         - screen state (screen-wall intent only)
 * @param {Object} params.acousticTreatmentSettings - { enabled, selectedQuantity,
 *                                         quantitySource, legacyAutoQuantity }
 * @returns {Object} recommendation result
 */
export function calculateAbfuserRecommendation({
  room,
  roomDims,
  speakers,
  placedSpeakers,
  seating,
  seatingPositions,
  screen,
  acousticTreatmentSettings = {},
  settings = {},
} = {}) {
  const opts = { ...settings, ...acousticTreatmentSettings };
  const dims = room || roomDims || {};
  const speakerList = Array.isArray(speakers)
    ? speakers
    : (Array.isArray(placedSpeakers) ? placedSpeakers : []);
  const seatList = Array.isArray(seating)
    ? seating
    : (Array.isArray(seatingPositions) ? seatingPositions : []);

  const selectedQuantity = Math.max(
    0,
    Math.floor(Number(opts.selectedQuantity ?? opts.selectedAbfuserQty) || 0)
  );
  const legacyAutoQuantity = Math.max(
    0,
    Math.floor(Number(opts.legacyAutoQuantity ?? opts.legacyAbfuserAutoQty) || 0)
  );
  const quantitySource = String(
    opts.quantitySource ?? opts.abfuserQtySource ?? (selectedQuantity > 0 ? "user" : "none")
  );
  const enabled = opts.enabled === true || opts.acousticTreatmentEnabled === true;

  const shared = {
    authority: ABFUSER_AUTHORITY,
    product: ABFUSER_PRODUCT,
    sku: ABFUSER_SKU,
    label: ABFUSER_LABEL,
    recommendedQuantity: 0,
    selectedQuantity,
    legacyAutoQuantity,
    quantitySource,
    enabled,
    zones: [],
    quantityByZone: { left: 0, right: 0, rear: 0, ceilingAdvisory: 0, counted: 0 },
    totalRecommendedAreaM2: 0,
    estimatedEffect: null,
    screen,
  };

  const widthM = readNumber(dims.widthM, dims.room_width);
  const lengthM = readNumber(dims.lengthM, dims.room_length);
  const heightM = readNumber(dims.heightM, dims.room_height);

  if (!(widthM > 0) || !(lengthM > 0) || !(heightM > 0)) {
    return {
      ...shared,
      status: ABFUSER_STATUS.NOT_CALCULATED,
      statusMessage: "Room geometry is not available yet.",
      band: null,
    };
  }

  const volumeM3 = widthM * lengthM * heightM;
  const rowCount = deriveSeatRowCount(seatList) || 1;
  const band = resolveBand({ volumeM3, rowCount });
  const bandRange = ABFUSER_BANDS[band];

  const geometry = computeAbfuserTreatmentZones({
    roomDims: { widthM, lengthM },
    placedSpeakers: speakerList,
    seatingPositions: seatList,
  });

  const listeningDepthM = geometry?.listeningAreaDepth ?? 0;
  const seatingWidthM = geometry?.listeningAreaWidth ?? 0;

  // Extended zones: a genuinely large room with a wide, multi-row listening area
  // is the only case where the automatic quantity may exceed the professional
  // band. The excess is never carried into product or pricing.
  const extendedZones = volumeM3 >= 200 || (rowCount >= 3 && seatingWidthM >= 5);

  const sidePanelsPerSide = extendedZones
    ? 4
    : (band === "large" && (rowCount >= 2 || listeningDepthM >= 2.8))
      ? 3
      : ABFUSER_SIDE_PANELS_PER_SIDE;

  const rearPanels = extendedZones
    ? 6
    : (band === "large" && seatingWidthM >= 3.2)
      ? 4
      : ABFUSER_REAR_PANELS_BASE;

  const rawQuantity = sidePanelsPerSide * 2 + rearPanels;
  const exceedsAutomaticCap = rawQuantity > ABFUSER_MAX_AUTO_QTY;
  const recommendedQuantity = Math.min(rawQuantity, ABFUSER_MAX_AUTO_QTY);
  const excessQuantity = exceedsAutomaticCap ? rawQuantity - ABFUSER_MAX_AUTO_QTY : 0;
  const status = exceedsAutomaticCap
    ? ABFUSER_STATUS.FULL_DESIGN_REQUIRED
    : ABFUSER_STATUS.OK;

  // ── Zones ──
  const zones = [];

  if (geometry) {
    zones.push({
      id: "side-left",
      key: "side_left_first_reflection",
      label: "Left side-wall first reflection",
      shortLabel: "Left first reflection",
      wall: "left",
      surface: "wall",
      panels: sidePanelsPerSide,
      advisory: false,
      rect: {
        x: 0,
        y: geometry.leftZone.start,
        width: ZONE_DEPTH_M,
        height: geometry.leftZone.length,
      },
    });
    zones.push({
      id: "side-right",
      key: "side_right_first_reflection",
      label: "Right side-wall first reflection",
      shortLabel: "Right first reflection",
      wall: "right",
      surface: "wall",
      panels: sidePanelsPerSide,
      advisory: false,
      rect: {
        x: widthM - ZONE_DEPTH_M,
        y: geometry.rightZone.start,
        width: ZONE_DEPTH_M,
        height: geometry.rightZone.length,
      },
    });
    zones.push({
      id: "rear-wall",
      key: "rear_wall_reflection_control",
      label: "Rear wall reflection control",
      shortLabel: "Rear wall",
      wall: "rear",
      surface: "wall",
      panels: rearPanels,
      advisory: false,
      rect: {
        x: geometry.rearZone.minX,
        y: lengthM - ZONE_DEPTH_M,
        width: geometry.rearZone.width,
        height: ZONE_DEPTH_M,
      },
    });
  }

  // Ceiling: advisory only, and only when the ceiling is genuinely low.
  // Never counted toward recommendedQuantity or pricing.
  const lowCeiling = heightM < ABFUSER_CEILING_ADVISORY_MAX_HEIGHT_M;
  if (lowCeiling) {
    zones.push({
      id: "ceiling",
      key: "ceiling_reflection_control",
      label: "Ceiling reflection control (advisory)",
      shortLabel: "Ceiling (optional)",
      wall: "ceiling",
      surface: "ceiling",
      panels: ABFUSER_CEILING_ADVISORY_PANELS,
      advisory: true,
      rect: {
        x: widthM * 0.15,
        y: lengthM * 0.35,
        width: widthM * 0.7,
        height: lengthM * 0.3,
      },
    });
  }

  const totalRecommendedAreaM2 = Number(abfuserTotalAreaM2(recommendedQuantity).toFixed(2));
  const absorption = abfuserAbsorptionArea(recommendedQuantity);

  const estimatedEffect = {
    panelCount: recommendedQuantity,
    areaM2: totalRecommendedAreaM2,
    absorptionByBand: absorption.byBand,
    statement:
      `${recommendedQuantity} × Abfuser adds ${totalRecommendedAreaM2} m² of absorption-grade panel area. `
      + "Each panel is 0.77 m² and provides strong absorption from 500 Hz upward, so this quantity "
      + "makes a meaningful difference to reflection control without over-treating the room.",
    bassNote: ABFUSER_BASS_NOTE,
    bassTreatment: false,
  };

  const notes = [
    "No Abfuser panels are recommended behind an acoustically transparent screen unless a specific acoustic reason is identified.",
    ABFUSER_BASS_NOTE,
  ];
  if (exceedsAutomaticCap) {
    notes.push(
      `The identified treatment zones require ${rawQuantity} panels (${totalRecommendedAreaM2} m² for the automatic cap of ${ABFUSER_MAX_AUTO_QTY}). ${ABFUSER_FULL_DESIGN_MESSAGE}.`
    );
  }
  if (lowCeiling) {
    notes.push("The ceiling is low, so an optional ceiling pair is offered as advisory only.");
  }

  return {
    ...shared,
    status,
    statusMessage: exceedsAutomaticCap
      ? ABFUSER_FULL_DESIGN_MESSAGE
      : `ADI recommends ${recommendedQuantity} Abfusers for this room.`,
    band,
    bandLabel: bandRange.label,
    bandRange,
    rowCount,
    volumeM3,
    widthM,
    lengthM,
    heightM,
    sidePanelsPerSide,
    rearPanels,
    rawQuantity,
    recommendedQuantity,
    excessQuantity,
    exceedsAutomaticCap,
    totalRecommendedAreaM2,
    quantityByZone: {
      left: sidePanelsPerSide,
      right: sidePanelsPerSide,
      rear: rearPanels,
      ceilingAdvisory: lowCeiling ? ABFUSER_CEILING_ADVISORY_PANELS : 0,
      counted: recommendedQuantity,
    },
    zones,
    estimatedEffect,
    geometry,
    listeningDepthM,
    seatingWidthM,
    rearClearanceM: geometry?.rearClearanceM ?? null,
    notes,
  };
}

/**
 * Client-facing recommendation sentence.
 */
export function describeAbfuserRecommendation(recommendation) {
  const quantity = Math.max(0, Math.floor(Number(recommendation?.recommendedQuantity) || 0));
  if (quantity <= 0) return "";

  const byZone = recommendation?.quantityByZone || {};
  const parts = [];
  if ((byZone.left || 0) + (byZone.right || 0) > 0) parts.push("the primary side-wall reflections");
  if ((byZone.rear || 0) > 0) parts.push("rear-wall reflection energy");
  if ((byZone.ceilingAdvisory || 0) > 0) parts.push("the optional low-ceiling reflection path");

  const targets = parts.length > 0 ? parts.join(" and ") : "the primary reflection points";

  return `ADI recommends ${quantity} Abfusers to control ${targets}. `
    + "This is a targeted acoustic treatment recommendation, not a full acoustic design.";
}

/**
 * Client-facing recommendation paragraph (report body copy).
 */
export function describeAbfuserRecommendationParagraph(recommendation) {
  const quantity = Math.max(0, Math.floor(Number(recommendation?.recommendedQuantity) || 0));
  if (quantity <= 0) return "";

  const byZone = recommendation?.quantityByZone || {};
  const focus = [];
  if ((byZone.left || 0) + (byZone.right || 0) > 0) focus.push("the main side-wall reflection points");
  if ((byZone.rear || 0) > 0) focus.push("rear-wall reflection control");
  const focusText = focus.length > 0 ? focus.join(" and ") : "the main reflection points";

  return `ADI recommends ${quantity} Abfusers for this room. The recommendation focuses on ${focusText}. `
    + "Each Abfuser is 0.77 m² and provides strong absorption from 500 Hz upward, so this quantity is "
    + "enough to make a meaningful difference without over-treating the room.";
}

/**
 * Selected-versus-recommended status. Pricing and product inclusion follow the
 * selected quantity only.
 */
export function describeAbfuserInclusion({ recommendedQuantity, selectedQuantity }) {
  const recommended = Math.max(0, Math.floor(Number(recommendedQuantity) || 0));
  const selected = Math.max(0, Math.floor(Number(selectedQuantity) || 0));

  if (selected <= 0) {
    return { state: "NOT_INCLUDED", message: "Not currently included in pricing." };
  }
  if (selected === recommended) {
    return { state: "INCLUDED", message: "Included in proposal." };
  }
  if (selected > recommended) {
    return {
      state: "ABOVE_RECOMMENDATION",
      message: "Designer selected quantity is above the ADI recommendation. Confirm this reflects a deliberate acoustic design choice.",
    };
  }
  return {
    state: "BELOW_RECOMMENDATION",
    message: `Included in proposal at ${selected} of the ${recommended} recommended Abfusers.`,
  };
}