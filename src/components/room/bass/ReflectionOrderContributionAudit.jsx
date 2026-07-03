// ReflectionOrderContributionAudit.jsx
// Temporary READ-ONLY diagnostic — identifies which image-source reflection wall
// pair(s)/order(s) create the opposing 30Hz vector in the fixed REW parity case.
//
// Direct and modal vectors are read directly from the production engine
// (simulateBassResponseRewCore, unmodified, via perFrequencyVectorDebug).
// The reflection breakdown replicates the exact production image-source geometry
// and formula (verbatim from rewBassEngine.js buildImageSources + the reflection
// summation loop) so each individual image source's Re/Im can be reported and
// grouped by wall/order — the production file itself does not expose this
// per-source breakdown, so it is reproduced unmodified here for read-only reporting.
// The group totals are verified to sum to the production reflectionRe/Im.
//
// No production behaviour, graph output, or physics is changed.
//
// Fixed test case: room 5.0m x 4.5m x 3.0m, sub centre-front, seat y=4.0m,
// absorption 0.30 all surfaces, frequencies 28-35Hz (1Hz steps).

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

const TEST_FREQS = [28, 29, 30, 31, 32, 33, 34, 35];
const ROOM_DIMS = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SUB = { x: 4.5 / 2, y: 0.1, z: 0.35, modelKey: "test-sub", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 4.5 / 2, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FLAT_CURVE_DB = 94; // flat reference curve value (matches FLAT_CURVE used in sibling audits)
const SPEED_OF_SOUND_MPS = 343;
const MIN_DISTANCE_M = 0.01;
// Production default (BassResponse.jsx does not override debugReflectionOrder) — first-order only.
const REFLECTION_ORDER = 1;

function magToDb(mag) {
  return 20 * Math.log10(Math.max(mag, 1e-10));
}
function phaseDeg(re, im) {
  return (Math.atan2(im, re) * 180) / Math.PI;
}
function angleDiffDeg(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// Verbatim copy of buildImageSources from src/bass/core/rewBassEngine.js — unmodified.
function buildImageSources(sx, sy, sz, W, L, H, sa, maxOrder) {
  if (maxOrder < 1) return [];
  const sources = [];
  const rMax = maxOrder;

  for (let rx = -rMax; rx <= rMax; rx++) {
    for (let ry = -rMax; ry <= rMax; ry++) {
      for (let rz = -rMax; rz <= rMax; rz++) {
        const totalOrder = Math.abs(rx) + Math.abs(ry) + Math.abs(rz);
        if (totalOrder === 0 || totalOrder > maxOrder) continue;

        const imgX = (rx % 2 === 0) ? rx * W + sx : rx * W + (W - sx);
        const imgY = (ry % 2 === 0) ? ry * L + sy : ry * L + (L - sy);
        const imgZ = (rz % 2 === 0) ? rz * H + sz : rz * H + (H - sz);

        const absRx = Math.abs(rx);
        const absRy = Math.abs(ry);
        const absRz = Math.abs(rz);

        let rightHits, leftHits, backHits, frontHits, ceilingHits, floorHits;

        if (rx >= 0) {
          rightHits = Math.ceil(absRx / 2);
          leftHits = Math.floor(absRx / 2);
        } else {
          leftHits = Math.ceil(absRx / 2);
          rightHits = Math.floor(absRx / 2);
        }
        if (ry >= 0) {
          backHits = Math.ceil(absRy / 2);
          frontHits = Math.floor(absRy / 2);
        } else {
          frontHits = Math.ceil(absRy / 2);
          backHits = Math.floor(absRy / 2);
        }
        if (rz >= 0) {
          ceilingHits = Math.ceil(absRz / 2);
          floorHits = Math.floor(absRz / 2);
        } else {
          floorHits = Math.ceil(absRz / 2);
          ceilingHits = Math.floor(absRz / 2);
        }

        const rc =
          Math.pow(Math.sqrt(1 - sa.left), leftHits) *
          Math.pow(Math.sqrt(1 - sa.right), rightHits) *
          Math.pow(Math.sqrt(1 - sa.front), frontHits) *
          Math.pow(Math.sqrt(1 - sa.back), backHits) *
          Math.pow(Math.sqrt(1 - sa.floor), floorHits) *
          Math.pow(Math.sqrt(1 - sa.ceiling), ceilingHits);

        const wallsHit = [];
        if (leftHits > 0) wallsHit.push("left");
        if (rightHits > 0) wallsHit.push("right");
        if (frontHits > 0) wallsHit.push("front");
        if (backHits > 0) wallsHit.push("back");
        if (floorHits > 0) wallsHit.push("floor");
        if (ceilingHits > 0) wallsHit.push("ceiling");

        sources.push({ x: imgX, y: imgY, z: imgZ, reflectionCoefficient: rc, order: totalOrder, wallsHit });
      }
    }
  }
  return sources;
}

function orderLabel(order) {
  if (order === 1) return "1st";
  if (order === 2) return "2nd";
  if (order === 3) return "3rd";
  return "4th+";
}

// Replicates the exact production per-image-source reflection formula
// (rewBassEngine.js lines ~949-990), unmodified, for per-source reporting.
function computeReflectionSources(frequencyHz) {
  const imageSources = buildImageSources(
    SUB.x, SUB.y, SUB.z,
    ROOM_DIMS.widthM, ROOM_DIMS.lengthM, ROOM_DIMS.heightM,
    SURFACE_ABSORPTION,
    REFLECTION_ORDER
  );

  return imageSources.map((imageSource) => {
    const dx = imageSource.x - SEAT.x;
    const dy = imageSource.y - SEAT.y;
    const dz = imageSource.z - SEAT.z;
    const distanceM = Math.max(MIN_DISTANCE_M, Math.sqrt(dx * dx + dy * dy + dz * dz));

    const distanceLossDb = -20 * Math.log10(distanceM / 1);
    const magnitudeDb = FLAT_CURVE_DB + distanceLossDb + SUB.tuning.gainDb;
    const amplitude = Math.pow(10, magnitudeDb / 20) * imageSource.reflectionCoefficient;

    const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
    const delayPhase = -2 * Math.PI * frequencyHz * (SUB.tuning.delayMs / 1000);
    const polarityPhase = SUB.tuning.polarity === 180 ? Math.PI : 0;
    const totalPhase = timeOfFlightPhase + delayPhase + polarityPhase;

    const coherenceWeight = Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));

    const re = coherenceWeight * amplitude * Math.cos(totalPhase);
    const im = coherenceWeight * amplitude * Math.sin(totalPhase);

    return { ...imageSource, re, im };
  });
}

function runProductionVectors(frequencyHz) {
  const flatCurve = [{ hz: 20, db: FLAT_CURVE_DB }, { hz: 200, db: FLAT_CURVE_DB }];
  const result = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, flatCurve, {
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections: true,
    enableModes: true,
  });
  const vec = result.perFrequencyVectorDebug[0] || {};
  return {
    directRe: vec.directRe ?? 0, directIm: vec.directIm ?? 0,
    modalRe: vec.modalSumRe ?? 0, modalIm: vec.modalSumIm ?? 0,
    reflectionRe: vec.reflectionRe ?? 0, reflectionIm: vec.reflectionIm ?? 0,
  };
}

function buildFrequencyRow(frequencyHz) {
  const production = runProductionVectors(frequencyHz);
  const sources = computeReflectionSources(frequencyHz);

  const modalPhase = phaseDeg(production.modalRe, production.modalIm);

  // Group by wall-combo + order
  const groups = new Map();
  sources.forEach((s) => {
    const key = `${s.wallsHit.join("+")} / ${orderLabel(s.order)}`;
    const existing = groups.get(key) || { wall: s.wallsHit.join("+"), order: orderLabel(s.order), re: 0, im: 0 };
    existing.re += s.re;
    existing.im += s.im;
    groups.set(key, existing);
  });

  const groupRows = Array.from(groups.values()).map((g) => {
    const mag = Math.sqrt(g.re * g.re + g.im * g.im);
    const phase = phaseDeg(g.re, g.im);
    const phaseDiffVsModal = angleDiffDeg(phase, modalPhase);
    // Destructive projection: component of this group's vector anti-parallel to the modal vector.
    const destructiveProjection = phaseDiffVsModal !== null
      ? mag * Math.cos((180 - phaseDiffVsModal) * Math.PI / 180)
      : 0;
    return {
      ...g,
      magDb: magToDb(mag),
      phase,
      phaseDiffVsModal,
      cancellationContributionDb: magToDb(Math.max(destructiveProjection, 1e-10)),
      destructiveProjection,
    };
  });

  // Sanity check: sum of group Re/Im should equal production reflectionRe/Im
  const sumRe = groupRows.reduce((acc, g) => acc + g.re, 0);
  const sumIm = groupRows.reduce((acc, g) => acc + g.im, 0);

  return {
    hz: frequencyHz,
    directRe: production.directRe, directIm: production.directIm,
    directMagDb: magToDb(Math.sqrt(production.directRe ** 2 + production.directIm ** 2)),
    directPhase: phaseDeg(production.directRe, production.directIm),
    modalRe: production.modalRe, modalIm: production.modalIm,
    modalMagDb: magToDb(Math.sqrt(production.modalRe ** 2 + production.modalIm ** 2)),
    modalPhase,
    groupRows,
    reconstructedReflectionRe: sumRe,
    reconstructedReflectionIm: sumIm,
    productionReflectionRe: production.reflectionRe,
    productionReflectionIm: production.reflectionIm,
  };
}

export default function ReflectionOrderContributionAudit() {
  const rows = useMemo(() => TEST_FREQS.map((hz) => buildFrequencyRow(hz)), []);
  const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

  const row30 = rows.find((r) => r.hz === 30);
  const ranking30 = row30
    ? [...row30.groupRows].sort((a, b) => b.destructiveProjection - a.destructiveProjection)
    : [];
  const totalDestructive = ranking30.reduce((acc, g) => acc + Math.max(g.destructiveProjection, 0), 0);
  const topShare = ranking30.length > 0 && totalDestructive > 0
    ? Math.max(ranking30[0].destructiveProjection, 0) / totalDestructive
    : 0;

  const frontBackFirstOrder = ranking30.filter((g) => (g.wall === "front" || g.wall === "back") && g.order === "1st");
  const frontBackShare = totalDestructive > 0
    ? frontBackFirstOrder.reduce((acc, g) => acc + Math.max(g.destructiveProjection, 0), 0) / totalDestructive
    : 0;
  const floorCeilingFirstOrder = ranking30.filter((g) => (g.wall === "floor" || g.wall === "ceiling") && g.order === "1st");
  const floorCeilingShare = totalDestructive > 0
    ? floorCeilingFirstOrder.reduce((acc, g) => acc + Math.max(g.destructiveProjection, 0), 0) / totalDestructive
    : 0;

  let verdictLabel;
  if (topShare > 0.6) {
    verdictLabel = "GEOMETRIC REFLECTION BUG LIKELY";
  } else if (frontBackShare > 0.6) {
    verdictLabel = "FRONT/BACK IMAGE-SOURCE PHASE ISSUE LIKELY";
  } else if (floorCeilingShare > 0.6) {
    verdictLabel = "HEIGHT REFLECTION ISSUE LIKELY";
  } else {
    verdictLabel = "LOW-FREQUENCY IMAGE-SOURCE / MODAL DOUBLE-COUNTING LIKELY";
  }

  const testStr = "Per wall-pair/order decomposition of the image-source reflection vector vs the modal vector at 30Hz (fixed REW parity case).";
  const expectedStr = "If a single wall/order dominates the cancellation (>60% of total destructive projection), a geometric or wall-specific reflection bug is implicated; otherwise cancellation is a distributed modal/image-source interaction.";
  const actualStr = ranking30.length > 0
    ? `Top contributor: ${ranking30[0].wall} / ${ranking30[0].order} at ${fmt((topShare * 100), 0)}% of total destructive projection (cancellation contribution ${fmt(ranking30[0].cancellationContributionDb)} dB).`
    : "No reflection groups found.";
  const deltaStr = `Reconstructed reflection vector vs production: Re diff ${fmt(row30 ? row30.reconstructedReflectionRe - row30.productionReflectionRe : null, 4)}, Im diff ${fmt(row30 ? row30.reconstructedReflectionIm - row30.productionReflectionIm : null, 4)} (should be ~0, confirming the per-source breakdown matches production).`;
  const severityStr = verdictLabel === "GEOMETRIC REFLECTION BUG LIKELY" ? "Critical" : "Medium";
  const nextTestStr = verdictLabel === "GEOMETRIC REFLECTION BUG LIKELY"
    ? `Audit the ${ranking30[0]?.wall || ""} wall's image-source position/distance formula in isolation for a geometry error.`
    : verdictLabel === "FRONT/BACK IMAGE-SOURCE PHASE ISSUE LIKELY"
      ? "Audit the front/back image-source distance and phase formula against measured REW front/back reflection timing."
      : verdictLabel === "HEIGHT REFLECTION ISSUE LIKELY"
        ? "Audit floor/ceiling image-source height and absorption coefficients against REW's vertical reflection model."
        : "Audit the combined reflection+modal summation stage itself rather than any single wall/order.";

  return (
    <div style={{ border: "2px solid #0c4a6e", borderRadius: 8, background: "#f0f9ff", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#0c4a6e", fontSize: 12, marginBottom: 4 }}>
        Reflection Order Contribution Audit — temporary diagnostic (production geometry, unmodified)
      </div>
      <div style={{ color: "#075985", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0m x 4.5m x 3.0m — sub centre-front — seat y=4.0m — absorption 0.30. Read-only: direct/modal vectors are exact production values; reflection breakdown replicates production's buildImageSources + summation formula verbatim, verified to sum to the production reflection vector.
      </div>

      {rows.map((r) => (
        <div key={r.hz} style={{ border: "1px solid #bae6fd", borderRadius: 6, background: "#fff", padding: "6px 8px", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>
            {r.hz} Hz — Direct: Re {r.directRe.toFixed(3)} Im {r.directIm.toFixed(3)} ({fmt(r.directMagDb)} dB, {fmt(r.directPhase)}°) — Modal: Re {r.modalRe.toFixed(3)} Im {r.modalIm.toFixed(3)} ({fmt(r.modalMagDb)} dB, {fmt(r.modalPhase)}°)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #bae6fd", color: "#0c4a6e", fontSize: 9, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: "2px 5px" }}>Wall</th>
                  <th style={{ textAlign: "left", padding: "2px 5px" }}>Order</th>
                  <th style={{ textAlign: "right", padding: "2px 5px" }}>Re</th>
                  <th style={{ textAlign: "right", padding: "2px 5px" }}>Im</th>
                  <th style={{ textAlign: "right", padding: "2px 5px" }}>Mag dB</th>
                  <th style={{ textAlign: "right", padding: "2px 5px" }}>Phase °</th>
                  <th style={{ textAlign: "right", padding: "2px 5px" }}>Δ vs Modal °</th>
                  <th style={{ textAlign: "right", padding: "2px 5px" }}>Cancel dB</th>
                </tr>
              </thead>
              <tbody>
                {r.groupRows
                  .sort((a, b) => b.destructiveProjection - a.destructiveProjection)
                  .map((g, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #e0f2fe" }}>
                      <td style={{ padding: "1px 5px" }}>{g.wall}</td>
                      <td style={{ padding: "1px 5px" }}>{g.order}</td>
                      <td style={{ textAlign: "right", padding: "1px 5px" }}>{g.re.toFixed(4)}</td>
                      <td style={{ textAlign: "right", padding: "1px 5px" }}>{g.im.toFixed(4)}</td>
                      <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(g.magDb)}</td>
                      <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(g.phase)}</td>
                      <td style={{ textAlign: "right", padding: "1px 5px" }}>{fmt(g.phaseDiffVsModal)}</td>
                      <td style={{ textAlign: "right", padding: "1px 5px", fontWeight: g.destructiveProjection > 0 ? 700 : 400, color: g.destructiveProjection > 0 ? "#b91c1c" : "#166534" }}>{fmt(g.cancellationContributionDb)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ border: "1px solid #bae6fd", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: 6 }}>Ranking Table at 30Hz (by cancellation contribution vs modal)</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #bae6fd", color: "#0c4a6e", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Rank</th>
              <th style={{ textAlign: "left", padding: "2px 6px" }}>Wall</th>
              <th style={{ textAlign: "left", padding: "2px 6px" }}>Order</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Cancel dB</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>% of total destructive</th>
            </tr>
          </thead>
          <tbody>
            {ranking30.map((g, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #e0f2fe", background: idx === 0 ? "#e0f2fe" : undefined }}>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: 700 }}>{idx + 1}</td>
                <td style={{ padding: "1px 6px" }}>{g.wall}</td>
                <td style={{ padding: "1px 6px" }}>{g.order}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(g.cancellationContributionDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{totalDestructive > 0 ? fmt((Math.max(g.destructiveProjection, 0) / totalDestructive) * 100, 0) : "—"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: "1px solid #bae6fd", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>Pass/Fail Diagnosis (30Hz)</div>
        <div style={{ fontWeight: 700, fontSize: 11, color: "#b91c1c" }}>{verdictLabel}</div>
      </div>

      <div style={{ border: "2px solid #0c4a6e", borderRadius: 6, background: "#fff", padding: "8px 10px" }}>
        <div>TEST: {testStr}</div>
        <div>EXPECTED: {expectedStr}</div>
        <div>ACTUAL: {actualStr}</div>
        <div>DELTA: {deltaStr}</div>
        <div>SEVERITY: {severityStr}</div>
        <div>NEXT TEST: {nextTestStr}</div>
      </div>
    </div>
  );
}