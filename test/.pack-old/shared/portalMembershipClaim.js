/**
 * Portal seat claim by invited email — the non-pilot route.
 *
 * Every Sound Proof account except the pinned iCubed pilot claims its
 * administrator seat by matching the invitation email. Ambiguous, foreign or
 * already-claimed seats fail closed here. The pilot never reaches this module:
 * it claims from the verified launch binding instead.
 */

import { hasText, normaliseEmail, uniqueRows } from './portalPrimitives.js';
import { recordPortalLaunchDiagnostic } from './portalLaunchDiagnostics.js';

function isPortalAdministratorMembership(membership) {
  return (
    membership?.is_account_admin === true
    && membership?.membership_role === 'dealer_admin'
    && membership?.access_level === 'FULL_ACCESS'
  );
}

export async function resolveOrClaimPortalAdministratorMembership(
  service,
  base44User,
  accountId,
) {
  const accountMemberships = await uniqueRows(
    service.entities.AccountMembership,
    { account_id: accountId },
  );

  const linked = accountMemberships.filter(
    (membership) => membership?.user_id === base44User.id,
  );
  if (linked.length > 1) throw new Error('PORTAL_MEMBERSHIP_AMBIGUOUS');
  if (linked.length === 1) {
    const membership = linked[0];
    if (
      !['pending', 'active'].includes(membership.status)
      || !isPortalAdministratorMembership(membership)
    ) {
      throw new Error('PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED');
    }
    return { membership, claimed: false };
  }

  const email = normaliseEmail(base44User?.email);
  if (!hasText(email)) throw new Error('PORTAL_MEMBERSHIP_EMAIL_REQUIRED');

  const membershipsForEmail = await uniqueRows(
    service.entities.AccountMembership,
    { email },
  );
  if (membershipsForEmail.some(
    (membership) => membership?.user_id && membership.user_id !== base44User.id,
  )) {
    throw new Error('PORTAL_MEMBERSHIP_ALREADY_CLAIMED');
  }
  if (membershipsForEmail.some(
    (membership) => membership?.account_id !== accountId,
  )) {
    throw new Error('PORTAL_MEMBERSHIP_ACCOUNT_MISMATCH');
  }

  const unclaimedAdministrators = accountMemberships.filter(
    (membership) =>
      membership?.status === 'pending'
      && !membership?.user_id
      && isPortalAdministratorMembership(membership),
  );
  if (unclaimedAdministrators.length > 1) {
    throw new Error('PORTAL_MEMBERSHIP_AMBIGUOUS');
  }

  const candidates = unclaimedAdministrators.filter(
    (membership) => normaliseEmail(membership?.email) === email,
  );
  if (candidates.length !== 1) {
    if (unclaimedAdministrators.length === 1) {
      await recordPortalLaunchDiagnostic(service, {
        event: 'PORTAL_MEMBERSHIP_EMAIL_MISMATCH',
        reason: 'PORTAL_MEMBERSHIP_EMAIL_MISMATCH',
        base44User,
        accountId,
        membershipId: unclaimedAdministrators[0]?.id || null,
        details: {
          seat_email: normaliseEmail(unclaimedAdministrators[0]?.email) || null,
          base44_user_email: email,
          claim_route: 'invited_email_match',
        },
      });
      throw new Error('PORTAL_MEMBERSHIP_EMAIL_MISMATCH');
    }
    throw new Error('PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED');
  }

  const membership = await service.entities.AccountMembership.update(
    candidates[0].id,
    { user_id: base44User.id },
  );
  return { membership, claimed: true };
}