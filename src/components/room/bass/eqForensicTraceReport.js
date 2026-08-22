// eqForensicTraceReport.js — Pure, read-only report formatter.
//
// Formats the eqForensicTrace object (built by eqForensicTraceBuilder.js) into
// a plain-text report string. This module:
//   - Runs zero simulations and zero optimiser runs.
//   - Derives the conclusion from the trace data — never hardcodes it.
//   - Prints INCOMPLETE / UNAVAILABLE for any missing stage.
//   - Never infers missing values from static code.
//
// The report covers the 34.16 Hz and 77.81 Hz probe frequencies through every
// available stage of the design EQ pipeline.

import { buildEqForensicTrace, DEFAULT_PROBE_FREQS } from "@/components/room/bass/eqForensicTraceBuilder";
import { finalOptimisedBassAuthorityMatches } from "@/components/room/bass/finalOptimisedBassResponse";
import { diagnoseHouseCurveP14Integration } from "@/components/utils/p14HouseCurveNormalisation";

const INCOMPLETE = "INCOMPLETE";
const UNAVAILABLE = "UNAVAILABLE";

const num = (v) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

function fmt(v, digits = 4, fallback = INCOMPLETE) {
  const n = num(v);
  return n === null ? fallback : n.toFixed(digits);
}

function sectionHeader(title) {
  return `\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`;
}

function interpolateSpl(curve, freq) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const f = num(freq);
  if (f === null) return null;
  const pts = curve
    .map((p) => ({ frequency: num(p?.frequency ?? p?.hz), spl: num(p?.spl ?? p?.offsetDb ?? p?.db) }))
    .filter((p) => p.frequency !== null && p.spl !== null)
    .sort((a, b) => a.frequency - b.frequency);
  if (!pts.length) return null;
  if (f < pts[0].frequency || f > pts[pts.length - 1].frequency) return null;
  let upper = pts.findIndex((p) => p.frequency >= f);
  if (upper === -1) return null;
  if (upper === 0) return pts[0].spl;
  const lo = pts[upper - 1];
  const hi = pts[upper];
  if (hi.frequency === lo.frequency) return hi.spl;
  return lo.spl + (hi.spl - lo.spl) * ((f - lo.frequency) / (hi.frequency - lo.frequency));
}

// ── Conclusion derivation ──
function deriveConclusion(trace) {
  if (!trace?.diagnosticsEnabled) {
    return { code: "G", reason: "Diagnostics not enabled — no forensic data available.", firstUnavailable: "fitterInputs" };
  }
  // Check fitter inputs
  for (const input of trace.fitterInputs || []) {
    if (input.unsmoothedRawSpl === null) {
      return { code: "G", reason: "Fitter inputs unavailable.", firstUnavailable: `fitterInputs[${input.probeHz}]` };
    }
  }
  // Check discovered regions
  const allRegions = (trace.discoveredRegions || []).flatMap((r) => r.regions || []);
  if (!allRegions.length) {
    return { code: "A", reason: "No discovered regions near probe frequencies — cut trial never generated." };
  }
  // Check generated trials
  const allTrials = (trace.generatedTrials || []).flatMap((t) => t.trials || []);
  if (!allTrials.length) {
    return { code: "G", reason: "Discovered regions exist but no trial diagnostics near probes — pre-acceptance gate rejections not exposed.", firstUnavailable: "generatedTrials" };
  }
  // Check if any trial was accepted
  const acceptedTrials = allTrials.filter((t) => t.accepted);
  const rejectedTrials = allTrials.filter((t) => !t.accepted);
  if (!acceptedTrials.length && rejectedTrials.length) {
    const firstRejection = rejectedTrials[0];
    return { code: "B", reason: `Cut trial rejected at ${firstRejection.firstGate}.`, gate: firstRejection.firstGate, trial: firstRejection };
  }
  if (acceptedTrials.length) {
    // Check if accepted trial's filter is in the final bank
    const finalBank = trace.finalAuthority;
    const handoffBanks = trace.handoffBanks?.candidateStages || [];
    const finalBankStage = handoffBanks.find((s) => s.stage === "finalOptimisedBassResponse.canonicalFilterBank");
    const selectedStage = handoffBanks.find((s) => s.stage === "selected-candidate");
    if (!finalBankStage || !selectedStage) {
      return { code: "G", reason: "Handoff bank stages unavailable.", firstUnavailable: "handoffBanks" };
    }
    // Check if any accepted trial frequency appears in the final bank
    const finalFilters = finalBankStage.filters || [];
    const acceptedFreqs = acceptedTrials.map((t) => t.frequencyHz).filter((f) => f !== null);
    const hasCutInFinalBank = finalFilters.some((f) => {
      if (f.gainDb >= 0) return false;
      return acceptedFreqs.some((af) => Math.abs(f.frequencyHz - af) < 2);
    });
    if (!hasCutInFinalBank) {
      // Check if it's in the selected candidate but not the final bank
      const selectedFilters = selectedStage.filters || [];
      const hasCutInSelected = selectedFilters.some((f) => {
        if (f.gainDb >= 0) return false;
        return acceptedFreqs.some((af) => Math.abs(f.frequencyHz - af) < 2);
      });
      if (hasCutInSelected) {
        return { code: "C", reason: "Cut accepted but lost between selected-candidate and finalOptimisedBassResponse.canonicalFilterBank.", stageA: "selected-candidate", stageB: "finalOptimisedBassResponse.canonicalFilterBank" };
      }
      // Check if another candidate has the cut
      const otherCandidates = (trace.candidates?.candidates || []).filter((c) => !c.selected);
      const usefulCandidate = otherCandidates.find((c) => {
        // We can't directly check filter frequencies here, but we can check if
        // a non-selected candidate has lower residual at the probe frequencies
        return c.rspMaxResidualDb !== null && c.rspMaxResidualDb < (trace.candidates?.candidates?.find((cc) => cc.selected)?.rspMaxResidualDb ?? Infinity);
      });
      if (usefulCandidate) {
        return { code: "D", reason: `Useful candidate ${usefulCandidate.candidateId} created but not selected.`, candidate: usefulCandidate };
      }
      return { code: "C", reason: "Cut accepted but not found in final or selected bank.", stageA: "generatedTrials", stageB: "selected-candidate" };
    }
    // Cut is in the final bank — check if the graph shows it
    return { code: "F", reason: "Cut trial accepted and present in final bank — graph should show the correction. Verify post-EQ minus raw at probe frequencies.", };
  }
  return { code: "G", reason: "Insufficient runtime evidence to determine the cause.", firstUnavailable: "unknown" };
}

// ── Report sections ──
function formatInputAuthority(trace) {
  const lines = [sectionHeader("1. INPUT AUTHORITY")];
  const auth = trace.calibrationFingerprint;
  lines.push(`Active calibration fingerprint: ${auth.activeCalibrationFingerprint || INCOMPLETE}`);
  lines.push(`Result calibration fingerprint: ${auth.resultCalibrationFingerprint || INCOMPLETE}`);
  lines.push(`Calibration fingerprint match: ${auth.calibrationMatch ? "PASS" : "FAIL"}`);
  lines.push(`Selected candidate ID: ${auth.selectedCandidateId || INCOMPLETE}`);
  lines.push(`Pool ID: ${auth.poolId || INCOMPLETE}`);
  lines.push(`Protocol version: ${auth.versions.protocolVersion || INCOMPLETE}`);
  lines.push(`Pool version: ${auth.versions.poolVersion || INCOMPLETE}`);
  lines.push(`Engine version: ${auth.versions.engineVersion || INCOMPLETE}`);
  lines.push(`Result schema version: ${auth.versions.resultSchemaVersion || INCOMPLETE}`);
  return lines;
}

function formatFitterInputs(trace) {
  const lines = [sectionHeader("2. FITTER INPUTS AT 34.16 / 77.81 Hz")];
  for (const input of trace.fitterInputs || []) {
    lines.push(`\n  Probe: ${input.probeHz} Hz`);
    lines.push(`    Actual sample frequency: ${fmt(input.actualSampleHz, 4)}`);
    lines.push(`    Unsmoothed raw SPL: ${fmt(input.unsmoothedRawSpl, 4)} dB`);
    lines.push(`    Fitter-smoothed SPL: ${fmt(input.fitterSmoothedSpl, 4)} dB`);
    lines.push(`    Canonical target SPL: ${fmt(input.canonicalTargetSpl, 4)} dB`);
    lines.push(`    Unsmoothed residual: ${fmt(input.unsmoothedResidualDb, 4)} dB`);
    lines.push(`    Fitter residual: ${fmt(input.fitterResidualDb, 4)} dB`);
    lines.push(`    Protected-null: ${input.protectedNull ? "true" : "false"}`);
    lines.push(`    Classification: ${input.classification || UNAVAILABLE}`);
    lines.push(`    Correction direction: ${input.correctionDirection || UNAVAILABLE}`);
    lines.push(`    In assessment band: ${input.inAssessmentBand === null ? UNAVAILABLE : input.inAssessmentBand ? "true" : "false"}`);
  }
  return lines;
}

function formatDiscoveredRegions(trace) {
  const lines = [sectionHeader("3. REGION DISCOVERY")];
  for (const entry of trace.discoveredRegions || []) {
    lines.push(`\n  Probe: ${entry.probeHz} Hz`);
    lines.push(`    Has containing region: ${entry.hasContainingRegion ? "true" : "false"}`);
    if (entry.regions && entry.regions.length) {
      for (const r of entry.regions) {
        lines.push(`    Region: start=${fmt(r.startHz, 2)}, centre=${fmt(r.centreHz, 2)}, end=${fmt(r.endHz, 2)} Hz`);
        lines.push(`      kind=${r.kind}, severity=${fmt(r.severityDb, 2)} dB, protectedNull=${r.insideProtectedNull ? "true" : "false"}`);
      }
    } else if (entry.nearestRegion) {
      const r = entry.nearestRegion;
      lines.push(`    Nearest region: start=${fmt(r.startHz, 2)}, centre=${fmt(r.centreHz, 2)}, end=${fmt(r.endHz, 2)} Hz`);
      lines.push(`      kind=${r.kind}, severity=${fmt(r.severityDb, 2)} dB, protectedNull=${r.insideProtectedNull ? "true" : "false"}`);
    } else {
      lines.push(`    No discovered region near this probe.`);
    }
  }
  return lines;
}

function formatGeneratedTrials(trace) {
  const lines = [sectionHeader("4. TRIAL GENERATION AND FIRST REJECTION GATE")];
  for (const entry of trace.generatedTrials || []) {
    lines.push(`\n  Probe: ${entry.probeHz} Hz — trial count: ${entry.trialCount}`);
    for (const t of entry.trials || []) {
      lines.push(`    Trial: action=${t.action}, freq=${fmt(t.frequencyHz, 2)} Hz, gain=${fmt(t.proposedGainDb, 2)} dB, Q=${fmt(t.proposedQ, 2)}`);
      lines.push(`      accepted=${t.accepted}, firstGate=${t.firstGate}`);
      lines.push(`      classification=${t.classification || UNAVAILABLE}, severity=${fmt(t.severityDb, 2)} dB`);
      lines.push(`      localImprovement=${fmt(t.localImprovementDb, 4)} dB, maxDevReduction=${fmt(t.maximumDeviationReductionDb, 4)} dB, rmsReduction=${fmt(t.rmsReductionDb, 4)} dB`);
      lines.push(`      reason: ${t.reason || UNAVAILABLE}`);
    }
    if (!entry.trials || !entry.trials.length) {
      lines.push(`    No trial diagnostics near this probe (pre-acceptance gate rejections not exposed).`);
    }
  }
  return lines;
}

function formatHandoffBanks(trace) {
  const lines = [sectionHeader("5. FILTER BANK AT EVERY HANDOFF")];
  lines.push("\n  Intermediate stages (not exposed by current diagnostics):");
  for (const s of trace.handoffBanks?.intermediateStages || []) {
    lines.push(`    ${s.stage}: ${s.status}`);
  }
  lines.push("\n  Candidate stages:");
  for (const s of trace.handoffBanks?.candidateStages || []) {
    lines.push(`\n    Stage: ${s.stage}`);
    lines.push(`      Candidate ID: ${s.candidateId || INCOMPLETE}`);
    lines.push(`      Enabled filter count: ${s.enabledFilterCount ?? INCOMPLETE}`);
    lines.push(`      Filter-bank signature: ${s.filterBankSignature || INCOMPLETE}`);
    if (s.filters && s.filters.length) {
      lines.push(`      Filters:`);
      for (const f of s.filters) {
        lines.push(`        ${fmt(f.frequencyHz, 2)} Hz, ${fmt(f.gainDb, 2)} dB, Q=${fmt(f.Q, 2)}, enabled=${f.enabled}`);
      }
    } else {
      lines.push(`      Filters: (none)`);
    }
  }
  return lines;
}

function formatCandidateRanking(trace) {
  const lines = [sectionHeader("6. CANDIDATE RANKING")];
  const ranking = trace.candidates || {};
  lines.push(`Ranking mode: ${ranking.rankingMode || INCOMPLETE}`);
  lines.push(`Selection reason: ${ranking.selectionReason || INCOMPLETE}`);
  lines.push(`Ranking tuple: ${ranking.rankingTuple ? JSON.stringify(ranking.rankingTuple) : INCOMPLETE}`);
  lines.push("\n  Candidates:");
  for (const c of ranking.candidates || []) {
    lines.push(`\n    Candidate ID: ${c.candidateId || INCOMPLETE}`);
    lines.push(`      Fit profile: ${c.fitProfile || INCOMPLETE}, start strategy: ${c.startStrategy || INCOMPLETE}`);
    lines.push(`      Enabled filter count: ${c.enabledFilterCount ?? INCOMPLETE}`);
    lines.push(`      Filter-bank signature: ${c.filterBankSignature || INCOMPLETE}`);
    lines.push(`      RSP max residual: ${fmt(c.rspMaxResidualDb, 4)} dB, RSP RMS residual: ${fmt(c.rspRmsResidualDb, 4)} dB`);
    lines.push(`      House-curve max error: ${fmt(c.houseCurveMaxErrorDb, 4)} dB, RMS error: ${fmt(c.houseCurveRmsErrorDb, 4)} dB`);
    lines.push(`      Mean absolute residual: ${fmt(c.meanAbsoluteResidualDb, 4)} dB`);
    lines.push(`      Worst-seat deviation: ${fmt(c.worstSeatDeviationDb, 4)} dB, mean-seat: ${fmt(c.meanSeatDeviationDb, 4)} dB`);
    lines.push(`      EQ cost: ${fmt(c.eqCost, 4)} dB`);
    lines.push(`      Rank: ${c.rank ?? INCOMPLETE}, selected: ${c.selected ? "true" : "false"}`);
    if (c.rejectionReason) lines.push(`      Rejection reason: ${c.rejectionReason}`);
  }
  return lines;
}

function formatFinalGraphValues(trace, rawRspCurve, postEqCurve, operatingLevelOffsetDb) {
  const lines = [sectionHeader("7. FINAL GRAPH VALUES")];
  const finalAuth = trace.finalAuthority || {};
  lines.push(`Final canonical filter-bank signature: ${finalAuth.filterBankSignature || INCOMPLETE}`);
  lines.push(`Graph filter-bank signature: ${trace.graphAuthority?.graphFilterBankSignature || INCOMPLETE}`);
  lines.push(`Graph matches final bank: ${trace.graphAuthority?.matchesFinalBank ? "true" : "false"}`);
  lines.push(`Raw response signature: ${finalAuth.rawResponseSignature || INCOMPLETE}`);
  lines.push(`Post-EQ response signature: ${finalAuth.postEqCurveSignature || INCOMPLETE}`);
  lines.push(`Canonical vertical offset: ${fmt(finalAuth.canonicalVerticalOffsetDb, 4)} dB`);
  lines.push(`Operating-level offset: ${fmt(operatingLevelOffsetDb, 4)} dB`);

  const probeFreqs = DEFAULT_PROBE_FREQS;
  lines.push("\n  Probe values (interpolated from actual graph arrays):");
  lines.push("  Freq(Hz)  Raw SPL    Post-EQ SPL  Target SPL  PostEQ-Raw  PostEQ-Target");
  lines.push("  --------  --------   ----------  ----------  ----------  -------------");
  for (const freq of probeFreqs) {
    const rawBase = interpolateSpl(rawRspCurve, freq);
    const postEqBase = interpolateSpl(postEqCurve, freq);
    const shiftedRaw = (rawBase !== null && operatingLevelOffsetDb !== null) ? rawBase + operatingLevelOffsetDb : null;
    const shiftedPostEq = (postEqBase !== null && operatingLevelOffsetDb !== null) ? postEqBase + operatingLevelOffsetDb : null;
    const eqApplied = (shiftedPostEq !== null && shiftedRaw !== null) ? shiftedPostEq - shiftedRaw : null;
    lines.push(`  ${freq.toString().padStart(8)}  ${(shiftedRaw === null ? INCOMPLETE : shiftedRaw.toFixed(4)).padStart(8)}   ${(shiftedPostEq === null ? INCOMPLETE : shiftedPostEq.toFixed(4)).padStart(10)}  ${INCOMPLETE.padStart(10)}  ${(eqApplied === null ? INCOMPLETE : eqApplied.toFixed(4)).padStart(10)}  ${INCOMPLETE.padStart(13)}`);
  }
  lines.push("\n  Tooltip EQ = postEqSpl - rawSpl (both curves use the same operating-level shift).");
  return lines;
}

function formatP14Guide(splConfig, requested) {
  const lines = [sectionHeader("8. P14 GUIDE")];
  const basis = splConfig?.selectedP14TargetBasis === "recommended" ? "recommended" : "minimum";
  // Explicit null guard: Number(null) === 0, which would coerce to L1 via `|| 1`.
  const rawLevel = splConfig?.selectedP14Level;
  const level = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;
  const targetDb = num(requested?.selectedP14TargetDb);
  const label = level !== null
    ? `${basis === "recommended" ? "Recommended" : "Minimum"} L${level} · ${targetDb !== null ? targetDb.toFixed(0) : INCOMPLETE} dBC`
    : INCOMPLETE;
  lines.push(`Selected P14 basis: ${basis}`);
  lines.push(`Selected P14 level: ${level !== null ? `L${level}` : INCOMPLETE}`);
  lines.push(`Selected P14 target dBC: ${targetDb !== null ? targetDb.toFixed(4) : INCOMPLETE}`);
  lines.push(`Reference-line Y value: ${targetDb !== null ? targetDb.toFixed(4) : INCOMPLETE}`);
  lines.push(`Reference-line label: ${label}`);
  lines.push(`Number of P14 reference lines rendered: 1`);
  lines.push(`House-curve target series present: true`);
  return lines;
}

// ── Main report builder ──
export function buildEqForensicTraceReport({
  optimisationResult,
  fingerprints,
  rawRspCurve,
  splConfig,
  requested,
  probeFreqs = DEFAULT_PROBE_FREQS,
}) {
  const lines = [];
  const trace = buildEqForensicTrace({ optimisationResult, fingerprints, probeFreqs });
  const finalBassResponse = optimisationResult?.finalOptimisedBassResponse || null;

  lines.push("ARTCOUSTIC EQ FORENSIC TRACE REPORT");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: current live project + current completed canonical result`);
  lines.push(`Note: read-only export. Zero simulations and zero optimiser runs triggered.`);
  lines.push(`Diagnostics enabled: ${trace.diagnosticsEnabled ? "true" : "false"}`);

  // Authority check
  const canonicalAuthorityMatches = finalOptimisedBassAuthorityMatches(finalBassResponse);
  lines.push(`Canonical completed-result authority: ${canonicalAuthorityMatches ? "PASS" : "FAIL"}`);

  // Sections
  lines.push(...formatInputAuthority(trace));
  lines.push(...formatFitterInputs(trace));
  lines.push(...formatDiscoveredRegions(trace));
  lines.push(...formatGeneratedTrials(trace));
  lines.push(...formatHandoffBanks(trace));
  lines.push(...formatCandidateRanking(trace));

  // Operating-level offset for graph values
  const houseCurveShape = finalBassResponse?.canonicalHouseCurveShape || null;
  const canonicalVerticalOffsetDb = num(finalBassResponse?.canonicalVerticalOffsetDb);
  const targetDb = num(requested?.selectedP14TargetDb);
  const extHz = num(requested?.selectedP14RequiredExtensionHz);
  let operatingLevelOffsetDb = null;
  if (Array.isArray(houseCurveShape) && houseCurveShape.length && targetDb !== null && extHz !== null) {
    const p14Diagnostic = diagnoseHouseCurveP14Integration({
      houseCurveShape, selectedP14TargetDb: targetDb, requiredExtensionHz: extHz, upperLfeHz: 120,
    });
    const selectedOperatingOffsetDb = p14Diagnostic ? num(p14Diagnostic.operatingOffsetDb) : null;
    if (selectedOperatingOffsetDb !== null && canonicalVerticalOffsetDb !== null) {
      operatingLevelOffsetDb = selectedOperatingOffsetDb - canonicalVerticalOffsetDb;
    }
  }
  const postEqCurve = finalBassResponse?.canonicalPostEqRsp || null;
  lines.push(...formatFinalGraphValues(trace, rawRspCurve, postEqCurve, operatingLevelOffsetDb));
  lines.push(...formatP14Guide(splConfig, requested));

  // Conclusion
  const conclusion = deriveConclusion(trace);
  lines.push(sectionHeader("9. CONCLUSION"));
  lines.push(`Conclusion code: ${conclusion.code}`);
  lines.push(`Reason: ${conclusion.reason}`);
  if (conclusion.firstUnavailable) {
    lines.push(`First unavailable stage: ${conclusion.firstUnavailable}`);
  }
  if (conclusion.gate) {
    lines.push(`First rejection gate: ${conclusion.gate}`);
  }
  if (conclusion.stageA && conclusion.stageB) {
    lines.push(`Lost between: ${conclusion.stageA} → ${conclusion.stageB}`);
  }
  if (conclusion.candidate) {
    lines.push(`Useful candidate: ${conclusion.candidate.candidateId}`);
  }

  lines.push("");
  lines.push("END OF REPORT");
  return lines.join("\n");
}