/**
 * frozenBassAuthorityVerification.js
 * -----------------------------------
 * Verify publication-retained bass evidence against the matching complete
 * saved cache contract and authority receipt.
 *
 * The frozen report reader must not accept a retained evidence block on
 * trust alone. It verifies that:
 *   1. A complete saved cache contract exists for the publication's bass
 *      fingerprint.
 *   2. The contract's own resultFingerprint matches the publication's bass
 *      fingerprint.
 *   3. The contract passes the full authoritative bass contract gate
 *      (injected by the caller so this module stays pure and testable).
 *   4. The publication's retained evidence (when present) matches the same
 *      calculation — its fingerprint agrees and its graph payload's key
 *      curves match the cache contract's.
 *
 * Only when all four hold is the frozen bass authority verified.
 *
 * Pure: no React, no fetching, no side effects, no external imports.
 */

function curveKeysMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    const pb = b[i];
    if (!pa || !pb) return false;
    if (![pa.frequency, pb.frequency, pa.spl, pb.spl].every(v => typeof v === 'number' && Number.isFinite(v))) return false;
    if (Math.abs(Number(pa.frequency) - Number(pb.frequency)) > 0.001) return false;
    if (Math.abs(Number(pa.spl) - Number(pb.spl)) > 0.001) return false;
  }
  return true;
}

/**
 * @param {Array<object>|null} rows - ProjectAnalysisCache records
 * @param {object|null} publication - the engineering publication
 * @param {Function|null} [isAuthoritative] - injected authority predicate
 *   (the real isAuthoritativeBassContract, passed by frozenReportBass.js)
 * @returns {{ verified: boolean, reason: string|null, contract: object|null }}
 */
export function verifyFrozenBassAuthority(rows, publication, isAuthoritative = null) {
  const bassFp = publication?.provenance?.bass_fingerprint || null;
  if (!bassFp) {
    return { verified: false, reason: 'no-bass-fingerprint', contract: null };
  }

  const cacheRows = Array.isArray(rows) ? rows : [];

  // 1. Find the matching complete cache contract for this fingerprint.
  let matchingContract = null;
  for (const row of cacheRows) {
    if (!row) continue; // A frozen report may reference a completed contract after the live design moved on.
    const cbf = row.completed_by_fingerprint;
    if (!cbf || typeof cbf !== 'object') continue;
    const contract = cbf[bassFp];
    if (!contract || typeof contract !== 'object') continue;
    const contractResultFp = contract?.job?.resultFingerprint || null;
    if (contractResultFp !== bassFp) continue;
    matchingContract = contract;
    break;
  }

  if (!matchingContract && publication?.bass_evidence?.authorityContract) {
    const retained = publication.bass_evidence;
    matchingContract = { ...retained.authorityContract, graphPayload: retained.graphPayload };
    if (retained.fingerprint !== bassFp || matchingContract.job?.resultFingerprint !== bassFp)
      return { verified: false, reason: 'retained-fingerprint-mismatch', contract: null };
  }
  if (!matchingContract) {
    return { verified: false, reason: 'no-matching-complete-contract', contract: null };
  }

  // 2. Verify the contract passes the full authority gate.
  if (typeof isAuthoritative === 'function' && !isAuthoritative(matchingContract)) {
    return { verified: false, reason: 'contract-not-authoritative', contract: matchingContract };
  }

  // 3. Verify the retained publication evidence (when present) matches.
  const retained = publication?.bass_evidence;
  if (retained && typeof retained === 'object') {
    if (retained.fingerprint !== bassFp) {
      return { verified: false, reason: 'retained-fingerprint-mismatch', contract: matchingContract };
    }
    const retainedGraph = retained.graphPayload;
    const contractGraph = matchingContract?.graphPayload;
    if (retainedGraph && contractGraph) {
      if (!curveKeysMatch(retainedGraph.postEqRspCurve, contractGraph.postEqRspCurve)) {
        return { verified: false, reason: 'retained-graph-mismatch', contract: matchingContract };
      }
    }
  }

  return { verified: true, reason: null, contract: matchingContract };
}

export default verifyFrozenBassAuthority;