import React from "react";
import { HOUSE_CURVE_ENGINE_VERSION } from "./bassResultAuthority";

const fmt = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";

export default function LiveResultAuthorityDiagnostic({ result, contract, graphCandidateId, lifecycle }) {
  const candidate = result?.selectedCandidate;
  const comparison = result?.selectionDiagnostics?.houseCurveCandidateComparison;
  const identityPass = !!result?.selectedCandidateId
    && result.selectedCandidateId === contract?.selectedCandidateId
    && result.selectedCandidateId === graphCandidateId
    && result.selectedCandidateId === result.productionCandidateId;
  return <div className="mt-2 rounded border border-blue-300 bg-blue-50 p-2 font-mono text-[10px] text-slate-700">
    <div><strong>Live result authority</strong></div>
    <div>Job: {lifecycle?.activeJobId || "—"} | Status: {lifecycle?.workerStatus || lifecycle?.status || "—"}</div>
    <div>Stage: {lifecycle?.progressStage || "—"} | Heartbeat age: {fmt((lifecycle?.lastHeartbeatAgeMs || 0) / 1000)} s</div>
    <div>Canonical mode: {result?.selectedMode || lifecycle?.requestIdentity?.canonicalPriorityMode || "—"} | Engine: {lifecycle?.requestIdentity?.engineVersion || HOUSE_CURVE_ENGINE_VERSION}</div>
    <div>Cache: {result?.cacheSource || lifecycle?.cacheStatus || "fresh"} | Replacements: {lifecycle?.replacementRunCount || 0}</div>
    <div>Request: {lifecycle?.currentJobFingerprint || "—"}</div>
    <div>Returned: {lifecycle?.returnedFingerprint || "—"}</div>
    <div>Selected candidate: {result?.selectedCandidateId || "—"}</div>
    <div>Profile: {candidate?.designEqFitProfile || "—"} | Start: {candidate?.startStrategy || "—"} ({candidate?.selectedStart || "—"})</div>
    <div>Filter-bank signature: {candidate?.filterBankSignature || "—"}</div>
    {lifecycle?.errorMessage && <div className="font-semibold text-rose-700">Terminal error: {lifecycle.errorMessage}</div>}
    <div>House-curve candidate max/RMS: {fmt(comparison?.houseCurve?.max)} / {fmt(comparison?.houseCurve?.rms)} dB</div>
    <div>Winning candidate max/RMS: {fmt(comparison?.winner?.max)} / {fmt(comparison?.winner?.rms)} dB</div>
    <div>Selection reason: {result?.selectionReason || "—"}</div>
    {candidate && <div className={identityPass ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>Contract/graph/production identity: {identityPass ? "PASS" : "FAIL"}</div>}
  </div>;
}