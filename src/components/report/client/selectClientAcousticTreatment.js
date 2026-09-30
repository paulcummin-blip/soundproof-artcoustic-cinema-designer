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

const ABFUSER_ALONG_WALL_M = ABFUSER_PRODUCT.widthMm / 1000; // 0.70 m

// Panels are placed edge-to-edge, centred within their treatment zone.
function markerRun(zoneStart, zoneEnd, panels) {
  const count = Math.max(0, Math.floor(panels || 0));
  if (count === 0) return [];
  const span = count * ABFUSER_ALONG_WALL_M;
  const centre = (zoneStart + zoneEnd) / 2;
  let cursor = centre - span / 2;

  // Keep the run inside the zone where the zone is long enough; otherwise
  // centre it on the zone.
  if (span <= (zoneEnd - zoneStart)) {
    cursor = Math.max(zoneStart, Math.min(cursor, zoneEnd - span));
  }

  const runs = [];
  for (let i = 0; i < count; i += 1) {
    runs.push({ start: cursor, length: ABFUSER_ALONG_WALL_M });
    cursor += ABFUSER_ALONG_WALL_M;
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

  if (recommendation.status === ABFUSER_STATUS.NOT_CALCULATED) {
    return {
      hasAny: false,
      zones: [],
      markers: [],
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
      const runs = markerRun(rect.y, rect.y + rect.height, zone.panels);
      runs.forEach((run, index) => {
        markers.push({
          key: `${zone.id}-${index}`,
          zoneId: zone.id,
          wall: zone.wall,
          advisory: zone.advisory,
          x: rect.x,
          y: run.start,
          width: rect.width,
          height: run.length,
        });
      });
    } else if (zone.wall === "rear") {
      const runs = markerRun(rect.x, rect.x + rect.width, zone.panels);
      runs.forEach((run, index) => {
        markers.push({
          key: `${zone.id}-${index}`,
          zoneId: zone.id,
          wall: zone.wall,
          advisory: zone.advisory,
          x: run.start,
          y: rect.y,
          width: run.length,
          height: rect.height,
        });
      });
    }
  }

  return {
    hasAny: true,
    zones,
    markers,
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