// subSymmetrySnap.js — pure drag-time symmetry snap assistance for subwoofers.
//
// When a subwoofer is dragged near the mirrored position of an enabled partner
// on the SAME wall, this returns a snap target. The caller (useSubDragHandler)
// applies the snap to the dragged sub only. The partner is never moved. There
// are no permanent locks — final stored coordinates remain independent.
//
// RSP equidistance is a separate geometric condition from room symmetry. When
// the RSP sits on the relevant room centreline, mirrored positions are also
// equidistant from it. When the RSP is offset, room symmetry still holds but
// RSP equidistance does not — the guide must not falsely indicate it.

import { deriveSubWallOrientation } from "./subWallOrientation";

const SNAP_M = 0.05; // 5 cm capture distance (50 mm), per spec
const RSP_CENTRAL_TOL_M = 0.01; // RSP within 1 cm of centreline counts as central

/**
 * Find a symmetry snap target for the dragged subwoofer.
 *
 * X-mirror (across the width centreline) is offered when both the dragged sub
 * and the partner sit on the same front or rear wall.
 * Y-mirror (across the length centreline) is offered when both sit on the same
 * left or right wall.
 *
 * @param {object} opts
 * @param {object} opts.draggedSub   - the sub being dragged (must carry .id)
 * @param {array}  opts.draftArray   - draft array holding enabled partner candidates (same group)
 * @param {number} opts.widthM
 * @param {number} opts.lengthM
 * @param {number} opts.candidateX   - pre-clamped dragged X
 * @param {number} opts.candidateY   - pre-clamped dragged Y
 * @param {object} [opts.draggedDims] - { widthM, depthM } of the dragged sub
 * @param {function} [opts.getModelDimsM] - resolves partner cabinet dims
 * @param {{x:number,y:number}} [opts.rspPoint] - RSP position in room metres
 * @returns {{snappedX:number, snappedY:number, axis:'x'|'y', value:number, partnerId:string, partnerPosition:{x,y}, rspEquidistant:boolean, rspCentral:boolean} | null}
 */
export function findSymmetrySnap({
  draggedSub,
  draftArray,
  widthM,
  lengthM,
  candidateX,
  candidateY,
  draggedDims,
  getModelDimsM,
  rspPoint,
}) {
  if (!draggedSub?.id || !Array.isArray(draftArray)) return null;
  if (!Number.isFinite(candidateX) || !Number.isFinite(candidateY)) return null;

  const W = Number(widthM);
  const L = Number(lengthM);
  if (!Number.isFinite(W) || !Number.isFinite(L) || W <= 0 || L <= 0) return null;

  // Determine the dragged sub's wall from its current candidate position.
  const draggedWall = deriveSubWallOrientation({
    x: candidateX,
    y: candidateY,
    widthM: W,
    lengthM: L,
    subWidthM: draggedDims?.widthM,
    subDepthM: draggedDims?.depthM,
  }).wall;

  if (!draggedWall) return null;

  // X-mirror applies to front/rear wall pairs. Y-mirror applies to side wall pairs.
  const isXAxis = draggedWall === "front" || draggedWall === "rear";

  // RSP equidistance:
  // X-mirror: RSP X is always the room centreline (W/2), so equidistance is
  // always true — the mirror axis passes through the RSP.
  // Y-mirror: equidistance holds only when RSP Y ≈ L/2.
  let rspEquidistant;
  let rspCentral;
  if (isXAxis) {
    rspCentral = true;
    rspEquidistant = true;
  } else {
    const rspY = rspPoint?.y;
    if (Number.isFinite(rspY)) {
      rspCentral = Math.abs(rspY - L / 2) < RSP_CENTRAL_TOL_M;
      rspEquidistant = rspCentral;
    } else {
      // No RSP available — do not claim equidistance.
      rspCentral = false;
      rspEquidistant = false;
    }
  }

  const partners = draftArray.filter(
    (s) =>
      s &&
      s.id !== draggedSub.id &&
      s.enabled !== false &&
      s.position &&
      Number.isFinite(s.position.x) &&
      Number.isFinite(s.position.y)
  );
  if (partners.length === 0) return null;

  let best = null;
  let bestDist = SNAP_M;

  for (const partner of partners) {
    const px = Number(partner.position.x);
    const py = Number(partner.position.y);

    // Determine the partner's wall. It must match the dragged sub's wall
    // (same-wall symmetry), not just any wall.
    const pDims = getModelDimsM ? getModelDimsM(partner.model) : null;
    const partnerWall = deriveSubWallOrientation({
      x: px,
      y: py,
      widthM: W,
      lengthM: L,
      subWidthM: pDims?.widthM,
      subDepthM: pDims?.depthM,
    }).wall;

    if (partnerWall !== draggedWall) continue;

    if (isXAxis) {
      // X-mirror across the width centreline
      const mirroredX = W - px;
      const dist = Math.abs(candidateX - mirroredX);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          type: "symmetry",
          snappedX: mirroredX,
          snappedY: candidateY,
          axis: "x",
          value: mirroredX,
          partnerId: partner.id,
          partnerPosition: { x: px, y: py },
          rspEquidistant,
          rspCentral,
        };
      }
    } else {
      // Y-mirror across the length centreline
      const mirroredY = L - py;
      const dist = Math.abs(candidateY - mirroredY);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          type: "symmetry",
          snappedX: candidateX,
          snappedY: mirroredY,
          axis: "y",
          value: mirroredY,
          partnerId: partner.id,
          partnerPosition: { x: px, y: py },
          rspEquidistant,
          rspCentral,
        };
      }
    }
  }

  return best;
}

export { SNAP_M as SYMMETRY_SNAP_M };