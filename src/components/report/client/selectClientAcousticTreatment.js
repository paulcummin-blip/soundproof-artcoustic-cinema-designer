// selectClientAcousticTreatment.js
// --------------------------------
// Pure selector for the client-facing Acoustic Treatment page.
//
// Quantity authority: ADI strategic reflection control
// (adiAbfuserRecommendation.js). This selector only converts the
// recommendation into plan-view geometry (zones + individual Abfuser markers)
// and into the client-facing wording.
//
// Recommended and selected quantities are separate: the recommendation is ADI
// guidance, the selected quantity is the designer's decision and the only
// quantity that is priced.

import { ZONE_DEPTH_M } from "@/components/utils/abfuserTreatmentZones";
import { ABFUSER_PRODUCT } from "@/components/utils/adiAbfuserProduct";
import {
  calculateAbfuserRecommendation,
  describeAbfuserRecommendation,
  describeAbfuserRecommendationParagraph,
  describeAbfuserInclusion,
  ABFUSER_STATUS,
} from "@/components/utils/adiAbfuserRecommendation";

// Real product footprint in plan: 700 mm along the wall × 18 mm off the wall.
const ABFUSER_ALONG_WALL_M = Number(ABFUSER_PRODUCT.widthMm) / 1000; // 0.70 m
const ABFUSER_DEPTH_M = Number(ABFUSER_PRODUCT.depthMm) / 1000; // 0.018 m
const PANEL_SIZE_AVAILABLE = ABFUSER_ALONG_WALL_M > 0 && ABFUSER_DEPTH_M > 0;

// Panels are installed edge-to-edge on a 700 mm pitch. A 10 mm visual joint is
// drawn between adjacent panels so each panel reads as a separate panel rather
// than one bar; it changes the drawing only, never the panel size or the pitch.
const PANEL_JOINT_M = 0.01;

// Panels are placed edge-to-edge, centred within their treatment zone.
function markerRun(zoneStart, zoneEnd, panels, alongWallM = ABFUSER_ALONG_WALL_M) {
  const count = Math.max(0, Math.floor(panels || 0));
  if (count === 0) return [];
  const zoneLength = Math.max(0, zoneEnd - zoneStart);
  // Real 0.70 m panel width. If the product data carries no usable width the
  // run is divided evenly across the zone so the count is still shown — the
  // report labels that drawing as schematic.
  const panelWidth = alongWallM > 0 ? alongWallM : zoneLength / count;
  const span = count * panelWidth;
  const centre = (zoneStart + zoneEnd) / 2;
  let cursor = centre - span / 2;

  // Keep the run inside the zone where the zone is long enough; otherwise
  // centre it on the zone.
  if (span <= zoneLength) {
    cursor = Math.max(zoneStart, Math.min(cursor, zoneEnd - span));
  }

  const runs = [];
  for (let i = 0; i < count; i += 1) {
    runs.push({ start: cursor, length: panelWidth });
    cursor += panelWidth;
  }
  return runs;
}

export function selectClientAcousticTreatment({
  roomDims,
  seatingPositions = [],
  placedSpeakers = [],
  rsp,
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
  legacyAutoQuantity = 0,
  abfuserQtySource = null,
}) {
  const recommendation = calculateAbfuserRecommendation({
    room: roomDims,
    speakers: placedSpeakers,
    seating: seatingPositions,
    acousticTreatmentSettings: {
      enabled: !!acousticTreatmentEnabled,
      selectedQuantity: Number(selectedAbfuserQty) || 0,
      legacyAutoQuantity: Number(legacyAutoQuantity) || 0,
      quantitySource: abfuserQtySource || undefined,
    },
  });

  const widthM = Number(roomDims?.widthM) || 4.5;
  const lengthM = Number(roomDims?.lengthM) || 6.0;
  const depth = ZONE_DEPTH_M;
  const recommendedQty = recommendation.recommendedQuantity;
  const selectedQty = recommendation.selectedQuantity;

  const inclusion = describeAbfuserInclusion({
    recommendedQuantity: recommendedQty,
    selectedQuantity: selectedQty,
    enabled: !!acousticTreatmentEnabled,
  });

  // The panel size the drawing and its legend read. Single source: the product.
  const panel = {
    label: ABFUSER_PRODUCT.label,
    widthM: ABFUSER_ALONG_WALL_M,
    heightM: Number(ABFUSER_PRODUCT.heightMm) / 1000,
    depthM: ABFUSER_DEPTH_M,
    jointM: PANEL_SIZE_AVAILABLE ? PANEL_JOINT_M : 0,
    sizeAvailable: PANEL_SIZE_AVAILABLE,
  };

  if (recommendation.status === ABFUSER_STATUS.NOT_CALCULATED) {
    return {
      hasAny: false,
      zones: [],
      markers: [],
      panel,
      recommendation,
      recommendedQty: 0,
      selectedQty,
      inclusion,
      wording: {
        headline: "",
        paragraph: "",
        recommendationSentence: "",
        inclusionMessage: inclusion.message,
      },
      quantityBreakdown: null,
    };
  }

  const zones = [];
  const markers = [];

  for (const zone of recommendation.zones) {
    const rect = zone.rect;
    zones.push({
      id: zone.id,
      label: zone.label,
      shortLabel: zone.shortLabel,
      wall: zone.wall,
      surface: zone.surface,
      panels: zone.panels,
      advisory: zone.advisory,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });

    if (zone.wall === "left" || zone.wall === "right") {
      // Panels sit against the wall face at their real size: 700 mm along the
      // wall × 18 mm thick. The zone is a pale guide area, not the coverage —
      // panels are never stretched to fill it.
      const depthM = PANEL_SIZE_AVAILABLE ? ABFUSER_DEPTH_M : rect.width;
      const jointM = PANEL_SIZE_AVAILABLE ? PANEL_JOINT_M : 0;
      const runs = markerRun(rect.y, rect.y + rect.height, zone.panels);
      runs.forEach((run, index) => {
        markers.push({
          key: `${zone.id}-${index}`,
          zoneId: zone.id,
          wall: zone.wall,
          advisory: zone.advisory,
          x: zone.wall === "left" ? 0 : widthM - depthM,
          y: run.start + jointM / 2,
          width: depthM,
          height: Math.max(jointM, Number((run.length - jointM).toFixed(3))),
        });
      });
    } else if (zone.wall === "rear") {
      const depthM = PANEL_SIZE_AVAILABLE ? ABFUSER_DEPTH_M : rect.height;
      const jointM = PANEL_SIZE_AVAILABLE ? PANEL_JOINT_M : 0;
      const runs = markerRun(rect.x, rect.x + rect.width, zone.panels);
      runs.forEach((run, index) => {
        markers.push({
          key: `${zone.id}-${index}`,
          zoneId: zone.id,
          wall: zone.wall,
          advisory: zone.advisory,
          x: run.start + jointM / 2,
          y: lengthM - depthM,
          width: Math.max(jointM, Number((run.length - jointM).toFixed(3))),
          height: depthM,
        });
      });
    }
  }

  return {
    hasAny: true,
    zones,
    markers,
    panel,
    recommendation,
    recommendedQty,
    selectedQty,
    inclusion,
    wording: {
      headline: `ADI Acoustic Treatment Recommendation`,
      paragraph: describeAbfuserRecommendationParagraph(recommendation),
      recommendationSentence: describeAbfuserRecommendation(recommendation),
      inclusionMessage: inclusion.message,
    },
    quantityBreakdown: {
      leftPanels: recommendation.quantityByZone.left,
      rightPanels: recommendation.quantityByZone.right,
      rearPanels: recommendation.quantityByZone.rear,
      ceilingAdvisoryPanels: recommendation.quantityByZone.ceilingAdvisory,
      recommendedQty,
      selectedQty,
      treatmentSurfaceArea: recommendation.totalRecommendedAreaM2,
      listeningAreaWidth: recommendation.geometry?.listeningAreaWidth ?? 0,
      listeningAreaDepth: recommendation.geometry?.listeningAreaDepth ?? 0,
    },
    roomPlan: { widthM, lengthM, depth },
  };
}