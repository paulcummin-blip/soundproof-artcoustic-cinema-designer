// BassContractParityAudit.jsx — Phase 1C: Compact live parity diagnostic.
//
// Available only when existing engineering diagnostics are enabled.
// Compares the BassAnalysisResult contract against current production values
// for P14/P18/P19/P20, selected mode, pool ID, candidate signature,
// real-seat count, job status, RSP curve point count, and seat curve count.
//
// This is a READ-ONLY diagnostic. It does not modify any state, start
// calculations, or change the selected candidate.

import React, { useMemo } from "react";
import { signatureToString, buildCandidateSignature } from "@/components/room/bass/candidateConsistency";
import { completedStatusesEquivalent } from "@/components/room/bass/bassResultAuthority";

// Compare two values for parity. Returns true if they match.
function valuesMatch(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

// Build a parity report comparing the contract against current production values.
export function buildParityReport({ contract, optimisationResult, detailedStatus, rspRawCurve, perSeatRawCurves, canonicalPriorityMode, graphCandidateId }) {
  if (!contract) return { pass: false, rows: [], reason: "No contract" };

  const rows = [];
  let allPass = true;

  const selectedCandidate = optimisationResult?.selectedCandidate;
  const poolId = optimisationResult?.poolId || null;

  // P14 level and value
  const prodP14Level = typeof selectedCandidate?.achievedP14Level === "number"
    ? selectedCandidate.achievedP14Level
    : null;
  const prodP14Value = Number.isFinite(selectedCandidate?.achievedP14Db) ? selectedCandidate.achievedP14Db : null;
  const conP14 = contract.productAnalysis.parameters.p14;
  if (!valuesMatch(conP14.level, prodP14Level)) {
    rows.push({ field: "P14 level", contract: conP14.level, production: prodP14Level });
    allPass = false;
  }
  if (!valuesMatch(conP14.value, prodP14Value)) {
    rows.push({ field: "P14 value", contract: conP14.value, production: prodP14Value });
    allPass = false;
  }

  // P18 level and value
  const prodP18Level = typeof selectedCandidate?.achievedP18Level === "number"
    ? selectedCandidate.achievedP18Level
    : null;
  const prodP18Value = Number.isFinite(selectedCandidate?.achievedP18FrequencyHz) ? selectedCandidate.achievedP18FrequencyHz : null;
  const conP18 = contract.productAnalysis.parameters.p18;
  if (!valuesMatch(conP18.level, prodP18Level)) {
    rows.push({ field: "P18 level", contract: conP18.level, production: prodP18Level });
    allPass = false;
  }
  if (!valuesMatch(conP18.value, prodP18Value)) {
    rows.push({ field: "P18 value", contract: conP18.value, production: prodP18Value });
    allPass = false;
  }

  // P19 level and value
  const prodP19Level = typeof selectedCandidate?.achievedP19Level === "number"
    ? selectedCandidate.achievedP19Level
    : null;
  const prodP19Value = Number.isFinite(selectedCandidate?.achievedP19VariationDb) ? selectedCandidate.achievedP19VariationDb : null;
  const conP19 = contract.productAnalysis.parameters.p19;
  if (!valuesMatch(conP19.level, prodP19Level)) {
    rows.push({ field: "P19 level", contract: conP19.level, production: prodP19Level });
    allPass = false;
  }
  if (!valuesMatch(conP19.value, prodP19Value)) {
    rows.push({ field: "P19 value", contract: conP19.value, production: prodP19Value });
    allPass = false;
  }

  // P20 status, level and value
  const conP20 = contract.productAnalysis.parameters.p20;
  const prodP20Level = selectedCandidate?.p20Available
    ? (typeof selectedCandidate.achievedP20Level === "number" ? selectedCandidate.achievedP20Level : null)
    : null;
  const prodP20Value = Number.isFinite(selectedCandidate?.achievedP20VariationDb) ? selectedCandidate.achievedP20VariationDb : null;
  if (!valuesMatch(conP20.level, prodP20Level)) {
    rows.push({ field: "P20 level", contract: conP20.level, production: prodP20Level });
    allPass = false;
  }
  if (!valuesMatch(conP20.value, prodP20Value)) {
    rows.push({ field: "P20 value", contract: conP20.value, production: prodP20Value });
    allPass = false;
  }

  // Selected mode
  const prodMode = canonicalPriorityMode || optimisationResult?.selectedMode || null;
  if (!valuesMatch(contract.selectedMode, prodMode)) {
    rows.push({ field: "Selected mode", contract: contract.selectedMode, production: prodMode });
    allPass = false;
  }

  // Pool ID
  if (!valuesMatch(contract.provenance.poolId, poolId)) {
    rows.push({ field: "Pool ID", contract: contract.provenance.poolId, production: poolId });
    allPass = false;
  }

  // Candidate signature
  let prodSig = optimisationResult?.productionCandidateId || selectedCandidate?.candidateId || null;
  if (!prodSig && selectedCandidate && optimisationResult) {
    try {
      const sig = buildCandidateSignature({ result: optimisationResult, rspRawCurve });
      prodSig = sig ? signatureToString(sig) : null;
    } catch (e) {
      prodSig = null;
    }
  }
  if (!valuesMatch(contract.selectedCandidateId, prodSig)) {
    rows.push({ field: "Candidate ID", contract: contract.selectedCandidateId, production: prodSig });
    allPass = false;
  }
  if (!valuesMatch(graphCandidateId, prodSig)) {
    rows.push({ field: "Graph candidate ID", contract: graphCandidateId, production: prodSig });
    allPass = false;
  }
  if (!valuesMatch(contract.provenance.filterBankSignature, optimisationResult?.filterBankSignature || null)) {
    rows.push({ field: "Filter-bank signature", contract: contract.provenance.filterBankSignature, production: optimisationResult?.filterBankSignature || null });
    allPass = false;
  }
  if (!valuesMatch(contract.provenance.postEqCurveSignature, optimisationResult?.postEqCurveSignature || null)) {
    rows.push({ field: "Post-EQ curve signature", contract: contract.provenance.postEqCurveSignature, production: optimisationResult?.postEqCurveSignature || null });
    allPass = false;
  }
  if (!valuesMatch(contract.fingerprints.calibration, optimisationResult?.calibrationFingerprint || contract.fingerprints.calibration)) {
    rows.push({ field: "Calibration fingerprint", contract: contract.fingerprints.calibration, production: optimisationResult?.calibrationFingerprint || null });
    allPass = false;
  }

  // Real-seat count
  const prodRealSeatCount = Array.isArray(perSeatRawCurves)
    ? perSeatRawCurves.filter((s) => s?.seatId && s.seatId !== "rsp" && !s.__isSyntheticRsp).length
    : 0;
  if (!valuesMatch(contract.provenance.realSeatCount, prodRealSeatCount)) {
    rows.push({ field: "Real-seat count", contract: contract.provenance.realSeatCount, production: prodRealSeatCount });
    allPass = false;
  }

  // Job status
  const prodJobStatus = detailedStatus === "CALCULATING" ? "running"
    : detailedStatus === "COMPLETE" ? "complete"
    : detailedStatus === "OUT_OF_DATE" ? "stale"
    : detailedStatus === "CANCELLED" ? "stale"
    : detailedStatus === "ERROR" ? "error"
    : selectedCandidate ? "complete" : "uncalculated";
  if (!completedStatusesEquivalent(contract.job.status, prodJobStatus)) {
    rows.push({ field: "Job status", contract: contract.job.status, production: prodJobStatus });
    allPass = false;
  }

  // RSP curve point count
  const prodRspPoints = Array.isArray(rspRawCurve) ? rspRawCurve.length : 0;
  const conRspPoints = Array.isArray(contract.roomResponse.rspCurve) ? contract.roomResponse.rspCurve.length : 0;
  if (!valuesMatch(conRspPoints, prodRspPoints)) {
    rows.push({ field: "RSP curve points", contract: conRspPoints, production: prodRspPoints });
    allPass = false;
  }

  // Seat curve count
  const prodSeatCount = Array.isArray(perSeatRawCurves) ? perSeatRawCurves.length : 0;
  const conSeatCount = Array.isArray(contract.roomResponse.seatCurves) ? contract.roomResponse.seatCurves.length : 0;
  if (!valuesMatch(conSeatCount, prodSeatCount)) {
    rows.push({ field: "Seat curve count", contract: conSeatCount, production: prodSeatCount });
    allPass = false;
  }

  return { pass: allPass, rows };
}

export default function BassContractParityAudit({ contract, optimisationResult, detailedStatus, rspRawCurve, perSeatRawCurves, canonicalPriorityMode, graphCandidateId }) {
  const report = useMemo(
    () => buildParityReport({ contract, optimisationResult, detailedStatus, rspRawCurve, perSeatRawCurves, canonicalPriorityMode, graphCandidateId }),
    [contract, optimisationResult, detailedStatus, rspRawCurve, perSeatRawCurves, canonicalPriorityMode, graphCandidateId]
  );

  if (!contract) return null;

  return (
    <div style={{
      border: "1px solid #DCDBD6",
      borderRadius: 8,
      background: "#F8F8F7",
      padding: "8px 12px",
      marginBottom: 8,
      fontSize: 10,
      fontFamily: "monospace",
      color: "#1B1A1A",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: "#213428" }}>
        Bass contract v1
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", marginBottom: 4 }}>
        <span style={{ color: "#625143" }}>Geometry:</span>
        <span style={{ color: "#1B1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {contract.fingerprints.geometry || "—"}
        </span>
        <span style={{ color: "#625143" }}>Product:</span>
        <span style={{ color: "#1B1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {contract.fingerprints.product || "—"}
        </span>
        <span style={{ color: "#625143" }}>Calibration:</span>
        <span style={{ color: "#1B1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {contract.fingerprints.calibration || "—"}
        </span>
        <span style={{ color: "#625143" }}>Response domain:</span>
        <span style={{ color: "#1B1A1A" }}>
          {contract.roomResponse.responseDomain || "—"}
          {contract.roomResponse.productIndependent != null && (
            <span style={{ color: "#625143", marginLeft: 6 }}>
              (productIndependent: {String(contract.roomResponse.productIndependent)})
            </span>
          )}
        </span>
      </div>
      <div style={{
        fontWeight: 700,
        color: report.pass ? "#059669" : "#dc2626",
        borderTop: "1px solid #DCDBD6",
        paddingTop: 4,
        marginTop: 4,
      }}>
        Contract parity: {report.pass ? "PASS" : "FAIL"}
      </div>
      {!report.pass && report.rows.length > 0 && (
        <div style={{ marginTop: 4, color: "#dc2626" }}>
          {report.rows.map((r, i) => (
            <div key={i}>
              {r.field}: contract={String(r.contract)} vs production={String(r.production)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}