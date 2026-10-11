import { CALIBRATION_APPLY_DECISION } from '@/components/room/bass/optimiseWorkflow/adiCalibrationAutoApplyAuthority.js';

export const CALIBRATION_AWAITING_APPLICATION = 'Not applied because this saved run evaluated the calibration but did not apply it.';

/** Read the actual saved application state, never mistake eligibility for application. */
export default function savedCalibrationDecision(plan) {
  const decision = plan?.calibrationDecision || null;
  if (!decision || decision.decision !== CALIBRATION_APPLY_DECISION.APPLIED || plan.decisionApplied === true) return decision;
  return { ...decision, decision: CALIBRATION_APPLY_DECISION.HOLD, statement: CALIBRATION_AWAITING_APPLICATION };
}

export function savedCalibrationCandidates(decision, applied) {
  return (decision?.candidateDecisions || []).map((candidate) => ({
    ...candidate,
    applied: candidate.applied === true && applied === true,
    outcome: candidate.applied === true && applied === true ? 'applied'
      : candidate.decisionRecord?.tradeOffDecision === 'reject-trade-off-exceeds-the-improvement' ? 'rejected' : 'held',
    statement: candidate.applied === true && applied !== true ? CALIBRATION_AWAITING_APPLICATION : candidate.statement,
  }));
}