// IsometricView.jsx — the fourth drawing tab.
//
// Renders the active design version from the same authoritative project geometry
// as Plan / Front / Side, using Three.js + an orthographic camera + OrbitControls.
//
// Camera gestures are PRESENTATION ONLY: they never move a speaker, subwoofer,
// listening position, RSP, screen, or room dimension; they never save the
// project or trigger acoustic/RP22 recalculation. Only an explicit Save Report
// View persists camera framing + visibility, scoped to (projectId, versionId).

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { buildIsometricSceneData } from "./buildIsometricSceneData";
import {
  buildRoomShell,
  buildScreenMesh,
  buildProjectorMesh,
  buildSpeakerMesh,
  buildSubwooferMesh,
  buildRoomElementMesh,
} from "./buildSceneMeshes";
import { buildHeadMesh } from "./buildHeadMesh";
import { useSavedReportView } from "./useSavedReportView";
import { saveReportView } from "./isometricReportViewStore";

// Orbit limits — keep the dealer above the floor and outside the room volume.
const MIN_POLAR_DEG = 5;     // near top-down limit
const MAX_POLAR_DEG = 80;    // above horizon — never underneath the room
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3.0;
const DEFAULT_AZIMUTH_DEG = 35;
const DEFAULT_POLAR_DEG = 35;

// Initial framing: fit the whole room cleanly from a clean isometric position.
function computeDefaultCamera(roomDims) {
  const W = roomDims.widthM;
  const L = roomDims.lengthM;
  const H = roomDims.heightM;
  const target = new THREE.Vector3(W / 2, H / 2, L / 2);
  // Orthographic frustum sized to the room's longest dimension.
  const span = Math.max(W, L, H) * 1.15;
  return { target, span, azimuth: DEFAULT_AZIMUTH_DEG, polar: DEFAULT_POLAR_DEG, zoom: 1 };
}

export default function IsometricView({
  appState,
  stableDimensions,
  placedSpeakers = [],
  seatingPositions = [],
  mlpPoint = null,
  screen = null,
  roomElements = [],
  dolbyLayout = "5.1",
  getSpeakerVisibility = null,
  projectId = null,
  versionId = null,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const contentGroupRef = useRef(null);
  const animationFrameRef = useRef(null);
  const needsRenderRef = useRef(true);
  const fitFrustumRef = useRef(null);

  const [showHeads, setShowHeads] = useState(true);
  const [showRspMarker, setShowRspMarker] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  const savedReportView = useSavedReportView(projectId, versionId);

  // Build the normalised scene data (pure) — memoised on design inputs only.
  const sceneData = useMemo(
    () => buildIsometricSceneData({
      appState,
      stableDimensions,
      placedSpeakers,
      seatingPositions,
      mlpPoint,
      screen,
      roomElements,
      dolbyLayout,
      getSpeakerVisibility,
      showRspMarker,
    }),
    [appState, stableDimensions, placedSpeakers, seatingPositions, mlpPoint, screen, roomElements, dolbyLayout, getSpeakerVisibility, showRspMarker],
  );

  // ---- Renderer / scene setup (once) ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xF8F8F7);
    sceneRef.current = scene;

    // Lights: a soft ambient + a single directional, matching the restrained style.
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(6, 10, 8);
    scene.add(dir);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // updateStyle=false: we control canvas CSS (100%/100%/block) so the canvas
    // always fills the mount. setSize only updates the drawing buffer. This
    // prevents the one-frame CSS-vs-drawing-buffer mismatch that stretches the
    // canvas during resize and reads as flicker/distortion.
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none"; // prevent browser scroll/zoom on canvas
    rendererRef.current = renderer;

    // Orthographic camera. Near/far tightened from (0.1, 1000) to (0.5, 200):
    // ortho depth is linear, so a tighter range gives finer z resolution for
    // coplanar transparent surfaces (the 3mm screen offset gets ~252 depth
    // steps instead of ~50). The scene spans ~8-25m in view depth, so 0.5/200
    // comfortably contains it at every allowed camera position.
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.5, 200);
    cameraRef.current = cam;

    // OrbitControls — installed Three.js controls.
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minPolarAngle = (MIN_POLAR_DEG * Math.PI) / 180;
    controls.maxPolarAngle = (MAX_POLAR_DEG * Math.PI) / 180;
    controls.minZoom = MIN_ZOOM;
    controls.maxZoom = MAX_ZOOM;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.8;
    // Touch mappings: one-finger rotate, two-finger dolly+pan (OrbitControls default).
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controlsRef.current = controls;

    // Request a render when controls change (damping, drag, wheel).
    controls.addEventListener("change", () => { needsRenderRef.current = true; });

    // Resize handling — guarded so the renderer only resizes when the drawing
    // buffer dimensions actually change. Uses the latest fitFrustum via ref
    // (the observer is created once but fitFrustum changes with sceneData).
    // updateStyle=false keeps canvas CSS stable; only the drawing buffer is
    // reallocated.
    let lastW = 0, lastH = 0;
    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      fitFrustumRef.current?.(w, h);
      needsRenderRef.current = true;
    });
    resizeObserver.observe(mount);

    // Re-render on tab re-entry (RAF paused while backgrounded, scene may be stale).
    const onVisibility = () => { if (!document.hidden) needsRenderRef.current = true; };
    document.addEventListener("visibilitychange", onVisibility);

    // Render loop — only render when a frame is needed (interaction/damping).
    const tick = () => {
      animationFrameRef.current = requestAnimationFrame(tick);
      if (controls.enabled && controls.enableDamping) {
        controls.update(); // damping drives needsRender via change event
      }
      if (needsRenderRef.current) {
        renderer.render(scene, cam);
        needsRenderRef.current = false;
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit the orthographic frustum to the room, preserving camera angle and zoom.
  const fitFrustum = useCallback((w, h) => {
    const cam = cameraRef.current;
    if (!cam || !sceneData) return;
    const def = computeDefaultCamera(sceneData.roomDims);
    const aspect = w / h;
    const span = def.span / 2;
    cam.left = -span * aspect;
    cam.right = span * aspect;
    cam.top = span;
    cam.bottom = -span;
    cam.updateProjectionMatrix();
    needsRenderRef.current = true;
  }, [sceneData]);

  // Keep the ref current so the ResizeObserver (created once) always calls the
  // latest fitFrustum with the current sceneData — avoids a stale-closure where
  // resize after a design change would fit to the old room dimensions.
  fitFrustumRef.current = fitFrustum;

  // Apply a camera framing (target + azimuth + polar + zoom) to the controls.
  const applyFraming = useCallback((framing) => {
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    const mount = mountRef.current;
    if (!controls || !cam || !mount || !sceneData) return;

    const def = computeDefaultCamera(sceneData.roomDims);
    const target = framing?.camera?.targetX != null
      ? new THREE.Vector3(framing.camera.targetX, framing.camera.targetZ, framing.camera.targetY)
      : def.target.clone();
    const azimuth = (framing?.camera?.azimuthDeg ?? def.azimuth) * Math.PI / 180;
    const polar = (framing?.camera?.polarDeg ?? def.polar) * Math.PI / 180;
    const zoom = framing?.camera?.zoom ?? def.zoom;
    const radius = def.span * 1.5;

    // Spherical → cartesian (Three.js: Y up).
    const sinP = Math.sin(polar);
    const cosP = Math.cos(polar);
    const sinA = Math.sin(azimuth);
    const cosA = Math.cos(azimuth);
    cam.position.set(
      target.x + radius * sinP * sinA,
      target.y + radius * cosP,
      target.z + radius * sinP * cosA,
    );
    controls.target.copy(target);
    cam.zoom = zoom;
    cam.updateProjectionMatrix();
    controls.update();
    fitFrustum(mount.clientWidth, mount.clientHeight);
    needsRenderRef.current = true;
  }, [sceneData, fitFrustum]);

  // ---- Initial framing + apply saved report view on mount / version change ----
  useEffect(() => {
    if (!sceneData || !controlsRef.current) return;
    if (savedReportView) {
      applyFraming(savedReportView);
      setShowHeads(savedReportView.visibility.showHeads !== false);
      setShowRspMarker(savedReportView.visibility.showRspMarker !== false);
      setIsSaved(true);
    } else {
      applyFraming({ camera: {}, visibility: {} });
      setIsSaved(false);
    }
  }, [savedReportView, sceneData, applyFraming]);

  // ---- Rebuild content meshes when scene data changes ----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneData) return;

    // Remove previous content group.
    if (contentGroupRef.current) {
      scene.remove(contentGroupRef.current);
      disposeGroup(contentGroupRef.current);
    }
    const group = new THREE.Group();
    contentGroupRef.current = group;

    // Room shell
    group.add(buildRoomShell(sceneData.roomDims));

    // Room elements
    for (const el of sceneData.roomElements) {
      group.add(buildRoomElementMesh(el));
    }

    // Screen
    const screenMesh = buildScreenMesh(sceneData.screen);
    if (screenMesh) group.add(screenMesh);

    // Projector
    const projMesh = buildProjectorMesh(sceneData.projector);
    if (projMesh) group.add(projMesh);

    // Speakers
    for (const spk of sceneData.speakers) {
      group.add(buildSpeakerMesh(spk));
    }

    // Subwoofers
    for (const sub of sceneData.subwoofers) {
      group.add(buildSubwooferMesh(sub));
    }

    // Heads (if enabled)
    if (showHeads) {
      for (const head of sceneData.heads) {
        if (head.isRsp && !showRspMarker) continue;
        group.add(buildHeadMesh(head));
      }
    }

    scene.add(group);
    needsRenderRef.current = true;
  }, [sceneData, showHeads, showRspMarker]);

  // ---- Reset View (double-tap and button) ----
  // Reset restores the default clean isometric framing — it never restores a
  // saved report view, so the drawing always returns to the canonical room.
  const resetView = useCallback(() => {
    applyFraming({ camera: {}, visibility: {} });
  }, [applyFraming]);

  // Double-tap detection on the canvas.
  useEffect(() => {
    const el = rendererRef.current?.domElement;
    if (!el) return undefined;
    let lastTap = 0;
    const onTouch = (e) => {
      if (e.touches.length > 1) return; // ignore double-tap during multi-touch
      const now = Date.now();
      if (now - lastTap < 320) {
        e.preventDefault();
        resetView();
      }
      lastTap = now;
    };
    el.addEventListener("touchend", onTouch, { passive: false });
    return () => el.removeEventListener("touchend", onTouch);
  }, [resetView]);

  // ---- Save / Return report view ----
  const captureFraming = useCallback(() => {
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return null;
    const target = controls.target;
    // Derive azimuth/polar from camera position relative to target.
    const offset = cam.position.clone().sub(target);
    const radius = offset.length();
    const polar = Math.acos(offset.y / Math.max(radius, 1e-6));
    const azimuth = Math.atan2(offset.x, offset.z);
    return {
      camera: {
        targetX: target.x,
        targetY: target.z, // room Y = Three.js Z
        targetZ: target.y, // room Z = Three.js Y
        azimuthDeg: (azimuth * 180) / Math.PI,
        polarDeg: (polar * 180) / Math.PI,
        zoom: cam.zoom,
      },
      visibility: { showHeads, showRspMarker },
    };
  }, [showHeads, showRspMarker]);

  const handleSaveReportView = useCallback(() => {
    const framing = captureFraming();
    if (!framing || !projectId) return;
    saveReportView(projectId, versionId, framing);
    setIsSaved(true);
  }, [captureFraming, projectId, versionId]);

  const btnStyle = {
    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", padding: "6px 12px",
    borderRadius: 6, border: "1px solid #DCDBD6", background: "#fff", color: "#213428",
    cursor: "pointer", touchAction: "manipulation", userSelect: "none",
  };
  const btnActive = { ...btnStyle, background: "#213428", color: "#fff", borderColor: "#213428" };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#F8F8F7" }}>
      {/* Controls overlay — Reset View + Save to Report only */}
      <div style={{
        position: "absolute", top: 10, left: 10, zIndex: 5, display: "flex",
        gap: 8, flexWrap: "wrap", alignItems: "center", pointerEvents: "auto",
      }}>
        <button type="button" style={btnStyle} onClick={resetView}>Reset View</button>
        <button type="button" style={isSaved ? btnStyle : btnActive} onClick={handleSaveReportView}>
          Save to Report
        </button>
      </div>

      {/* The 3D canvas mount */}
      <div ref={mountRef} style={{ width: "100%", height: "100%", touchAction: "none" }} />

      {/* Loading / empty hint */}
      {!sceneData?.roomDims && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", color: "#9B9890", fontSize: 13, pointerEvents: "none",
        }}>
          Loading room…
        </div>
      )}
    </div>
  );
}

// Dispose all geometries/materials in a group to avoid GPU leaks on rebuild.
function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material.dispose?.();
    }
  });
}