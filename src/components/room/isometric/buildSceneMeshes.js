// buildSceneMeshes.js — converts isometric scene data into Three.js meshes.
//
// Pure-ish (creates Three.js objects). The IsometricView component owns the
// scene graph; this module builds the meshes from the normalised scene data and
// returns a group that can be added/removed wholesale when the design changes.
//
// Coordinate mapping:
//   Room X (width)     → Three.js X
//   Room Z (height)    → Three.js Y (up)
//   Room Y (depth)     → Three.js Z (front-to-rear; -Z = toward screen)
//
// All sizes are in metres. Cabinet meshes are physically scaled from the same
// registry the existing drawings use.

import * as THREE from "three";

const ROOM_FILL = 0xF4F3F0;
const ROOM_EDGE = 0xB0AEA8;
const FLOOR_COLOR = 0x8C8880;
const SCREEN_FRAME = 0x2C2C2C;
const SCREEN_SURFACE = 0xD6D9D6;
const SPEAKER_COLOR = 0x213428;
const SPEAKER_COLOR_ALT = 0x3E4349;
const SUB_COLOR = 0x4A3B30;
const PROJECTOR_COLOR = 0x3E4349;
const ELEMENT_FILL = 0xC7C3BB;
const ELEMENT_EDGE = 0x9B9890;

function boxMesh(widthM, heightM, depthM, color, edgeColor) {
  const geo = new THREE.BoxGeometry(widthM, heightM, depthM);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  if (edgeColor != null) {
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.55 });
    mesh.add(new THREE.LineSegments(edges, lineMat));
  }
  return mesh;
}

// Room shell: floor + 4 walls (transparent, cutaway facing camera) + ceiling line.
// Walls are rendered as thin outlined planes so the room reads as a container.
export function buildRoomShell(roomDims) {
  const group = new THREE.Group();
  const W = roomDims.widthM;
  const L = roomDims.lengthM;
  const H = roomDims.heightM;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ color: ROOM_FILL, roughness: 0.95, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, L / 2);
  group.add(floor);

  // Floor edge
  const floorEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.001, L)),
    new THREE.LineBasicMaterial({ color: FLOOR_COLOR }),
  );
  floorEdges.position.set(W / 2, 0.001, L / 2);
  group.add(floorEdges);

  // Walls — transparent, so the interior is visible. Back wall + 2 side walls.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, roughness: 0.9, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
  });
  const wallEdgeMat = new THREE.LineBasicMaterial({ color: ROOM_EDGE, transparent: true, opacity: 0.7 });

  const makeWall = (w, h, x, y, z, rotY) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    wall.position.set(x, y, z);
    wall.rotation.y = rotY;
    group.add(wall);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.001)), wallEdgeMat);
    edges.rotation.y = rotY;
    edges.position.set(x, y, z);
    group.add(edges);
  };

  // Back wall (rear, +Y room → +Z Three.js)
  makeWall(W, H, W / 2, H / 2, L, 0);
  // Left wall (x=0)
  makeWall(L, H, 0, H / 2, L / 2, -Math.PI / 2);
  // Right wall (x=W)
  makeWall(L, H, W, H / 2, L / 2, Math.PI / 2);
  // Front wall (y=0) — drawn fainter, mostly open toward camera
  const frontWallMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, roughness: 0.9, transparent: true, opacity: 0.05, side: THREE.DoubleSide,
  });
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), frontWallMat);
  frontWall.position.set(W / 2, H / 2, 0);
  group.add(frontWall);

  return group;
}

// Screen: a thin slab at the front plane Y, centred on the room centreline.
export function buildScreenMesh(screenData) {
  if (!screenData) return null;
  const group = new THREE.Group();
  const cx = screenData.centreX;
  const frontY = screenData.frontY;
  const frameH = screenData.overallHeightM;
  const frameW = screenData.overallWidthM;
  const frameBottom = screenData.frameBottomM;
  const frameCentreZ = frameBottom + frameH / 2;

  // Frame slab
  const frame = boxMesh(frameW, frameH, 0.04, SCREEN_FRAME, SCREEN_FRAME);
  frame.position.set(cx, frameCentreZ, frontY);
  group.add(frame);

  // Viewable surface (slightly inset, lighter)
  const view = new THREE.Mesh(
    new THREE.PlaneGeometry(screenData.viewableWidthM, screenData.viewableHeightM),
    new THREE.MeshStandardMaterial({ color: SCREEN_SURFACE, roughness: 0.6, side: THREE.DoubleSide }),
  );
  const viewCentreZ = screenData.viewableBottomM + screenData.viewableHeightM / 2;
  view.position.set(cx, viewCentreZ, frontY + 0.001);
  group.add(view);

  return group;
}

// Projector: a small box centred on the lens, body dims from the shared resolver.
export function buildProjectorMesh(projData) {
  if (!projData) return null;
  const body = boxMesh(projData.bodyWidthM, projData.bodyHeightM, projData.bodyDepthM, PROJECTOR_COLOR, 0x222222);
  body.position.set(projData.lensX, projData.lensZ, projData.lensY);
  return body;
}

// Speaker: a box at its acoustic centre, rotated by yaw around the vertical axis.
// Round models (Architect) become cylinders.
export function buildSpeakerMesh(spk) {
  const { widthM, heightM, depthM, round, x, y, z, yawDeg } = spk;
  let mesh;
  if (round) {
    const r = Math.max(widthM, depthM) / 2;
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, heightM, 20),
      new THREE.MeshStandardMaterial({ color: SPEAKER_COLOR, roughness: 0.7 }),
    );
  } else {
    mesh = boxMesh(widthM, heightM, depthM, SPEAKER_COLOR, 0x152420);
  }
  // Three.js: position (roomX, roomZ, roomY); yaw around Y-up axis.
  mesh.position.set(x, z, y);
  // Yaw: 0° = facing -Y (screen). Three.js rotation about Y axis.
  mesh.rotation.y = -(yawDeg * Math.PI) / 180;
  return mesh;
}

export function buildSubwooferMesh(sub) {
  const { widthM, heightM, depthM, x, y, z, rotationDeg } = sub;
  const mesh = boxMesh(widthM, heightM, depthM, SUB_COLOR, 0x2E241D);
  mesh.position.set(x, z, y);
  mesh.rotation.y = -(rotationDeg * Math.PI) / 180;
  return mesh;
}

// Room element (door/window): a translucent box from zBottom to zTop.
export function buildRoomElementMesh(el) {
  const mesh = boxMesh(el.widthM, el.heightM, el.depthM, ELEMENT_FILL, ELEMENT_EDGE);
  mesh.position.set(el.x, (el.zBottom + el.zTop) / 2, el.y);
  mesh.material.transparent = true;
  mesh.material.opacity = 0.35;
  return mesh;
}