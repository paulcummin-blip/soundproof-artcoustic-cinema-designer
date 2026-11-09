// crossQuantityAuditTrail.js
//
// Run-scoped, lightweight audit receipts for cross-quantity V2 candidate
// evaluation. One receipt per candidate-owned finalist records the boundary
// outcomes (admission, transfer, proxy, confirmation, final disposition) so
// a completed run can be diagnosed from retained evidence instead of console
// logs.
//
// The trail is deliberately compact: it stores identity references and
// outcome labels only. It never retains response arrays, curves, tuning
// payloads, or any duplicate of the canonical evidence. It is an audit
// ledger, not a second result authority.
//
// Receipts are keyed by finalistId. A cross-quantity candidate is one whose
// subwoofer quantity differs from the installed design; the trail records
// only those candidates (same-quantity candidates are covered by the existing
// engine diagnostics).

/**
 * Create a run-scoped cross-quantity audit trail.
 * @param {string|null} runId — the run's own identity (params.runId)
 * @returns {object} trail API
 */
export function createCrossQuantityAuditTrail(runId) {
  const receipts = new Map();
  let admittedScope = [];

  function ensure(finalistId, quantity) {
    let r = receipts.get(finalistId);
    if (!r) {
      r = {
        finalistId,
        quantity: quantity ?? null,
        sourceCount: null,
        sourceIds: [],
        admission: null,
        transfer: null,
        proxy: null,
        confirmationSubmitted: false,
        confirmationResult: null,
        receiptRef: null,
        finalDisposition: null,
      };
      receipts.set(finalistId, r);
    }
    return r;
  }

  return {
    recordScope(quantities) {
      admittedScope = Array.isArray(quantities) ? [...quantities] : [];
    },
    recordAdmission(finalistId, quantity, sourceCount, sourceIds, reason) {
      const r = ensure(finalistId, quantity);
      r.quantity = quantity ?? r.quantity;
      r.sourceCount = sourceCount ?? r.sourceCount;
      if (Array.isArray(sourceIds)) r.sourceIds = [...sourceIds];
      r.admission = reason || "admitted";
    },
    recordTransfer(finalistId, outcome, reason) {
      const r = ensure(finalistId, null);
      r.transfer = reason ? `${outcome}:${reason}` : outcome;
    },
    recordProxy(finalistId, outcome, reason) {
      const r = ensure(finalistId, null);
      r.proxy = reason ? `${outcome}:${reason}` : outcome;
    },
    recordConfirmation(finalistId, outcome, receiptRef) {
      const r = ensure(finalistId, null);
      r.confirmationSubmitted = true;
      r.confirmationResult = outcome;
      if (receiptRef) r.receiptRef = receiptRef;
    },
    recordNotPromoted(finalistId) {
      const r = ensure(finalistId, null);
      if (!r.confirmationSubmitted && !r.finalDisposition) {
        r.finalDisposition = "not-promoted";
      }
    },
    recordDisposition(finalistId, disposition) {
      const r = ensure(finalistId, null);
      r.finalDisposition = disposition;
    },
    has(finalistId) { return receipts.has(finalistId); },
    snapshot() {
      return {
        runId: runId || null,
        admittedScope,
        receipts: Array.from(receipts.values()),
      };
    },
  };
}