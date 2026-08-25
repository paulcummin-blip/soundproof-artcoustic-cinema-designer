// Pure RSP authority — the SINGLE calculation used by both project hydration
// (hydrateProjectIntoAppState) and the useEffectiveRsp hook.
//
// Dependency-free (no @/ alias, no React) so it runs under bare Node for
// cold-hydration fingerprint regression tests.
//
// Preserves all existing modes: auto_from_screen, manual_position,
// row-derived modes, and the currentMlpY_m fallback.

// RP23: distance from screen front plane to MLP for a given screen *width*
// at 57.5° H-FOV. Inlined here to keep this module dependency-free (the
// canonical copy lives in seatingUtils.jsx; the formula is a primitive).
function distanceFor57_5FromWidth(widthM) {
  const halfFov = (57.5 / 2) * Math.PI / 180;
  return widthM / (2 * Math.tan(halfFov));
}

const ROW_MODE_LABELS = {
  front_row_center:  "Front Row Centre",
  middle_row_center: "Middle Row Centre",
  back_row_center:   "Back Row Centre",
  all_rows_average:  "All Rows Average",
};

/**
 * Compute the effective RSP (Reference Seating Position) from the chosen
 * rspMode and its associated inputs. Pure: no React, no side effects.
 *
 * @param {string}      rspMode              - e.g. "auto_from_screen"
 * @param {number|null} manualRspY_m          - explicit Y when mode is manual_position
 * @param {number|null} manualRspX_m          - explicit X (ignored — manual drag is Y-axis only)
 * @param {number}      roomWidthM            - room width in metres (for centreline X)
 * @param {number}      screenFrontPlaneM     - Y of screen front face (metres)
 * @param {number}      screenWidthM          - viewable screen width in metres
 * @param {number[]}    rowCentersM           - array of row-centre Y values (reserved)
 * @param {object[]}    seatingPositions      - seat objects (reserved)
 * @param {number|null} currentMlpY_m         - existing mlpY_m, used as fallback
 * @param {object}      rowDerivedRspYByMode  - precomputed Y per row-derived mode
 * @returns {{ effectiveRspX_m: number|null, effectiveRspY_m: number|null, rspSourceLabel: string }}
 */
export function computeEffectiveRsp({
  rspMode,
  manualRspY_m,
  manualRspX_m,
  roomWidthM,
  screenFrontPlaneM,
  screenWidthM,
  rowCentersM,
  seatingPositions,
  currentMlpY_m,
  rowDerivedRspYByMode = {},
  designatedRspSeat = null,
}) {
  const centrelineX = Number.isFinite(Number(roomWidthM)) ? Number(roomWidthM) / 2 : null;

  // ── seat_bound ───────────────────────────────────────────────────────────
  // The canonical RSP is bound to a designated real seat. Use its exact X/Y
  // so the green-dot visual matches the seat. The bass engine RSP uses the
  // same exact coordinates via buildAuthoritativeRspPosition (which receives
  // the resolved seat directly), guaranteeing P20 = 0 for that seat.
  if (rspMode === "seat_bound") {
    const seat = designatedRspSeat;
    if (seat && Number.isFinite(Number(seat.x)) && Number.isFinite(Number(seat.y))) {
      return {
        effectiveRspX_m: Number(seat.x),
        effectiveRspY_m: Number(seat.y),
        rspSourceLabel: "Seat-bound RSP",
      };
    }
    // Designated seat missing — fall through to fallback below.
  }

  // ── auto_from_screen ────────────────────────────────────────────────────
  if (rspMode === "auto_from_screen") {
    const planeM = Number(screenFrontPlaneM);
    const widthM = Number(screenWidthM);

    if (Number.isFinite(planeM) && Number.isFinite(widthM) && widthM > 0) {
      const dist = distanceFor57_5FromWidth(widthM);
      if (Number.isFinite(dist)) {
        return {
          effectiveRspX_m: centrelineX,
          effectiveRspY_m: planeM + dist,
          rspSourceLabel: "Auto from screen",
        };
      }
    }

    // Inputs not yet finite — fall through to fallback below
  }

  // ── manual_position ─────────────────────────────────────────────────────
  // X is ALWAYS the room centreline — manual RSP drag is Y-axis only.
  // manualRspX_m is ignored (kept in schema for compatibility but harmless).
  if (rspMode === "manual_position") {
    const manualY = Number(manualRspY_m);
    if (Number.isFinite(manualY)) {
      return {
        effectiveRspX_m: centrelineX,
        effectiveRspY_m: manualY,
        rspSourceLabel: "Manual RSP",
      };
    }
    // manualRspY_m not yet set — fall through to currentMlpY_m fallback
  }

  // ── Row-derived modes ────────────────────────────────────────────────────
  if (rspMode in ROW_MODE_LABELS) {
    const precomputed = Number((rowDerivedRspYByMode ?? {})[rspMode]);
    if (Number.isFinite(precomputed)) {
      return {
        effectiveRspX_m: centrelineX,
        effectiveRspY_m: precomputed,
        rspSourceLabel: ROW_MODE_LABELS[rspMode],
      };
    }
    // Precomputed value not yet available — fall through to currentMlpY_m fallback
  }

  // ── Fallback / unsupported modes ─────────────────────────────────────────
  // Return currentMlpY_m unchanged so wiring has zero behaviour impact
  // for modes whose inputs are not yet computed.
  const fallbackY = Number.isFinite(Number(currentMlpY_m))
    ? Number(currentMlpY_m)
    : null;

  return {
    effectiveRspX_m: centrelineX,
    effectiveRspY_m: fallbackY,
    rspSourceLabel: "Current RSP",
  };
}