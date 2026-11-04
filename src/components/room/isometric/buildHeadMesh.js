// buildHeadMesh.js — a simple 3D human head for the Isometric View.
//
// Convention: stored listening point {x, y, z} is the EXACT centre of the head.
// Head size is presentation-only (0.16 × 0.22 × 0.20 m) and must not alter
// acoustic calculations. A restrained nose cue gives a visible facing direction.
// Facing is toward the screen (negative Y) unless a per-seat facing is stored.

import * as THREE from "three";

export const HEAD_SIZE = { width: 0.16, height: 0.22, depth: 0.20 };

export function buildHeadMesh(headData) {
  const { x, y, z, isPrimary, isRsp } = headData;
  const group = new THREE.Group();
  group.position.set(x, z, y); // Three.js: Y up; room Y → Three.js Z, room Z → Three.js Y

  // Head: an ellipsoid (scaled sphere). Width = X, height = Y (up), depth = Z.
  const headGeo = new THREE.SphereGeometry(0.5, 24, 16);
  // Scale sphere to head dims (radius 0.5 → multiply by full size).
  const headMat = new THREE.MeshStandardMaterial({
    color: isRsp ? 0x10B981 : (isPrimary ? 0x213428 : 0x625143),
    roughness: 0.75,
    metalness: 0.0,
    flatShading: false,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.scale.set(HEAD_SIZE.width, HEAD_SIZE.height, HEAD_SIZE.depth);
  group.add(head);

  // Nose cue: a small cone pointing in the facing direction (toward screen = -Y room).
  // In Three.js space (Y up), the room -Y maps to Three.js -Z.
  const noseGeo = new THREE.ConeGeometry(0.018, 0.05, 10);
  const noseMat = new THREE.MeshStandardMaterial({
    color: isRsp ? 0x0A8A6E : (isPrimary ? 0x152420 : 0x4A3B30),
    roughness: 0.7,
  });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  // Cone points +Y by default; rotate so it points -Z (toward screen in Three.js space).
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -(HEAD_SIZE.depth / 2 + 0.012));
  group.add(nose);

  return group;
}