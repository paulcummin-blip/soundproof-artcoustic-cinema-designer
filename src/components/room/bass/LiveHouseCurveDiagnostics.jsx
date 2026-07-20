// LiveHouseCurveDiagnostics.jsx — Read-only diagnostic that inspects the currently
// loaded project and currently selected candidate. Copies a structured report to
// clipboard. Does NOT change selection, ranking, filters, or production behaviour.
// All data comes from the real optimisation run — no synthetic curves, no
// substituted data, no assumed subwoofer model.

import React, { useState } from "react";
import { peakingEqResponseDb, evaluateProvisionalBankLimits, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getSourceDomainBoostAllowance, getSystemSourceCapability, getCurrentSystemSourceOutput } from "@/components/utils/subwooferCapability";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";

const PROBE_FREQS = [29.75, 39.14, 77.16, 101.52];
const EXPECTED_EQ = { 29.75: -5.3, 39.14: 0.8, 77.16: -1.5, 101.52: -2.1 };
const EQ_TOLERANCE_DB = 1.0;

function interpolate(curve, frequency) {
  if (!Array.isArray(curve) || curve.length === 0 || !Number.isFinite(frequency)) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (frequency >= curve[i].frequency && frequency <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const ratio = (frequency - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
    }
  }
  return null;
}

function fmt(v, digits = 2, unit = "") {
  return Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : "—";
}

function buildReport({ result, activeSubs, usableLfHz, perSeatRawCurves, rspRawCurve }) {
  const c = result?.selectedCandidate;
  if (!c) return null;

  const anchorDb = result?.selectedP14TargetDb ?? c.requestedTargetSpl ?? null;
  const filters = Array.isArray(c.generatedFilterBank) ? c.generatedFilterBank.filter((f) => f?.enabled) : [];
  const rawCurve = Array.isArray(rspRawCurve) && rspRawCurve.length > 0 ? rspRawCurve : (Array.isArray(c.finalPostEqCurve) ? c.finalPostEqCurve : []);
  const postEqCurve = Array.isArray(c.finalPostEqCurve) ? c.finalPostEqCurve : [];
  const combinedEqCurve = Array.isArray(c.combinedEqCurve) ? c.combinedEqCurve : [];
  const assessmentStartHz = c.assessmentStartHz ?? null;
  const assessmentEndHz = c.assessmentEndHz ?? null;
  const profile = c.designEqFitProfile === "house_curve" ? DESIGN_EQ_FIT_PROFILES.accuracy : (DESIGN_EQ_FIT_PROFILES[c.designEqFitProfile] || DESIGN_EQ_FIT_PROFILES.standard);

  const smoothedRaw = applyBassSmoothing(rawCurve, "third");
  const smoothedPostEq = applyBassSmoothing(postEqCurve, "third");

  // Subwoofer product info
  const subProducts = (activeSubs || []).map((s) => {
    const key = normaliseModelKey(s?.modelKey ?? s?.model ?? "");
    const model = MODELS.find((m) => m.key === key);
    return { modelKey: key, display: model?.display || key, count: 1 };
  });
  const subProductSummary = subProducts.length > 0
    ? subProducts.map((s) => `${s.display} ×${s.count}`).join(", ")
    : "—";
  const subCount = (activeSubs || []).length;

  // Real seat info
  const realSeats = (Array.isArray(perSeatRawCurves) ? perSeatRawCurves : [])
    .filter((s) => s?.seatId && s.seatId !== "rsp" && !s.__isSyntheticRsp && Array.isArray(s?.responseData) && s.responseData.length > 0);
  const seatIds = realSeats.map((s) => s.seatId);
  const seatCount = realSeats.length;

  // Probe frequency data
  const probeData = PROBE_FREQS.map((freq) => {
    const target = Number.isFinite(anchorDb) ? anchorDb + artcousticHouseCurveOffsetAt(freq) : null;
    const rawBefore = interpolate(rawCurve, freq);
    const rawAfter = interpolate(postEqCurve, freq);
    const rawResidual = (Number.isFinite(rawAfter) && Number.isFinite(target)) ? rawAfter - target : null;
    const smoothedBefore = interpolate(smoothedRaw, freq);
    const smoothedAfter = interpolate(smoothedPostEq, freq);
    const smoothedResidual = (Number.isFinite(smoothedAfter) && Number.isFinite(target)) ? smoothedAfter - target : null;
    const combinedEq = interpolate(combinedEqCurve, freq);
    // Direct computation: sum of individual filter responses
    const individualContribs = filters.map((f) => ({ band: f.band, freq: f.frequencyHz, gain: f.gainDb, Q: f.Q, contrib: peakingEqResponseDb(freq, f) }));
    const totalEqDirect = individualContribs.reduce((sum, ic) => sum + ic.contrib, 0);
    return { freq, target, rawBefore, rawAfter, rawResidual, smoothedBefore, smoothedAfter, smoothedResidual, combinedEq, totalEqDirect, individualContribs };
  });

  // Source-domain allowance at 39.14 Hz
  const probe39 = 39.14;
  const systemCapability = getSystemSourceCapability(activeSubs, probe39);
  const currentSystemOutput = Number.isFinite(anchorDb) ? anchorDb : getCurrentSystemSourceOutput(activeSubs);
  const availableHeadroom = (Number.isFinite(systemCapability) && Number.isFinite(currentSystemOutput)) ? systemCapability - currentSystemOutput : null;
  const boostAllowance = getSourceDomainBoostAllowance({ frequency: probe39, requestedBoostDb: 6, activeSubs, usableLfHz, maxBoostDb: 6, requestedSystemOutputDb: currentSystemOutput });
  const permittedBoost = boostAllowance?.allowedBoostDb ?? null;
  const lfRampFraction = boostAllowance?.lfRampFraction ?? null;
  const lfRampLimit = boostAllowance?.lfRampLimitDb ?? null;

  const contribs39 = filters.map((f) => peakingEqResponseDb(probe39, f));
  const positiveContrib = contribs39.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const negativeContrib = contribs39.filter((v) => v < 0).reduce((s, v) => s + v, 0);
  const netEq = contribs39.reduce((s, v) => s + v, 0);
  const remainingBoost = (Number.isFinite(permittedBoost) && Number.isFinite(positiveContrib)) ? permittedBoost - positiveContrib : null;

  // Bank limits
  const bankLimits = c.houseCurveBankLimits || c.aggregateBankLimits || {};
  const bankValidation = c.designEqFitProfile === "house_curve"
    ? { allOk: bankLimits.allOk, boostLimitOk: bankLimits.boostLimitOk, cutLimitOk: bankLimits.cutLimitOk, sourceDomainHeadroomOk: bankLimits.sourceDomainHeadroomOk }
    : { allOk: bankLimits.allOk, boostLimitOk: bankLimits.boostLimitOk, cutLimitOk: bankLimits.cutLimitOk, sourceDomainHeadroomOk: bankLimits.sourceDomainHeadroomOk };

  // Determine exact binding limit
  let bindingLimit = "none";
  if (bankValidation.allOk === false) {
    if (bankValidation.boostLimitOk === false) bindingLimit = "aggregate boost exceeded +6.05 dB";
    else if (bankValidation.cutLimitOk === false) bindingLimit = `aggregate cut exceeded ${profile.maximumCutDb + 0.05} dB floor`;
    else if (bankValidation.sourceDomainHeadroomOk === false) bindingLimit = "source-domain headroom exceeded";
    else bindingLimit = "bank validation failed (unknown)";
  } else if (c.houseCurveLimitingReason) {
    bindingLimit = c.houseCurveLimitingReason;
  }

  // Iteration trace
  const trace = Array.isArray(c.designEqIterationTrace) ? c.designEqIterationTrace : [];

  // --- Verification ---
  const verification = PROBE_FREQS.map((freq) => {
    const actual = probeData.find((p) => p.freq === freq)?.totalEqDirect ?? null;
    const expected = EXPECTED_EQ[freq];
    const delta = Number.isFinite(actual) ? actual - expected : null;
    const match = Number.isFinite(delta) && Math.abs(delta) <= EQ_TOLERANCE_DB;
    return { freq, expected, actual, delta, match };
  });
  const allMatch = verification.every((v) => v.match);

  // --- Assemble report ---
  const lines = [];
  lines.push("========== LIVE HOUSE-CURVE DIAGNOSTIC REPORT ==========");
  lines.push("");
  lines.push("========== 1. ACTUAL PROJECT INPUTS ==========");
  lines.push(`  Selected subwoofer product(s): ${subProductSummary}`);
  lines.push(`  Subwoofer quantity: ${subCount}`);
  lines.push(`  Actual requested output: ${fmt(currentSystemOutput, 1, " dB")}`);
  lines.push(`  Usable LF frequency: ${fmt(usableLfHz, 0, " Hz")}`);
  lines.push(`  Target anchor: ${fmt(anchorDb, 1, " dB")}`);
  lines.push(`  Actual P19 assessment band: ${fmt(assessmentStartHz, 0, " Hz")} – ${fmt(assessmentEndHz, 0, " Hz")}`);
  lines.push(`  Real-seat count: ${seatCount}`);
  lines.push(`  Real-seat IDs: ${seatIds.length > 0 ? seatIds.join(", ") : "none"}`);
  lines.push(`  Selected optimiser start: ${c.designEqFitProfile === "house_curve" ? (result?.selectedCandidate?.houseCurveBaselineWorstSeatDeviation != null ? "multi-start (empty + standard-seeded)" : "—") : "—"}`);
  lines.push(`  Selected optimiser profile: ${c.designEqFitProfile || "—"}`);
  lines.push(`  Selected optimiser priority: ${result?.selectedMode || "—"}`);
  lines.push("");

  lines.push("========== 2. COMPLETE SELECTED EQ BANK ==========");
  lines.push("  Band | Frequency (Hz) | Gain (dB) | Q | Enabled | Creation reason");
  filters.forEach((f) => {
    lines.push(`  ${f.band ?? "—"} | ${fmt(f.frequencyHz, 2, " Hz")} | ${fmt(f.gainDb, 2, " dB")} | ${fmt(f.Q, 2)} | ${f.enabled ? "Yes" : "No"} | ${f.reason || "—"}`);
  });
  lines.push("");

  lines.push("========== 3. PROBE FREQUENCY DATA (29.75, 39.14, 77.16, 101.52 Hz) ==========");
  probeData.forEach((p) => {
    lines.push(`  --- ${p.freq.toFixed(2)} Hz ---`);
    lines.push(`    Raw before-EQ SPL: ${fmt(p.rawBefore, 2, " dB")}`);
    lines.push(`    Raw after-EQ SPL: ${fmt(p.rawAfter, 2, " dB")}`);
    lines.push(`    House-curve target: ${fmt(p.target, 2, " dB")}`);
    lines.push(`    Raw residual (after - target): ${fmt(p.rawResidual, 2, " dB")}`);
    lines.push(`    ⅓-octave smoothed before-EQ SPL: ${fmt(p.smoothedBefore, 2, " dB")}`);
    lines.push(`    ⅓-octave smoothed after-EQ SPL: ${fmt(p.smoothedAfter, 2, " dB")}`);
    lines.push(`    Smoothed target residual (after - target): ${fmt(p.smoothedResidual, 2, " dB")}`);
    lines.push(`    Total EQ contribution (combinedEqCurve): ${fmt(p.combinedEq, 2, " dB")}`);
    lines.push(`    Total EQ contribution (direct sum): ${fmt(p.totalEqDirect, 2, " dB")}`);
    lines.push(`    Individual contributions from enabled filters:`);
    p.individualContribs.forEach((ic) => {
      if (Math.abs(ic.contrib) >= 0.001) {
        lines.push(`      Band ${ic.band} @ ${fmt(ic.freq, 2, " Hz")} gain ${fmt(ic.gain, 2, " dB")} Q ${fmt(ic.Q, 2)}: ${fmt(ic.contrib, 3, " dB")}`);
      }
    });
    lines.push("");
  });

  lines.push("========== 4. ACTUAL SOURCE-DOMAIN ALLOWANCE AT 39.14 Hz ==========");
  lines.push(`  Product capability: ${fmt(systemCapability, 2, " dB")}`);
  lines.push(`  Requested output: ${fmt(currentSystemOutput, 2, " dB")}`);
  lines.push(`  Available headroom: ${fmt(availableHeadroom, 2, " dB")}`);
  lines.push(`  LF ramp fraction: ${fmt(lfRampFraction, 3)}`);
  lines.push(`  LF ramp limit: ${fmt(lfRampLimit, 2, " dB")}`);
  lines.push(`  Permitted total boost: ${fmt(permittedBoost, 2, " dB")}`);
  lines.push(`  Current positive-filter contribution: ${fmt(positiveContrib, 2, " dB")}`);
  lines.push(`  Current negative-filter contribution: ${fmt(negativeContrib, 2, " dB")}`);
  lines.push(`  Net EQ contribution: ${fmt(netEq, 2, " dB")}`);
  lines.push(`  Remaining boost allowance: ${fmt(remainingBoost, 2, " dB")}`);
  lines.push(`  Exact binding limit: ${bindingLimit}`);
  lines.push("");

  lines.push("========== 5. ACTUAL OPTIMISER TRACE FOR THE SELECTED RUN ==========");
  lines.push(`  Total iterations: ${trace.length}`);
  lines.push(`  Stop reason: ${c.designEqStopReason || c.houseCurveStopReason || "—"}`);
  lines.push("");
  trace.forEach((iter) => {
    lines.push(`  --- Iteration ${iter.iteration} ---`);
    lines.push(`    Discovered residual regions (${iter.regions.length}):`);
    iter.regions.forEach((r) => {
      lines.push(`      ${r.kind.toUpperCase()} ${fmt(r.startHz, 1, " Hz")}–${fmt(r.endHz, 1, " Hz")}, centre ${fmt(r.centreFrequencyHz, 2, " Hz")}, severity ${fmt(r.severityDb, 2, " dB")}, seat ${r.seatId}`);
    });
    // Filter trials near 25-45, 70-85, 95-110 Hz
    const nearTrials = (iter.trials || []).filter((t) => {
      const f = t.frequencyHz;
      return Number.isFinite(f) && ((f >= 25 && f <= 45) || (f >= 70 && f <= 85) || (f >= 95 && f <= 110));
    });
    if (nearTrials.length > 0) {
      lines.push(`    Trials considered near 25–45 / 70–85 / 95–110 Hz (${nearTrials.length}):`);
      nearTrials.forEach((t) => {
        const bv = t.bankValidation;
        lines.push(`      ${t.action} @ ${fmt(t.frequencyHz, 2, " Hz")}, gain ${fmt(t.gainDb, 2, " dB")}, Q ${fmt(t.Q, 2)}${t.scaled ? " (scaled)" : ""}`);
        lines.push(`        Bank validation: ${bv.allOk ? "PASS" : "FAIL"} (boost ${fmt(bv.maxAggregateBoostDb, 2, " dB")} @ ${fmt(bv.maxAggregateBoostHz, 1, " Hz")}, cut ${fmt(bv.maxAggregateCutDb, 2, " dB")} @ ${fmt(bv.maxAggregateCutHz, 1, " Hz")})`);
        lines.push(`        Before: worst ${fmt(t.metricsBefore?.worstSeatMaxDeviationDb, 2, " dB")}, mean ${fmt(t.metricsBefore?.meanSeatMaxDeviationDb, 2, " dB")}, RMS ${fmt(t.metricsBefore?.rmsSeatTargetErrorDb, 2, " dB")}`);
        lines.push(`        After: worst ${fmt(t.metricsAfter?.worstSeatMaxDeviationDb, 2, " dB")}, mean ${fmt(t.metricsAfter?.meanSeatMaxDeviationDb, 2, " dB")}, RMS ${fmt(t.metricsAfter?.rmsSeatTargetErrorDb, 2, " dB")}`);
        lines.push(`        ${t.accepted ? "ACCEPTED" : "REJECTED"}${t.rejectionReason ? ` — ${t.rejectionReason}` : ""}`);
      });
    } else {
      lines.push(`    No trials considered near 25–45 / 70–85 / 95–110 Hz in this iteration.`);
    }
    if (iter.bestTrialIndex !== null) {
      const bt = iter.trials[iter.bestTrialIndex];
      if (bt) {
        lines.push(`    Best trial: ${bt.action} @ ${fmt(bt.frequencyHz, 2, " Hz")}, gain ${fmt(bt.gainDb, 2, " dB")}, Q ${fmt(bt.Q, 2)}`);
      }
    }
    lines.push("");
  });

  lines.push("========== VERIFICATION: EQ VALUES VS LIVE GRAPH ==========");
  verification.forEach((v) => {
    lines.push(`  ${v.freq.toFixed(2)} Hz: expected ${fmt(v.expected, 1, " dB")}, actual ${fmt(v.actual, 2, " dB")}, delta ${fmt(v.delta, 2, " dB")} — ${v.match ? "MATCH" : "MISMATCH"}`);
  });
  lines.push(`  Overall: ${allMatch ? "ALL MATCH — diagnostic is inspecting the correct candidate" : "MISMATCH — diagnostic may be inspecting a different candidate or response"}`);
  lines.push("");
  lines.push("========== END OF REPORT ==========");

  return { report: lines.join("\n"), allMatch, verification };
}

export default function LiveHouseCurveDiagnostics({ result, activeSubs, usableLfHz, perSeatRawCurves, rspRawCurve }) {
  const [status, setStatus] = useState(null); // null | "copied" | "error" | "mismatch"
  const [verification, setVerification] = useState(null);

  const handleCopy = async () => {
    try {
      const { report, allMatch, verification: ver } = buildReport({ result, activeSubs, usableLfHz, perSeatRawCurves, rspRawCurve });
      if (!report) { setStatus("error"); return; }
      await navigator.clipboard.writeText(report);
      setVerification(ver);
      setStatus(allMatch ? "copied" : "mismatch");
    } catch (err) {
      setStatus("error");
    }
  };

  if (!result?.selectedCandidate) return null;

  return (
    <div className="mt-2 rounded border border-amber-400 bg-amber-50 p-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="rounded border border-amber-600 bg-amber-100 px-3 py-1 font-mono text-[10px] font-semibold text-amber-900 hover:bg-amber-200"
        >
          Copy live house-curve diagnostics
        </button>
        {status === "copied" && <span className="font-mono text-[10px] text-emerald-700">Copied — all EQ values match graph</span>}
        {status === "mismatch" && <span className="font-mono text-[10px] text-rose-700">Copied — WARNING: EQ values do not match graph</span>}
        {status === "error" && <span className="font-mono text-[10px] text-rose-700">Error — could not copy</span>}
      </div>
      {status === "mismatch" && verification && (
        <div className="mt-1 font-mono text-[10px] text-rose-700">
          {verification.filter((v) => !v.match).map((v) => `${v.freq.toFixed(2)} Hz: expected ${v.expected.toFixed(1)} dB, got ${v.actual?.toFixed(2) ?? "—"} dB`).join(" | ")}
          <div className="mt-1 text-amber-800">Diagnostic may be inspecting a different candidate or response. Do not interpret results until they match.</div>
        </div>
      )}
    </div>
  );
}