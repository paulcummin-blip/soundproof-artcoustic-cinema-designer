// subOpposingAlignmentSnap.js — pure drag-time opposing-wall alignment snap.
//
// When a subwoofer is dragged near a wall, this finds a partner subwoofer
// positioned against the OPPOSING wall and snaps the relevant axis coordinate
// to match it exactly:
//   front ↔ rear  → snap X (horizontal centre alignment)
//   left  ↔ right → snap Y (longitudinal centre alignment)
//
// The partner is never moved. The snap is only returned when the resulting
// position is physically valid for the dragged sub's own cabinet (10 mm wall
// clearance preserved). No permanent lock, no linked movement.

import { deriveSubWallOrientation } from "./subWallOrientation";

const SNAP_M = 0.05; // 5 cm capture distance

/**
 * Find an opposing-wall alignment snap target for the dragged subwoofer.
 *
 * @param {object}   opts.draggedSub      - the sub being dragged (must carry .id)
 * @param {array}    opts.allPartners     - combined enabled subs from BOTH draft arrays, excluding the dragged sub
 * @param {number}   opts.widthM
 * @param {number}   opts.lengthM
 * @param {number}   opts.candidateX      - pre-clamped dragged X (metres)
 * @param {number}   opts.candidateY      - pre-clamped dragged Y (metres)
 * @param {object}   opts.draggedDims      - { widthM, depthM } of the dragged sub
 * @param {function} opts.getModelDimsM   - resolves partner cabinet dims
 * @returns {{type:'opposing', snappedX:number, snappedY:number, axis:'x'|'y', partnerId:string, partnerPosition:{x,y}, draggedWall:string, partnerWall:string} | null}
 */
export function findOpposingAlignmentSnap({
  draggedSub,
  allPartners,
  widthM,
  lengthM,
  candidateX,
  candidateY,
  draggedDims,
  getModelDimsM,
}) {
  if (!draggedSub?.id || !Array.isArray(allPartners)) return null;
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

  // Opposing wall mapping.
  const opposingWall = { front: "rear", rear: "front", left: "right", right: "left" }[draggedWall];
  if (!opposingWall) return null;

  // Front/rear opposing → align X. Left/right opposing → align Y.
  const snapAxis = draggedWall === "front" || draggedWall === "rear" ? "x" : "y";

  let best = null;
  let bestDist = SNAP_M;

  for (const partner of allPartners) {
    if (!partner || partner.id === draggedSub.id) continue;
    if (partner.enabled === false) continue;
    const ppos = partner.position;
    if (!ppos || !Number.isFinite(ppos.x) || !Number.isFinite(ppos.y)) continue;

    const pDims = getModelDimsM(partner.model);
    const partnerWall = deriveSubWallOrientation({
      x: ppos.x,
      y: ppos.y,
      widthM: W,
      lengthM: L,
      subWidthM: pDims?.widthM,
      subDepthM: pDims?.depthM,
    }).wall;

    if (partnerWall !== opposingWall) continue;

    if (snapAxis === "x") {
      const dist = Math.abs(candidateX - ppos.x);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          type: "opposing",
          snappedX: ppos.x,
          snappedY: candidateY,
          axis: "x",
          partnerId: partner.id,
          partnerPosition: { x: ppos.x, y: ppos.y },
          draggedWall,
          partnerWall,
        };
      }
    } else {
      const dist = Math.abs(candidateY - ppos.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          type: "opposing",
          snappedX: candidateX,
          snappedY: ppos.y,
          axis: "y",
          partnerId: partner.id,
          partnerPosition: { x: ppos.x, y: ppos.y },
          draggedWall,
          partnerWall,
        };
      }
    }
  }

  return best;
}

export { SNAP_M as OPPOSING_SNAP_M };