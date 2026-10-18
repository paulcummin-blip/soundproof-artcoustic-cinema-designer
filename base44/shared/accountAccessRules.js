/**
 * accountAccessRules.js (shared)
 * ------------------------------
 * THE PURE DECISION RULES of Sound Proof account access, and nothing else.
 *
 * They were extracted from accountAccessAuthority.js so that a caller which must
 * resolve access by READING ALONE can share the identical rules without importing
 * that module's persistence — its legacy membership bootstrap, its seat and User
 * stamping, and its audit rows. Those stay in accountAccessAuthority.js, whose
 * behaviour is unchanged: every name here is re-exported from it, so no existing
 * importer has to change and there is exactly one implementation of each rule.
 *
 * A rule is a rule: the capability mapping, the access-level normalisation, the
 * account-administrator determination and the seat-status sets are the authority,
 * whichever door a caller reads the records through.
 *
 * Leaf module: imports nothing. No SDK, no clock, no writes.
 */

export const ACCESS_LEVELS = Object.freeze({
  FULL_ACCESS: 'FULL_ACCESS',
  SOUND_PROOF_ONLY: 'SOUND_PROOF_ONLY',
  PRICE_LIST_ONLY: 'PRICE_LIST_ONLY',
});

export const MAX_ACCOUNT_SEATS = 5;

/** The membership roles that make a seat the account's administrator. */
export const ADMIN_MEMBERSHIP_ROLES = new Set(['dealer_admin', 'distributor_admin', 'internal_admin']);

/** The seat statuses that occupy a seat. */
export const ACTIVE_SEAT_STATUSES = new Set(['active', 'pending']);

export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normaliseAccessLevel(value, fallback = ACCESS_LEVELS.FULL_ACCESS) {
  const candidate = String(value || '').trim().toUpperCase();
  return Object.values(ACCESS_LEVELS).includes(candidate) ? candidate : fallback;
}

export function legacyAppRoleForAccess(accessLevel, isAccountAdmin = false) {
  if (isAccountAdmin) return 'Administrator';
  if (accessLevel === ACCESS_LEVELS.FULL_ACCESS) return 'Designer Pro';
  if (accessLevel === ACCESS_LEVELS.SOUND_PROOF_ONLY) return 'Designer Lite';
  return 'Viewer';
}

export function buildCapabilities({ isMasterAdmin, isAccountAdmin, accessLevel }) {
  if (isMasterAdmin) {
    return {
      soundProof: true,
      priceList: true,
      commercial: true,
      manageUsers: true,
      masterAdmin: true,
    };
  }

  return {
    soundProof:
      accessLevel === ACCESS_LEVELS.FULL_ACCESS
      || accessLevel === ACCESS_LEVELS.SOUND_PROOF_ONLY,
    priceList:
      accessLevel === ACCESS_LEVELS.FULL_ACCESS
      || accessLevel === ACCESS_LEVELS.PRICE_LIST_ONLY,
    commercial: accessLevel === ACCESS_LEVELS.FULL_ACCESS,
    manageUsers: isAccountAdmin === true,
    masterAdmin: false,
  };
}

/** The login as every caller is given it. */
export function publicUser(authoritativeUser) {
  return {
    id: authoritativeUser.id,
    email: authoritativeUser.email,
    full_name: authoritativeUser.full_name || null,
    role: authoritativeUser.role,
    territory: authoritativeUser.territory || 'UK',
    account_id: authoritativeUser.account_id || null,
    account_role: authoritativeUser.account_role || 'account_user',
    access_level: authoritativeUser.access_level || ACCESS_LEVELS.FULL_ACCESS,
    app_role: authoritativeUser.app_role || null,
    dealer_account_id: authoritativeUser.dealer_account_id || null,
    dealer_name: authoritativeUser.dealer_name || null,
  };
}

/** One record, read from an entity-access object (a client's `.entities`). */
export async function getSingleFrom(entities, entityName, query) {
  const rows = await entities[entityName].filter(query);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** One record, read from a service-like holder carrying `.entities`. */
export async function getSingle(service, entityName, query) {
  return getSingleFrom(service.entities, entityName, query);
}