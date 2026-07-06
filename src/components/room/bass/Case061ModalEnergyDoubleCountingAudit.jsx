import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";

// Case 061 — Modal Energy Double-Counting Audit (read-only, diagnostic only).
// No production/solver/Q/phase/smoothing/reflection changes, no arbitrary modal scaling
// beyond the explicitly-requested ×0.10 test variants. Single live engine call; all
// variants are recombined post-hoc from the same per-frequency Re/Im vectors.
// REW reference = Case 058 digitised trace.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const ABSORPTION_ALL = 0.30;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const TEST_FREQUENCIES_HZ = [30, 38, 58, 75, 88, 100, 116, 152];
const SPL_TABLE_HZ = [30, 38, 58, 75, 100, 152];

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

// include: { direct, reflection, modal } booleans; modalScale multiplies modal term when included.
const VARIANTS = [
  { key: "A", label: "A — direct only", direct: true, reflection: false, modal: false, modalScale: 1 },
  { key: "B", label: "B — reflections only", direct: false, reflection: true, modal: false, modalScale: 1 },
  { key: "C", label: "C — direct + reflections", direct: true, reflection: true, modal: false, modalScale: 1 },
  { key: "D", label: "D — modal only", direct: false, reflection: false, modal: true, modalScale: 1 },
  { key: "E", label: "E — modal + direct", direct: true, reflection: false, modal: true, modalScale: 1 },
  { key: "F", label: "F — modal + reflections", direct: false, reflection: true, modal: true, modalScale: 1 },
  { key: "G", label: "G — full production", direct: true, reflection: true, modal: true, modalScale: 1 },
  { key: "H", label: "H — direct + reflections + modal ×0.10", direct: true, reflection: true, modal: true, modalScale: 0.10 },
  { key: "I", label: "I — direct + modal ×0.10 only", direct: true, reflection: false, modal: true, modalScale: 0.10 },
  { key: "J", label: "J — reflections + modal ×0.10 only", direct: false, reflection: true, modal: true, modalScale: 0.10 },
];

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }
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

function nearestRow(rows, targetHz) {
  return rows.reduce((best, r) => (Math.abs(r.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? r : best), rows[0]);
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

function buildVariantSeries(vectorRows, variant) {
  return vectorRows.map((v) => {
    let re = 0, im = 0;
    if (variant.direct) { re += v.directRe; im += v.directIm; }
    if (variant.reflection) { re += v.reflectionRe; im += v.reflectionIm; }
    if (variant.modal) { re += v.modalSumRe * variant.modalScale; im += v.modalSumIm * variant.modalScale; }
    return { frequencyHz: v.frequencyHz, db: db(mag(re, im)) };
  });
}

function scoreVariant(series) {
  let sumSq = 0, maxErr = 0, n = 0;
  let sumRew = 0, sumB44 = 0, sumRewSq = 0, sumB44Sq = 0, sumRewB44 = 0;
  series.forEach((p) => {
    const rewDb = interpolateRewDb(p.frequencyHz);
    const err = p.db - rewDb;
    sumSq += err * err;
    maxErr = Math.max(maxErr, Math.abs(err));
    n++;
    sumRew += rewDb; sumB44 += p.db;
    sumRewSq += rewDb * rewDb; sumB44Sq += p.db * p.db;
    sumRewB44 += rewDb * p.db;
  });
  const rmsError = Math.sqrt(sumSq / n);
  const covariance = (sumRewB44 / n) - (sumRew / n) * (sumB44 / n);
  const rewStd = Math.sqrt((sumRewSq / n) - (sumRew / n) ** 2);
  const b44Std = Math.sqrt((sumB44Sq / n) - (sumB44 / n) ** 2);
  const correlation = (rewStd > 1e-9 && b44Std > 1e-9) ? covariance / (rewStd * b44Std) : null;
  const { peak, dip } = findFirstPeakAndNull(series);
  const splAt = {};
  SPL_TABLE_HZ.forEach((hz) => { splAt[hz] = nearestRow(series, hz).db; });
  return { rmsError, maxErr, correlation, peak, dip, splAt };
}

export default function Case061ModalEnergyDoubleCountingAudit() {
  const appState = useAppState();

  const analysis = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const vectorRows = engineResult.perFrequencyVectorDebug || [];

    const variantResults = VARIANTS.map((variant) => {
      const series = buildVariantSeries(vectorRows, variant);
      const score = scoreVariant(series);
      return { ...variant, ...score };
    });

    const byKey = Object.fromEntries(variantResults.map((v) => [v.key, v]));
    const directReflectionTracksBetter = byKey.C.rmsError < byKey.G.rmsError;
    const fullModalWorsens = byKey.G.rmsError > byKey.C.rmsError;
    const tenPctModalImproves = byKey.H.rmsError < byKey.C.rmsError && byKey.H.rmsError < byKey.G.rmsError;
    const modalOnlyExcessive = SPL_TABLE_HZ.some((hz) => byKey.D.splAt[hz] - interpolateRewDb(hz) > 10);
    const doubleCountingSignal = directReflectionTracksBetter && fullModalWorsens && tenPctModalImproves;

    let verdict;
    if (doubleCountingSignal && modalOnlyExcessive) {
      verdict = "1. MODAL ENERGY DOUBLE-COUNTING CONFIRMED";
    } else if (modalOnlyExcessive && !directReflectionTracksBetter) {
      verdict = "2. MODAL ABSOLUTE SCALE TOO HIGH";
    } else if (directReflectionTracksBetter && !modalOnlyExcessive) {
      verdict = "3. DIRECT/REFLECTION FIELD ALREADY CONTAINS ROOM BUILDUP";
    } else {
      verdict = "4. NO DOUBLE-COUNTING — MODAL SCALING ONLY";
    }

    return { variantResults, byKey, directReflectionTracksBetter, fullModalWorsens, tenPctModalImproves, modalOnlyExcessive, verdict };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #164e63", borderRadius: 10, background: "#ecfeff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#164e63", fontSize: 13, marginBottom: 6 }}>
        Case 061 — Modal Energy Double-Counting Audit (read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#cffafe", border: "1px solid #0e7490", color: "#164e63", marginBottom: 10 }}>
        No production/solver/Q/phase/smoothing/reflection changes, no arbitrary modal scaling beyond the requested ×0.10 variants. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m, sub front-right, live seat, 0.30 absorption all surfaces, no smoothing, production settings. Single live engine call — all variants recombined post-hoc. REW reference = Case 058 digitised trace.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#cffafe" }}>
              {["Variant", "RMS err", "Max err", "Corr", "30Hz", "38Hz", "58Hz", "75Hz", "100Hz", "152Hz", "1st peak Hz/dB", "1st null Hz/dB"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #0e7490" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.variantResults.map((v) => (
              <tr key={v.key}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{v.label}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.rmsError, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.maxErr, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.correlation, 3)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.splAt[30], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.splAt[38], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.splAt[58], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.splAt[75], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.splAt[100], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.splAt[152], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{v.peak ? `${fmt(v.peak.frequencyHz, 1)} / ${fmt(v.peak.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px" }}>{v.dip ? `${fmt(v.dip.frequencyHz, 1)} / ${fmt(v.dip.db, 1)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 10, fontSize: 9 }}>
        Direct+reflection (C) RMS {fmt(analysis.byKey.C.rmsError, 2)} dB vs full production (G) RMS {fmt(analysis.byKey.G.rmsError, 2)} dB — direct+reflection tracks REW shape better: {analysis.directReflectionTracksBetter ? "YES" : "NO"}.<br/>
        Adding full modal worsens RMS: {analysis.fullModalWorsens ? "YES" : "NO"}.<br/>
        Modal ×0.10 (H) RMS {fmt(analysis.byKey.H.rmsError, 2)} dB improves over both C and G: {analysis.tenPctModalImproves ? "YES" : "NO"}.<br/>
        Modal-only (D) exceeds REW by &gt;10 dB at one or more test points: {analysis.modalOnlyExcessive ? "YES" : "NO"}.
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#164e63", color: "#ecfeff", border: "1px solid #0e7490" }}>
        <div style={{ fontWeight: 700 }}>TEST: Is B44 adding modal pressure on top of direct/reflection energy that already contains the same standing-wave contribution?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED = digitised REW curve (Case 058 reference).<br/>
          ACTUAL = each variant's full-curve response, same room/seat/sub/absorption/smoothing.<br/>
          DELTA: full production (G) RMS {fmt(analysis.byKey.G.rmsError, 2)} dB vs direct+reflection (C) RMS {fmt(analysis.byKey.C.rmsError, 2)} dB vs modal ×0.10 (H) RMS {fmt(analysis.byKey.H.rmsError, 2)} dB.<br/>
          SEVERITY: {analysis.modalOnlyExcessive && analysis.fullModalWorsens ? "HIGH" : analysis.fullModalWorsens ? "MODERATE" : "LOW"}<br/>
          NEXT FIX CANDIDATE: {analysis.verdict}
        </div>
      </div>
    </div>
  );
}