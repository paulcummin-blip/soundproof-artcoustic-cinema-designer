import React from "react";
import DiagnosticSection from "@/components/room/bass/design-eq-lifecycle/DiagnosticSection";
import DiagnosticTable, { fmt, text } from "@/components/room/bass/design-eq-lifecycle/DiagnosticTable";
import { FILTER_COLUMNS } from "@/components/room/bass/design-eq-lifecycle/FinalBankSection";

export default function GraphHandoffSection({ model }) {
  const { finalResponse, handedOffFilters, maximumCurveDifferenceDb, graphCandidateId, graphFilterBankSignature } = model;
  return <DiagnosticSection title="5. Graph handoff"><div className="grid gap-1 font-mono text-[10px] sm:grid-cols-2">
    <span>Selected candidate ID: <strong>{text(finalResponse?.selectedCandidateId)}</strong></span><span>Final bank signature: <strong>{text(finalResponse?.filterBankSignature)}</strong></span>
    <span>Enabled filters passed into post-EQ curve builder: <strong>{handedOffFilters.length}</strong></span><span>Maximum pre/post difference: <strong>{fmt(maximumCurveDifferenceDb)} dB</strong></span>
    <span>Graph candidate ID: <strong>{text(graphCandidateId)}</strong></span><span>Graph bank signature: <strong>{text(graphFilterBankSignature)}</strong></span>
  </div><DiagnosticTable rows={handedOffFilters} columns={FILTER_COLUMNS} /></DiagnosticSection>;
}