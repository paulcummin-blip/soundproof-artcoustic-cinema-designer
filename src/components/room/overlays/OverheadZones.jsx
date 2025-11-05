// overlays/OverheadZones.js
// Minimal, framework-safe utilities for overhead zones.
// Provides:
//  1) computeOverheadZones({...})  -> math only (no JSX)
//  2) renderOverheadBandsSVG({...}) -> returns a <g> element with bands

import React from "react";

/**
 * Compute Dolby 30–45° overhead zones around the MLP.
 * Returns { status:'ok', frontLeft?, frontRight?, midLeft?, midRight?, rearLeft?, rearRight? }
 * Each zone: { xMin, xMax, yMin, yMax } in *metres*.
 */
export function computeOverheadZones({
  seatingPositions,
  heightM,
  widthM,
  lengthM,
  mlpY_m,
  placedSpeakers,
  getCanonicalRole,
}) {
  if (!Array.isArray(seatingPositions) || seatingPositions.length === 0) {
    return { status: "disabled" };
  }

  // Dolby angles
  const THETA_NEAR_DEG = 30;
  const THETA_FAR_DEG = 45;
  const toRad = (d) => (d * Math.PI) / 180;
  const tan30 = Math.tan(toRad(THETA_NEAR_DEG));
  const tan45 = Math.tan(toRad(THETA_FAR_DEG));

  const H_room = Number(heightM) || 2.8;
  const primary = seatingPositions.find((s) => s && s.isPrimary);
  const avgEar =
    seatingPositions.reduce((a, s) => a + (Number(s?.z) || 1.2), 0) /
    seatingPositions.length;
  const H_ear = Number(primary?.z) || avgEar || 1.2;

  const delta_h = Math.max(0.1, H_room - H_ear); // 10cm minimum to avoid div/0
  const d30 = delta_h * tan30;
  const d45 = delta_h * tan45;
  const bandHeightM = Math.max(0, d45 - d30);

  const yFrontMin = mlpY_m - d45;
  const yFrontMax = mlpY_m - d30;
  const yMidMin = mlpY_m - bandHeightM / 2;
  const yMidMax = mlpY_m + bandHeightM / 2;
  const yRearMin = mlpY_m + d30;
  const yRearMax = mlpY_m + d45;

  const w = Number(widthM) || 4.5;
  const l = Number(lengthM) || 6.0;

  // Lateral limits: inner = seating span, outer = L/R screen speakers
  const seatXs = seatingPositions
    .map((s) => Number(s?.x))
    .filter((n) => Number.isFinite(n));
  const innerLeftX = seatXs.length ? Math.min(...seatXs) : w * 0.35;
  const innerRightX = seatXs.length ? Math.max(...seatXs) : w * 0.65;

  const fl = (placedSpeakers || []).find(
    (s) => getCanonicalRole(s.role) === "FL"
  );
  const fr = (placedSpeakers || []).find(
    (s) => getCanonicalRole(s.role) === "FR"
  );
  const outerLeftX = Number(fl?.position?.x);
  const outerRightX = Number(fr?.position?.x);

  const zones = { status: "ok" };

  function addBand(prefix, yMin, yMax) {
    const y0 = Math.max(0, yMin);
    const y1 = Math.min(l, yMax);
    if (!(y1 > y0)) return;

    // Left band: outerLeft -> innerLeft
    const xL0 = Number.isFinite(outerLeftX) ? outerLeftX : 0;
    const xL1 = Math.max(xL0, Math.min(w, innerLeftX));
    if (xL1 > xL0) zones[`${prefix}Left`] = { xMin: xL0, xMax: xL1, yMin: y0, yMax: y1 };

    // Right band: innerRight -> outerRight
    const xR0 = Math.max(0, Math.min(w, innerRightX));
    const xR1 = Number.isFinite(outerRightX) ? Math.min(w, outerRightX) : w;
    if (xR1 > xR0) zones[`${prefix}Right`] = { xMin: xR0, xMax: xR1, yMin: y0, yMax: y1 };
  }

  addBand("front", yFrontMin, yFrontMax);
  addBand("mid", yMidMin, yMidMax);
  addBand("rear", yRearMin, yRearMax);

  return zones;
}

/**
 * Render the overhead bands as SVG <rect>s using precomputed zones.
 * config: ".2" | ".4" | ".6"
 * Returns a single <g> element.
 */
export function renderOverheadBandsSVG({
  zones,
  config,
  toPx,
  scale,
  roomRect,
  widthM, // only used for guard defaults in labels
}) {
  if (!zones || zones.status !== "ok") return null;

  const wanted =
    config === ".2"
      ? ["midLeft", "midRight"]
      : config === ".4"
      ? ["frontLeft", "frontRight", "rearLeft", "rearRight"]
      : ["frontLeft", "frontRight", "midLeft", "midRight", "rearLeft", "rearRight"];

  const fillFor = (key) =>
    key.includes("Left") ? "#4A230F" : "#213428";

  const elts = [];

  for (const key of wanted) {
    const z = zones[key];
    if (!z) continue;

    const iconW = 0; // purely visual band; no icon here
    const [x0px] = toPx(z.xMin, 0);
    const [x1px] = toPx(z.xMax, 0);
    const [, y0px] = toPx(0, z.yMin);
    const [, y1px] = toPx(0, z.yMax);

    const x = Math.min(x0px, x1px);
    const y = Math.min(y0px, y1px);
    const wpx = Math.abs(x1px - x0px);
    const hpx = Math.abs(y1px - y0px);

    if (wpx <= 0 || hpx <= 0) continue;

    // gentle vertical gradient
    const gid = `oh-${key}-grad`;
    const fill = fillFor(key);

    elts.push(
      <defs key={`${gid}-defs`}>
        <linearGradient id={gid} x1={x} y1={y} x2={x} y2={y + hpx} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={fill} stopOpacity="0.06" />
          <stop offset="50%" stopColor={fill} stopOpacity="0.12" />
          <stop offset="100%" stopColor={fill} stopOpacity="0.06" />
        </linearGradient>
      </defs>
    );

    elts.push(
      <rect
        key={`rect-${key}`}
        x={x}
        y={y}
        width={wpx}
        height={hpx}
        fill={`url(#${gid})`}
        pointerEvents="none"
      />
    );
  }

  return <g data-layer="overhead-bands" pointerEvents="none">{elts}</g>;
}