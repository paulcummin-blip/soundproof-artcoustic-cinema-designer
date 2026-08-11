// selectClientAcousticTreatment.js
// --------------------------------
// Pure selector that computes wall-hugging treatment-zone rectangles for the
// Client Visual Report Acoustic Treatment page.
//
// Zones are narrow bands immediately inside the wall boundary (NOT floor areas).
// Side reflection zones are derived from actual speaker/seating geometry via
// the image-source method. The rear zone width follows the seating envelope.
//
// No ceiling zone. No individual Abfuser markers.

import { computeAbfuserTreatmentZones, ZONE_DEPTH_M } from "@/components/utils/abfuserTreatmentZones";

export function selectClientAcousticTreatment({
  roomDims,
  seatingPositions = [],
  placedSpeakers = [],
  rsp,
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
}) {
  if (!acousticTreatmentEnabled || !Number.isFinite(selectedAbfuserQty) || selectedAbfuserQty <= 0) {
    return { hasAny: false, zones: [], selectedQty: 0, quantityBreakdown: null };
  }

  const zoneData = computeAbfuserTreatmentZones({ roomDims, placedSpeakers, seatingPositions });
  if (!zoneData) {
    return { hasAny: false, zones: [], selectedQty: 0, quantityBreakdown: null };
  }

  const widthM = Number(roomDims?.widthM) || 4.5;
  const lengthM = Number(roomDims?.lengthM) || 6.0;
  const depth = ZONE_DEPTH_M;

  // Wall-hugging zone rectangles (narrow bands)
  const zones = [
    {
      id: "side-left",
      label: "PRIMARY REFLECTION TREATMENT",
      x: 0,
      y: zoneData.leftZone.start,
      width: depth,
      height: zoneData.leftZone.length,
      wall: "left",
    },
    {
      id: "side-right",
      label: "PRIMARY REFLECTION TREATMENT",
      x: widthM - depth,
      y: zoneData.rightZone.start,
      width: depth,
      height: zoneData.rightZone.length,
      wall: "right",
    },
    {
      id: "rear-wall",
      label: "REAR SOUND CONTROL",
      x: zoneData.rearZone.minX,
      y: lengthM - depth,
      width: zoneData.rearZone.width,
      height: depth,
      wall: "rear",
    },
  ];

  return {
    hasAny: true,
    zones,
    selectedQty: Math.floor(selectedAbfuserQty),
    quantityBreakdown: {
      leftPanels: zoneData.leftPanels,
      rightPanels: zoneData.rightPanels,
      rearPanels: zoneData.rearPanels,
      recommendedQty: zoneData.recommendedQty,
      treatmentSurfaceArea: zoneData.treatmentSurfaceArea,
      listeningAreaWidth: zoneData.listeningAreaWidth,
      listeningAreaDepth: zoneData.listeningAreaDepth,
    },
  };
}