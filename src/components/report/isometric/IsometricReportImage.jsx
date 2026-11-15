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

import React, { useEffect, useRef, useState } from "react";
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
import { setIsometricReportReady } from "./isometricReportReadinessStore";

const RENDER_WIDTH = 1200;
const RENDER_HEIGHT = 1600;

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
}) {
  const [dataUrl, setDataUrl] = useState(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Stable key for the design inputs — re-render only when the physical design
  // changes, not on every parent render.
  const designKey = useRef(buildDesignKey(appState, stableDimensions, placedSpeakers, seatingPositions, mlpPoint, screen, roomElements, dolbyLayout));

  useEffect(() => {
    let disposed = false;
    let renderer = null;
    let scene = null;

    setIsometricReportReady(readinessKey, false);

    try {
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
        if (!disposed) {
          setDataUrl(null);
          onReadyRef.current?.(null);
        }
        return () => {};
      }

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

      const bbox = new THREE.Box3().setFromObject(group);
      if (bbox.isEmpty()) {
        if (!disposed) {
          setDataUrl(null);
          onReadyRef.current?.(null);
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

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(RENDER_WIDTH, RENDER_HEIGHT, false);
      renderer.render(scene, camera);

      if (!disposed) {
        const url = renderer.domElement.toDataURL("image/png");
        setDataUrl(url);
        setIsometricReportReady(readinessKey, true);
        onReadyRef.current?.(url);
      }
    } catch {
      if (!disposed) {
        setDataUrl(null);
        onReadyRef.current?.(null);
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
      setIsometricReportReady(readinessKey, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designKey.current, readinessKey]);

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