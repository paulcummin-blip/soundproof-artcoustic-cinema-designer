import React from "react";
import { useBassReconciliationStatus } from "@/components/room/bass/bassReconciliationStatus";

export default function BassReconciliationDiagnosticRows({ projectId, versionId, gateResult }) {
  const status = useBassReconciliationStatus(projectId, versionId);
  const text = (value) => value == null ? "not observed" : typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  const rows = [
    ["reconciliation_mounted", status.hookMounted === true],
    ["reconciliation_mount", "useVersionedEngineeringAuthority → useSharedBassAuthorityReconciliation"],
    ["reconciliation_project_id", projectId], ["reconciliation_version_id", versionId],
    ["design_state_received", status.designStateReceived],
    ["target_bank_received", status.targetBankReceived], ["completed_bass_row_received", status.bassRowReceived],
    ["identityReady", status.identityReady], ["inputsValid", status.inputsValid],
    ["inputsValid_note", "Simulation-curve readiness; not required for identity-only reconciliation"],
    ["cache_key_built", status.cacheKeyBuilt], ["rebuilt_fingerprint", status.cacheKey],
    ["reconciliation_ran", status.ran === true], ["reconciliation_result", status.reason || (status.matched ? "matched" : "awaiting context")],
    ["target_bank_count", status.bankTargetCount], ["match_found", status.matched],
    ["match_source", status.matchSource], ["matched_fingerprint", status.matchedFingerprint],
    ["selected_bank_fingerprint", status.selectedBankFingerprint],
    ["live_base_fingerprint", status.baseDesignFingerprint], ["bank_base_fingerprint", status.bankBaseDesignFingerprint],
    ["identity_missing", status.identityMissing?.join(", ") || "none"],
    ["write_attempted", status.writeAttempted === true], ["write_succeeded", status.writeSucceeded],
    ["write_error", status.writeError || "none"],
    ["authority_status_before", status.authorityStatusBefore], ["authority_status_after", status.authorityStatusAfter],
    ["visual_or_technical_gate_result", gateResult],
  ];
  return <div data-bass-reconciliation-diagnostics="true">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-0.5 break-all"><span className="text-muted-foreground">{label}</span><span>{text(value)}</span></div>)}</div>;
}