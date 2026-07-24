import React from "react";
import { buildDesignEqLifecycleModel } from "@/components/room/bass/design-eq-lifecycle/designEqLifecycleModel";
import DetectedRegionsSection from "@/components/room/bass/design-eq-lifecycle/DetectedRegionsSection";
import CandidateAcceptanceSection from "@/components/room/bass/design-eq-lifecycle/CandidateAcceptanceSection";
import CandidateSelectionSection from "@/components/room/bass/design-eq-lifecycle/CandidateSelectionSection";
import FinalBankSection from "@/components/room/bass/design-eq-lifecycle/FinalBankSection";
import GraphHandoffSection from "@/components/room/bass/design-eq-lifecycle/GraphHandoffSection";
import ProtectedNullRegionsSection from "@/components/room/bass/design-eq-lifecycle/ProtectedNullRegionsSection";

export default function DesignEqLifecycleDiagnostic(props) {
  const model = buildDesignEqLifecycleModel(props);
  return <details open className="mt-3 rounded border-2 border-slate-500 bg-slate-50 p-3 text-xs">
    <summary className="cursor-pointer font-semibold text-slate-900">Temporary Design EQ lifecycle diagnostic</summary>
    <div className="mt-2 rounded border border-slate-300 bg-white p-2 font-mono text-[11px]"><strong>First empty stage:</strong> {model.firstEmptyStage}</div>
    <ProtectedNullRegionsSection rows={model.protectedNullRegions} />
    <DetectedRegionsSection rows={model.regions} />
    <CandidateAcceptanceSection rows={model.acceptance} />
    <CandidateSelectionSection selections={model.selections} sortedRows={model.sortedRows} />
    <FinalBankSection bank={model.bank} enabledBank={model.enabledBank} stopReason={model.candidate?.designEqStopReason} />
    <GraphHandoffSection model={model} />
  </details>;
}