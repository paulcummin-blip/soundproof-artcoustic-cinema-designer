// subSymmetrySnap.js — pure drag-time symmetry snap assistance for subwoofers.
//
// Stage 2B.4: When a subwoofer is dragged near the mirrored position of an
// enabled partner in the same group, this returns a snap target. The caller
// (useSubDragHandler) applies the snap to the dragged sub only. The partner
// is never moved. There are no permanent locks and no symmetryLinkId
// dependency — final stored coordinates remain independent.

const SNAP_M = 0.05; // 50 mm threshold, matching speaker magnetic snap
const WALL_PROXIMITY_M = 0.12; // partner must be near a wall to define a symmetry axis

function isNearWall(val, roomSpan) {
  return Math.abs(val) < WALL_PROXIMITY_M || Math.abs(val - roomSpan) < WALL_PROXIMITY_M;
}

/**
 * Find a symmetry snap target for the dragged subwoofer.
 *
 * X-mirror (across the width centreline) is offered when the partner sits on
 * a front/rear wall — the common front/rear sub pair case.
 * Y-mirror (across the length centreline) is offered when the partner sits on
 * a side wall — the side-wall pair case.
 *
 * @param {object} opts
 * @param {object} opts.draggedSub  - the sub being dragged (must carry .id)
 * @param {array}  opts.draftArray  - draft array holding enabled partner candidates
 * @param {number} opts.widthM
 * @param {number} opts.lengthM
 * @param {number} opts.candidateX  - pre-clamped dragged X
 * @param {number} opts.candidateY  - pre-clamped dragged Y
 * @returns {{snappedX:number, snappedY:number, axis:'x'|'y', value:number, partnerId:string} | null}
 */
export function findSymmetrySnap({ draggedSub, draftArray, widthM, lengthM, candidateX, candidateY }) {
  if (!draggedSub?.id || !Array.isArray(draftArray)) return null;
  if (!Number.isFinite(candidateX) || !Number.isFinite(candidateY)) return null;

  const W = Number(widthM);
  const L = Number(lengthM);
  if (!Number.isFinite(W) || !Number.isFinite(L) || W <= 0 || L <= 0) return null;

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

    // X-mirror across the width centreline (front/rear wall pair)
    if (isNearWall(py, L)) {
      const mirroredX = W - px;
      const dist = Math.abs(candidateX - mirroredX);
      if (dist < bestDist) {
        bestDist = dist;
        best = { type: "symmetry", snappedX: mirroredX, snappedY: candidateY, axis: "x", value: mirroredX, partnerId: partner.id };
      }
    }

    // Y-mirror across the length centreline (side wall pair)
    if (isNearWall(px, W)) {
      const mirroredY = L - py;
      const dist = Math.abs(candidateY - mirroredY);
      if (dist < bestDist) {
        bestDist = dist;
        best = { type: "symmetry", snappedX: candidateX, snappedY: mirroredY, axis: "y", value: mirroredY, partnerId: partner.id };
      }
    }
  }

  return best;
}