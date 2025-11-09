
"use client";

import React from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// ---- Roles / misc helpers ----
export const isSubRole = (role) => {
  const s = String(role || "").toUpperCase();
  return s.includes("SUB") || s === "LFE" || s.startsWith("SW");
};

export const hasPos = (s) => (s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y));

// FIXED: Stricter validation - no ghost speakers
export const isRenderableSpeaker = (s) => {
  if (!s) return false;

  // Must have a role
  const role = String(s.role || "").trim();
  if (!role) return false;

  // Must have a valid position
  if (!hasPos(s)) return false;

  // Model must be meaningful (not "off", "none", empty, etc.)
  const model = String(s.model || "").trim().toLowerCase();
  if (
    !model ||
    model === "off" ||
    model === "none" ||
    model === "null" ||
    model === "undefined"
  ) {
    return false;
  }

  return true;
};

export const getChannelColor = (role) => {
  switch (String(role).toUpperCase()) {
    case "FL":
    case "FR":
    case "L":
    case "R":
      return "#1B1A1A";       // Front L/R
    case "FC":
    case "C":
      return "#3E4349";       // Center
    case "SL":
    case "SR":
    case "LS":
    case "RS":
      return "#C1B6AD";       // Side surrounds
    case "RL":
    case "RR":
    case "RSL":
    case "RSR":
    case "SBL":
    case "SBR":
      return "#625143";       // Rear surrounds
    case "TSL":
    case "TSR":
    case "TBL":
    case "TBR":
    case "TFL":
    case "TFR":
    case "LTM":
    case "RTM":
    case "LW":
    case "RW":
      return "#A87A5B";       // Tops / wides
    case "SW1":
    case "SW2":
    case "SW":
    case "SUB":
    case "LFE":
      return "#4A230F";       // Subs
    default:
      return "#999999";       // Fallback
  }
};

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
  const w = (widthM || 0) * (scale || 1);
  const d = (depthM || 0) * (scale || 1);
  const pathData = `M ${-w / 2},${-d / 2} L ${w / 2},${-d / 2} L ${w / 2},${d / 2} L ${-w / 2},${d / 2} Z`;
  const transform = `translate(${canvasX}, ${canvasY_raw}) rotate(${yawDeg || 0})`;

  return (
    <g
      transform={transform}
      pointerEvents="all"
      onMouseDown={speakerMouseDownHandler}
      onMouseEnter={() => setHoveredSpeaker?.({ id, role, model, x: canvasX, y: canvasY_raw, angle: yawDeg })}
      onMouseLeave={() => setHoveredSpeaker?.(null)}
      className={speakerMouseDownHandler ? "cursor-grab active:cursor-grabbing" : ""}
    >
      <path d={pathData} fill="#1a1a1a" stroke="none" strokeWidth={0} />
    </g>
  );
});
SpeakerIcon.displayName = "SpeakerIcon";

// Simple rectangle (subs etc.)
export function SpeakerRect({ speaker, widthM, depthM, opacity = 1.0, scale = 1, toPx }) {
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
    />
  );
}
