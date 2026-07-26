// eqDiscoveryAuditReport.js — Plain-text report formatter for the copy button.
// Pure, read-only. Calls the audit engine and formats the result as text.

import { runEqDiscoveryAudit } from "@/components/room/bass/eqDiscoveryAuditEngine";

const INCOMPLETE = "INCOMPLETE";
const UNAVAILABLE = "UNAVAILABLE";

const fmt = (v, digits = 2, fallback = INCOMPLETE) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
};

function sectionHeader(title) {
  return `\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`;
}

export function buildEqDiscoveryAuditReport({
  optimisationResult,
  fingerprints,
  rawRspCurve,
  workerDelta = { starts: 0, completions: 0 },
}) {
  const audit = runEqDiscoveryAudit({ optimisationResult, fingerprints, rawRspCurve });
  const lines = [];

  lines.push("ARTCOUSTIC EQ DISCOVERY AUDIT REPORT");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: current live project + current completed canonical result`);
  lines.push(`Note: read-only audit. Zero simulations, zero optimiser runs, zero production-state changes.`);
  lines.push(`Available: ${audit.available ? "true" : "false"}`);

  if (!audit.available) {
    lines.push(`\nReason: ${audit.reason || INCOMPLETE}`);
    lines.push("\nEND OF REPORT");
    return lines.join("\n");
  }

  // SECTION 1: AUTHORITY
  lines.push(sectionHeader("1. AUTHORITY"));
  const auth = audit.authority || {};
  lines.push(`Active calibration fingerprint: ${auth.activeCalibrationFingerprint || INCOMPLETE}`);
  lines.push(`Completed-result calibration fingerprint: ${auth.resultCalibrationFingerprint || INCOMPLETE}`);
  lines.push(`Match status: ${auth.calibrationMatch ? "PASS" : "FAIL"}`);
  lines.push(`Selected candidate ID: ${auth.selectedCandidateId || INCOMPLETE}`);
  const finalAuth = audit.finalAuthority || {};
  lines.push(`Final canonical candidate ID: ${finalAuth.selectedCandidateId || INCOMPLETE}`);
  lines.push(`Raw response signature: ${finalAuth.rawResponseSignature || INCOMPLETE}`);
  lines.push(`Post-EQ response signature: ${finalAuth.postEqCurveSignature || INCOMPLETE}`);
  lines.push(`Final filter-bank signature: ${finalAuth.filterBankSignature || INCOMPLETE}`);
  const graphAuth = audit.graphAuthority || {};
  lines.push(`Graph filter-bank signature: ${graphAuth.graphFilterBankSignature || INCOMPLETE}`);
  lines.push(`Worker status: idle (audit is read-only)`);
  lines.push(`Lifecycle trace worker starts: ${workerDelta.starts}`);
  lines.push(`Lifecycle trace worker completions: ${workerDelta.completions}`);
  lines.push(`Worker delta — starts: 0, completions: 0`);

  // SECTION 2: PRODUCTION-PATH SUMMARY
  lines.push(sectionHeader("2. PRODUCTION-PATH SUMMARY"));
  for (const p of audit.productionPathSummary || []) {
    lines.push(`\n  Probe: ${p.probeHz} Hz`);
    lines.push(`    Actual raw sample frequency: ${fmt(p.actualSampleHz, 4)}`);
    lines.push(`    Unsmoothed residual: ${fmt(p.unsmoothedResidualDb, 4)} dB`);
    lines.push(`    Production fitter-smoothed residual: ${fmt(p.productionFitterResidualDb, 4)} dB`);
    lines.push(`    Difference caused by smoothing: ${fmt(p.smoothingDiffDb, 4)} dB`);
    lines.push(`    Sign changed: ${p.signChanged}`);
    lines.push(`    Protected-null status: ${p.protectedNull}`);
    lines.push(`    Assessment-band status: ${p.inAssessmentBand ? "in-band" : "out-of-band"}`);
    lines.push(`    Region discovered: ${p.regionDiscovered}`);
    lines.push(`    Region start: ${fmt(p.regionStartHz, 2)} Hz`);
    lines.push(`    Region centre: ${fmt(p.regionCentreHz, 2)} Hz`);
    lines.push(`    Region end: ${fmt(p.regionEndHz, 2)} Hz`);
    lines.push(`    Region width: ${fmt(p.regionWidthHz, 2)} Hz (${fmt(p.regionWidthOctaves, 4)} octaves)`);
    lines.push(`    Peak threshold: ${fmt(p.peakThresholdDb, 1)} dB`);
    lines.push(`    Threshold pass: ${p.thresholdPass}`);
    lines.push(`    Minimum-width threshold: ${p.minimumWidthThreshold}`);
    lines.push(`    Trial count: ${p.trialCount}`);
    lines.push(`    First rejection gate: ${p.firstRejectionGate}`);
    lines.push(`    Accepted trial: ${p.acceptedTrial}`);
    lines.push(`    Final filter near probe: ${p.finalFilterNearProbe}`);
    lines.push(`    Final graph EQ contribution: ${p.finalGraphEqContribution}`);
  }

  // SECTION 3: RESOLUTION COMPARISON
  lines.push(sectionHeader("3. RESOLUTION COMPARISON"));
  for (const rc of audit.resolutionComparison || []) {
    lines.push(`\n  Probe: ${rc.probeHz} Hz`);
    for (const [res, data] of Object.entries(rc.byResolution || {})) {
      lines.push(`    ${res.padEnd(6)}: residual=${fmt(data.residualDb, 4)} dB, class=${data.classification}, dir=${data.correctionDirection}, exceedsThreshold=${data.exceedsProductionThreshold}, signDiffers=${data.signDiffersFromUnsmoothed}`);
    }
  }

  // SECTION 4: REGION DISCOVERY MATRIX
  lines.push(sectionHeader("4. REGION DISCOVERY MATRIX"));
  lines.push("  Smoothing  | Threshold | MinWidth         | 34Hz | 78Hz | Production");
  lines.push("  ---------- | --------- | ---------------- | ---- | ---- | ---------");
  for (const row of audit.regionDiscoveryMatrix || []) {
    const p34 = row[`probe_34.16`];
    const p78 = row[`probe_77.81`];
    lines.push(`  ${row.smoothing.padEnd(10)} | ${fmt(row.peakThresholdDb, 1).padEnd(9)} | ${row.minWidthLabel.padEnd(16)} | ${p34?.regionFound ? "YES" : "no"}  | ${p78?.regionFound ? "YES" : "no"}  | ${row.isProductionCombo ? "<<< PROD" : ""}`);
  }

  // SECTION 5: CURATED DISCOVERY VARIANTS
  lines.push(sectionHeader("5. CURATED DISCOVERY VARIANTS"));
  for (const v of audit.curatedVariants || []) {
    lines.push(`\n  Variant ${v.id}: ${v.label}`);
    lines.push(`    Smoothing: ${v.smoothing}, threshold: ${fmt(v.threshold, 1)} dB, minWidth: ${fmt(v.minWidthOctaves, 4)} octaves`);
    lines.push(`    Total regions: ${v.totalRegions}, protected-null violations: ${v.protectedNullViolations}, cut-limit violations: ${v.cutLimitViolations}`);
    for (const probeHz of [34.16, 77.81]) {
      const pr = v.probeResults[probeHz];
      lines.push(`    Probe ${probeHz} Hz: region=${pr?.regionFound}, centre=${fmt(pr?.centreHz, 2)} Hz, gain=${fmt(pr?.proposedGainDb, 2)} dB, Q=${fmt(pr?.proposedQ, 2)}, protectedNull=${pr?.protectedNull}, wouldAccept=${pr?.wouldReachAcceptance}`);
    }
  }

  // SECTION 6: AUTOMATIC PEAK SCAN
  lines.push(sectionHeader("6. AUTOMATIC PEAK SCAN — TOP 10 POSITIVE"));
  lines.push("  Freq(Hz)  | Raw(dB)  | 1/12(dB) | 1/6(dB)  | 1/3(dB)  | Region | Trial | Filter | Status");
  lines.push("  --------- | -------- | -------- | -------- | -------- | ------ | ----- | ------ | ------");
  for (const p of audit.peakScan?.topPositive || []) {
    lines.push(`  ${fmt(p.frequencyHz, 2).padStart(9)} | ${fmt(p.unsmoothedResidualDb, 2).padStart(8)} | ${fmt(p.residual12Db, 2).padStart(8)} | ${fmt(p.residual6Db, 2).padStart(8)} | ${fmt(p.residual3Db, 2).padStart(8)} | ${p.productionRegionDiscovered ? "Y" : "n"}     | ${p.productionTrialGenerated ? "Y" : "n"}    | ${p.finalFilterNearby ? "Y" : "n"}     | ${p.detectionStatus}`);
  }
  lines.push(`\n  TOP 5 NEGATIVE`);
  for (const p of audit.peakScan?.topNegative || []) {
    lines.push(`  ${fmt(p.frequencyHz, 2).padStart(9)} | ${fmt(p.unsmoothedResidualDb, 2).padStart(8)} | ${p.detectionStatus}`);
  }

  // SECTION 8: ACTUAL PRODUCTION CANDIDATES
  lines.push(sectionHeader("8. ACTUAL PRODUCTION CANDIDATES"));
  for (const c of audit.actualCandidates?.candidates || []) {
    lines.push(`\n  Candidate: ${c.candidateId}`);
    lines.push(`    Fit profile: ${c.fitProfile}, enabled filters: ${c.enabledFilterCount}`);
    lines.push(`    Filter-bank signature: ${c.filterBankSignature || INCOMPLETE}`);
    lines.push(`    Max residual: ${fmt(c.maximumResidualDb, 4)} dB, RMS: ${fmt(c.rmsResidualDb, 4)} dB, mean abs: ${fmt(c.meanAbsoluteResidualDb, 4)} dB`);
    lines.push(`    Worst-seat: ${fmt(c.worstSeatDeviationDb, 4)} dB, mean-seat: ${fmt(c.meanSeatDeviationDb, 4)} dB, EQ cost: ${fmt(c.eqCost, 4)} dB`);
    lines.push(`    Rank: ${c.rank ?? INCOMPLETE}, selected: ${c.selected}`);
  }
  const checks = audit.actualCandidates?.checks || {};
  lines.push(`\n  Checks:`);
  lines.push(`    Cut within ±2 Hz of 34.16 Hz: ${checks.cutNear34Hz ? "YES" : "no"}`);
  lines.push(`    Cut within ±3 Hz of 77.81 Hz: ${checks.cutNear78Hz ? "YES" : "no"}`);
  lines.push(`    Selected bank equals final bank: ${checks.selectedEqualsFinal ? "PASS" : "FAIL"}`);
  lines.push(`    Final signature equals graph signature: ${checks.finalEqualsGraph ? "PASS" : "FAIL"}`);

  // SECTION 9: ROOT-CAUSE CLASSIFICATION
  lines.push(sectionHeader("9. ROOT-CAUSE CLASSIFICATION"));
  lines.push(`  34.16 Hz: ${audit.rootCause34?.code} — ${audit.rootCause34?.reason}`);
  lines.push(`  77.81 Hz: ${audit.rootCause78?.code} — ${audit.rootCause78?.reason}`);

  // SECTION 10: VARIANT COMPARISON SUMMARY
  lines.push(sectionHeader("10. VARIANT COMPARISON SUMMARY"));
  lines.push("  Var | 34Hz found | 34Hz cut  | 78Hz found | 78Hz cut  | Total peaks | ProtNull | BoostLim | CutLim | SeatReg | ProdChanged");
  lines.push("  --- | ---------- | --------- | ---------- | --------- | ----------- | -------- | -------- | ------ | ------- | ----------");
  for (const v of audit.variantSummary || []) {
    lines.push(`  ${v.variant}   | ${v.probe34RegionFound ? "YES" : "no"}       | ${v.probe34ProposedCut.padEnd(9)} | ${v.probe78RegionFound ? "YES" : "no"}       | ${v.probe78ProposedCut.padEnd(9)} | ${String(v.totalPositivePeaksAbove3dB).padEnd(11)} | ${String(v.protectedNullViolations).padEnd(8)} | ${String(v.boostLimitViolations).padEnd(8)} | ${String(v.cutLimitViolations).padEnd(6)} | ${v.seatRegressionCalculated}       | ${v.productionBehaviourChanged}`);
  }

  // SECTION 11: SMELL TEST
  lines.push(sectionHeader("11. SMELL TEST"));
  for (const s of audit.smellTest || []) {
    lines.push(`  Variant ${s.variant}: ${s.label} — ${s.classification}`);
  }

  // NEXT PRODUCTION TEST
  lines.push(sectionHeader("NEXT PRODUCTION TEST"));
  lines.push(audit.nextTest || INCOMPLETE);
  lines.push("  NOTE: This test is NOT approved. It is the smallest change worth testing next based on measured audit evidence.");

  lines.push("\nEND OF REPORT");
  return lines.join("\n");
}