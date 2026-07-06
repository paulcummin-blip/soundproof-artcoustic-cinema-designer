import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";

// Case 062 — Modal Normalisation Source Audit (read-only, diagnostic only).
// No production/solver/Q/smoothing/reflection changes, no post-hoc fix applied to production.
// Single live engine call; all variants are recombined post-hoc from the existing modal
// Re/Im vectors and per-mode contributor debug data. REW reference = Case 058 digitised trace.
// Baseline from Case 061: direct+reflections RMS 6.96 dB, full production RMS 16.87 dB,
// modal ×0.10 RMS 6.64 dB.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const ROOM_VOLUME_M3 = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const ABSORPTION_ALL = 0.30;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const STAGE_TARGET_HZ = [30, 38, 58, 75, 100, 152];
const TOP_CONTRIBUTORS_PER_FREQ = 12;

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: ABSORPTION_ALL, back: ABSORPTION_ALL, left: ABSORPTION_ALL, right: ABSORPTION_ALL, ceiling: ABSORPTION_ALL, floor: ABSORPTION_ALL },
  freqMinHz: 20,
  freqMaxHz: 200,
  smoothing: "none",
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
  debugReflectionOrder: 1,
};

function fmt(v, d = 3) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function db(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

function interpolateRewDb(hz) {
  const anchors = REW_TRACE_ANCHORS_HZ_DB;
  if (hz <= anchors[0][0]) return anchors[0][1];
  if (hz >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [f0, v0] = anchors[i], [f1, v1] = anchors[i + 1];
    if (hz >= f0 && hz <= f1) return v0 + (v1 - v0) * ((hz - f0) / (f1 - f0));
  }
  return anchors[anchors.length - 1][1];
}

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: ROOM.widthM / 2, y: ROOM.lengthM * 0.6, z: 1.2 };
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35, modelKey: appState?.frontSubsCfg?.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, sub };
}

function nearestSeries(rows, targetHz, key = "frequencyHz") {
  return rows.reduce((best, r) => (Math.abs(r[key] - targetHz) < Math.abs(best[key] - targetHz) ? r : best), rows[0]);
}

function findFirstPeakAndNull(series) {
  let peak = null, dip = null;
  for (let i = 1; i < series.length - 1; i++) {
    if (!peak && series[i].db > series[i - 1].db && series[i].db >= series[i + 1].db) peak = series[i];
    if (!dip && series[i].db < series[i - 1].db && series[i].db <= series[i + 1].db) dip = series[i];
    if (peak && dip) break;
  }
  return { peak, dip };
}

function statsFor(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { min: null, max: null, avg: null };
  const min = Math.min(...finite), max = Math.max(...finite), avg = finite.reduce((s, v) => s + v, 0) / finite.length;
  return { min, max, avg };
}

export default function Case062ModalNormalisationSourceAudit() {
  const appState = useAppState();

  const analysis = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const vectorRows = engineResult.perFrequencyVectorDebug || [];
    const contributorSeries = engineResult.activeModalContributorDebugSeries || [];

    // ── Stage-by-stage breakdown for top 12 modal contributors at each target frequency ──
    const stageBlocks = STAGE_TARGET_HZ.map((targetHz) => {
      const entry = contributorSeries.length > 0 ? nearestSeries(contributorSeries, targetHz) : null;
      const contributors = (entry?.contributors || []).slice(0, TOP_CONTRIBUTORS_PER_FREQ);
      const rows = contributors.map((c) => {
        const transferMag = c.activeTransferMagnitudeAtNull || 0;
        const denom = c.combinedCoupling * transferMag;
        const sourceExcitationAmplitude = Math.abs(denom) > 1e-9 ? c.rawModalMagnitude / denom : null;
        const activeAxes = (c.nx > 0 ? 1 : 0) + (c.ny > 0 ? 1 : 0) + (c.nz > 0 ? 1 : 0);
        return {
          modeIndex: `(${c.nx},${c.ny},${c.nz})`,
          modeFrequencyHz: c.modeFrequencyHz,
          modeType: c.modeType,
          sourceCoupling: c.sourceCoupling,
          receiverCoupling: c.receiverCoupling,
          combinedCoupling: c.combinedCoupling,
          sourceExcitationAmplitude,
          roomVolumeTerm: 1, // 'existing' mode applies no 1/V or 1/sqrt(V) term — confirmed in source
          eigenfunctionNormTerm: 1, // modeShapeValueLocal is raw cos product, no normalisation divisor — confirmed in source
          qValue: c.qValue,
          transferMagnitude: transferMag,
          rawModalPressure: c.rawModalMagnitude,
          modalGainMultiplier: 1, // highOrderAxialScale/familyScale all default 1.0 in this call — no override passed
          finalRe: c.activeReal,
          finalIm: c.activeImag,
          finalMagnitude: c.activeMagnitude,
          finalDb: db(c.activeMagnitude),
          activeAxes,
        };
      });
      return { targetHz, actualHz: entry?.frequencyHz ?? null, rows };
    });

    const allRows = stageBlocks.flatMap((b) => b.rows);
    const stageStats = {
      sourceCoupling: statsFor(allRows.map((r) => r.sourceCoupling)),
      receiverCoupling: statsFor(allRows.map((r) => r.receiverCoupling)),
      combinedCoupling: statsFor(allRows.map((r) => r.combinedCoupling)),
      sourceExcitationAmplitude: statsFor(allRows.map((r) => r.sourceExcitationAmplitude)),
      qValue: statsFor(allRows.map((r) => r.qValue)),
      transferMagnitude: statsFor(allRows.map((r) => r.transferMagnitude)),
      rawModalPressure: statsFor(allRows.map((r) => r.rawModalPressure)),
      finalMagnitude: statsFor(allRows.map((r) => r.finalMagnitude)),
      finalDb: statsFor(allRows.map((r) => r.finalDb)),
    };
    const excitationSpread = stageStats.sourceExcitationAmplitude.max - stageStats.sourceExcitationAmplitude.min;
    const excitationConstant = Number.isFinite(excitationSpread) && excitationSpread < 1e-6;
    const transferScalesWithModeOrder = allRows.some((r) => r.activeAxes >= 2) &&
      statsFor(allRows.filter((r) => r.activeAxes === 1).map((r) => r.qValue)).avg !==
      statsFor(allRows.filter((r) => r.activeAxes >= 2).map((r) => r.qValue)).avg;

    // Weighted-average active-axis count (for approximate eigenfunction-energy normalisation variants).
    const weightedAxisSum = allRows.reduce((s, r) => s + r.activeAxes * r.finalMagnitude, 0);
    const weightSum = allRows.reduce((s, r) => s + r.finalMagnitude, 0);
    const avgActiveAxes = weightSum > 0 ? weightedAxisSum / weightSum : 1.5;
    const avgSourceExcitationAmplitude = stageStats.sourceExcitationAmplitude.avg || Math.pow(10, CURVE_DB / 20);

    // ── Read-only diagnostic variants — modal term scaled post-hoc, direct+reflection unchanged ──
    const variantScales = {
      A: { label: "A — production modal path", scale: 1, note: "no change" },
      B: { label: "B — remove room-volume normalisation", scale: 1, note: "production 'existing' mode already applies no 1/V or 1/√V term — identical to A" },
      C: { label: "C — apply 1 / room volume", scale: 1 / ROOM_VOLUME_M3, note: `1/V, V=${fmt(ROOM_VOLUME_M3, 2)} m³` },
      D: { label: "D — apply 1 / √room volume", scale: 1 / Math.sqrt(ROOM_VOLUME_M3), note: `1/√V, V=${fmt(ROOM_VOLUME_M3, 2)} m³` },
      E: { label: "E — apply eigenfunction RMS normalisation", scale: Math.pow(0.5, avgActiveAxes), note: `approx (1/2)^p̄, p̄=${fmt(avgActiveAxes, 2)} magnitude-weighted avg active axes across sampled contributors` },
      F: { label: "F — apply per-mode energy normalisation", scale: Math.pow(0.5, avgActiveAxes) / Math.sqrt(ROOM_VOLUME_M3), note: "approx (1/2)^p̄ / √V combined" },
      G: { label: "G — remove source excitation constant", scale: avgSourceExcitationAmplitude > 0 ? 1 / avgSourceExcitationAmplitude : 1, note: `divides by measured avg source excitation amplitude (${fmt(avgSourceExcitationAmplitude, 1)})` },
      H: { label: "H — replace source excitation with unit pressure", scale: Math.pow(10, -CURVE_DB / 20), note: `sets curveDb-derived amplitude to 1.0 (10^(-${CURVE_DB}/20))` },
      I: { label: "I — modal path ×0.10 reference control", scale: 0.10, note: "reference control from Case 061" },
    };

    const variantResults = Object.entries(variantScales).map(([key, v]) => {
      const fullSeries = vectorRows.map((row) => {
        const re = row.directRe + row.reflectionRe + (row.modalSumRe * v.scale);
        const im = row.directIm + row.reflectionIm + (row.modalSumIm * v.scale);
        return { frequencyHz: row.frequencyHz, db: db(mag(re, im)) };
      });
      const modalOnlySeries = vectorRows.map((row) => ({
        frequencyHz: row.frequencyHz,
        db: db(mag(row.modalSumRe * v.scale, row.modalSumIm * v.scale)),
      }));

      const scoreAgainstRew = (series) => {
        let sumSq = 0, maxErr = 0, n = 0;
        series.forEach((p) => {
          const err = p.db - interpolateRewDb(p.frequencyHz);
          sumSq += err * err; maxErr = Math.max(maxErr, Math.abs(err)); n++;
        });
        return { rms: Math.sqrt(sumSq / n), max: maxErr };
      };
      const fullScore = scoreAgainstRew(fullSeries);
      const modalScore = scoreAgainstRew(modalOnlySeries);
      const { peak, dip } = findFirstPeakAndNull(fullSeries);
      const splAt = (hz) => nearestSeries(fullSeries, hz).db;

      return {
        key, label: v.label, note: v.note, scale: v.scale,
        modalOnlyRms: modalScore.rms, fullRms: fullScore.rms, fullMax: fullScore.max,
        spl30: splAt(30), spl58: splAt(58), spl100: splAt(100), spl152: splAt(152),
        peak, dip,
      };
    });

    const productionRms = variantResults.find((v) => v.key === "A").fullRms;
    variantResults.forEach((v) => { v.closerToRew = v.key === "A" ? "—" : (v.fullRms < productionRms ? "YES" : "NO"); });

    const best = variantResults.filter((v) => v.key !== "A" && v.key !== "I").sort((a, b) => a.fullRms - b.fullRms)[0];
    let verdict;
    if (best.fullRms >= productionRms * 0.95) {
      verdict = "5. MODAL NORMALISATION SOURCE NOT FOUND";
    } else if (best.key === "D" || best.key === "C") {
      verdict = "2. ROOM VOLUME NORMALISATION MISSING";
    } else if (best.key === "E" || best.key === "F") {
      verdict = "3. EIGENFUNCTION NORMALISATION MISSING";
    } else if (best.key === "G" || best.key === "H") {
      verdict = "1. SOURCE EXCITATION TOO HIGH";
    } else {
      verdict = "4. MODAL DENOMINATOR / TRANSFER TOO HIGH";
    }

    return { stageBlocks, stageStats, excitationConstant, transferScalesWithModeOrder, avgActiveAxes, avgSourceExcitationAmplitude, variantResults, best, verdict, productionRms };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #7f1d1d", borderRadius: 10, background: "#fef2f2", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#7f1d1d", fontSize: 13, marginBottom: 6 }}>
        Case 062 — Modal Normalisation Source Audit (read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#fecaca", border: "1px solid #b91c1c", color: "#7f1d1d", marginBottom: 10 }}>
        No production changes, no post-hoc fix, no arbitrary scaling as a solution, no Q/smoothing/reflection changes. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(ROOM_VOLUME_M3, 2)} m³), sub front-right, live seat, 0.30 absorption, no smoothing, production settings. Baseline (Case 061): direct+reflections RMS 6.96 dB, full production RMS 16.87 dB, modal ×0.10 RMS 6.64 dB.
      </div>

      {analysis.stageBlocks.map((block) => (
        <div key={block.targetHz} style={{ marginBottom: 10, overflowX: "auto" }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Top {TOP_CONTRIBUTORS_PER_FREQ} modal contributors @ {block.targetHz} Hz (actual bin {fmt(block.actualHz, 1)} Hz)</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
            <thead>
              <tr style={{ background: "#fecaca" }}>
                {["Mode", "f0 Hz", "Type", "SrcCoup", "RxCoup", "Combined", "SrcExcit", "VolTerm", "EigenNorm", "Q", "TransferMag", "RawModal", "GainMult", "Re", "Im", "Mag", "dB"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "2px 3px", borderBottom: "1px solid #b91c1c" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: "1px 3px" }}>{r.modeIndex}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.modeFrequencyHz, 1)}</td>
                  <td style={{ padding: "1px 3px" }}>{r.modeType}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.sourceCoupling, 3)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.receiverCoupling, 3)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.combinedCoupling, 3)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.sourceExcitationAmplitude, 1)}</td>
                  <td style={{ padding: "1px 3px" }}>{r.roomVolumeTerm}</td>
                  <td style={{ padding: "1px 3px" }}>{r.eigenfunctionNormTerm}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.qValue, 2)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.transferMagnitude, 2)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.rawModalPressure, 3)}</td>
                  <td style={{ padding: "1px 3px" }}>{r.modalGainMultiplier}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.finalRe, 3)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.finalIm, 3)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.finalMagnitude, 3)}</td>
                  <td style={{ padding: "1px 3px" }}>{fmt(r.finalDb, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ marginBottom: 10, padding: 8, background: "#fee2e2", borderRadius: 6, border: "1px solid #b91c1c", fontSize: 9 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STAGE STATISTICS (across all sampled contributors):</div>
        Source excitation amplitude: min {fmt(analysis.stageStats.sourceExcitationAmplitude.min, 1)}, max {fmt(analysis.stageStats.sourceExcitationAmplitude.max, 1)}, avg {fmt(analysis.stageStats.sourceExcitationAmplitude.avg, 1)} — constant across modes: {analysis.excitationConstant ? "YES (same for every mode at a given frequency, as expected — it depends only on curveDb/gain, not mode index)" : "NO"}.<br/>
        Room volume term: constant 1 for every mode — confirmed NOT scaled by room volume (modalSourceReferenceMode='existing' applies no 1/V or 1/√V divisor in source).<br/>
        Eigenfunction normalisation term: constant 1 for every mode — confirmed modeShapeValueLocal returns raw, unnormalised cosine products (no 1/√V or per-mode energy divisor in source).<br/>
        Q/transfer magnitude: min {fmt(analysis.stageStats.transferMagnitude.min, 2)}, max {fmt(analysis.stageStats.transferMagnitude.max, 2)}, avg {fmt(analysis.stageStats.transferMagnitude.avg, 2)} — scales with mode order/topology: {analysis.transferScalesWithModeOrder ? "YES" : "NO"}. At resonance the transfer magnitude approaches the mode's Q value (up to ~40+), the largest multiplier in the whole modal chain and the strongest candidate for the ~10× excess.<br/>
        Final modal dB: min {fmt(analysis.stageStats.finalDb.min, 1)}, max {fmt(analysis.stageStats.finalDb.max, 1)}, avg {fmt(analysis.stageStats.finalDb.avg, 1)}.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#fecaca" }}>
              {["Variant", "Modal-only RMS", "Full RMS", "Max err", "30Hz", "58Hz", "100Hz", "152Hz", "1st peak Hz/dB", "1st null Hz/dB", "Closer to REW?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #b91c1c" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.variantResults.map((v) => (
              <tr key={v.key} style={{ background: v.key === analysis.best.key ? "#fca5a5" : "transparent" }}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }} title={v.note}>{v.label}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.modalOnlyRms, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.fullRms, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.fullMax, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.spl30, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.spl58, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.spl100, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.spl152, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{v.peak ? `${fmt(v.peak.frequencyHz, 1)} / ${fmt(v.peak.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px" }}>{v.dip ? `${fmt(v.dip.frequencyHz, 1)} / ${fmt(v.dip.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{v.closerToRew}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 7.5, color: "#7f1d1d", marginTop: 4 }}>
          Variants E/F use an approximate representative scale (magnitude-weighted average across sampled contributors) rather than a true per-mode normalisation applied across the full curve — noted as an approximation given the available per-frequency debug data.
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#7f1d1d", color: "#fef2f2", border: "1px solid #b91c1c" }}>
        <div style={{ fontWeight: 700 }}>TEST: Where does the excessive modal amplitude first enter the B44 bass engine?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED = digitised REW curve (Case 058 reference).<br/>
          ACTUAL = B44 production full-curve response with modal term scaled per variant, same room/seat/sub/absorption/smoothing.<br/>
          DELTA: production (A) full RMS {fmt(analysis.productionRms, 2)} dB vs best non-reference variant ({analysis.best.label}) full RMS {fmt(analysis.best.fullRms, 2)} dB.<br/>
          SEVERITY: {analysis.best.fullRms < analysis.productionRms * 0.6 ? "HIGH — a normalisation-based variant materially improves parity" : analysis.best.fullRms < analysis.productionRms * 0.9 ? "MODERATE" : "LOW"}<br/>
          NEXT FIX CANDIDATE: {analysis.verdict}
        </div>
      </div>
    </div>
  );
}