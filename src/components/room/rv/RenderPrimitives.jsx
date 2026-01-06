"use client";

import React from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// ---- Roles / misc helpers ----
export const isSubRole = (role) => {
  const s = String(role || "").toUpperCase();
  return s.includes("SUB") || s === "LFE" || s.startsWith("SW");
};

export const hasPos = (s) => (s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y));

export const isRenderableSpeaker = (speaker) => {
  if (!speaker) return false;

  // Must have a valid position to draw anything
  if (
    !speaker.position ||
    typeof speaker.position.x !== "number" ||
    typeof speaker.position.y !== "number" ||
    !Number.isFinite(speaker.position.x) ||
    !Number.isFinite(speaker.position.y)
  ) {
    return false;
  }

  // Only render if a real model is selected.
  // Prevents "default" surround icons appearing when Surround Model = off.
  const ms = String(speaker?.model ?? '').trim().toLowerCase();
  if (!ms || ms === 'off' || ms === 'none') return false;

  return true;
};

// SIMPLIFIED: All speakers render black for now
export function getChannelColor(/* role */) {
  return "#000000";
}

export function normaliseModelKey(name = "") {
  const raw = String(name).trim().toLowerCase();
  let s = raw.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  s = s.replace(/spitfire-?q-?(\d+)-?(\d+)/, "spitfire-q-$1-$2");
  s = s.replace(/evolve-?(\d+)-?(\d+)/, "evolve-$1-$2");
  return s;
}

// ---- Angle helpers (render-time) ----
export const RAD = Math.PI / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;

// 0° = facing into room (+Y). Positive yaw = clockwise.
export function yawDegToMLP(pos, mlp) {
  if (!pos || !mlp) return 0;
  const dx = mlp.x - pos.x;
  const dy = mlp.y - pos.y;
  return rad2deg(Math.atan2(dx, dy));
}

// Safe wrapper to avoid HUD-breaking exceptions
export const safeYawToMLP = (speaker, mlp) => {
  try { return yawDegToMLP(speaker, mlp); }
  catch (e) { if (typeof console !== "undefined") console.error("Error in yawDegToMLP:", e); return 0; }
};

// ---- Visual constants ----
export const PADDING = 40;
export const DEFAULT_W = 1000;
export const DEFAULT_H = 700;

export const SCREEN_BAR_PX = 16;
export const SCREEN_BAR_HALF_PX = SCREEN_BAR_PX / 2;

// depth/fmt utilities used across RV
export const SCREEN_THICKNESS_M = 0.05;
export const toCmCeil = (m) => (Number.isFinite(m) ? Math.ceil(m * 100) : null);

// stroke-aware projection used for on-canvas collision/placement
export const SPEAKER_STROKE_PX = 2;
export const STROKE_HALF_M =
  (SPEAKER_STROKE_PX / 2) /
  Math.max(1, (typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1)) /
  96 * 0.0254;

// Projected half-extent along Y for a rotated rectangle (VISUAL: includes stroke)
export function yHalfExtentM(depthM, widthM, yawDeg = 0) {
  const t = Math.abs((yawDeg || 0) * RAD);
  return (depthM * 0.5) * Math.abs(Math.cos(t)) +
         (widthM * 0.5) * Math.abs(Math.sin(t)) +
         STROKE_HALF_M;
}

// Physical (no stroke). Exported in case reports need it.
export function yHalfExtentM_physical(depthM, widthM, yawDeg = 0) {
  const t = Math.abs((yawDeg || 0) * RAD);
  return (depthM * 0.5) * Math.abs(Math.cos(t)) +
         (widthM * 0.5) * Math.abs(Math.sin(t));
}

// Single source of truth for target MLP Y (RP23 57.5° H FOV)
export function targetMlpY57_5(screen, roomFrontY = 0) {
  const visibleW_m = (Number(screen?.visibleWidthInches || 100) * 0.0254);
  const planeDepth_m = Math.max(0, Number(screen?.floatDepthM) || 0.20);
  const d57 = (visibleW_m / 2) / Math.tan((57.5 * RAD) / 2);
  return roomFrontY + planeDepth_m + d57;
}

// ---- Render primitives ----
export const SpeakerIcon = React.memo(function SpeakerIcon({
  speaker,
  canvasX,
  canvasY_raw,
  yawDeg,
  widthM,
  depthM,
  scale,
  speakerMouseDownHandler,
  setHoveredSpeaker
}) {
  const { model, role, id } = speaker || {};
  
  // Get speaker metadata from registry
  const modelMeta = getSpeakerModelMeta(model);
  
  // Log warning if model not found in registry (with better visibility for overhead debugging)
  if (modelMeta?.notFound && typeof console !== 'undefined') {
    console.warn(`[RenderPrimitives] Speaker model "${model}" not found in registry, using defaults for role ${role}`);
  }
  
  // Determine if this should render as a circle
  // Check BOTH round flag AND presence of diameterM (legacy models might only have diameterM)
  const isRound = modelMeta?.round === true || (modelMeta?.diameterM && modelMeta?.round !== false);
  
  // Safe fallbacks: use registry dimensions or defaults (ensure always visible)
  const safeWidthM = modelMeta?.widthM || (Number(widthM) > 0 ? Number(widthM) : 0.27);
  const safeDepthM = modelMeta?.depthM || (Number(depthM) > 0 ? Number(depthM) : 0.27);
  
  // Get color (currently always black)
  const color = getChannelColor(role);
  
  // For round speakers (overheads), render as circle
  if (isRound) {
    const diameter = modelMeta?.diameterM || safeWidthM;
    const radiusPx = (diameter / 2) * (scale || 1);
    
    return (
      <g
        pointerEvents="all"
        onMouseDown={speakerMouseDownHandler}
        onMouseEnter={() =>
          setHoveredSpeaker?.({ id, role, model, x: canvasX, y: canvasY_raw, angle: yawDeg })
        }
        onMouseLeave={() => setHoveredSpeaker?.(null)}
        className={speakerMouseDownHandler ? "cursor-grab active:cursor-grabbing" : ""}
      >
        <circle
          cx={canvasX}
          cy={canvasY_raw}
          r={radiusPx}
          fill={color || "#000000"}
          stroke="#000000"
          strokeWidth={1}
          opacity={1}
        />
      </g>
    );
  }
  
  // For rectangular speakers, render as rotated rectangle
  const w = safeWidthM * (scale || 1);
  const d = safeDepthM * (scale || 1);
  
  const pathData = `M ${-w / 2},${-d / 2} L ${w / 2},${-d / 2} L ${w / 2},${d / 2} L ${-w / 2},${d / 2} Z`;
  const transform = `translate(${canvasX}, ${canvasY_raw}) rotate(${yawDeg || 0})`;

  return (
    <g
      transform={transform}
      pointerEvents="all"
      onMouseDown={speakerMouseDownHandler}
      onMouseEnter={() =>
        setHoveredSpeaker?.({ id, role, model, x: canvasX, y: canvasY_raw, angle: yawDeg })
      }
      onMouseLeave={() => setHoveredSpeaker?.(null)}
      className={speakerMouseDownHandler ? "cursor-grab active:cursor-grabbing" : ""}
    >
      <path
        d={pathData}
        fill={color || "#000000"}
        stroke="#000000"
        strokeWidth={1}
        opacity={1}
      />
    </g>
  );
});
SpeakerIcon.displayName = "SpeakerIcon";

// Simple rectangle (subs etc.)
export function SpeakerRect({ speaker, widthM, depthM, opacity = 1.0, scale = 1, toPx, pointerEvents = "auto" }) {
  if (!speaker?.position || !widthM || !depthM) return null;
  const [cx, cy] = toPx(speaker.position.x, speaker.position.y);
  const w = widthM * scale;
  const d = depthM * scale;
  return (
    <rect
      x={cx - w / 2}
      y={cy - d / 2}
      width={w}
      height={d}
      rx={0}
      ry={0}
      fill="#1a1a1a"
      stroke="none"
      strokeWidth={0}
      style={{ opacity }}
      pointerEvents={pointerEvents}
    />
  );
}