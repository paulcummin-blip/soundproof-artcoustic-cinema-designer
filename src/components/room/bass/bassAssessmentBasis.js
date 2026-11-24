// ADI integration is an explicit applied transaction, never inferred from the
// presence of main speakers, crossover defaults, or a diagnostic run.
export function usesAppliedAdiIntegration(receipt) {
  return !!receipt && ["verifying", "verified"].includes(receipt.status)
    && !!receipt.runId && !!receipt.after?.crossover;
}
