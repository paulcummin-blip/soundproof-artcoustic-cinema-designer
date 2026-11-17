// IsometricReportImage.jsx
// ---------------------------------------------------------------------------
// Report-only isometric renderer.
//
// Builds the SAME scene data and meshes the Room Designer's IsometricView uses
// (buildIsometricSceneData + buildSceneMeshes + buildHeadMesh), but renders with
// a FIXED orthographic camera (reportIsometricFraming) and captures the canvas
// to a PNG data URL. The data URL is handed to the parent, which displays it in
// a ReportDrawingPage. The interactive OrbitControls, user-saved camera views
// and dimension overlays are NOT used here — the report view is deterministic.
//
// The render runs once per (project, version, design) change. WebGL is fully
// disposed afterwards to avoid context leaks. The component mounts in a hidden
// off-screen container so the canvas has real pixel dimensions for rendering,
// even while the print layout is not screen-visible.
//
// CAPTURE DIAGNOSTICS: each lifecycle stage is logged to the console with the
// readinessKey prefix so an admin can trace a stuck capture in the browser DevTools
// console. A failed capture sets the store's failure state (not just ready=false)
// so the UI can show the error and offer Retry instead of spinning indefinitely.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";

import { buildIsometricSceneData } from "@/components/room/isometric/buildIsometricSceneData";
import {
  buildRoomShell,
  buildScreenMesh,
  buildProjectorMesh,
  buildSpeakerMesh,
  buildSubwooferMesh,
  buildRoomElementMesh,
} from "@/components/room/isometric/buildSceneMeshes";
import { buildHeadMesh } from "@/components/room/isometric/buildHeadMesh";
import { computeReportIsometricCamera } from "./reportIsometricFraming";
import {
  setIsometricReportReady,
  setIsometricReportFailed,
  setIsometricReportDataUrl,
  isometricRetryNonce,
  isometricReportStatus,
  subscribeIsometricReportReady,
} from "./isometricReportReadinessStore";

const RENDER_WIDTH = 1200;
const RENDER_HEIGHT = 1600;

const LOG_PREFIX = "[IsometricReportImage]";

function disposeScene(scene) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material.dispose?.();
    }
  });
}

/**
 * @param {object} props
 * @param {object} props.appState - the report's app state (same object the
 *   existing drawings consume)
 * @param {object} props.stableDimensions - { width, length, height } in metres
 * @param {Array} props.placedSpeakers
 * @param {Array} props.seatingPositions
 * @param {object|null} props.mlpPoint - RSP/MLP anchor { x, y, z }
 * @param {object} props.screen
 * @param {Array} props.roomElements
 * @param {string} props.dolbyLayout
 * @param {function|null} [props.getSpeakerVisibility]
 * @param {string} props.readinessKey - "projectId::versionId" for the gate
 * @param {function} [props.onReady] - called with the PNG data URL when ready
 * @param {boolean} [props.skipIfReady] - if true, skip capture when the store
 *   already shows 'ready' for this key (used by the display-page instance when a
 *   standalone capture has already produced the image).
 */
export default function IsometricReportImage({
  appState,
  stableDimensions,
  placedSpeakers = [],
  seatingPositions = [],
  mlpPoint = null,
  screen = null,
  roomElements = [],
  dolbyLayout = "5.1",
  getSpeakerVisibility = null,
  readinessKey = null,
  onReady = null,
  skipIfReady = false,
}) {
  const [dataUrl, setDataUrl] = useState(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Reactive design key: recomputed when any physical-design input changes.
  // The effect depends on this string, so it re-runs only when the actual
  // design content changes — not on every parent re-render with new object
  // identities but identical values.
  const designKey = useMemo(
    () => buildDesignKey(appState, stableDimensions, placedSpeakers, seatingPositions, mlpPoint, screen, roomElements, dolbyLayout),
    [appState, stableDimensions, placedSpeakers, seatingPositions, mlpPoint, screen, roomElements, dolbyLayout],
  );

  // Retry nonce from the store: increments when the user clicks Retry,
  // forcing the effect to re-run.
  const retryNonce = useSyncExternalStore(
    subscribeIsometricReportReady,
    () => isometricRetryNonce(readinessKey),
    () => 0,
  );

  // Render-generation guard: each effect run gets a unique generation number.
  // A stale cleanup only clears readiness if it is STILL the current generation,
  // so an obsolete cleanup can never wipe a newer successful capture.
  const renderGenRef = useRef(0);

  useEffect(() => {
    const gen = ++renderGenRef.current;
    let disposed = false;
    let renderer = null;
    let scene = null;

    // If a standalone capture has already produced an image for this key, skip
    // the re-capture — the display page reads the dataUrl from the store.
    if (skipIfReady && isometricReportStatus(readinessKey) === 'ready') {
      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "skipped — store already ready");
      return () => {};
    }

    // eslint-disable-next-line no-console
    console.info(LOG_PREFIX, readinessKey, "capture started", { gen, designKeyPreview: designKey?.slice(0, 80) });

    setIsometricReportReady(readinessKey, false);

    try {
      // Stage 1: build scene data
      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "building scene data");
      const sceneData = buildIsometricSceneData({
        appState,
        stableDimensions,
        placedSpeakers,
        seatingPositions,
        mlpPoint,
        screen,
        roomElements,
        dolbyLayout,
        getSpeakerVisibility,
        showRspMarker: true,
        showRoomDims: false,
      });

      if (!sceneData?.roomDims) {
        // eslint-disable-next-line no-console
        console.warn(LOG_PREFIX, readinessKey, "no roomDims in scene data — capture aborted");
        if (!disposed) {
          setDataUrl(null);
          onReadyRef.current?.(null);
          setIsometricReportFailed(readinessKey, "Room dimensions are not available for the isometric render.");
        }
        return () => {};
      }

      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "scene data built", {
        roomDims: sceneData.roomDims,
        speakers: sceneData.speakers?.length || 0,
        subwoofers: sceneData.subwoofers?.length || 0,
        heads: sceneData.heads?.length || 0,
        roomElements: sceneData.roomElements?.length || 0,
        hasScreen: !!sceneData.screen,
        hasProjector: !!sceneData.projector,
      });

      // Stage 2: construct Three.js scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xF8F8F7);

      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.55);
      dir.position.set(6, 10, 8);
      scene.add(dir);

      const group = new THREE.Group();
      group.add(buildRoomShell(sceneData.roomDims));
      for (const el of sceneData.roomElements) group.add(buildRoomElementMesh(el));
      const screenMesh = buildScreenMesh(sceneData.screen);
      if (screenMesh) group.add(screenMesh);
      const projMesh = buildProjectorMesh(sceneData.projector);
      if (projMesh) group.add(projMesh);
      for (const spk of sceneData.speakers) group.add(buildSpeakerMesh(spk));
      for (const sub of sceneData.subwoofers) group.add(buildSubwooferMesh(sub));
      for (const head of sceneData.heads) group.add(buildHeadMesh(head));
      scene.add(group);

      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "scene constructed");

      // Stage 3: compute bounding box and camera
      const bbox = new THREE.Box3().setFromObject(group);
      if (bbox.isEmpty()) {
        // eslint-disable-next-line no-console
        console.warn(LOG_PREFIX, readinessKey, "bounding box is empty — capture aborted");
        if (!disposed) {
          setDataUrl(null);
          onReadyRef.current?.(null);
          setIsometricReportFailed(readinessKey, "The isometric scene has no visible geometry.");
        }
        return () => {};
      }

      const aspect = RENDER_WIDTH / RENDER_HEIGHT;
      const camParams = computeReportIsometricCamera(bbox, aspect);

      const camera = new THREE.OrthographicCamera(
        camParams.left, camParams.right, camParams.top, camParams.bottom,
        camParams.near, camParams.far,
      );
      camera.position.copy(camParams.position);
      camera.lookAt(camParams.target);

      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "camera computed", { bbox: { min: bbox.min, max: bbox.max } });

      // Stage 4: create WebGL renderer
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT, false);

      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "WebGL renderer created");

      // Stage 5: render
      renderer.render(scene, camera);

      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "render completed");

      // Stage 6: capture to PNG
      const url = renderer.domElement.toDataURL("image/png");

      if (!url || url.length < 100) {
        throw new Error("toDataURL returned an empty or invalid PNG.");
      }

      // eslint-disable-next-line no-console
      console.info(LOG_PREFIX, readinessKey, "PNG captured", { urlLength: url.length });

      // Stage 7: set readiness — only if this is still the current generation
      if (!disposed && renderGenRef.current === gen) {
        setDataUrl(url);
        setIsometricReportDataUrl(readinessKey, url);
        setIsometricReportReady(readinessKey, true);
        onReadyRef.current?.(url);
        // eslint-disable-next-line no-console
        console.info(LOG_PREFIX, readinessKey, "readiness set TRUE");
      } else {
        // eslint-disable-next-line no-console
        console.info(LOG_PREFIX, readinessKey, "capture completed but superseded — readiness not set");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(LOG_PREFIX, readinessKey, "CAPTURE FAILED", err);
      if (!disposed && renderGenRef.current === gen) {
        setDataUrl(null);
        onReadyRef.current?.(null);
        setIsometricReportFailed(readinessKey, err);
      }
    }

    return () => {
      disposed = true;
      if (renderer) {
        try { renderer.dispose(); } catch { /* already gone */ }
      }
      if (scene) {
        try { disposeScene(scene); } catch { /* already gone */ }
      }
      // Only clear readiness if this cleanup is for the CURRENT generation.
      // A stale cleanup (from an older render whose deps changed) must not
      // wipe a newer successful capture's ready state.
      if (renderGenRef.current === gen) {
        setIsometricReportReady(readinessKey, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designKey, readinessKey, retryNonce]);

  // The off-screen mount is only used to host the data-URL <img> for the parent;
  // the WebGL canvas is never appended to the DOM.
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-99999px", top: 0, width: 1, height: 1, overflow: "hidden", pointerEvents: "none" }}>
      {dataUrl ? <img src={dataUrl} alt="" /> : null}
    </div>
  );
}

function buildDesignKey(...parts) {
  try {
    return JSON.stringify(parts);
  } catch {
    return String(parts.length);
  }
}