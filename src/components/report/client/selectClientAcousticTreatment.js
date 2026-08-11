// selectClientAcousticTreatment.js
// --------------------------------
// Pure selector that computes simple treatment-zone rectangles and Abfuser panel
// positions for the Client Visual Report Acoustic Treatment page.
//
// This is deliberately simple — NOT a detailed acoustic simulation.
// It distributes the selected Abfuser quantity across three understandable zones:
//   A. Side-wall reflection treatment (left + right first-reflection regions)
//   B. Rear-wall treatment (behind the listening area)
//   C. Ceiling treatment (above the listening area, only when allocated)
//
// Abfuser physical dimensions: 700 × 1100 mm.

const ABFUSER_WIDTH_M = 0.70;
const ABFUSER_HEIGHT_M = 1.10;

// Zone allocation: roughly 50% side, 30% rear, 20% ceiling (when ceiling is used).
// For small quantities, ceiling is skipped and the split is 60/40 side/rear.
const CEILING_THRESHOLD_QTY = 8;

export function selectClientAcousticTreatment({
  roomDims,
  seatingPositions = [],
  rsp,
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
}) {
  if (!acousticTreatmentEnabled || !Number.isFinite(selectedAbfuserQty) || selectedAbfuserQty <= 0) {
    return { hasAny: false, zones: [], panels: [], selectedQty: 0 };
  }

  const widthM = Number(roomDims?.widthM) || 4.5;
  const lengthM = Number(roomDims?.lengthM) || 6.0;
  const qty = Math.floor(selectedAbfuserQty);

  // Listening position Y (fallback to room centre if no RSP)
  const mlpY = Number.isFinite(rsp?.y) ? rsp.y : lengthM * 0.6;
  const mlpX = Number.isFinite(rsp?.x) ? rsp.x : widthM / 2;

  // Side-wall first-reflection point: roughly midway between screen (y≈0) and MLP
  const sideReflectionY = mlpY * 0.5;
  const sideZoneLength = Math.min(2.0, mlpY * 0.6);
  const sideZoneStartY = Math.max(0.3, sideReflectionY - sideZoneLength / 2);

  // Rear-wall zone: behind the MLP, from mlpY + 0.5m to the back wall
  const rearZoneStartY = Math.min(lengthM - 0.3, mlpY + 0.5);
  const rearZoneLength = Math.max(0.5, lengthM - rearZoneStartY - 0.1);

  // Distribute panels across zones
  const useCeiling = qty >= CEILING_THRESHOLD_QTY;
  let sideQty, rearQty, ceilingQty;

  if (useCeiling) {
    sideQty = Math.round(qty * 0.50);
    rearQty = Math.round(qty * 0.30);
    ceilingQty = qty - sideQty - rearQty;
  } else {
    sideQty = Math.round(qty * 0.60);
    rearQty = qty - sideQty;
    ceilingQty = 0;
  }

  // Ensure minimums are sensible
  if (sideQty < 2 && qty >= 2) { sideQty = 2; rearQty = qty - sideQty - ceilingQty; }
  if (rearQty < 0) rearQty = 0;

  // ── Build zone rectangles (in room metres) ──
  const zones = [];

  // A. Side reflection zones (left + right)
  if (sideQty > 0) {
    zones.push({
      id: "side-left",
      label: "Side reflection treatment",
      x: 0,
      y: sideZoneStartY,
      width: 0.3,
      height: sideZoneLength,
      fill: "rgba(33, 52, 40, 0.12)",
      stroke: "#213428",
    });
    zones.push({
      id: "side-right",
      label: "Side reflection treatment",
      x: widthM - 0.3,
      y: sideZoneStartY,
      width: 0.3,
      height: sideZoneLength,
      fill: "rgba(33, 52, 40, 0.12)",
      stroke: "#213428",
    });
  }

  // B. Rear wall zone
  if (rearQty > 0) {
    zones.push({
      id: "rear-wall",
      label: "Rear wall treatment",
      x: 0,
      y: rearZoneStartY,
      width: widthM,
      height: rearZoneLength,
      fill: "rgba(33, 52, 40, 0.10)",
      stroke: "#213428",
    });
  }

  // C. Ceiling zone (represented as a dashed outline in plan view)
  if (ceilingQty > 0) {
    const ceilWidth = Math.min(widthM * 0.6, 3.0);
    const ceilLength = Math.min(2.0, mlpY * 0.5);
    zones.push({
      id: "ceiling",
      label: "Ceiling treatment",
      x: (widthM - ceilWidth) / 2,
      y: Math.max(0.3, mlpY - ceilLength / 2),
      width: ceilWidth,
      height: ceilLength,
      fill: "rgba(33, 52, 40, 0.06)",
      stroke: "#213428",
      dashed: true,
    });
  }

  // ── Build panel positions (in room metres) ──
  const panels = [];

  // Side panels: distribute evenly along each side wall
  if (sideQty > 0) {
    const perSide = Math.ceil(sideQty / 2);
    const sideSpan = sideZoneLength;
    for (let i = 0; i < perSide; i++) {
      const frac = perSide === 1 ? 0.5 : i / (perSide - 1);
      const panelY = sideZoneStartY + frac * (sideSpan - ABFUSER_HEIGHT_M) + ABFUSER_HEIGHT_M / 2;
      // Left wall
      if (i < perSide) {
        panels.push({
          id: `panel-side-l-${i}`,
          x: 0.02,
          y: panelY - ABFUSER_HEIGHT_M / 2,
          width: ABFUSER_WIDTH_M,
          height: ABFUSER_HEIGHT_M,
          zone: "side",
        });
      }
      // Right wall (mirror)
      const rightIdx = sideQty - perSide > i ? i : null;
      if (rightIdx !== null) {
        panels.push({
          id: `panel-side-r-${i}`,
          x: widthM - ABFUSER_WIDTH_M - 0.02,
          y: panelY - ABFUSER_HEIGHT_M / 2,
          width: ABFUSER_WIDTH_M,
          height: ABFUSER_HEIGHT_M,
          zone: "side",
        });
      }
    }
  }

  // Rear panels: distribute across the rear wall.
  // Panel CENTRES are distributed within [rearMargin + half-width, widthM - rearMargin - half-width]
  // so the full 0.70 m panel rectangle stays inside the room walls.
  // In narrow rooms the span compresses (panels may touch/overlap) but never exit the room.
  if (rearQty > 0) {
    const rearMargin = 0.10;
    const rearSpan = Math.max(0, widthM - ABFUSER_WIDTH_M - rearMargin * 2);
    const firstCenter = rearMargin + ABFUSER_WIDTH_M / 2;
    for (let i = 0; i < rearQty; i++) {
      const frac = rearQty === 1 ? 0.5 : i / (rearQty - 1);
      const panelCenterX = firstCenter + frac * rearSpan;
      panels.push({
        id: `panel-rear-${i}`,
        x: panelCenterX - ABFUSER_WIDTH_M / 2,
        y: rearZoneStartY + 0.05,
        width: ABFUSER_WIDTH_M,
        height: ABFUSER_HEIGHT_M,
        zone: "rear",
      });
    }
  }

  // Ceiling panels: distribute in a grid pattern
  if (ceilingQty > 0) {
    const ceilZone = zones.find((z) => z.id === "ceiling");
    if (ceilZone) {
      const cols = Math.ceil(Math.sqrt(ceilingQty));
      const rows = Math.ceil(ceilingQty / cols);
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (idx >= ceilingQty) break;
          const colSpan = ceilZone.width / cols;
          const rowSpan = ceilZone.height / rows;
          panels.push({
            id: `panel-ceiling-${idx}`,
            x: ceilZone.x + c * colSpan + (colSpan - ABFUSER_WIDTH_M) / 2,
            y: ceilZone.y + r * rowSpan + (rowSpan - ABFUSER_HEIGHT_M) / 2,
            width: ABFUSER_WIDTH_M,
            height: ABFUSER_HEIGHT_M,
            zone: "ceiling",
            isCeiling: true,
          });
          idx++;
        }
      }
    }
  }

  return {
    hasAny: true,
    zones,
    panels,
    selectedQty: qty,
    sideQty,
    rearQty,
    ceilingQty,
    abfuserDimensions: { widthM: ABFUSER_WIDTH_M, heightM: ABFUSER_HEIGHT_M },
  };
}