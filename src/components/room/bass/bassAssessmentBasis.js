// Ordinary subwoofer authority never depends on ADI execution or LCR inputs.
// This advisory concerns only a previously verified integration assessment.
function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+stable(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
export function adiIntegrationNeedsReview(receipt, currentIdentity) {
  const verified = receipt?.status === "verified" ? receipt : receipt?.restoreReceipt;
  if (verified?.status !== "verified") return false;
  if (!verified.integrationIdentity) return !!verified.physicalContext?.integrationContext;
  return stable(verified.integrationIdentity) !== stable(currentIdentity);
}
