import React from "react";
import { buildLiveResultAuthorityDiagnosticModel } from "./liveResultAuthorityDiagnosticModel";
export { shouldShowLiveResultAuthorityDiagnostic } from "./liveResultAuthorityDiagnosticModel";

export default function LiveResultAuthorityDiagnostic(props) {
  const model = buildLiveResultAuthorityDiagnosticModel(props);
  return <div className="mt-2 rounded border border-blue-300 bg-blue-50 p-2 font-mono text-[10px] text-slate-700">
    <div><strong>Live result authority</strong></div>
    <div>Job: {model.jobId} | Status: {model.status}</div>
    <div>Stage: {model.lastStage} | Elapsed: {model.elapsed} | Heartbeat age: {model.heartbeatAge}</div>
    <div>Canonical mode: {model.canonicalMode}</div>
    <div>Engine: {model.engineVersion} | Schema: {model.schemaVersion}</div>
    <div>Cache: {model.cacheDecision} | Replacements: {model.replacementCount}</div>
    <div>Request: {model.requestFingerprint}</div>
    <div>Returned: {model.returnedFingerprint}</div>
    <div className={model.terminalError === "—" ? "" : "font-semibold text-rose-700"}>Terminal error: {model.terminalError}</div>
    <div>Selected candidate: {model.selectedCandidateId}</div>
    <div>Profile: {model.profile} | Start: {model.startStrategy} ({model.selectedStart})</div>
    <div>Filter-bank signature: {model.filterBankSignature}</div>
    <div>House-curve candidate max/RMS: {model.houseCurveMax} / {model.houseCurveRms} dB</div>
    <div>Winning candidate max/RMS: {model.winnerMax} / {model.winnerRms} dB</div>
    <div>Selection reason: {model.selectionReason}</div>
    {model.hasCandidate && <div className={model.identityPass ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>Contract/graph/production identity: {model.identityPass ? "PASS" : "FAIL"}</div>}
  </div>;
}