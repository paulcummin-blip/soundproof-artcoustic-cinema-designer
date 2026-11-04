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
//
// RENDERING STABILITY RULES
//   - Opaque solids (speakers, subs, projector, screen frame, floor) keep
//     depthWrite ON and are rendered first by the sorter.
//   - Transparent shells (room walls, room elements, screen viewable surface)
//     use depthWrite: false + an explicit renderOrder so they never fight the
//     depth buffer or pop as the camera moves. The room shell stays readable;
//     the equipment behind the acoustically transparent screen stays visible.
//   - No physical object is moved to hide flicker. The only presentation-only
//     offset is the screen viewable surface sitting 3 mm in front of the frame
//     plane, documented here and visually insignificant.

import * as THREE from "three";

const ROOM_FILL = 0xF4F3F0;
const ROOM_EDGE = 0xB0AEA8;
const FLOOR_COLOR = 0x8C8880;
const SCREEN_FRAME = 0x2C2C2C;
const SCREEN_SURFACE = 0xF5F6F8;   // white / very light neutral image surface
const SPEAKER_COLOR = 0x213428;
const SPEAKER_EDGE = 0x152420;
const SUB_COLOR = 0x4A3B30;
const SUB_EDGE = 0x2E241D;
const PROJECTOR_COLOR = 0x3E4349;
const ELEMENT_FILL = 0xC7C3BB;
const ELEMENT_EDGE = 0x9B9890;

// renderOrder bands — opaque first (0), transparent shells after (10+).
const RENDER_ORDER_OPAQUE = 0;
const RENDER_ORDER_WALLS = 10;
const RENDER_ORDER_ELEMENTS = 11;
const RENDER_ORDER_SCREEN_SURFACE = 12;

function opaqueBox(widthM, heightM, depthM, color, edgeColor) {
  const geo = new THREE.BoxGeometry(widthM, heightM, depthM);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = RENDER_ORDER_OPAQUE;
  if (edgeColor != null) {
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.55 });
    const lines = new THREE.LineSegments(edges, lineMat);
    lines.renderOrder = RENDER_ORDER_OPAQUE;
    mesh.add(lines);
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

  // Floor — opaque, solid ground.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ color: ROOM_FILL, roughness: 0.95, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, L / 2);
  floor.renderOrder = RENDER_ORDER_OPAQUE;
  group.add(floor);

  // Floor edge.
  const floorEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.001, L)),
    new THREE.LineBasicMaterial({ color: FLOOR_COLOR }),
  );
  floorEdges.position.set(W / 2, 0.001, L / 2);
  group.add(floorEdges);

  // Walls — transparent shells. depthWrite OFF + explicit renderOrder prevents
  // the depth-buffer popping that makes coplanar transparent surfaces flicker as
  // the camera orbits. side: BackSide avoids the DoubleSide overdraw that doubles
  // the transparent blend and worsens sort instability; the interior surface is
  // the one we want visible from outside the cutaway shell.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, roughness: 0.9, transparent: true, opacity: 0.12,
    side: THREE.BackSide, depthWrite: false,
  });
  const wallEdgeMat = new THREE.LineBasicMaterial({ color: ROOM_EDGE, transparent: true, opacity: 0.7, depthWrite: false });

  const makeWall = (w, h, x, y, z, rotY) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    wall.position.set(x, y, z);
    wall.rotation.y = rotY;
    wall.renderOrder = RENDER_ORDER_WALLS;
    group.add(wall);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, 0.001)), wallEdgeMat);
    edges.rotation.y = rotY;
    edges.position.set(x, y, z);
    edges.renderOrder = RENDER_ORDER_WALLS;
    group.add(edges);
  };

  // Back wall (rear, +Y room → +Z Three.js).
  makeWall(W, H, W / 2, H / 2, L, 0);
  // Left wall (x=0).
  makeWall(L, H, 0, H / 2, L / 2, -Math.PI / 2);
  // Right wall (x=W).
  makeWall(L, H, W, H / 2, L / 2, Math.PI / 2);
  // Front wall (y=0) — drawn fainter, mostly open toward camera.
  const frontWallMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, roughness: 0.9, transparent: true, opacity: 0.05,
    side: THREE.BackSide, depthWrite: false,
  });
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), frontWallMat);
  frontWall.position.set(W / 2, H / 2, 0);
  frontWall.renderOrder = RENDER_ORDER_WALLS;
  group.add(frontWall);

  return group;
}

// Screen: a solid dark FRAME (4 border bars using the real border width) plus a
// white, partially transparent VIEWABLE surface inside it. Equipment behind the
// acoustically transparent screen (LCR, front subs) shows through the surface.
export function buildScreenMesh(screenData) {
  if (!screenData) return null;
  const group = new THREE.Group();
  const cx = screenData.centreX;
  const frontY = screenData.frontY;
  const frameH = screenData.overallHeightM;
  const frameW = screenData.overallWidthM;
  const frameBottom = screenData.frameBottomM;
  const frameCentreZ = frameBottom + frameH / 2;
  const border = screenData.borderM;
  const viewW = screenData.viewableWidthM;
  const viewH = screenData.viewableHeightM;
  const viewBottom = screenData.viewableBottomM;
  const viewCentreZ = viewBottom + viewH / 2;
  const slabDepth = 0.04; // presentation-only frame thickness

  // Frame as 4 solid border bars — leaves the centre open for the viewable
  // surface instead of filling the whole screen as one black rectangle.
  const frameMat = new THREE.MeshStandardMaterial({ color: SCREEN_FRAME, roughness: 0.6, metalness: 0.0 });
  const addBar = (w, h, zOff) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, slabDepth), frameMat);
    bar.position.set(cx, frameCentreZ + zOff, frontY);
    bar.renderOrder = RENDER_ORDER_OPAQUE;
    group.add(bar);
  };
  // Top + bottom bars span the full frame width; height = border.
  addBar(frameW, border, (frameH / 2) - (border / 2));   // top
  addBar(frameW, border, -(frameH / 2) + (border / 2));  // bottom
  // Left + right bars fit between the top/bottom bars; height = viewable height.
  const sideH = viewH;
  const sideW = border;
  const sideXOff = (frameW / 2) - (border / 2);
  const addSideBar = (xOff) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sideW, sideH, slabDepth), frameMat);
    bar.position.set(cx + xOff, viewCentreZ, frontY);
    bar.renderOrder = RENDER_ORDER_OPAQUE;
    group.add(bar);
  };
  addSideBar(-sideXOff);
  addSideBar(sideXOff);

  // Viewable image surface — white, partially transparent so LCR / front subs
  // behind the acoustically transparent screen remain visible. depthWrite OFF +
  // renderOrder keeps it stable behind/around the opaque frame bars.
  // Presentation-only offset of +3 mm in front of the frame plane to avoid any
  // coplanar z-fight with the bars' front faces; does not move the screen.
  const viewMat = new THREE.MeshStandardMaterial({
    color: SCREEN_SURFACE, roughness: 0.5, metalness: 0.0,
    transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  });
  const view = new THREE.Mesh(new THREE.PlaneGeometry(viewW, viewH), viewMat);
  view.position.set(cx, viewCentreZ, frontY + 0.003);
  view.renderOrder = RENDER_ORDER_SCREEN_SURFACE;
  group.add(view);

  return group;
}

// Projector: a small box centred on the lens, body dims from the shared resolver.
export function buildProjectorMesh(projData) {
  if (!projData) return null;
  const body = opaqueBox(projData.bodyWidthM, projData.bodyHeightM, projData.bodyDepthM, PROJECTOR_COLOR, 0x222222);
  body.position.set(projData.lensX, projData.lensZ, projData.lensY);
  return body;
}

// Speaker: a box at its acoustic centre, rotated by yaw around the vertical axis.
// Round in-ceiling models (Architect) become SHALLOW cylinders — diameter across,
// depth as the cylinder height — so they read as ceiling-mounted, not hanging
// pillars. The acoustic/listening position (stored z) is unchanged.
export function buildSpeakerMesh(spk) {
  const { widthM, heightM, depthM, round, x, y, z, yawDeg } = spk;
  let mesh;
  if (round) {
    // Round in-ceiling speaker: radius = diameter/2, cylinder height = depthM.
    const r = Math.max(widthM, 0.02) / 2;
    const cylHeight = Math.max(depthM, 0.01);
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, cylHeight, 24),
      new THREE.MeshStandardMaterial({ color: SPEAKER_COLOR, roughness: 0.7, metalness: 0.0 }),
    );
    mesh.renderOrder = RENDER_ORDER_OPAQUE;
  } else {
    mesh = opaqueBox(widthM, heightM, depthM, SPEAKER_COLOR, SPEAKER_EDGE);
  }
  // Three.js: position (roomX, roomZ, roomY); yaw around Y-up axis.
  mesh.position.set(x, z, y);
  // Yaw: 0° = facing -Y (screen). Three.js rotation about Y axis.
  mesh.rotation.y = -(yawDeg * Math.PI) / 180;
  return mesh;
}

export function buildSubwooferMesh(sub) {
  const { widthM, heightM, depthM, x, y, z, rotationDeg } = sub;
  const mesh = opaqueBox(widthM, heightM, depthM, SUB_COLOR, SUB_EDGE);
  mesh.position.set(x, z, y);
  mesh.rotation.y = -(rotationDeg * Math.PI) / 180;
  return mesh;
}

// Room element (door/window): a translucent box from zBottom to zTop. depthWrite
// OFF + renderOrder so transparent openings never flicker against the walls.
export function buildRoomElementMesh(el) {
  const mesh = opaqueBox(el.widthM, el.heightM, el.depthM, ELEMENT_FILL, ELEMENT_EDGE);
  mesh.position.set(el.x, (el.zBottom + el.zTop) / 2, el.y);
  mesh.material.transparent = true;
  mesh.material.opacity = 0.35;
  mesh.material.depthWrite = false;
  mesh.renderOrder = RENDER_ORDER_ELEMENTS;
  return mesh;
}