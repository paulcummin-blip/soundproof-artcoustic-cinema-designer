/**
 * listenerLevelSurroundRoles.js
 * -----------------------------
 * The ONE authority for which listener-level (bed-layer) surround speakers
 * contribute to the RP22 surround-consistency assessment (P6), and for
 * resolving the stored role label of each one to a single canonical identity.
 *
 * P6 must assess every EXPLICITLY INSTALLED listener-level surround speaker —
 * the bed-layer sides (including numbered additional pairs), the rear pair and
 * the front wides — not a fixed six-role list.
 *
 * Identity rules (no second identity system is introduced — the stored speaker
 * record's own role label is the identity, resolved through the app's existing
 * canonical role map `surroundRoleMap`):
 *
 *   - Alternative stored labels resolve to their canonical role:
 *       LS  -> SL          RS  -> SR
 *       LR / RSL / RL / BL / LB / LBS / LBR -> SBL
 *       RR / RSR / BR / RB / RBS / RBR      -> SBR
 *       FWL -> LW          FWR -> RW
 *   - A numbered side surround is a DISTINCT physical speaker (SL2, SR2, SL3…),
 *     except the redundant first-pair labels SL1 / SR1, which are the same
 *     physical position as SL / SR.
 *
 * Deduplication is therefore by canonical identity: two labels for one physical
 * position (SBL and LR) count once, while SL and SL2 count separately.
 *
 * This module is pure and dependency-light (canonical role map only), so it is
 * safe to import from both the SPL engine and the RP22 analysis engine.
 */

import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

/** Canonical listener-level surround roles P6 always considers. */
export const LISTENER_LEVEL_SURROUND_ROLES = Object.freeze([
  "SL", "SR", "SBL", "SBR", "LW", "RW",
]);

const LISTENER_LEVEL_SURROUND_ROLE_SET = new Set(LISTENER_LEVEL_SURROUND_ROLES);

// Additional numbered side-surround pairs: SL2/SR2, SL3/SR3, ...
const NUMBERED_SIDE_RE = /^(SL|SR)(\d+)$/;

/**
 * Canonical identity of a stored listener-level role label.
 * Returns the uppercase label unchanged when it is not a surround role.
 *
 * @param {string} role - raw stored role (any alias form)
 * @returns {string} canonical role
 */
export function canonicalListenerLevelRole(role) {
  const raw = String(role || "").trim().toUpperCase();
  if (!raw) return raw;

  // Redundant first-pair labels are the base pair, not a second speaker.
  const numbered = raw.match(NUMBERED_SIDE_RE);
  if (numbered) {
    const [, base, index] = numbered;
    return index === "1" ? base : `${base}${index}`;
  }

  // Everything else (LS/RS, LR/RR, LRS/RRS, RL/BL..., FWL/FWR) resolves
  // through the app's existing canonical role map.
  return getCanonicalRole(raw);
}

/**
 * Whether a stored role is an eligible listener-level surround for P6.
 * Eligibility is judged on the canonical identity, so aliases qualify.
 */
export function isListenerLevelSurroundRole(role) {
  const canonical = canonicalListenerLevelRole(role);
  if (!canonical) return false;
  if (LISTENER_LEVEL_SURROUND_ROLE_SET.has(canonical)) return true;
  // Numbered additional side pairs (SL2/SR2 and above).
  return /^(SL|SR)[2-9]\d*$/.test(String(canonical));
}

/**
 * Resolve the seat's and the RSP's listener-level surround SPL maps into one
 * normalised entry per canonical role.
 *
 * Each installed physical speaker contributes ONCE: labels that resolve to the
 * same canonical identity are collapsed to a single entry, while genuinely
 * distinct speakers (SL and SL2) remain separate. A speaker contributes only
 * when it has a finite SPL at BOTH the evaluated seat and the RSP — the
 * existing same-speaker RSP-normalisation rule is unchanged.
 *
 * @param {Object} input
 * @param {Object} input.seatListeners - seat SPL map: { role: { value } }
 * @param {Object} input.rspListeners  - RSP SPL map:  { role: { value } }
 * @returns {{normalizedByRole:Object, seatByRole:Object, rspByRole:Object, rolesUsed:string[]}}
 */
export function resolveP6Listeners({ seatListeners, rspListeners } = {}) {
  const normalizedByRole = {};
  const seatByRole = {};
  const rspByRole = {};

  if (!seatListeners || !rspListeners) {
    return { normalizedByRole, seatByRole, rspByRole, rolesUsed: [] };
  }

  const seen = new Set();
  const keys = [
    ...Object.keys(seatListeners),
    ...Object.keys(rspListeners),
  ];

  for (const key of keys) {
    if (!isListenerLevelSurroundRole(key)) continue;

    const canonical = canonicalListenerLevelRole(key);
    // One physical position, one entry. This is what prevents an aliased
    // duplicate of the same speaker from being counted twice.
    if (seen.has(canonical)) continue;

    const seatVal = seatListeners[key]?.value;
    const rspVal = rspListeners[key]?.value;
    if (!Number.isFinite(seatVal) || !Number.isFinite(rspVal)) continue;

    seen.add(canonical);
    normalizedByRole[canonical] = seatVal - rspVal;
    seatByRole[canonical] = seatVal;
    rspByRole[canonical] = rspVal;
  }

  return {
    normalizedByRole,
    seatByRole,
    rspByRole,
    rolesUsed: Object.keys(normalizedByRole),
  };
}