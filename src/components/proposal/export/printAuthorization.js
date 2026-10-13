import { withDeadline, PRINT_READINESS_BUDGET_MS } from '@/components/report/printReadiness/readinessContract.js';

/** A late response is ignored by withDeadline, never treated as authorization. */
export async function authorizePrint(invoke, payload, budgetMs = PRINT_READINESS_BUDGET_MS.inputs) {
  try {
    return await withDeadline(Promise.resolve().then(() => invoke(payload)), budgetMs);
  } catch (cause) {
    const error = new Error(cause?.printReadinessTimeout
      ? 'Authorization took too long. Nothing was printed. Choose Retry Export to try again.'
      : 'Authorization could not be completed. Nothing was printed. Choose Retry Export to try again.');
    error.printNotReady = true;
    error.exportBlockedBy = 'edit_layer';
    error.readinessDiagnostics = { kind: 'print_readiness', blockingStage: 'edit_layer',
      conditionNotMet: cause?.printReadinessTimeout ? 'authorization_deadline_exceeded' : 'authorization_failed' };
    throw error;
  }
}