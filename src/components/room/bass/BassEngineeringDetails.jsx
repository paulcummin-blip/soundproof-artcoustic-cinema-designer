import React from "react";
import BassContractParityAudit from "./BassContractParityAudit";
import BassOptimiserValidationPanel from "./BassOptimiserValidationPanel";
import DesignEqFilterBankDiagnostic from "./DesignEqFilterBankDiagnostic";
import SourceDomainCapabilityDiagnostic from "./SourceDomainCapabilityDiagnostic";
import ProductionVectorCaptureTest10 from "./ProductionVectorCaptureTest10";
import { buildCandidateSignature, signatureToString } from "./candidateConsistency";

export default function BassEngineeringDetails({ enabled, designEqEnabled, result, rspPosition, seatingPositions, contract, detailedStatus, rspRawCurve, perSeatRawCurves, priorityMode, onPriorityChange, systemLimits, multiSeries, runtimeCapture, smoothingMode }) {
  if (!enabled) return null;
  const signature = designEqEnabled && result?.selectedCandidate ? buildCandidateSignature({ result, rspRawCurve }) : null;
  const baseCurve = rspRawCurve.length ? rspRawCurve : (multiSeries[0]?.data || []);
  const correction = result ? baseCurve.map((point) => {
    const finalPoint = result.finalPostEqCurve.find((candidate) => candidate.frequency === point.frequency);
    return { frequency: point.frequency, spl: (finalPoint?.spl ?? point.spl) - point.spl };
  }) : [];
  return <>
    {signature && <div style={{ fontSize: 9, color: "#625143", fontFamily: "monospace", marginTop: 4, background: "#F8F8F7", border: "1px solid #DCDBD6", borderRadius: 4, padding: "4px 8px" }}><strong>Candidate signature:</strong> {signatureToString(signature)}</div>}
    {designEqEnabled && result && <>
      <div style={{ fontSize: 10, fontFamily: "monospace", color: "#625143", background: "#F8F8F7", border: "1px solid #DCDBD6", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
        <strong>Assessment position:</strong> RSP &nbsp;|&nbsp; <strong>Response ID:</strong> rsp &nbsp;|&nbsp; <strong>RSP coordinates:</strong> {rspPosition ? `x=${rspPosition.x.toFixed(3)} / y=${rspPosition.y.toFixed(3)} / z=${rspPosition.z.toFixed(3)} m` : "unavailable"} &nbsp;|&nbsp; <strong>Real seats:</strong> {seatingPositions?.length ?? 0}
      </div>
      <BassContractParityAudit contract={contract} optimisationResult={result} detailedStatus={detailedStatus} rspRawCurve={rspRawCurve} perSeatRawCurves={perSeatRawCurves} canonicalPriorityMode={priorityMode} />
      <BassOptimiserValidationPanel result={result} priorityMode={priorityMode} onPriorityModeChange={onPriorityChange} activeSubs={systemLimits.activeSubs} usableLfHz={systemLimits.usableLfHz} perSeatRawCurves={perSeatRawCurves} rspRawCurve={rspRawCurve} includeDiagnostics />
      <DesignEqFilterBankDiagnostic filters={result.selectedFilters} combinedEqCurve={correction} />
      <SourceDomainCapabilityDiagnostic activeSubs={systemLimits.activeSubs} rawCurve={baseCurve} postEqCurve={result.finalPostEqCurve} usableLfHz={systemLimits.usableLfHz} optimisationResult={result} />
    </>}
    <ProductionVectorCaptureTest10 capture={runtimeCapture} designEqEnabled={designEqEnabled} smoothingMode={smoothingMode} />
  </>;
}