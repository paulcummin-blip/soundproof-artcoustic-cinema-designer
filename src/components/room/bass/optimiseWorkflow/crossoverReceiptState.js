// Shared read-only ownership for the joint recommendation and its parent panel.
// An intentional Apply changes the fingerprint; that is not missing run evidence.
export function resolveCrossoverReceiptState({
 record, plan, latestRun, versionId, projectId, fingerprint, operation = null,
 runStatus = "idle", calculationInProgress = false,
}) {
 const hidden = reason => ({ ownsPanel:false, canApply:false, state:"hidden", reason });
 if (!record?.candidate || record.versionId !== versionId || record.status === "dismissed") return hidden("receipt-scope");
 if (!plan || plan.projectId !== projectId || plan.versionId !== versionId) return hidden("plan-scope");
 if (runStatus === "running" || runStatus === "failed" ||
     (latestRun?.runId && latestRun.runId !== plan.run?.runId)) return hidden("latest-run");
 if (plan.run?.terminal !== true || plan.run?.outcome !== "actionable_plan_produced" ||
     plan.terminalOutcome || plan.baselineParity?.status !== "MATCH") return hidden("run-evidence");
 // Legacy receipts are bound by BOTH exact baseline and candidate identity;
 // new receipts additionally carry the producing run ID.
 if ((record.runId && record.runId !== plan.run?.runId) ||
     record.baselineCacheKey !== plan.designFingerprint ||
     record.candidateId !== plan.candidateId ||
     record.candidateId !== plan.run?.winnerCandidateId) return hidden("receipt-run-mismatch");
 const c=record.candidate;
 const seatIds=(plan.baseline?.seats || []).map(s=>s.seatId);
 if (c.integrationVerified !== true || !c.crossover || !c.appliedTuning?.length ||
     !["achievedP19VariationDb","achievedP20VariationDb","p14AchievedDb","achievedP18Hz"].every(k=>Number.isFinite(c[k])) ||
     !seatIds.length || c.perSeatP20?.length !== seatIds.length ||
     !seatIds.every(id=>c.perSeatP20.some(s=>s.seatId===id && Number.isFinite(s.variationDbRaw)))) return hidden("candidate-evidence");
 const active = operation?.versionId === versionId && operation?.projectId === projectId &&
   operation?.candidateId === record.candidateId && operation?.baselineCacheKey === record.baselineCacheKey;
 let state;
 if (active) state=operation.kind === "restore" ? "restoring" : "applying";
 else if (["applying","restoring","verification-required"].includes(record.status)) state="verification-required";
 else if (record.status === "applied" && record.appliedCacheKey === fingerprint) state="applied";
 else if (["recommended","restored"].includes(record.status) &&
    (record.baselineCacheKey === fingerprint || (record.status === "restored" && record.appliedCacheKey === fingerprint))) state="recommended";
 else return hidden("fingerprint");
 return { ownsPanel:true, state, canApply:state==="recommended" && !calculationInProgress,
   runId:plan.run.runId, operationActive:!!active };
}
