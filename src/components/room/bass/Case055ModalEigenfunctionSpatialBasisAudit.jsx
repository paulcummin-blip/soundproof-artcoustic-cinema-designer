import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { computeRoomModesLocal, modeShapeValueLocal } from "@/bass/core/modalCalculations.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 055 — Modal Eigenfunction Spatial Basis Audit (read-only, diagnostic only).
// Verifies whether the remaining REW mismatch comes from B44's modal source/receiver
// spatial basis (mode-shape eigenfunctions), rather than phase, Q, damping, coordinates,
// or summation — all of which were separately isolated in Cases 052-054.
// Variant reconstructions reuse the production engine's own per-mode complex contributions
// and only rescale them by (newCoupling / productionCoupling) for the tested mode — no
// re-derivation of amplitude, Q, phase, or summation logic.

const MODE_FMAX_HZ = 120;
const NULL_BAND_LO = 20;
const NULL_BAND_HI = 80;
const REW_OBSERVED_NULL_HZ = 45.6;
const SEAT_BACK_OFFSET_M = 0.55;

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: 20,
  freqMaxHz: 200,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
};

function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }
function toDb(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }

function resolveLiveInputs(appState) {
  const roomDims = appState?.roomDims || { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: (roomDims.widthM || 4.5) / 2, y: (roomDims.lengthM || 6) * 0.6, z: 1.2 };
  const frontCfg = appState?.frontSubsCfg;
  const roomWidth = roomDims.widthM || 4.5;
  let sub;
  if (frontCfg?.count > 0 && Array.isArray(frontCfg.positions) && frontCfg.positions[0]) {
    const pos = frontCfg.positions[0];
    sub = { x: pos.x, y: pos.y, z: Number.isFinite(pos.z) ? pos.z : 0.35, modelKey: frontCfg.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  } else {
    sub = { x: roomWidth * 0.33, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  }
  return { roomDims: { widthM: roomWidth, lengthM: roomDims.lengthM || 6.0, heightM: roomDims.heightM || 2.4 }, seat, sub };
}

// Textbook cos/cos/cos rigid-wall eigenfunction — written independently from
// modeShapeValueLocal (which already uses cos/cos/cos) purely for parity comparison.
function textbookCosCosCos(mode, x, y, z, roomDims) {
  const W = Math.max(1e-6, roomDims.widthM), L = Math.max(1e-6, roomDims.lengthM), H = Math.max(1e-6, roomDims.heightM);
  const sx = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / W) : 1;
  const sy = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / L) : 1;
  const sz = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / H) : 1;
  return sx * sy * sz;
}

function basisVariant(variant, mode, x, y, z, roomDims) {
  const W = Math.max(1e-6, roomDims.widthM), L = Math.max(1e-6, roomDims.lengthM), H = Math.max(1e-6, roomDims.heightM);
  const trig = (axis) => (variant === axis ? Math.sin : Math.cos);
  const fx = trig("x"), fy = trig("y"), fz = trig("z");
  const sx = mode.nx > 0 ? fx(mode.nx * Math.PI * x / W) : 1;
  const sy = mode.ny > 0 ? fy(mode.ny * Math.PI * y / L) : 1;
  const sz = mode.nz > 0 ? fz(mode.nz * Math.PI * z / H) : 1;
  return sx * sy * sz;
}

function findFirstDestructiveNull(series) {
  const band = series.filter((p) => p.frequency >= NULL_BAND_LO && p.frequency <= NULL_BAND_HI && Number.isFinite(p.spl));
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl < band[i - 1].spl && band[i].spl < band[i + 1].spl) return band[i];
  }
  if (band.length === 0) return null;
  return band.reduce((min, p) => (p.spl < min.spl ? p : min), band[0]);
}

export default function Case055ModalEigenfunctionSpatialBasisAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { roomDims, seat, sub } = resolveLiveInputs(appState);
    const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const vecDebug = engineResult.perFrequencyVectorDebug || [];
    const contributorSeries = engineResult.activeModalContributorDebugSeries || [];

    // --- Mode table (<120 Hz) with B44 vs textbook cos/cos/cos comparison ---
    const modes = computeRoomModesLocal({ widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM, fMax: MODE_FMAX_HZ });
    const modeTable = modes.map((mode) => {
      const b44Source = modeShapeValueLocal(mode, sub.x, sub.y, sub.z, roomDims);
      const textbookSource = textbookCosCosCos(mode, sub.x, sub.y, sub.z, roomDims);
      const b44Receiver = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const textbookReceiver = textbookCosCosCos(mode, seat.x, seat.y, seat.z, roomDims);
      const combinedB44 = b44Source * b44Receiver;
      const combinedTextbook = textbookSource * textbookReceiver;
      const deltaSource = b44Source - textbookSource;
      const deltaReceiver = b44Receiver - textbookReceiver;
      const deltaCombined = combinedB44 - combinedTextbook;
      const signMatch = Math.sign(combinedB44) === Math.sign(combinedTextbook) ? "YES" : "NO";
      const magnitudeMatch = Math.abs(deltaCombined) < 1e-9 ? "YES" : "NO";
      return {
        nx: mode.nx, ny: mode.ny, nz: mode.nz, freq: mode.freq, type: mode.type,
        b44Source, textbookSource, deltaSource,
        b44Receiver, textbookReceiver, deltaReceiver,
        combinedB44, combinedTextbook, deltaCombined,
        signMatch, magnitudeMatch,
      };
    });

    // --- Variant reconstructions ---
    // Rescale factor per mode: newCoupling / productionCombinedCoupling. Applied to every
    // contributor entry matching that (nx,ny,nz) across the whole spectrum, leaving Q,
    // phase, amplitude, and direct/reflection paths completely untouched.
    const variantKeys = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const ratioForMode = {}; // variant -> "nx,ny,nz" -> ratio
    variantKeys.forEach((variant) => { ratioForMode[variant] = {}; });

    modes.forEach((mode) => {
      const key = `${mode.nx},${mode.ny},${mode.nz}`;
      const prodSource = modeShapeValueLocal(mode, sub.x, sub.y, sub.z, roomDims);
      const prodReceiver = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims);
      const prodCombined = prodSource * prodReceiver;
      const safeDiv = (num) => (Math.abs(prodCombined) < 1e-12 ? 1 : num / prodCombined);

      ratioForMode.A[key] = 1; // production, unchanged

      ["B", "C", "D"].forEach((v) => {
        const axis = v === "B" ? "x" : v === "C" ? "y" : "z";
        const newSource = basisVariant(axis, mode, sub.x, sub.y, sub.z, roomDims);
        const newReceiver = basisVariant(axis, mode, seat.x, seat.y, seat.z, roomDims);
        ratioForMode[v][key] = safeDiv(newSource * newReceiver);
      });

      // E — shifted origin x + half room (both source & receiver x shifted)
      {
        const shiftedSourceX = sub.x + roomDims.widthM / 2;
        const shiftedReceiverX = seat.x + roomDims.widthM / 2;
        const newSource = modeShapeValueLocal(mode, shiftedSourceX, sub.y, sub.z, roomDims);
        const newReceiver = modeShapeValueLocal(mode, shiftedReceiverX, seat.y, seat.z, roomDims);
        ratioForMode.E[key] = safeDiv(newSource * newReceiver);
      }
      // F — shifted origin y + half room
      {
        const shiftedSourceY = sub.y + roomDims.lengthM / 2;
        const shiftedReceiverY = seat.y + roomDims.lengthM / 2;
        const newSource = modeShapeValueLocal(mode, sub.x, shiftedSourceY, sub.z, roomDims);
        const newReceiver = modeShapeValueLocal(mode, seat.x, shiftedReceiverY, seat.z, roomDims);
        ratioForMode.F[key] = safeDiv(newSource * newReceiver);
      }
      // G — source clamped to wall boundary plane (nearest wall, y=0 front wall)
      {
        const newSource = modeShapeValueLocal(mode, sub.x, 0, sub.z, roomDims);
        ratioForMode.G[key] = safeDiv(newSource * prodReceiver);
      }
      // H — receiver evaluated at seat back offset +0.55m
      {
        const shiftedReceiverY = Math.min(roomDims.lengthM - 1e-6, seat.y + SEAT_BACK_OFFSET_M);
        const newReceiver = modeShapeValueLocal(mode, seat.x, shiftedReceiverY, seat.z, roomDims);
        ratioForMode.H[key] = safeDiv(prodSource * newReceiver);
      }
    });

    const variantSeries = {};
    variantKeys.forEach((variant) => {
      variantSeries[variant] = contributorSeries.map((row) => {
        const vecRow = vecDebug.find((v) => v.frequencyHz === row.frequencyHz);
        let sumRe = 0, sumIm = 0;
        (row.contributors || []).forEach((c) => {
          const key = `${c.nx},${c.ny},${c.nz}`;
          const ratio = ratioForMode[variant][key] ?? 1;
          sumRe += c.activeReal * ratio;
          sumIm += c.activeImag * ratio;
        });
        const finalRe = (vecRow?.directRe ?? 0) + (vecRow?.reflectionRe ?? 0) + sumRe;
        const finalIm = (vecRow?.directIm ?? 0) + (vecRow?.reflectionIm ?? 0) + sumIm;
        return { frequency: row.frequencyHz, spl: toDb(Math.sqrt(finalRe * finalRe + finalIm * finalIm)) };
      }).sort((a, b) => a.frequency - b.frequency);
    });

    const variantReport = variantKeys.map((variant) => {
      const series = variantSeries[variant];
      const splAt = (targetHz) => {
        const p = series.reduce((best, pt) => Math.abs(pt.frequency - targetHz) < Math.abs(best.frequency - targetHz) ? pt : best, series[0]);
        return p ? p.spl : null;
      };
      const nullPt = findFirstDestructiveNull(series);
      const nullDepth = nullPt ? (Math.max(...series.filter(p => Math.abs(p.frequency - nullPt.frequency) <= 8).map(p => p.spl)) - nullPt.spl) : null;
      return { variant, spl30_8: splAt(30.8), spl45_6: splAt(45.6), nullFreq: nullPt?.frequency ?? null, nullDepth };
    });

    const productionRow = variantReport.find((r) => r.variant === "A");
    variantReport.forEach((r) => {
      const freqDeltaToRew = Number.isFinite(r.nullFreq) ? Math.abs(r.nullFreq - REW_OBSERVED_NULL_HZ) : Infinity;
      const prodFreqDeltaToRew = Number.isFinite(productionRow?.nullFreq) ? Math.abs(productionRow.nullFreq - REW_OBSERVED_NULL_HZ) : Infinity;
      const deeperThanProd = Number.isFinite(r.nullDepth) && Number.isFinite(productionRow?.nullDepth) ? r.nullDepth >= productionRow.nullDepth : false;
      r.closerToRew = (freqDeltaToRew < prodFreqDeltaToRew - 0.5) || (freqDeltaToRew <= prodFreqDeltaToRew && deeperThanProd) ? "YES" : "NO";
    });

    const bestNonProdVariant = variantReport
      .filter((r) => r.variant !== "A" && r.closerToRew === "YES")
      .sort((a, b) => Math.abs(a.nullFreq - REW_OBSERVED_NULL_HZ) - Math.abs(b.nullFreq - REW_OBSERVED_NULL_HZ))[0];

    let verdict;
    if (!bestNonProdVariant) {
      verdict = "4. EIGENFUNCTION BASIS RETIRED";
    } else if (bestNonProdVariant.variant === "G") {
      verdict = "2. SOURCE BOUNDARY PLANE ERROR CONFIRMED";
    } else if (bestNonProdVariant.variant === "H") {
      verdict = "3. RECEIVER POSITIONAL BASIS ERROR CONFIRMED";
    } else {
      verdict = "1. EIGENFUNCTION BASIS ERROR CONFIRMED";
    }

    return { modeTable, variantReport, verdict, bestNonProdVariant };
  }, [appState?.roomDims, appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 10, background: "#fff7ed", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 13, marginBottom: 6 }}>
        Case 055 — Modal Eigenfunction Spatial Basis Audit (read-only)
      </div>
      <div style={{ color: "#9a3412", marginBottom: 10 }}>
        Live room/seat/sub · production Q/phase/summation untouched · modes below 120 Hz only.
      </div>

      <div style={{ marginBottom: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#ffedd5" }}>
              {["Mode", "f0", "Type", "B44 src", "Textbook src", "Δ src", "B44 rcv", "Textbook rcv", "Δ rcv", "B44 comb", "Textbook comb", "Δ comb", "Sign match", "Mag match"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "2px 4px", borderBottom: "1px solid #fdba74" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.modeTable.map((m, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 4px" }}>({m.nx},{m.ny},{m.nz})</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.freq, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{m.type}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.b44Source)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.textbookSource)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.deltaSource)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.b44Receiver)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.textbookReceiver)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.deltaReceiver)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.combinedB44)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.combinedTextbook)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.deltaCombined)}</td>
                <td style={{ padding: "2px 4px", color: m.signMatch === "YES" ? "#166534" : "#b91c1c" }}>{m.signMatch}</td>
                <td style={{ padding: "2px 4px", color: m.magnitudeMatch === "YES" ? "#166534" : "#b91c1c" }}>{m.magnitudeMatch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>BASIS ALTERNATIVES A–H</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr style={{ background: "#ffedd5" }}>
                {["Variant", "1st null Hz (20–80)", "Null depth", "SPL@30.8Hz", "SPL@45.6Hz", "Closer to REW"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #fdba74" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.variantReport.map((r) => (
                <tr key={r.variant}>
                  <td style={{ padding: "2px 5px", fontWeight: 700 }}>{r.variant}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.nullFreq, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.nullDepth, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.spl30_8, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.spl45_6, 1)}</td>
                  <td style={{ padding: "2px 5px", fontWeight: 700, color: r.closerToRew === "YES" ? "#166534" : "#b91c1c" }}>{r.closerToRew}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: "#9a3412", marginTop: 4 }}>
          A = production cos/cos/cos. B/C/D = sin substituted on x/y/z axis respectively. E/F = origin shifted +half-room on x/y. G = source clamped to y=0 wall plane. H = receiver shifted +{SEAT_BACK_OFFSET_M}m in y. "Closer to REW" compares each variant's first destructive null (20–80 Hz) to the REW-observed reference ({REW_OBSERVED_NULL_HZ} Hz) against production.
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#7c2d12", color: "#fff7ed", border: "1px solid #9a3412" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does the remaining REW mismatch come from B44's modal source/receiver spatial basis?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: B44's current cos/cos/cos basis should match the textbook rigid-wall eigenfunction exactly (Δ=0, sign/magnitude match YES for every mode); if the basis itself were wrong, an alternate basis or coordinate treatment (B–H) should move the null closer to the REW-observed reference than production.<br/>
          ACTUAL: {result.modeTable.every(m => m.signMatch === "YES" && m.magnitudeMatch === "YES") ? "every tested mode's B44 coupling matched the textbook cos/cos/cos formula exactly (Δ=0)." : "one or more modes showed a coupling mismatch against the textbook formula — see table."} {result.bestNonProdVariant ? `Variant ${result.bestNonProdVariant.variant} moved the null to ${fmt(result.bestNonProdVariant.nullFreq, 1)} Hz (depth ${fmt(result.bestNonProdVariant.nullDepth, 1)} dB), closer to REW than production's ${fmt(result.variantReport.find(r=>r.variant==='A')?.nullFreq, 1)} Hz.` : "No alternate basis variant (B–H) moved the null closer to the REW-observed reference than production."}<br/>
          DELTA: {result.bestNonProdVariant ? `${fmt(Math.abs(result.bestNonProdVariant.nullFreq - REW_OBSERVED_NULL_HZ), 1)} Hz residual vs REW reference under variant ${result.bestNonProdVariant.variant}.` : "0 — no basis variant reduced the residual."}<br/>
          SEVERITY: {result.verdict.startsWith("4") ? "INFORMATIONAL — spatial basis is not the dominant cause" : "HIGH — spatial-basis defect located"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}