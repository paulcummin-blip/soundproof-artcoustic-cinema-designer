// bassGraphPipelineTrace.js
//
// Graph pipeline diagnostic instrument. Traces the production graph series
// through every stage of the pipeline and produces a structured table showing
// exactly where each series exists, is filtered, or disappears.
//
// This is a READ-ONLY diagnostic. It never modifies any series, visibility,
// authority, or graph value. It only inspects and reports.
//
// Pipeline stages traced:
//   1. finalOptimisedBassResponse  — raw curve data on the authority object
//   2. Authority validation         — finalOptimisedBassAuthorityMatches checks
//   3. buildBassGraphSeries         — series built from the authority
//   4. visibleMultiSeries           — series after visibility filtering
//   5. BassGraph props              — series actually passed to the graph
//
// Production curves tracked:
//   - Room Response      (kind: "room-response")
//   - Product + Room Max  (kind: "maximum-spl")
//   - House Target        (kind: "house-curve")
//   - Final Corrected     (kind: "post-eq")

import { finalOptimisedBassAuthorityMatches } from "@/components/room/bass/finalOptimisedBassResponse";
import {
  buildFilterBankSignature,
  buildCorrectionCurveSignature,
  buildCurveSignature,
} from "@/components/room/bass/bassResultAuthority";

const PRODUCTION_CURVES = [
  { name: "Room Response", kind: "room-response" },
  { name: "Product + Room Max", kind: "maximum-spl" },
  { name: "House Target", kind: "house-curve" },
  { name: "Final Corrected", kind: "post-eq" },
];

function curvePoints(curve) {
  return Array.isArray(curve) ? curve.filter((p) => Number.isFinite(Number(p?.frequency)) && Number.isFinite(Number(p?.spl))).length : 0;
}

function findSeries(allSeries, kind) {
  return (allSeries || []).find((s) => s?.kind === kind) || null;
}

/**
 * Trace the full graph pipeline and return a structured diagnostic report.
 *
 * @param {object} params
 * @param {object|null} params.finalBassResponse - optimisationResult.finalOptimisedBassResponse
 * @param {Array} params.multiSeriesForGraph - output of buildBassGraphSeries
 * @param {Array} params.visibleMultiSeries - after visibility filtering
 * @param {object} params.curveVisibility - current visibility state
 * @param {object} params.layerAvailability - current availability state
 * @param {boolean} params.hasValidDetailedResult - the hasMatchingDetailedResult gate
 * @param {boolean} params.designEqEnabled
 * @returns {object} structured trace report
 */
export function traceBassGraphPipeline({
  finalBassResponse,
  multiSeriesForGraph,
  visibleMultiSeries,
  curveVisibility,
  layerAvailability,
  hasValidDetailedResult,
  designEqEnabled,
}) {
  const stages = [];

  // ── Stage 1: finalOptimisedBassResponse — raw curve data ──
  const stage1 = { stage: "finalOptimisedBassResponse", rows: {} };
  for (const { name, kind } of PRODUCTION_CURVES) {
    let curve = null;
    let pointCount = 0;
    if (kind === "room-response") curve = finalBassResponse?.roomResponseCurve;
    else if (kind === "maximum-spl") curve = finalBassResponse?.maximumSplCurveAfterEq;
    else if (kind === "house-curve") curve = finalBassResponse?.canonicalTargetCurve;
    else if (kind === "post-eq") curve = finalBassResponse?.postEqRspCurve;
    pointCount = curvePoints(curve);
    stage1.rows[name] = {
      exists: pointCount > 0,
      points: pointCount,
      visible: "N/A (raw data)",
      filtered: false,
      authorityPassed: "N/A",
      reason: pointCount === 0 ? "curve missing or empty on finalOptimisedBassResponse" : "present",
    };
  }
  stages.push(stage1);

  // ── Stage 2: Authority validation — finalOptimisedBassAuthorityMatches ──
  const stage2 = { stage: "Authority validation", rows: {} };
  const authorityPassed = finalOptimisedBassAuthorityMatches(finalBassResponse);
  const authorityChecks = {
    "selectedCandidateId exists": !!finalBassResponse?.selectedCandidateId,
    "p18.candidateId matches": finalBassResponse?.finalSeatVariationData?.p18?.candidateId === finalBassResponse?.selectedCandidateId,
    "p19.candidateId matches": finalBassResponse?.finalSeatVariationData?.p19?.candidateId === finalBassResponse?.selectedCandidateId,
    "p20.candidateId matches": finalBassResponse?.finalSeatVariationData?.p20?.candidateId === finalBassResponse?.selectedCandidateId,
    "filterBankSignature matches": finalBassResponse?.filterBankSignature === buildFilterBankSignature({ generatedFilterBank: finalBassResponse?.eqFilterBank }),
    "correctionCurveSignature matches": finalBassResponse?.correctionCurveSignature === buildCorrectionCurveSignature(finalBassResponse),
    "postEqCurveSignature matches": finalBassResponse?.postEqCurveSignature === buildCurveSignature(finalBassResponse?.postEqRspCurve),
    "referenceEqSignature matches": finalBassResponse?.referenceEqSignature === finalBassResponse?.postEqCurveSignature && buildCurveSignature(finalBassResponse?.referenceEq) === finalBassResponse?.postEqCurveSignature,
  };
  const failedChecks = Object.entries(authorityChecks).filter(([, v]) => v === false).map(([k]) => k);
  for (const { name } of PRODUCTION_CURVES) {
    stage2.rows[name] = {
      exists: "N/A",
      points: "N/A",
      visible: "N/A",
      filtered: false,
      authorityPassed,
      reason: authorityPassed ? "passed" : `FAILED: ${failedChecks.join("; ")}`,
    };
  }
  stages.push(stage2);

  // ── Stage 3: buildBassGraphSeries — series built from authority ──
  const stage3 = { stage: "buildBassGraphSeries", rows: {} };
  for (const { name, kind } of PRODUCTION_CURVES) {
    const series = findSeries(multiSeriesForGraph, kind);
    const points = series ? curvePoints(series.data) : 0;
    let reason = "present";
    if (!series) {
      if (kind === "room-response") reason = "normalizedSeries (roomResponseCurve) empty or missing";
      else if (!hasValidDetailedResult) reason = `GATED: hasMatchingDetailedResult=false (authority validation failed)`;
      else if (kind === "maximum-spl") reason = "maximumSplCurveAfterEq empty or missing on finalBassResponse";
      else if (kind === "house-curve") reason = "productionHouseCurveTarget empty or missing on selectedCandidate";
      else if (kind === "post-eq") reason = "postEqRspCurve empty or missing on finalBassResponse";
    }
    stage3.rows[name] = {
      exists: !!series,
      points,
      visible: "N/A (pre-filter)",
      filtered: false,
      authorityPassed: hasValidDetailedResult,
      reason,
    };
  }
  stages.push(stage3);

  // ── Stage 4: visibleMultiSeries — after visibility filtering ──
  const stage4 = { stage: "visibleMultiSeries (visibility filter)", rows: {} };
  for (const { name, kind } of PRODUCTION_CURVES) {
    const series = findSeries(multiSeriesForGraph, kind);
    const inVisible = visibleMultiSeries.some((s) => s?.kind === kind);
    let visible = false;
    let reason = "not built (absent from multiSeriesForGraph)";
    if (series) {
      if (kind === "room-response") { visible = curveVisibility?.room !== false; reason = visible ? "visible" : `filtered: curveVisibility.room=false`; }
      else if (kind === "maximum-spl") { visible = curveVisibility?.combined !== false; reason = visible ? "visible" : `filtered: curveVisibility.combined=false`; }
      else if (kind === "house-curve") { visible = curveVisibility?.house !== false; reason = visible ? "visible" : `filtered: curveVisibility.house=false`; }
      else if (kind === "post-eq") { visible = curveVisibility?.finalEq !== false; reason = visible ? "visible" : `filtered: curveVisibility.finalEq=false`; }
    }
    stage4.rows[name] = {
      exists: !!series,
      points: series ? curvePoints(series.data) : 0,
      visible,
      filtered: series && !visible,
      authorityPassed: hasValidDetailedResult,
      reason,
    };
  }
  stages.push(stage4);

  // ── Stage 5: BassGraph props — what's actually passed to the graph ──
  const stage5 = { stage: "BassGraph props", rows: {} };
  for (const { name, kind } of PRODUCTION_CURVES) {
    const inProps = visibleMultiSeries.some((s) => s?.kind === kind);
    stage5.rows[name] = {
      exists: inProps,
      points: inProps ? curvePoints(findSeries(visibleMultiSeries, kind)?.data) : 0,
      visible: inProps,
      filtered: false,
      authorityPassed: hasValidDetailedResult,
      reason: inProps ? "passed to BassGraph" : "absent from visibleMultiSeries",
    };
  }
  stages.push(stage5);

  // ── Summary: first failing stage ──
  let firstFailingStage = null;
  let firstFailingReason = null;
  for (const { name, kind } of PRODUCTION_CURVES) {
    if (kind === "room-response") continue; // Room is non-default, not a required default
    const stage3Row = stage3.rows[name];
    if (!stage3Row.exists) {
      firstFailingStage = stage3.stage;
      firstFailingReason = stage3Row.reason;
      break;
    }
    const stage4Row = stage4.rows[name];
    if (!stage4Row.visible) {
      firstFailingStage = stage4.stage;
      firstFailingReason = stage4Row.reason;
      break;
    }
  }

  return {
    stages,
    authorityPassed,
    authorityChecks,
    failedChecks,
    hasValidDetailedResult,
    designEqEnabled,
    firstFailingStage,
    firstFailingReason,
    multiSeriesCount: (multiSeriesForGraph || []).length,
    visibleMultiSeriesCount: (visibleMultiSeries || []).length,
    curveVisibility,
    layerAvailability,
  };
}

/**
 * Format the trace as a console-friendly table string.
 */
export function formatPipelineTraceTable(trace) {
  if (!trace) return "No trace available.";
  const lines = [];
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("  BASS GRAPH PIPELINE TRACE");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(`  designEqEnabled: ${trace.designEqEnabled}`);
  lines.push(`  hasValidDetailedResult: ${trace.hasValidDetailedResult}`);
  lines.push(`  authorityPassed: ${trace.authorityPassed}`);
  lines.push(`  multiSeriesForGraph count: ${trace.multiSeriesCount}`);
  lines.push(`  visibleMultiSeries count: ${trace.visibleMultiSeriesCount}`);
  if (trace.failedChecks.length > 0) {
    lines.push(`  FAILED authority checks: ${trace.failedChecks.join("; ")}`);
  }
  lines.push("");

  for (const stage of trace.stages) {
    lines.push(`── ${stage.stage} ──`);
    lines.push("  Series                  | Exists | Points | Visible  | Authority | Reason");
    lines.push("  ──────────────────────────────────────────────────────────────────────────");
    for (const { name } of PRODUCTION_CURVES) {
      const row = stage.rows[name];
      const exists = String(row.exists).padEnd(6);
      const points = String(row.points).padEnd(6);
      const visible = String(row.visible).padEnd(7);
      const auth = String(row.authorityPassed).padEnd(9);
      lines.push(`  ${name.padEnd(22)} | ${exists} | ${points} | ${visible} | ${auth} | ${row.reason}`);
    }
    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════════");
  if (trace.firstFailingStage) {
    lines.push(`  FIRST FAILING STAGE: ${trace.firstFailingStage}`);
    lines.push(`  REASON: ${trace.firstFailingReason}`);
  } else {
    lines.push("  All production curves present and visible. No failure detected.");
  }
  lines.push("═══════════════════════════════════════════════════════════════");
  return lines.join("\n");
}