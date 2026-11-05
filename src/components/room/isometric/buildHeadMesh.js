// buildHeadMesh.js — listening heads + the RSP reference marker for Isometric View.
//
// Convention: stored listening point {x, y, z} is the EXACT centre of the head.
// Head size is presentation-only (0.16 × 0.22 × 0.20 m) and must not alter
// acoustic calculations. Heads are plain smooth ellipsoids with no nose, no
// facing-direction cone and no protrusion — this view does not show facing.
//
// The RSP marker is a SEPARATE reference marker, not a listening head: a simple
// small sphere sized to echo the Plan View RSP dot (Plan radius ≈ 5 px ≈ 0.05 m
// at room scale), well under head size. It must not become a head, carry a nose,
// or alter acoustic coordinates — it only marks the authoritative RSP position.

import * as THREE from "three";

export const HEAD_SIZE = { width: 0.16, height: 0.22, depth: 0.20 };

// RSP sphere radius — presentation-only. Matches the small Plan View RSP dot
// scaled into 3D: visibly smaller than the 0.16–0.22 m listening heads.
export const RSP_RADIUS_M = 0.06;

export function buildHeadMesh(headData) {
  const { x, y, z, isPrimary, isRsp } = headData;
  // isPrimary here is the resolved saved seat priority (Primary = true),
  // sourced from resolveSeatPriority in buildIsometricSceneData. The RSP
  // marker is a separate reference marker and never reaches this branch.
  const group = new THREE.Group();
  group.position.set(x, z, y); // Three.js: Y up; room Y → Three.js Z, room Z → Three.js Y

  // RSP marker — a simple small green sphere at the authoritative RSP centre.
  // No nose, no head ellipsoid. Reference marker only.
  if (isRsp) {
    const rsp = new THREE.Mesh(
      new THREE.SphereGeometry(RSP_RADIUS_M, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6, metalness: 0.0 }),
    );
    rsp.renderOrder = 0;
    group.add(rsp);
    return group;
  }

  // Listening head: an ellipsoid (scaled sphere). Width = X, height = Y (up), depth = Z.
  const headGeo = new THREE.SphereGeometry(0.5, 24, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: isPrimary ? 0x213428 : 0x625143,
    roughness: 0.75,
    metalness: 0.0,
    flatShading: false,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.scale.set(HEAD_SIZE.width, HEAD_SIZE.height, HEAD_SIZE.depth);
  head.renderOrder = 0;
  group.add(head);

  return group;
}