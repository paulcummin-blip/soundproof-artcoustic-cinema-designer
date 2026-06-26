/**
 * FiniteSourceRadiationAudit.jsx
 * Diagnostic only — no production changes, does not affect the live graph.
 * Collapsed by default.
 *
 * Goal: Determine whether finite source radiation behaviour naturally explains
 * the depth difference between Variant Q (−53.7 dB at 41.5 Hz) and REW (−17 dB at 40.6 Hz),
 * without artificial coherence factors.
 *
 * Baseline: Variant Q (normalised-vector summation).
 * Only the source radiation model is varied across Families A–F.
 */

import React, { useState, useCallback } from 'react';
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from '@/bass/core/modalCalculations';

// ── Constants ──────────────────────────────────────────────────────────────────

const C              = 343;
const REW_NULL_HZ    = 40.6;
const REW_NULL_DEPTH = -17.0;
const FLAT_SRC_DB    = 94;
const NULL_RANGE     = { min: 20, max: 60 };
const TEST_HZ        = [30, 35, 40, 45, 50, 55, 60];
const REW_REF        = { 30: 87.5, 35: 85.0, 40: 76.0, 45: 85.5, 50: 91.0, 55: 89.0, 60: 88.0 };

// Driver diameters in inches → radius in metres
const inchToM = i => (i * 0.0254) / 2;
const DRIVER_RADII = { '8"': inchToM(8), '10"': inchToM(10), '12"': inchToM(12), '15"': inchToM(15), '18"': inchToM(18) };

// ── Variant definitions ────────────────────────────────────────────────────────

const VARIANTS = [
  // Family A — Ideal point source (baseline)
  { key: 'A_point', family: 'A', label: 'Ideal point source', desc: 'Monopole baseline — Variant Q. No radiation correction.' },

  // Family B — Finite piston (circular piston radiation factor)
  { key: 'B_8in',  family: 'B', label: 'Finite piston 8"',  desc: '8" driver diameter. Circular piston ka rolloff.', radiusM: DRIVER_RADII['8"'] },
  { key: 'B_10in', family: 'B', label: 'Finite piston 10"', desc: '10" driver diameter.', radiusM: DRIVER_RADII['10"'] },
  { key: 'B_12in', family: 'B', label: 'Finite piston 12"', desc: '12" driver diameter.', radiusM: DRIVER_RADII['12"'] },
  { key: 'B_15in', family: 'B', label: 'Finite piston 15"', desc: '15" driver diameter.', radiusM: DRIVER_RADII['15"'] },
  { key: 'B_18in', family: 'B', label: 'Finite piston 18"', desc: '18" driver diameter.', radiusM: DRIVER_RADII['18"'] },

  // Family C — Radiating area models
  { key: 'C_equiv',   family: 'C', label: 'Equiv piston radius',  desc: 'Effective radius = sqrt(Sd/π) for a 12" driver (Sd ≈ 0.053 m²).' },
  { key: 'C_effSd',   family: 'C', label: 'Effective Sd',         desc: 'Effective Sd = 0.9 × nominal Sd, 12" driver.' },
  { key: 'C_measSd',  family: 'C', label: 'Measured Sd',          desc: 'Measured Sd = 0.8 × nominal Sd, representing surround compliance reduction.' },

  // Family D — Cabinet radiation centre offsets
  { key: 'D_driver',  family: 'D', label: 'Driver centre',        desc: 'Direct distance measured from driver centre (cabinet mid-depth offset).' },
  { key: 'D_acoustic',family: 'D', label: 'Acoustic centre',      desc: 'Acoustic centre ~0.1 m behind front baffle.' },
  { key: 'D_front',   family: 'D', label: 'Cabinet front plane',  desc: 'Direct distance measured from cabinet front plane (sub.z = floor + 0.35 m).' },
  { key: 'D_distrib', family: 'D', label: 'Distributed radiation',desc: 'Average over front and rear radiation points (finite cabinet depth ≈ 0.4 m).' },

  // Family E — Multi-point source approximation
  { key: 'E_1pt',  family: 'E', label: '1-point source',    desc: 'Single monopole at driver centre. Same as baseline.' },
  { key: 'E_4pt',  family: 'E', label: '4-point source',    desc: '4-point uniform grid over piston face (12" driver).' },
  { key: 'E_9pt',  family: 'E', label: '9-point source',    desc: '9-point uniform grid over piston face (12" driver).' },
  { key: 'E_16pt', family: 'E', label: '16-point source',   desc: '16-point uniform grid over piston face (12" driver).' },
  { key: 'E_gauss',family: 'E', label: 'Gaussian weighted', desc: '9-point Gaussian-weighted grid — emphasises centre.' },

  // Family F — Radiation averaging
  { key: 'F_spatial', family: 'F', label: 'Spatial averaging',    desc: 'SPL averaged over a small spatial region around the seat (±0.15 m).' },
  { key: 'F_angular', family: 'F', label: 'Angular averaging',    desc: 'Average over ±10° arrival angles from sub to seat.' },
  { key: 'F_aperture',family: 'F', label: 'Finite aperture avg',  desc: 'Aperture integral: pressure averaged over finite piston face projected to listener.' },
  { key: 'F_nearfield',family:'F', label: 'Near-field correction',desc: 'Near-field correction factor for source-seat distances < 3λ.' },
];

// ── Build room modes ───────────────────────────────────────────────────────────

function buildModes(roomDims, surfaceAbsorption, axialQ) {
  const { widthM, lengthM, heightM } = roomDims;
  return computeRoomModesLocal({ widthM, lengthM, heightM, fMax: 120, c: C }).map(m => {
    const baseQ = m.type === 'axial' ? (axialQ ?? 4.0) : m.type === 'tangential' ? 3.9 : 2.5;
    const absQ  = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: m.freq });
    return { ...m, qValue: Math.max(1, Math.min(baseQ, absQ)) };
  });
}

// ── Frequency axis ─────────────────────────────────────────────────────────────

function buildFreqs(min = 15, max = 80, step = 0.5) {
  const out = [];
  for (let f = min; f <= max + 1e-9; f += step) out.push(Math.round(f * 100) / 100);
  return out;
}

// ── Circular piston radiation factor J1(ka)/ka ────────────────────────────────
// For on-axis pressure: H(ka) = 2·J1(ka)/ka
// J1 via series: J1(x) ≈ x/2 - x³/16 + x⁵/384 - x⁷/18432...

function J1(x) {
  if (Math.abs(x) < 1e-10) return 0;
  // Good enough for ka < 20 (sub-bass range)
  let s = 0;
  const half = x / 2;
  let term = half;
  for (let k = 1; k <= 20; k++) {
    s += term / k;
    term *= -(half * half) / (k * (k + 1));
  }
  return s;
}

function pistonFactor(fHz, radiusM) {
  const k  = 2 * Math.PI * fHz / C;
  const ka = k * radiusM;
  if (ka < 1e-8) return 1;
  return 2 * J1(ka) / ka;
}

// ── Grid points for multi-point source ────────────────────────────────────────

function uniformGridPoints(n, radiusM) {
  // n × n grid over square bounding box, filter to circle
  const pts = [];
  const step = 2 * radiusM / (n - 1 || 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -radiusM + i * step;
      const z = -radiusM + j * step;
      if (x * x + z * z <= radiusM * radiusM) pts.push({ x, z, w: 1 });
    }
  }
  if (!pts.length) pts.push({ x: 0, z: 0, w: 1 });
  const wSum = pts.length;
  return pts.map(p => ({ ...p, w: p.w / wSum }));
}

function gaussianGridPoints(n, radiusM) {
  const pts = [];
  const step = 2 * radiusM / (n - 1 || 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -radiusM + i * step;
      const z = -radiusM + j * step;
      if (x * x + z * z <= radiusM * radiusM) {
        const r2 = (x * x + z * z) / (radiusM * radiusM);
        pts.push({ x, z, w: Math.exp(-2 * r2) });
      }
    }
  }
  if (!pts.length) pts.push({ x: 0, z: 0, w: 1 });
  const wSum = pts.reduce((s, p) => s + p.w, 0);
  return pts.map(p => ({ ...p, w: p.w / wSum }));
}

// ── Variant Q kernel (single source point) ────────────────────────────────────
// directGainFn(fHz, distM) => gain scalar applied to direct path
// Returns splDb array.

function runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, directGainFn) {
  const { widthM, lengthM, heightM } = roomDims;
  const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);
  const dx = sub.x - seat.x, dy = sub.y - seat.y, dz = (sub.z ?? 0.35) - (seat.z ?? 1.2);
  const distM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const srcAmp = srcAmpBase / distM;

  return freqsHz.map(fHz => {
    // Direct — Variant Q normalised phase + optional gain scalar
    const dirPhase = -2 * Math.PI * fHz * distM / C;
    const dGain = directGainFn(fHz, distM);
    const rawDirRe = dGain * srcAmp * Math.cos(dirPhase);
    const rawDirIm = dGain * srcAmp * Math.sin(dirPhase);
    const dirMag = Math.sqrt(rawDirRe ** 2 + rawDirIm ** 2) || 1;
    const dirRe = rawDirRe / dirMag;
    const dirIm = rawDirIm / dirMag;

    // Modal sum — normalised (Variant Q)
    let modRawRe = 0, modRawIm = 0;
    modes.forEach(m => {
      const psiSrc = modeShapeValueLocal(m, sub.x,  sub.y,  sub.z  ?? 0.35, { widthM, lengthM, heightM });
      const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seat.z ?? 1.2,  { widthM, lengthM, heightM });
      const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
      const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
      const axialHO = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
      const gain = srcAmp * psiSrc * psiRcv * orderWt * axialHO;
      const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);
      modRawRe += gain * tfRe;
      modRawIm += gain * tfIm;
    });
    const modMag = Math.sqrt(modRawRe ** 2 + modRawIm ** 2) || 1;
    const modRe = modRawRe / modMag;
    const modIm = modRawIm / modMag;

    const totMag = Math.sqrt((dirRe + modRe) ** 2 + (dirIm + modIm) ** 2);
    return 20 * Math.log10(Math.max(totMag, 1e-10));
  });
}

// ── Multi-point kernel — averages pressure across grid points ─────────────────

function runMultiPointKernel(freqsHz, roomDims, seat, sub, modes, gridPts) {
  const { widthM, lengthM, heightM } = roomDims;
  const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);
  const subZ = sub.z ?? 0.35;
  const seatZ = seat.z ?? 1.2;

  return freqsHz.map(fHz => {
    // Average SPL (linear pressure) across all source grid points
    let totRe = 0, totIm = 0;

    gridPts.forEach(({ x: ox, z: oz, w }) => {
      const sx = sub.x + ox;
      const sz = subZ + oz;
      const dx = sx - seat.x, dy = sub.y - seat.y, dz = sz - seatZ;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const srcAmp = srcAmpBase / dist;

      // Direct
      const dirPhase = -2 * Math.PI * fHz * dist / C;
      const rawDirRe = srcAmp * Math.cos(dirPhase);
      const rawDirIm = srcAmp * Math.sin(dirPhase);
      const dirMag = Math.sqrt(rawDirRe ** 2 + rawDirIm ** 2) || 1;
      const dirRe = rawDirRe / dirMag;
      const dirIm = rawDirIm / dirMag;

      // Modal (still referenced to sub.x/sub.y for mode coupling, Variant Q normalised)
      let modRawRe = 0, modRawIm = 0;
      modes.forEach(m => {
        const psiSrc = modeShapeValueLocal(m, sx, sub.y, sz, { widthM, lengthM, heightM });
        const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seatZ, { widthM, lengthM, heightM });
        const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
        const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
        const axialHO = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
        const gain = srcAmp * psiSrc * psiRcv * orderWt * axialHO;
        const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);
        modRawRe += gain * tfRe;
        modRawIm += gain * tfIm;
      });
      const modMag = Math.sqrt(modRawRe ** 2 + modRawIm ** 2) || 1;
      const modRe = modRawRe / modMag;
      const modIm = modRawIm / modMag;

      totRe += w * (dirRe + modRe);
      totIm += w * (dirIm + modIm);
    });

    return 20 * Math.log10(Math.max(Math.sqrt(totRe ** 2 + totIm ** 2), 1e-10));
  });
}

// ── Spatial averaging kernel (listener side) ──────────────────────────────────

function runSpatialAvgKernel(freqsHz, roomDims, seat, sub, modes, offsetM) {
  const offsets = [
    { dx: 0,       dy: 0 },
    { dx: +offsetM, dy: 0 },
    { dx: -offsetM, dy: 0 },
    { dx: 0,       dy: +offsetM },
    { dx: 0,       dy: -offsetM },
  ];
  const w = 1 / offsets.length;
  const { widthM, lengthM, heightM } = roomDims;
  const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);

  return freqsHz.map(fHz => {
    let sumRe = 0, sumIm = 0;
    offsets.forEach(off => {
      const listenX = (seat.x ?? 0) + off.dx;
      const listenY = (seat.y ?? 0) + off.dy;
      const listenZ = seat.z ?? 1.2;
      const dx = sub.x - listenX, dy = sub.y - listenY, dz = (sub.z ?? 0.35) - listenZ;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const srcAmp = srcAmpBase / dist;

      const dirPhase = -2 * Math.PI * fHz * dist / C;
      const rawDirRe = srcAmp * Math.cos(dirPhase);
      const rawDirIm = srcAmp * Math.sin(dirPhase);
      const dirMag = Math.sqrt(rawDirRe ** 2 + rawDirIm ** 2) || 1;
      const dirRe = rawDirRe / dirMag, dirIm = rawDirIm / dirMag;

      let modRawRe = 0, modRawIm = 0;
      modes.forEach(m => {
        const psiSrc = modeShapeValueLocal(m, sub.x, sub.y, sub.z ?? 0.35, { widthM, lengthM, heightM });
        const psiRcv = modeShapeValueLocal(m, listenX, listenY, listenZ, { widthM, lengthM, heightM });
        const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
        const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
        const axialHO = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
        const gain = srcAmp * psiSrc * psiRcv * orderWt * axialHO;
        const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);
        modRawRe += gain * tfRe; modRawIm += gain * tfIm;
      });
      const modMag = Math.sqrt(modRawRe ** 2 + modRawIm ** 2) || 1;
      const modRe = modRawRe / modMag, modIm = modRawIm / modMag;

      sumRe += w * (dirRe + modRe);
      sumIm += w * (dirIm + modIm);
    });
    return 20 * Math.log10(Math.max(Math.sqrt(sumRe ** 2 + sumIm ** 2), 1e-10));
  });
}

// ── Run one variant ────────────────────────────────────────────────────────────

function runVariant(def, freqsHz, roomDims, seat, sub, modes) {
  const t0 = performance.now();
  const subZ = sub.z ?? 0.35;
  const seatZ = seat.z ?? 1.2;

  let splDb;

  const identity = (_f, _d) => 1;

  if (def.family === 'A') {
    splDb = runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, identity);

  } else if (def.family === 'B') {
    const r = def.radiusM;
    splDb = runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, (fHz) => {
      const pf = pistonFactor(fHz, r);
      return Math.max(pf, 0.01); // never zero
    });

  } else if (def.family === 'C') {
    // Nominal Sd for 12" ≈ 0.053 m²
    const nomSd = 0.053;
    const sdMap = { C_equiv: nomSd, C_effSd: 0.9 * nomSd, C_measSd: 0.8 * nomSd };
    const sd = sdMap[def.key] ?? nomSd;
    const r = Math.sqrt(sd / Math.PI);
    splDb = runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, (fHz) => {
      return Math.max(pistonFactor(fHz, r), 0.01);
    });

  } else if (def.family === 'D') {
    let effSub = { ...sub };
    if (def.key === 'D_driver') {
      // Cabinet mid-depth: shift source 0.2 m back from front face
      effSub = { ...sub, y: sub.y + 0.2 };
    } else if (def.key === 'D_acoustic') {
      effSub = { ...sub, y: sub.y + 0.1 };
    } else if (def.key === 'D_front') {
      // Already at front — no offset needed, same as baseline
      effSub = { ...sub };
    } else if (def.key === 'D_distrib') {
      // Average of front (y) and rear (y + 0.4 m cabinet depth)
      const frontDx = sub.x - seat.x, frontDy = sub.y - seat.y, frontDz = subZ - seatZ;
      const frontDist = Math.max(0.01, Math.sqrt(frontDx ** 2 + frontDy ** 2 + frontDz ** 2));
      const rearY = sub.y + 0.4;
      const rearDy = rearY - seat.y;
      const rearDist = Math.max(0.01, Math.sqrt(frontDx ** 2 + rearDy ** 2 + frontDz ** 2));
      const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);
      splDb = freqsHz.map(fHz => {
        const pFront = -2 * Math.PI * fHz * frontDist / C;
        const pRear  = -2 * Math.PI * fHz * rearDist  / C;
        const amp    = srcAmpBase / frontDist;
        const aRear  = srcAmpBase / rearDist;
        const re = 0.5 * amp * Math.cos(pFront) + 0.5 * aRear * Math.cos(pRear);
        const im = 0.5 * amp * Math.sin(pFront) + 0.5 * aRear * Math.sin(pRear);
        // Normalise as Variant Q
        const mag = Math.sqrt(re ** 2 + im ** 2) || 1;
        const dirRe = re / mag, dirIm = im / mag;
        // Modal still at nominal sub position
        const { widthM, lengthM, heightM } = roomDims;
        let modRawRe = 0, modRawIm = 0;
        modes.forEach(m => {
          const psiSrc = modeShapeValueLocal(m, sub.x, sub.y, subZ, { widthM, lengthM, heightM });
          const psiRcv = modeShapeValueLocal(m, seat.x, seat.y, seatZ, { widthM, lengthM, heightM });
          const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
          const orderWt = modeOrder >= 2 ? 0.5 : 1.0;
          const axialHO = (m.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
          const g = amp * psiSrc * psiRcv * orderWt * axialHO;
          const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);
          modRawRe += g * tfRe; modRawIm += g * tfIm;
        });
        const modMag = Math.sqrt(modRawRe ** 2 + modRawIm ** 2) || 1;
        const modRe = modRawRe / modMag, modIm = modRawIm / modMag;
        return 20 * Math.log10(Math.max(Math.sqrt((dirRe + modRe) ** 2 + (dirIm + modIm) ** 2), 1e-10));
      });
    }
    if (!splDb) {
      splDb = runSingleSourceKernel(freqsHz, roomDims, { ...seat }, effSub, modes, identity);
    }

  } else if (def.family === 'E') {
    const r12 = DRIVER_RADII['12"'];
    if (def.key === 'E_1pt') {
      splDb = runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, identity);
    } else if (def.key === 'E_gauss') {
      const pts = gaussianGridPoints(3, r12);
      splDb = runMultiPointKernel(freqsHz, roomDims, seat, sub, modes, pts);
    } else {
      const nMap = { E_4pt: 2, E_9pt: 3, E_16pt: 4 };
      const n = nMap[def.key] ?? 1;
      const pts = uniformGridPoints(n, r12);
      splDb = runMultiPointKernel(freqsHz, roomDims, seat, sub, modes, pts);
    }

  } else if (def.family === 'F') {
    if (def.key === 'F_spatial') {
      splDb = runSpatialAvgKernel(freqsHz, roomDims, seat, sub, modes, 0.15);
    } else if (def.key === 'F_angular') {
      // Average over ±10° in the horizontal plane
      const angleOffsets = [-10, -5, 0, 5, 10].map(deg => deg * Math.PI / 180);
      const dx0 = sub.x - seat.x, dy0 = sub.y - seat.y;
      const baseDist = Math.max(0.01, Math.sqrt(dx0 ** 2 + dy0 ** 2 + ((sub.z ?? 0.35) - (seat.z ?? 1.2)) ** 2));
      const seats = angleOffsets.map(ang => ({
        x: seat.x + baseDist * Math.sin(ang),
        y: seat.y,
        z: seat.z ?? 1.2,
      }));
      const w = 1 / seats.length;
      const { widthM, lengthM, heightM } = roomDims;
      const srcAmpBase = Math.pow(10, FLAT_SRC_DB / 20);
      splDb = freqsHz.map(fHz => {
        let sumRe = 0, sumIm = 0;
        seats.forEach(ls => {
          const dx = sub.x - ls.x, dy = sub.y - ls.y, dz = (sub.z ?? 0.35) - ls.z;
          const dist = Math.max(0.01, Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2));
          const sa = srcAmpBase / dist;
          const ph = -2 * Math.PI * fHz * dist / C;
          const rawRe = sa * Math.cos(ph), rawIm = sa * Math.sin(ph);
          const dm = Math.sqrt(rawRe ** 2 + rawIm ** 2) || 1;
          const dRe = rawRe / dm, dIm = rawIm / dm;
          let mRawRe = 0, mRawIm = 0;
          modes.forEach(m => {
            const psiSrc = modeShapeValueLocal(m, sub.x, sub.y, sub.z ?? 0.35, { widthM, lengthM, heightM });
            const psiRcv = modeShapeValueLocal(m, ls.x, ls.y, ls.z, { widthM, lengthM, heightM });
            const modeOrder = Math.abs(m.nx) + Math.abs(m.ny) + Math.abs(m.nz);
            const g = sa * psiSrc * psiRcv * (modeOrder >= 2 ? 0.25 : 1.0);
            const { re: tfRe, im: tfIm } = resonantTransfer(fHz, m.freq, m.qValue);
            mRawRe += g * tfRe; mRawIm += g * tfIm;
          });
          const mm = Math.sqrt(mRawRe ** 2 + mRawIm ** 2) || 1;
          sumRe += w * (dRe + mRawRe / mm);
          sumIm += w * (dIm + mRawIm / mm);
        });
        return 20 * Math.log10(Math.max(Math.sqrt(sumRe ** 2 + sumIm ** 2), 1e-10));
      });
    } else if (def.key === 'F_aperture') {
      // Aperture integral: piston factor applied to direct path, modal unaffected
      const r12 = DRIVER_RADII['12"'];
      splDb = runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, (fHz) => {
        return Math.max(pistonFactor(fHz, r12), 0.01);
      });
    } else if (def.key === 'F_nearfield') {
      // Near-field correction: 1/(1 + a/r) where a = ka/(2π) ~ lambda/2pi
      const dx0 = sub.x - seat.x, dy0 = sub.y - seat.y, dz0 = (sub.z ?? 0.35) - (seat.z ?? 1.2);
      const dist = Math.max(0.01, Math.sqrt(dx0 ** 2 + dy0 ** 2 + dz0 ** 2));
      splDb = runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, (fHz) => {
        const lambda = C / fHz;
        const nearFieldCorrected = dist / (dist + lambda / (2 * Math.PI));
        return Math.max(nearFieldCorrected, 0.01);
      });
    }

  }

  if (!splDb) {
    splDb = runSingleSourceKernel(freqsHz, roomDims, seat, sub, modes, identity);
  }

  return { splDb, runtimeMs: performance.now() - t0 };
}

// ── Metrics ────────────────────────────────────────────────────────────────────

function detectNull(freqsHz, splDb) {
  const band = freqsHz.map((f, i) => ({ f, s: splDb[i] }))
    .filter(p => p.f >= NULL_RANGE.min && p.f <= NULL_RANGE.max && Number.isFinite(p.s));
  if (band.length < 3) return null;
  const vals = [...band].map(p => p.s).sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)];
  let deepest = null;
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].s < band[i - 1].s && band[i].s < band[i + 1].s) {
      const depth = band[i].s - med;
      if (!deepest || depth < deepest.depth)
        deepest = { hz: band[i].f, spl: band[i].s, depth };
    }
  }
  return deepest;
}

function detectPeak(freqsHz, splDb) {
  let peak = null;
  freqsHz.forEach((f, i) => {
    if (f < NULL_RANGE.min || f > NULL_RANGE.max || !Number.isFinite(splDb[i])) return;
    if (!peak || splDb[i] > peak.spl) peak = { hz: f, spl: splDb[i] };
  });
  return peak;
}

function computeMAE(freqsHz, splDb) {
  let sum = 0, n = 0;
  TEST_HZ.forEach(hz => {
    const ref = REW_REF[hz]; if (ref == null) return;
    let best = null, bestD = Infinity;
    freqsHz.forEach((f, i) => { const d = Math.abs(f - hz); if (d < bestD) { bestD = d; best = splDb[i]; } });
    if (best !== null && Number.isFinite(best)) { sum += Math.abs(best - ref); n++; }
  });
  return n ? sum / n : null;
}

function computeWorstErr(freqsHz, splDb) {
  let worst = 0, worstHz = null;
  TEST_HZ.forEach(hz => {
    const ref = REW_REF[hz]; if (ref == null) return;
    let best = null, bestD = Infinity;
    freqsHz.forEach((f, i) => { const d = Math.abs(f - hz); if (d < bestD) { bestD = d; best = splDb[i]; } });
    if (best !== null && Number.isFinite(best)) {
      const e = Math.abs(best - ref);
      if (e > worst) { worst = e; worstHz = hz; }
    }
  });
  return { worstErr: worst, worstHz };
}

// ── Run all ────────────────────────────────────────────────────────────────────

function runAll(roomDims, seat, sub, surfaceAbsorption, axialQ) {
  const freqsHz = buildFreqs();
  const modes   = buildModes(roomDims, surfaceAbsorption, axialQ);

  return VARIANTS.map(def => {
    try {
      const { splDb, runtimeMs } = runVariant(def, freqsHz, roomDims, seat, sub, modes);
      const nullInfo  = detectNull(freqsHz, splDb);
      const peakInfo  = detectPeak(freqsHz, splDb);
      const mae       = computeMAE(freqsHz, splDb);
      const { worstErr, worstHz } = computeWorstErr(freqsHz, splDb);
      const distHz    = nullInfo ? Math.abs(nullInfo.hz - REW_NULL_HZ) : 999;
      const depthDelta = nullInfo ? Math.abs(nullInfo.depth - REW_NULL_DEPTH) : 999;
      const score     = (distHz * 2) + depthDelta + (mae ?? 20);
      return {
        ...def,
        nullHz: nullInfo?.hz ?? null, nullDepth: nullInfo?.depth ?? null,
        peakHz: peakInfo?.hz ?? null, peakSpl: peakInfo?.spl ?? null,
        mae, worstErr, worstHz, distFromRewNull: distHz, depthDelta, score, runtimeMs,
      };
    } catch (e) {
      return { ...def, error: e.message, runtimeMs: 0 };
    }
  });
}

function rankResults(results) {
  return [...results].filter(r => !r.error).sort((a, b) => {
    const da = a.distFromRewNull ?? 999, db = b.distFromRewNull ?? 999;
    if (Math.abs(da - db) > 0.5) return da - db;
    const dda = a.depthDelta ?? 999, ddb = b.depthDelta ?? 999;
    if (Math.abs(dda - ddb) > 0.5) return dda - ddb;
    return (a.mae ?? 999) - (b.mae ?? 999);
  });
}

// ── Engineering verdict ────────────────────────────────────────────────────────

function buildVerdict(ranked) {
  if (!ranked.length) return { text: 'No results.', type: 'neutral' };

  // Baseline stats (Family A — point source)
  const baseline = ranked.find(r => r.key === 'A_point');
  const baseDepth = baseline?.nullDepth ?? null;

  // Best non-A candidate that moves depth meaningfully towards −17 dB
  const nonBase = ranked.filter(r => r.family !== 'A');
  const physWin = nonBase.find(r =>
    (r.distFromRewNull ?? 999) < 2 && (r.depthDelta ?? 999) < 3
  );

  if (physWin) {
    return {
      text: `${physWin.key} (${physWin.label}) reproduces null at ${physWin.nullHz?.toFixed(1)} Hz with depth ${physWin.nullDepth?.toFixed(1)} dB — within tolerance of REW (${REW_NULL_HZ} Hz / ${REW_NULL_DEPTH} dB). Finite source radiation is likely the dominant cause of depth reduction. Simplest production implementation: circular piston radiation factor applied to direct path.`,
      type: 'candidate',
    };
  }

  // Check if any variant materially reduces depth towards −17 dB
  const bestDepth = ranked[0]?.nullDepth ?? null;
  const baseDeepest = baseDepth !== null ? baseDepth : null;
  const bestImprovement = (baseDeepest !== null && bestDepth !== null) ? bestDepth - baseDeepest : null;

  if (bestImprovement !== null && bestImprovement > 10) {
    return {
      text: `Finite source radiation partially reduces the null depth (best: ${ranked[0]?.nullDepth?.toFixed(1)} dB vs baseline ${baseDeepest?.toFixed(1)} dB). However no variant achieves REW target of ${REW_NULL_DEPTH} dB. Finite source behaviour is a contributing factor but not the sole cause.`,
      type: 'partial',
    };
  }

  return {
    text: 'Finite source behaviour is not the dominant cause of the remaining REW discrepancy. None of the tested radiation models move the null depth materially towards −17 dB while maintaining the correct null frequency. Investigate REW\'s modal excitation assumptions, boundary conditions, or room pressure field normalisation.',
    type: 'investigate',
  };
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

const mono = { fontFamily: 'monospace', fontSize: 10 };

function TH({ ch, left }) {
  return (
    <th style={{ ...mono, padding: '3px 6px', fontSize: 9, fontWeight: 700, color: '#6b7280',
      background: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap' }}>
      {ch}
    </th>
  );
}

function TD({ v, unit = '', digits = 2, color }) {
  const n = Number(v);
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
      color: color ?? (Number.isFinite(n) ? '#1c1917' : '#9ca3af') }}>
      {Number.isFinite(n) ? `${n.toFixed(digits)}${unit}` : '—'}
    </td>
  );
}

function NullHzCell({ hz }) {
  const dist = hz !== null && Number.isFinite(hz) ? Math.abs(hz - REW_NULL_HZ) : null;
  const col  = dist !== null ? (dist < 2 ? '#166534' : dist < 5 ? '#92400e' : '#991b1b') : '#9ca3af';
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: col,
      fontWeight: dist !== null && dist < 3 ? 700 : 400 }}>
      {hz !== null && Number.isFinite(hz) ? `${hz.toFixed(1)} Hz` : '—'}
    </td>
  );
}

function DepthCell({ depth }) {
  const delta = depth !== null && Number.isFinite(depth) ? Math.abs(depth - REW_NULL_DEPTH) : null;
  const col   = delta !== null ? (delta < 3 ? '#166534' : delta < 8 ? '#92400e' : '#991b1b') : '#9ca3af';
  return (
    <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: col,
      fontWeight: delta !== null && delta < 4 ? 700 : 400 }}>
      {depth !== null && Number.isFinite(depth) ? `${depth.toFixed(1)} dB` : '—'}
    </td>
  );
}

const FAM_COLORS = { A: '#374151', B: '#7c3aed', C: '#0369a1', D: '#065f46', E: '#92400e', F: '#991b1b' };

function FamBadge({ family }) {
  return (
    <span style={{ display: 'inline-block', width: 16, textAlign: 'center',
      fontWeight: 700, color: FAM_COLORS[family] ?? '#374151', fontFamily: 'monospace', fontSize: 10 }}>
      {family}
    </span>
  );
}

const FAMILY_NAMES = {
  A: 'Family A — Ideal point source (baseline)',
  B: 'Family B — Finite piston',
  C: 'Family C — Radiating area',
  D: 'Family D — Cabinet radiation centre',
  E: 'Family E — Multi-point source',
  F: 'Family F — Radiation averaging',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function FiniteSourceRadiationAudit({ roomDims, seat, sub, surfaceAbsorption, axialQ }) {
  const [running, setRunning] = useState(false);
  const [data, setData]       = useState(null);

  const handleRun = useCallback(() => {
    if (!roomDims || !seat || !sub) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const results = runAll(roomDims, seat, sub, surfaceAbsorption, axialQ ?? 4.0);
        const ranked  = rankResults(results);
        const verdict = buildVerdict(ranked);
        setData({ results, ranked, verdict });
      } catch (e) {
        setData({ error: e.message });
      }
      setRunning(false);
    }, 20);
  }, [roomDims, seat, sub, surfaceAbsorption, axialQ]);

  const VS = {
    candidate:   { bg: '#f0fdf4', border: '#166534', color: '#166534' },
    partial:     { bg: '#fffbeb', border: '#92400e', color: '#92400e' },
    investigate: { bg: '#eff6ff', border: '#1d4ed8', color: '#1d4ed8' },
    neutral:     { bg: '#f3f4f6', border: '#6b7280', color: '#374151' },
  };

  return (
    <details style={{ border: '1px solid #065f46', borderRadius: 8, background: '#f0fdf4', padding: 0, marginBottom: 8 }}>
      <summary style={{ fontWeight: 700, color: '#064e3b', fontSize: 11, fontFamily: 'monospace',
        cursor: 'pointer', padding: '8px 12px', userSelect: 'none' }}>
        Finite Source Radiation Audit — {VARIANTS.length} variants · depth reduction vs REW −17 dB
        <span style={{ fontSize: 9, fontWeight: 400, color: '#065f46', marginLeft: 8 }}>diagnostic only · collapsed by default</span>
      </summary>

      <div style={{ padding: '0 12px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#065f46', maxWidth: '72%', lineHeight: 1.5 }}>
            Baseline: Variant Q normalised-vector summation (null ~41.5 Hz / −53.7 dB). Only source radiation model varied.
            All other engine parameters held constant.
          </div>
          <button
            onClick={handleRun}
            disabled={running || !roomDims || !seat || !sub}
            style={{ padding: '5px 14px', borderRadius: 5, fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
              background: running ? '#e5e7eb' : '#065f46', color: running ? '#6b7280' : '#fff',
              border: 'none', cursor: running ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
          >
            {running ? `Running ${VARIANTS.length} variants…` : data ? 'Re-run' : 'Run Audit'}
          </button>
        </div>

        {(!seat || !sub) && (
          <div style={{ color: '#065f46', fontSize: 10, fontFamily: 'monospace' }}>⚠ Need seat and sub to run.</div>
        )}
        {data?.error && (
          <div style={{ color: '#991b1b', fontSize: 10, fontFamily: 'monospace', padding: 6, background: '#fee2e2', borderRadius: 4 }}>
            Error: {data.error}
          </div>
        )}

        {data && !data.error && (() => {
          const { ranked, verdict } = data;
          const vc = VS[verdict.type] ?? VS.neutral;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── VERDICT ── */}
              <div style={{ padding: '8px 12px', borderRadius: 6, background: vc.bg,
                border: `2px solid ${vc.border}`, fontFamily: 'monospace', fontSize: 10,
                color: vc.color, fontWeight: 700, lineHeight: 1.6 }}>
                {verdict.text}
              </div>

              {/* ── RANKED SUMMARY (always visible) ── */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 10, color: '#064e3b', marginBottom: 4 }}>
                  Ranked Summary — null Hz closest to {REW_NULL_HZ} Hz, then depth closest to {REW_NULL_DEPTH} dB
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
                    <thead>
                      <tr>
                        <TH ch="Rank" left />
                        <TH ch="Fam" />
                        <TH ch="Variant" left />
                        <TH ch="Null Hz" />
                        <TH ch="Null depth" />
                        <TH ch="Δ Hz from REW" />
                        <TH ch="Δ depth from REW" />
                        <TH ch="Score" />
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const isBase = r.key === 'A_point';
                        const depthDelta = r.nullDepth !== null ? r.nullDepth - REW_NULL_DEPTH : null;
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #d1fae5',
                            background: isBase ? '#dcfce7' : i === 0 ? '#f0fdf4' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', color: '#6b7280', textAlign: 'right' }}>
                              {i + 1}{isBase ? ' ★' : ''}
                            </td>
                            <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                              <FamBadge family={r.family} />
                            </td>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isBase || i === 0 ? 700 : 400 }}>
                              {r.label}
                              {i === 0 && !isBase && <span style={{ color: '#166534', marginLeft: 4, fontSize: 8 }}>★ best</span>}
                            </td>
                            <NullHzCell hz={r.nullHz} />
                            <DepthCell depth={r.nullDepth} />
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: (r.distFromRewNull ?? 999) < 2 ? '#166534' : (r.distFromRewNull ?? 999) < 5 ? '#92400e' : '#991b1b',
                              fontWeight: (r.distFromRewNull ?? 999) < 3 ? 700 : 400 }}>
                              {Number.isFinite(r.distFromRewNull) ? `${r.distFromRewNull.toFixed(1)} Hz` : '—'}
                            </td>
                            <td style={{ ...mono, padding: '2px 5px', textAlign: 'right',
                              color: depthDelta !== null && Math.abs(depthDelta) < 3 ? '#166534' : '#6b7280' }}>
                              {depthDelta !== null && Number.isFinite(depthDelta)
                                ? `${depthDelta > 0 ? '+' : ''}${depthDelta.toFixed(1)} dB` : '—'}
                            </td>
                            <TD v={r.score} digits={1}
                              color={r.score < 10 ? '#166534' : r.score > 30 ? '#991b1b' : '#374151'} />
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: '2px solid #6ee7b7', background: '#fef9c3' }}>
                        <td colSpan={3} style={{ ...mono, padding: '2px 6px', fontWeight: 700, color: '#92400e' }}>REW target</td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>
                          {REW_NULL_HZ.toFixed(1)} Hz
                        </td>
                        <td style={{ ...mono, padding: '2px 5px', textAlign: 'right', color: '#92400e', fontWeight: 700 }}>
                          {REW_NULL_DEPTH.toFixed(1)} dB
                        </td>
                        <td colSpan={3} style={{ ...mono, padding: '2px 5px', color: '#9ca3af', fontSize: 9 }}>reference</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── FULL METRICS (collapsed) ── */}
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Full Metrics — all {ranked.length} variants
                </summary>
                <div style={{ overflowX: 'auto', marginTop: 6 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
                    <thead>
                      <tr>
                        <TH ch="Variant" left />
                        <TH ch="MAE" />
                        <TH ch="Worst err" />
                        <TH ch="Worst Hz" />
                        <TH ch="Null Hz" />
                        <TH ch="Null depth" />
                        <TH ch="Peak Hz" />
                        <TH ch="Peak dB" />
                        <TH ch="Runtime" />
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const isBase = r.key === 'A_point';
                        return (
                          <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6',
                            background: isBase ? '#dcfce7' : i === 0 ? '#f0fdf4' : 'transparent' }}>
                            <td style={{ ...mono, padding: '2px 6px', fontWeight: isBase ? 700 : 400 }}>
                              <FamBadge family={r.family} />
                              <span style={{ marginLeft: 4 }}>{r.label}</span>
                            </td>
                            <TD v={r.mae} digits={2} unit=" dB"
                              color={r.mae < 3 ? '#166534' : r.mae > 6 ? '#991b1b' : undefined} />
                            <TD v={r.worstErr} digits={2} unit=" dB" />
                            <TD v={r.worstHz} digits={0} unit=" Hz" />
                            <NullHzCell hz={r.nullHz} />
                            <DepthCell depth={r.nullDepth} />
                            <TD v={r.peakHz} digits={1} unit=" Hz" />
                            <TD v={r.peakSpl} digits={1} unit=" dB" />
                            <TD v={r.runtimeMs} digits={1} unit=" ms" />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>

              {/* ── VARIANT DESCRIPTIONS (collapsed) ── */}
              <details>
                <summary style={{ ...mono, fontWeight: 700, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                  Variant descriptions — {VARIANTS.length} variants across 6 families
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['A', 'B', 'C', 'D', 'E', 'F'].map(fam => {
                    const famVars = VARIANTS.filter(v => v.family === fam);
                    return (
                      <div key={fam}>
                        <div style={{ fontWeight: 700, fontSize: 9, color: FAM_COLORS[fam], fontFamily: 'monospace', marginBottom: 2 }}>
                          {FAMILY_NAMES[fam]}
                        </div>
                        {famVars.map(v => (
                          <div key={v.key} style={{ padding: '2px 8px', borderRadius: 3, marginBottom: 2,
                            background: '#f8faf8', border: '1px solid #d1fae5', fontSize: 9, fontFamily: 'monospace' }}>
                            <span style={{ fontWeight: 600, color: '#374151', marginRight: 6 }}>{v.label}</span>
                            <span style={{ color: '#6b7280' }}>{v.desc}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </details>

            </div>
          );
        })()}
      </div>
    </details>
  );
}