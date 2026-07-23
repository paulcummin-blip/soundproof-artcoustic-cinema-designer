export function buildBassCapabilityReceiptDiagnostics(activeSubs = []) {
  return activeSubs.map((sub, index) => {
    const capability = sub?.bassCapability;
    const responsePoints = Array.isArray(capability?.frequencyResponseCurve) ? capability.frequencyResponseCurve : [];
    const maxSPLPoints = Array.isArray(capability?.maxSPLCurve) ? capability.maxSPLCurve : [];
    return {
      sourceId: sub?.id || `sub-${index + 1}`,
      modelName: sub?.modelKey || sub?.model || "Unknown",
      usableLF_neg6dB: Number.isFinite(capability?.usableLF_neg6dB) ? capability.usableLF_neg6dB : null,
      frequencyResponseCurvePoints: responsePoints.length,
      maxSPLCurvePoints: maxSPLPoints.length,
      maxSPL: Number.isFinite(capability?.maxSPL) ? capability.maxSPL : null,
      received: !!capability && responsePoints.length > 0,
    };
  });
}