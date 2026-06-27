/**
 * AcousticSolverShootoutBatch4.jsx
 * Diagnostic only: Width Axial Coupling Micro-Audit
 *
 * Goal: find why (1,0,0) width axial mode has receiver coupling = 0.
 * No production solver changes. No modal maths changes.
 */

import React, { useState } from 'react';
import { modeShapeValueLocal, resonantTransfer, estimateModeQLocal, computeRoomModesLocal } from '../../../bass/core/modalCalculations.js';

const SPEED_OF_SOUND = 343;

function fmt(v, d = 6) {
  if (v == null || !Number.isFinite(v)) return '—';
  return Number(v).toFixed(d);
}

function computeWidthAxialCoupling(x, roomDims) {
  // (1,0,0): cos(1 * π * x / width)
  const width = roomDims.widthM;
  const arg = Math.PI * x / width;
  const coupling = Math.cos(arg);
  return { arg, coupling };
}

function computeContributionAtFreq(hz, x, roomDims, seatPos, sub, surfaceAbsorption) {
  const width  = roomDims.widthM;
  const length = roomDims.lengthM;
  const height = roomDims.heightM;

  const mode100 = { nx: 1, ny: 0, nz: 0, freq: (SPEED_OF_SOUND / 2) / width, type: 'axial' };

  const qValue = estimateModeQLocal({ roomDims, surfaceAbsorption, f0: mode100.freq });
  const q = Math.max(1, Math.min(4.0, qValue)); // axialQ default 4.0

  const srcX = Number(sub.x);
  const srcY = Number(sub.y);
  const srcZ = Number(sub.z ?? 0.35);

  const lstX = x;
  const lstY = Number(seatPos.y);
  const lstZ = Number(seatPos.z ?? 1.2);

  const srcCoupling = modeShapeValueLocal(mode100, srcX, srcY, srcZ, { widthM: width, lengthM: length, heightM: height });
  const lstCoupling = modeShapeValueLocal(mode100, lstX, lstY, lstZ, { widthM: width, lengthM: length, heightM: height });
  const combined = srcCoupling * lstCoupling;

  const { transferMag, re: tRe, im: tIm } = resonantTransfer(hz, mode100.freq, q);

  const gainDb = sub?.tuning?.gainDb ?? 0;
  const dxd = srcX - lstX, dyd = srcY - lstY, dzd = srcZ - lstZ;
  const dist = Math.max(0.01, Math.sqrt(dxd*dxd + dyd*dyd + dzd*dzd));
  const directAmp = Math.pow(10, (94 - 20 * Math.log10(dist) + gainDb) / 20);

  const gain = directAmp * combined * 1.0; // order 1, orderWeight = 1.0
  const cRe  = gain * tRe;
  const cIm  = gain * tIm;
  const cMag = Math.sqrt(cRe*cRe + cIm*cIm);

  return { srcCoupling, lstCoupling, combined, q, transferMag, cMag, cRe, cIm, mode100freq: mode100.freq };
}

export default function AcousticSolverShootoutBatch4({
  roomDims,
  seatPos,
  subsForSimulation,
  surfaceAbsorption,
}) {
  const [results, setResults] = useState(null);
  const [error,   setError]   = useState(null);

  function runAudit() {
    setError(null);
    setResults(null);

    try {
      if (!roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM)
        throw new Error('Room dimensions missing.');
      if (!seatPos?.x || !seatPos?.y)
        throw new Error('Seat position missing.');
      if (!Array.isArray(subsForSimulation) || subsForSimulation.length === 0)
        throw new Error('No active subs in subsForSimulation.');

      const width  = roomDims.widthM;
      const seatX  = Number(seatPos.x);
      const mode100freq = (SPEED_OF_SOUND / 2) / width;

      // Base coupling at seat X
      const { arg, coupling: lstCoupling } = computeWidthAxialCoupling(seatX, roomDims);

      // Per-sub source coupling
      const subRows = subsForSimulation.map(sub => {
        const srcCoupling = modeShapeValueLocal(
          { nx: 1, ny: 0, nz: 0, freq: mode100freq, type: 'axial' },
          Number(sub.x), Number(sub.y), Number(sub.z ?? 0.35),
          { widthM: width, lengthM: roomDims.lengthM, heightM: roomDims.heightM }
        );
        const combined = srcCoupling * lstCoupling;
        const c = computeContributionAtFreq(mode100freq, seatX, roomDims, seatPos, sub, surfaceAbsorption);
        return { id: sub.id ?? sub.role ?? '?', srcCoupling, combined, cMag: c.cMag, x: sub.x, y: sub.y };
      });

      // Offsets in metres
      const offsets = [-0.05, -0.01, -0.001, 0, +0.001, +0.01, +0.05];
      const offsetRows = offsets.map(dxM => {
        const testX = seatX + dxM;
        const { coupling: rcv } = computeWidthAxialCoupling(testX, roomDims);
        // use first sub for contribution
        const c = computeContributionAtFreq(mode100freq, testX, roomDims,
          { ...seatPos, x: testX }, subsForSimulation[0], surfaceAbsorption);
        return { dxMm: dxM * 1000, testX, rcv, combined: c.combined, cMag: c.cMag };
      });

      // Nodal plane check: is seatX exactly width/2?
      const halfWidth = width / 2;
      const distFromNodeM = Math.abs(seatX - halfWidth);
      const isOnNodeM = distFromNodeM < 0.0001; // within 0.1 mm

      // Verdict
      let verdict = '';
      if (isOnNodeM) {
        verdict = `VERDICT: The seat X (${fmt(seatX,4)} m) is on the (1,0,0) nodal plane at width/2 = ${fmt(halfWidth,4)} m (Δ = ${(distFromNodeM*1000).toFixed(2)} mm). This is an exact pressure node — cos(π × x/W) = 0. The zero coupling is physically correct for this seating position.`;
      } else if (Math.abs(lstCoupling) < 1e-10) {
        verdict = `VERDICT: Receiver coupling is numerically zero but seat is NOT at the nodal plane (Δ = ${(distFromNodeM*1000).toFixed(1)} mm from width/2). This indicates a floating-point precision issue or clipping threshold suppressing a genuine non-zero value.`;
      } else if (Math.abs(lstCoupling) < 0.01) {
        verdict = `VERDICT: Receiver coupling is very small (${fmt(lstCoupling,8)}) but non-zero — the seat is near (${(distFromNodeM*1000).toFixed(1)} mm from) the nodal plane. The contribution is real but tiny — dominated by other modes.`;
      } else {
        verdict = `VERDICT: Receiver coupling is ${fmt(lstCoupling,6)} — NOT zero. If Batch 3 showed zero, it may be a display rounding artifact. The raw cos() value is ${fmt(lstCoupling,10)}.`;
      }

      setResults({ width, seatX, mode100freq, arg, lstCoupling, subRows, offsetRows, halfWidth, distFromNodeM, isOnNodeM, verdict });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <details className="border border-orange-500 rounded bg-orange-50 mt-4">
      <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none text-orange-900">
        🔭 Acoustic Solver Shootout — Batch 4 (Width Axial Coupling Micro-Audit)
      </summary>

      <div className="px-4 pb-5 pt-2 space-y-4 font-mono text-xs">
        <p className="text-orange-800">
          Diagnostic only. Explains why (1,0,0) receiver coupling is zero. No solver changes.
        </p>

        <button
          onClick={runAudit}
          className="px-3 py-1 text-xs bg-orange-700 text-white rounded hover:bg-orange-800"
        >
          Run Batch 4 Audit
        </button>

        {error && (
          <div className="p-2 border border-red-400 bg-red-50 text-red-800 rounded">{error}</div>
        )}

        {results && (() => {
          const { width, seatX, mode100freq, arg, lstCoupling, subRows, offsetRows,
                  halfWidth, distFromNodeM, isOnNodeM, verdict } = results;

          return (
            <div className="space-y-4">

              {/* ── Room geometry & seat ── */}
              <div className="p-2 border border-orange-300 bg-white rounded space-y-0.5 text-orange-900">
                <div className="font-bold mb-1">(1,0,0) nodal geometry</div>
                <div>Room width: <strong>{fmt(width, 4)} m</strong></div>
                <div>Seat X: <strong>{fmt(seatX, 6)} m</strong></div>
                <div>width / 2 (nodal plane): <strong>{fmt(halfWidth, 6)} m</strong></div>
                <div>Δ seat from nodal plane: <strong className={isOnNodeM ? 'text-red-700' : 'text-green-700'}>
                  {(distFromNodeM * 1000).toFixed(3)} mm
                </strong></div>
                <div>(1,0,0) mode frequency: <strong>{fmt(mode100freq, 3)} Hz</strong></div>
              </div>

              {/* ── Raw cos() decomposition ── */}
              <div className="p-2 border border-orange-400 bg-orange-100 rounded space-y-0.5 text-orange-900">
                <div className="font-bold mb-1">Receiver coupling decomposition at seat X</div>
                <div>seatX / roomWidth: <strong>{fmt(seatX / width, 8)}</strong></div>
                <div>π × seatX / roomWidth: <strong>{fmt(arg, 10)} rad</strong></div>
                <div>π × seatX / roomWidth (degrees): <strong>{fmt(arg * 180 / Math.PI, 6)}°</strong></div>
                <div>cos(π × seatX / roomWidth): <strong className={Math.abs(lstCoupling) < 0.001 ? 'text-red-700' : 'text-green-700'}>
                  {fmt(lstCoupling, 10)}
                </strong></div>
                <div>Formatted (6dp): <strong>{fmt(lstCoupling, 6)}</strong></div>
                <div>|coupling| &lt; 1e-6? <strong>{Math.abs(lstCoupling) < 1e-6 ? 'YES — effectively zero' : 'NO'}</strong></div>
              </div>

              {/* ── Per-sub source coupling ── */}
              <div>
                <div className="font-bold text-orange-900 mb-1">Source coupling per active sub</div>
                <table className="border-collapse w-full" style={{ fontSize: 10 }}>
                  <thead>
                    <tr className="bg-orange-200 text-orange-900">
                      <th className="text-left px-2 py-1 border border-orange-300">Sub ID</th>
                      <th className="px-2 py-1 border border-orange-300">Sub X (m)</th>
                      <th className="px-2 py-1 border border-orange-300">Sub Y (m)</th>
                      <th className="px-2 py-1 border border-orange-300">Src coupling ψ(src)</th>
                      <th className="px-2 py-1 border border-orange-300">Rcv coupling ψ(rcv)</th>
                      <th className="px-2 py-1 border border-orange-300">Combined ψ²</th>
                      <th className="px-2 py-1 border border-orange-300">|contribution|</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subRows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-orange-50'}>
                        <td className="px-2 py-0.5 border border-orange-100 font-bold">{row.id}</td>
                        <td className="px-2 py-0.5 border border-orange-100 text-center">{fmt(row.x, 4)}</td>
                        <td className="px-2 py-0.5 border border-orange-100 text-center">{fmt(row.y, 4)}</td>
                        <td className="px-2 py-0.5 border border-orange-100 text-center">{fmt(row.srcCoupling, 6)}</td>
                        <td className={`px-2 py-0.5 border border-orange-100 text-center ${Math.abs(lstCoupling) < 0.001 ? 'text-red-700 font-bold' : ''}`}>
                          {fmt(lstCoupling, 6)}
                        </td>
                        <td className={`px-2 py-0.5 border border-orange-100 text-center ${Math.abs(row.combined) < 0.001 ? 'text-red-700 font-bold' : ''}`}>
                          {fmt(row.combined, 8)}
                        </td>
                        <td className="px-2 py-0.5 border border-orange-100 text-center">{fmt(row.cMag, 6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Offset sensitivity table ── */}
              <div>
                <div className="font-bold text-orange-900 mb-1">Seat X offset sensitivity (sub 0)</div>
                <div className="text-orange-700 mb-1" style={{ fontSize: 10 }}>
                  If coupling remains 0 across all offsets → seat is at a true nodal plane.
                  If coupling jumps at ±1mm → it's a precision artifact.
                </div>
                <table className="border-collapse w-full" style={{ fontSize: 10 }}>
                  <thead>
                    <tr className="bg-orange-200 text-orange-900">
                      <th className="px-2 py-1 border border-orange-300">Offset (mm)</th>
                      <th className="px-2 py-1 border border-orange-300">Test X (m)</th>
                      <th className="px-2 py-1 border border-orange-300">Rcv coupling</th>
                      <th className="px-2 py-1 border border-orange-300">Combined</th>
                      <th className="px-2 py-1 border border-orange-300">|contribution|</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offsetRows.map((row, i) => {
                      const isBase = row.dxMm === 0;
                      return (
                        <tr key={i} className={isBase ? 'bg-yellow-100 font-bold' : i % 2 === 0 ? 'bg-white' : 'bg-orange-50'}>
                          <td className="px-2 py-0.5 border border-orange-100 text-center">
                            {isBase ? '0 (base)' : (row.dxMm > 0 ? '+' : '') + row.dxMm.toFixed(1)}
                          </td>
                          <td className="px-2 py-0.5 border border-orange-100 text-center">{fmt(row.testX, 6)}</td>
                          <td className={`px-2 py-0.5 border border-orange-100 text-center ${Math.abs(row.rcv) < 0.001 ? 'text-red-700' : 'text-green-700'}`}>
                            {fmt(row.rcv, 8)}
                          </td>
                          <td className="px-2 py-0.5 border border-orange-100 text-center">{fmt(row.combined, 8)}</td>
                          <td className="px-2 py-0.5 border border-orange-100 text-center">{fmt(row.cMag, 6)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Final verdict ── */}
              <div className={`p-3 rounded border-2 font-semibold leading-relaxed ${
                isOnNodeM ? 'border-red-600 bg-red-100 text-red-900'
                          : Math.abs(lstCoupling) < 1e-10 ? 'border-yellow-500 bg-yellow-100 text-yellow-900'
                          : 'border-green-600 bg-green-100 text-green-900'
              }`}>
                {verdict}
              </div>

            </div>
          );
        })()}
      </div>
    </details>
  );
}