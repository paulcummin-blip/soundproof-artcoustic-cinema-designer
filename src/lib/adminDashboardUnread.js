/**
 * Admin Dashboard unread-activity helpers.
 *
 * Pure presentation-state logic: reads existing timestamped events and compares
 * them against a per-admin "last seen" timestamp stored on the admin's own User
 * record. Never creates, updates, or deletes any incident, audit record, ledger
 * entry, project, or access state. The only write is the current admin's own
 * last-seen timestamp via base44.auth.updateMe.
 */

import { base44 } from '@/api/base44Client';

export const DASHBOARD_SECTIONS = {
  SYSTEM_HEALTH: 'system_health',
  ACCOUNT_ACCESS: 'account_access',
  COMMERCIAL_CONTROL: 'commercial_control',
};

export const SECTION_LAST_SEEN_FIELDS = {
  system_health: 'system_health_last_seen_at',
  account_access: 'account_access_last_seen_at',
  commercial_control: 'commercial_control_last_seen_at',
};

// AccountUserAudit actions that represent meaningful admin/account activity.
// Routine login (USER_LOGIN_RECORDED) and background eligibility noise
// (SOUNDPROOF_ELIGIBILITY_SET, LEGACY_ADMIN_BOOTSTRAPPED, PORTAL_IDENTITY_CLAIMED,
//  PORTAL_ACTIVATION_REQUESTED, INVITED, INVITATION_RESENT, REMOVED) are excluded.
export const ACCOUNT_ACCESS_AUDIT_ACTIONS = [
  'SOUNDPROOF_ENABLE',
  'SOUNDPROOF_TERM_STARTED',
  'SOUNDPROOF_RENEWED',
  'ACCESS_CHANGED',
  'INVITATION_ACCEPTED',
];

// CapacityLedger transaction types that represent meaningful credit activity.
// INTERNAL is excluded — internal/test ledger entries are not dealer activity.
export const ACCOUNT_ACCESS_LEDGER_TYPES = [
  'TRIAL',
  'PURCHASED',
  'UK_TURNOVER_REWARD',
  'ADMIN_GRANT',
  'PROMOTIONAL',
  'PROJECT_ACTIVATION',
  'REVERSAL',
  'DISTRIBUTOR_ALLOCATION',
  'DISTRIBUTOR_RECLAIM',
];

const EPOCH = '2000-01-01T00:00:00.000Z';

function sinceDate(lastSeen) {
  return lastSeen || EPOCH;
}

/**
 * Count distinct SystemHealthIncident records whose last_detected_at is newer
 * than the admin's last-seen timestamp. Test records (test_run_id non-null) are
 * excluded. A repeated occurrence of a grouped incident advances
 * last_detected_at, which makes that incident unread again.
 */
export async function fetchSystemHealthUnreadCount(lastSeen) {
  try {
    const page = await base44.entities.SystemHealthIncident.filter(
      { last_detected_at: { $gt: sinceDate(lastSeen) } },
      { sort: '-last_detected_at', limit: 100 },
    );
    const items = (page?.items || []).filter((i) => !i.test_run_id);
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Count meaningful account-access activity since last seen: qualifying
 * AccountUserAudit actions + qualifying CapacityLedger credit transactions.
 */
export async function fetchAccountAccessUnreadCount(lastSeen) {
  try {
    const since = sinceDate(lastSeen);
    const [auditCount, ledgerCount] = await Promise.all([
      base44.entities.AccountUserAudit.count({
        occurred_at: { $gt: since },
        action: { $in: ACCOUNT_ACCESS_AUDIT_ACTIONS },
      }),
      base44.entities.CapacityLedger.count({
        created_date: { $gt: since },
        transaction_type: { $in: ACCOUNT_ACCESS_LEDGER_TYPES },
      }),
    ]);
    return (typeof auditCount === 'number' ? auditCount : 0)
      + (typeof ledgerCount === 'number' ? ledgerCount : 0);
  } catch {
    return 0;
  }
}

/**
 * Count new non-internal Professional Projects created since last seen.
 * commercial_tier 'PROFESSIONAL' already excludes INTERNAL/test projects.
 */
export async function fetchCommercialControlUnreadCount(lastSeen) {
  try {
    const count = await base44.entities.Project.count({
      commercial_tier: 'PROFESSIONAL',
      created_date: { $gt: sinceDate(lastSeen) },
    });
    return typeof count === 'number' ? count : 0;
  } catch {
    return 0;
  }
}

export async function fetchAllUnreadCounts(lastSeenBySection) {
  const [systemHealth, accountAccess, commercialControl] = await Promise.all([
    fetchSystemHealthUnreadCount(lastSeenBySection.system_health),
    fetchAccountAccessUnreadCount(lastSeenBySection.account_access),
    fetchCommercialControlUnreadCount(lastSeenBySection.commercial_control),
  ]);
  return { systemHealth, accountAccess, commercialControl };
}

/**
 * Read the current admin's three last-seen timestamps from their own User
 * record via base44.auth.me(). Returns nulls when the fields are not yet set.
 */
export async function readLastSeenTimestamps() {
  try {
    const me = await base44.auth.me();
    return {
      system_health: me?.system_health_last_seen_at || null,
      account_access: me?.account_access_last_seen_at || null,
      commercial_control: me?.commercial_control_last_seen_at || null,
    };
  } catch {
    return {
      system_health: null,
      account_access: null,
      commercial_control: null,
    };
  }
}

/**
 * Stamp the current admin's last-seen timestamp for one dashboard section.
 * Only updates the current admin's own User record. Never touches any
 * underlying event record.
 */
export async function markSectionSeen(sectionKey) {
  const field = SECTION_LAST_SEEN_FIELDS[sectionKey];
  if (!field) return null;
  const now = new Date().toISOString();
  await base44.auth.updateMe({ [field]: now });
  return now;
}