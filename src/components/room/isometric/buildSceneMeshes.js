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

// renderOrder bands — opaque first (0), then transparent surfaces in a strict
// hierarchy. Each overlapping transparent pair gets a DISTINCT band so Three.js
// never distance-sorts them against each other (distance sort flips as the
// camera/frustum moves → flicker). Non-overlapping objects may share a band.
const RENDER_ORDER_OPAQUE = 0;
const RENDER_ORDER_WALLS = 10;          // transparent wall planes
const RENDER_ORDER_WALL_EDGES = 11;     // wall outlines — drawn after (on top of) planes
const RENDER_ORDER_ELEMENTS = 12;       // transparent room-element boxes
const RENDER_ORDER_ELEMENT_EDGES = 13;  // element outlines — after boxes
const RENDER_ORDER_SCREEN_SURFACE = 14; // screen viewable image — after everything

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
  // the camera orbits. DoubleSide so ALL four walls (including the front wall)
  // remain visible from inside and outside as the camera orbits — the room
  // reads as a complete transparent enclosure, never an open three-wall box.
  // DoubleSide doubles the transparent blend on the near face, but with
  // depthWrite:false + explicit renderOrder bands the sort stays stable.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, roughness: 0.9, transparent: true, opacity: 0.12,
    side: THREE.DoubleSide, depthWrite: false,
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
    // Edges get a HIGHER renderOrder than the wall plane so they always draw
    // on top — never distance-sorted against their own coplanar plane.
    edges.renderOrder = RENDER_ORDER_WALL_EDGES;
    group.add(edges);
  };

  // Back wall (rear, +Y room → +Z Three.js).
  makeWall(W, H, W / 2, H / 2, L, 0);
  // Left wall (x=0).
  makeWall(L, H, 0, H / 2, L / 2, -Math.PI / 2);
  // Right wall (x=W).
  makeWall(L, H, W, H / 2, L / 2, Math.PI / 2);
  // Front wall (y=0) — same DoubleSide treatment as the other walls so it
  // remains visible from every isometric angle. Lower opacity than the other
  // walls keeps the front (screen-side) slightly more open toward camera.
  const frontWallMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF, roughness: 0.9, transparent: true, opacity: 0.08,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), frontWallMat);
  frontWall.position.set(W / 2, H / 2, 0);
  frontWall.renderOrder = RENDER_ORDER_WALLS;
  group.add(frontWall);
  // Front wall edge for readability.
  const frontEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, 0.001)), wallEdgeMat);
  frontEdges.position.set(W / 2, H / 2, 0);
  frontEdges.renderOrder = RENDER_ORDER_WALL_EDGES;
  group.add(frontEdges);

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
  // behind the acoustically transparent screen remain visible. DoubleSide keeps
  // it visible from both viewing directions (front and behind the screen).
  // depthWrite OFF + renderOrder keeps it stable behind/around the opaque
  // frame bars and prevents z-fighting with coplanar transparent surfaces.
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
  // The child edges from opaqueBox inherit renderOrder 0 and depthWrite true —
  // fix both so they draw after the transparent box and never fight the depth
  // buffer. Without this, transparent edges at renderOrder 0 are sorted among
  // opaque objects and pop as the camera moves.
  mesh.children.forEach((child) => {
    if (child.isLineSegments) {
      child.renderOrder = RENDER_ORDER_ELEMENT_EDGES;
      child.material.depthWrite = false;
    }
  });
  return mesh;
}