/**
 * Pure account-access status derivation, shared by the admin Account Access
 * page logic and the dashboard summary backend function.
 *
 * Mirrors the logic in src/lib/commercial/accountAccessOverview.js. The client
 * cannot import from base44/shared (server-only), so both copies are kept in
 * sync. These functions are pure data — no imports, no side effects.
 */

export const OCCUPIED_STATUSES = ['pending', 'active'];

export function occupiedMembers(members) {
  return (Array.isArray(members) ? members : []).filter((member) =>
    OCCUPIED_STATUSES.includes(member?.status || 'pending')
  );
}

/**
 * Sound Proof eligibility: "Approved" when the admin has set
 * soundproof_eligible. Eligibility never starts the term or activates.
 */
export function soundproofEligibilityState(account) {
  const isEligible = account?.soundproof_eligible === true;
  return {
    label: isEligible ? 'Approved' : 'Not Approved',
    tone: isEligible ? 'ok' : 'muted',
  };
}

/**
 * Activation state — the same labels the Account Access table shows.
 * "Active" means a valid (non-expired) access term with at least one active
 * member. Expired / Suspended / Not Activated / Invitation Pending read
 * distinctly so a partially-active account never counts as live.
 */
export function soundproofActivationState(account, members, nowMs) {
  if (account?.status === 'suspended') return { label: 'Suspended', tone: 'danger' };
  const expiry = account?.soundproof_access_expires_at;
  if (expiry && (account?.status === 'active' || account?.status === 'trial')) {
    if (new Date(expiry).getTime() < (nowMs || Date.now())) return { label: 'Expired', tone: 'warn' };
  }
  if (account?.status === 'inactive') return { label: 'Not Activated', tone: 'muted' };
  const occupied = occupiedMembers(members);
  if (occupied.length === 0) return { label: 'Not Activated', tone: 'muted' };
  const hasActiveMember = occupied.some((m) => (m.status || 'pending') === 'active');
  if (!hasActiveMember) return { label: 'Invitation Pending', tone: 'warn' };
  return { label: 'Active', tone: 'ok' };
}

/**
 * A dealer account is "live" only when BOTH access indicators are green:
 *   1. Approved  (soundproof_eligible === true)
 *   2. Active with a valid access term (activation label === 'Active')
 * Eligibility alone never counts as activation. Pending invitations,
 * incomplete registrations, expired and inactive accounts are excluded.
 */
export function isLiveDealerAccount(account, members, nowMs) {
  if (account?.account_type !== 'dealer') return false;
  if (account?.soundproof_eligible !== true) return false;
  return soundproofActivationState(account, members, nowMs).label === 'Active';
}