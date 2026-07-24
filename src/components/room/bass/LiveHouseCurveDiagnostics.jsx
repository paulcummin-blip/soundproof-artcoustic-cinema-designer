// LiveHouseCurveDiagnostics.jsx — Read-only diagnostic that inspects the currently
// loaded project and currently selected candidate. Copies a structured report to
// clipboard. Does NOT change selection, ranking, filters, or production behaviour.
// All data comes from the real optimisation run — no synthetic curves, no
// substituted data, no assumed subwoofer model, no historic expected values.

import React, { useState } from "react";
import { peakingEqResponseDb, evaluateProvisionalBankLimits, DESIGN_EQ_FIT_PROFILES } from "@/components/utils/designEqCalibration";
import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { getSourceDomainBoostAllowance, getSystemSourceCapability, getCurrentSystemSourceOutput } from "@/components/utils/subwooferCapability";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import {
  PROBE_FREQS,
  buildCandidateSignature,
  signatureToString,
  runConsistencyTest,
  buildVisibleConditionReport,
  interpolateCurve,
} from "@/components/room/bass/candidateConsistency";

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
    const target = interpolateCurve(c.productionHouseCurveTarget || [], freq);
    const rawBefore = interpolateCurve(rawCurve, freq);
    const rawAfter = interpolateCurve(postEqCurve, freq);
    const rawResidual = (Number.isFinite(rawAfter) && Number.isFinite(target)) ? rawAfter - target : null;
    const smoothedBefore = interpolateCurve(smoothedRaw, freq);
    const smoothedAfter = interpolateCurve(smoothedPostEq, freq);
    const smoothedResidual = (Number.isFinite(smoothedAfter) && Number.isFinite(target)) ? smoothedAfter - target : null;
    const combinedEq = interpolateCurve(combinedEqCurve, freq);
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
  const bankValidation = { allOk: bankLimits.allOk, boostLimitOk: bankLimits.boostLimitOk, cutLimitOk: bankLimits.cutLimitOk, sourceDomainHeadroomOk: bankLimits.sourceDomainHeadroomOk };

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

  // --- Candidate signature ---
  const signature = buildCandidateSignature({ result, rspRawCurve });
  const signatureStr = signatureToString(signature);

  // --- A/B/C/D consistency test ---
  const consistency = runConsistencyTest({ result, rspRawCurve });

  // --- Visible condition report ---
  const visibleCondition = buildVisibleConditionReport({ result, rspRawCurve });

  // --- Assemble report ---
  const lines = [];
  lines.push("========== LIVE HOUSE-CURVE DIAGNOSTIC REPORT ==========");
  lines.push("");
  lines.push("========== CANDIDATE SIGNATURE ==========");
  lines.push(`  ${signatureStr}`);
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
  lines.push(`  Selected optimiser start: ${c.designEqFitProfile === "house_curve" ? (c.houseCurveBaselineWorstSeatDeviation != null ? "multi-start (empty + standard-seeded)" : "—") : "—"}`);
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

  const rejectedCandidates = Array.isArray(c.rejectedEqCandidates) ? c.rejectedEqCandidates : [];
  const toleranceAccepted = Array.isArray(c.seatToleranceAdjustedCandidates) ? c.seatToleranceAdjustedCandidates : [];
  lines.push("========== 6. EQ CANDIDATE ACCEPTANCE DECISIONS ==========");
  lines.push(`  Rejected candidates: ${rejectedCandidates.length}`);
  rejectedCandidates.forEach((candidate) => {
    lines.push(`  REJECTED | ${fmt(candidate.filterFrequencyHz, 2, " Hz")} | ${fmt(candidate.gainDb, 2, " dB")} | Q ${fmt(candidate.Q, 2)}`);
    lines.push(`    RSP improvement: ${fmt(candidate.rspImprovementDb, 2, " dB")}`);
    lines.push(`    Worst seat change: ${fmt(candidate.seatImpact?.worstSeatChangeDb, 2, " dB")} (${candidate.seatImpact?.worstSeatId || "—"}); allowed regression ${fmt(candidate.seatImpact?.allowedRegressionDb, 2, " dB")}`);
    lines.push(`    Capability penalty: ${fmt(candidate.capabilityPenaltyDb, 2, " dB")}`);
    lines.push(`    Decision: ${candidate.rejectionReason || "rejected before acoustic metrics were available"}`);
  });
  lines.push(`  Accepted after controlled seat tolerance: ${toleranceAccepted.length}`);
  toleranceAccepted.forEach((candidate) => {
    lines.push(`  ACCEPTED AFTER TOLERANCE ADJUSTMENT | ${fmt(candidate.filterFrequencyHz, 2, " Hz")} | ${fmt(candidate.gainDb, 2, " dB")} | Q ${fmt(candidate.Q, 2)}`);
    lines.push(`    RSP improvement: ${fmt(candidate.rspImprovementDb, 2, " dB")}`);
    lines.push(`    Worst seat change: ${fmt(candidate.seatImpact?.worstSeatChangeDb, 2, " dB")} (${candidate.seatImpact?.worstSeatId || "—"}); allowed regression ${fmt(candidate.seatImpact?.allowedRegressionDb, 2, " dB")}`);
    lines.push(`    Capability penalty: ${fmt(candidate.capabilityPenaltyDb, 2, " dB")}`);
  });
  lines.push("");

  lines.push("========== LIVE CANDIDATE CONSISTENCY TEST (A/B/C/D) ==========");
  lines.push(`  A = direct sum of peakingEqResponseDb() for enabled filters`);
  lines.push(`  B = interpolated selectedCandidate.combinedEqCurve`);
  lines.push(`  C = selectedCandidate.finalPostEqCurve − rspRawCurve`);
  lines.push(`  D = result.finalPostEqCurve − rspRawCurve`);
  lines.push(`  Tolerance: ±0.05 dB`);
  lines.push("");
  consistency.rows.forEach((r) => {
    if (r.missing) {
      lines.push(`  ${r.freq.toFixed(2)} Hz: A=${fmt(r.A, 3)} B=${fmt(r.B, 3)} C=${fmt(r.C, 3)} D=${fmt(r.D, 3)} — MISSING DATA`);
    } else {
      lines.push(`  ${r.freq.toFixed(2)} Hz: A=${fmt(r.A, 3, " dB")} B=${fmt(r.B, 3, " dB")} C=${fmt(r.C, 3, " dB")} D=${fmt(r.D, 3, " dB")} | spread=${fmt(r.spread, 3, " dB")} — ${r.pass ? "PASS" : "FAIL"}`);
    }
  });
  lines.push("");
  if (consistency.allPass) {
    lines.push("  LIVE CANDIDATE CONSISTENCY: PASS");
  } else {
    lines.push("  LIVE CANDIDATE CONSISTENCY: FAIL — representations diverge");
    const fails = consistency.rows.filter((r) => !r.pass);
    fails.forEach((r) => {
      const vals = { A: r.A, B: r.B, C: r.C, D: r.D };
      const finite = Object.entries(vals).filter(([, v]) => Number.isFinite(v));
      const min = Math.min(...finite.map(([, v]) => v));
      const max = Math.max(...finite.map(([, v]) => v));
      const diverging = finite.filter(([, v]) => Math.abs(v - (min + max) / 2) > 0.025).map(([k]) => k);
      lines.push(`    ${r.freq.toFixed(2)} Hz: diverging representation(s): ${diverging.join(", ")} | A=${fmt(r.A, 3)} B=${fmt(r.B, 3)} C=${fmt(r.C, 3)} D=${fmt(r.D, 3)}`);
      lines.push(`      Candidate signature: ${signatureStr}`);
    });
  }
  lines.push("");

  lines.push("========== VISIBLE CONDITION REPORT (observation only — not fixed) ==========");
  lines.push("  TEST | EXPECTED | ACTUAL | DELTA | SEVERITY | NEXT TEST");
  visibleCondition.forEach((row) => {
    lines.push(`  ${row.test} | ${row.expected} | ${row.actual} | ${row.delta} | ${row.severity.toUpperCase()} | ${row.nextTest}`);
  });
  lines.push("");

  lines.push("========== END OF REPORT ==========");

  return { report: lines.join("\n"), consistency, signature, signatureStr, visibleCondition };
}

export default function LiveHouseCurveDiagnostics({ result, activeSubs, usableLfHz, perSeatRawCurves, rspRawCurve }) {
  const [status, setStatus] = useState(null); // null | "copied" | "error" | "fail"
  const [consistency, setConsistency] = useState(null);
  const [signatureStr, setSignatureStr] = useState(null);

  const handleCopy = async () => {
    try {
      const out = buildReport({ result, activeSubs, usableLfHz, perSeatRawCurves, rspRawCurve });
      if (!out) { setStatus("error"); return; }
      await navigator.clipboard.writeText(out.report);
      setConsistency(out.consistency);
      setSignatureStr(out.signatureStr);
      setStatus(out.consistency.allPass ? "copied" : "fail");
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
        {status === "copied" && <span className="font-mono text-[10px] text-emerald-700">Copied — LIVE CANDIDATE CONSISTENCY: PASS</span>}
        {status === "fail" && <span className="font-mono text-[10px] text-rose-700">Copied — LIVE CANDIDATE CONSISTENCY: FAIL</span>}
        {status === "error" && <span className="font-mono text-[10px] text-rose-700">Error — could not copy</span>}
      </div>
      {status === "fail" && consistency && (
        <div className="mt-1 font-mono text-[10px] text-rose-700">
          {consistency.rows.filter((r) => !r.pass).map((r) => {
            const vals = { A: r.A, B: r.B, C: r.C, D: r.D };
            const finite = Object.entries(vals).filter(([, v]) => Number.isFinite(v));
            const min = Math.min(...finite.map(([, v]) => v));
            const max = Math.max(...finite.map(([, v]) => v));
            const diverging = finite.filter(([, v]) => Math.abs(v - (min + max) / 2) > 0.025).map(([k]) => k);
            return `${r.freq.toFixed(2)} Hz: ${diverging.join(", ")} diverge (A=${fmt(r.A, 3)} B=${fmt(r.B, 3)} C=${fmt(r.C, 3)} D=${fmt(r.D, 3)})`;
          }).join(" | ")}
          {signatureStr && <div className="mt-1 text-amber-800">Signature: {signatureStr}</div>}
        </div>
      )}
    </div>
  );
}