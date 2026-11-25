import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  isLiveDealerAccount,
  soundproofActivationState,
} from '../../shared/accountAccessStatus.js';

/**
 * getAccountAccessDashboardSummary
 *
 * Lightweight aggregated summary of dealer adoption and activity for the
 * Admin Dashboard "Account Access & Credits" card. Admin-only. Read-only: never
 * creates, updates, or deletes any account, membership, project, ledger or
 * audit record. The only write is the admin's own last-seen timestamp, handled
 * elsewhere by markSectionSeen when the full Account Access page is opened.
 *
 * Returns a compact set of counts computed from the same authoritative status
 * logic as the Account Access page:
 *   liveDealerAccounts     — dealer accounts with BOTH indicators green
 *                            (Approved + Active, valid access term)
 *   newlyActivated         — accounts that became fully live since lastSeen
 *   newAccounts            — new dealer accounts created since lastSeen
 *   newIncompleteActivations — accounts that started activation since lastSeen
 *                              but have not yet achieved both green indicators
 *   lostActiveAccess       — previously-live dealer accounts that are no longer
 *                            live, due to expiry or suspension since lastSeen
 *   newDealerProjects      — genuinely new projects created by dealer accounts
 *                            since lastSeen (excludes internal/platform-admin)
 *
 * lastSeen is read from the admin's own User.account_access_last_seen_at, the
 * same per-admin timestamp the existing unread infrastructure uses. It is
 * stamped by markSectionSeen when the full Account Access page opens — never by
 * the dashboard itself — so opening/refreshing the dashboard never resets the
 * activity counters.
 */

const EPOCH = '2000-01-01T00:00:00.000Z';

// AccountUserAudit actions that represent genuine activation or access-change
// activity. Used to detect newly-started (but incomplete) activations and
// lost-access events since the last visit.
const ACTIVATION_AUDIT_ACTIONS = [
  'SOUNDPROOF_ENABLE',
  'SOUNDPROOF_TERM_STARTED',
  'SOUNDPROOF_RENEWED',
  'ACCESS_CHANGED',
  'INVITATION_ACCEPTED',
  'INVITED',
];
const SUSPEND_AUDIT_ACTION = 'SOUNDPROOF_SUSPEND';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const sessionUser = await base44.auth.me().catch((e: any) =>
      e?.status === 401 ? null : Promise.reject(e)
    );
    if (!sessionUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (sessionUser.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lastSeen =
      (sessionUser as any)?.account_access_last_seen_at ||
      (sessionUser as any)?.data?.account_access_last_seen_at ||
      null;
    const since = lastSeen || EPOCH;
    const nowMs = Date.now();

    // Parallel service-role reads. Each is bounded; audits and projects are
    // filtered to records newer than lastSeen so the payload stays small.
    const [accountsPage, membershipsPage, auditPage, projectsPage] =
      await Promise.all([
        base44.asServiceRole.entities.Account.filter(
          { account_type: 'dealer' },
          { sort: '-created_date', limit: 500 }
        ),
        base44.asServiceRole.entities.AccountMembership.filter(
          {},
          { sort: '-created_date', limit: 1000 }
        ),
        base44.asServiceRole.entities.AccountUserAudit.filter(
          {
            occurred_at: { $gt: since },
            action: { $in: [...ACTIVATION_AUDIT_ACTIONS, SUSPEND_AUDIT_ACTION] },
          },
          { sort: '-occurred_at', limit: 500 }
        ),
        base44.asServiceRole.entities.Project.filter(
          { created_date: { $gt: since } },
          { sort: '-created_date', limit: 500 }
        ),
      ]);

    const accounts = (accountsPage?.items || []).filter(
      (a: any) =>
        a?.account_type === 'dealer' &&
        a?.dealer_group !== 'INTERNAL'
    );
    const memberships = membershipsPage?.items || [];
    const audits = auditPage?.items || [];
    const recentProjects = projectsPage?.items || [];

    // Index memberships by account_id (same rule as the access page).
    const membersByAccount = new Map<string, any[]>();
    for (const m of memberships) {
      const aid = (m as any)?.account_id;
      if (!aid) continue;
      if (!membersByAccount.has(aid)) membersByAccount.set(aid, []);
      membersByAccount.get(aid)!.push(m);
    }

    const sinceMs = new Date(since).getTime();

    // Account-ids with activation-related membership activity since lastSeen
    // (new invitation sent, invitation accepted, or membership created).
    const membershipActivityAccounts = new Set<string>();
    for (const m of memberships) {
      const aid = (m as any)?.account_id;
      if (!aid) continue;
      const created = (m as any)?.created_date;
      const invited = (m as any)?.invited_at;
      const accepted = (m as any)?.accepted_at;
      const stamps = [created, invited, accepted]
        .filter(Boolean)
        .map((v) => new Date(v).getTime());
      if (stamps.some((ms) => Number.isFinite(ms) && ms > sinceMs)) {
        membershipActivityAccounts.add(aid);
      }
    }

    // Account-ids with activation/suspension audit activity since lastSeen.
    const activationAuditAccounts = new Set<string>();
    const suspendAuditAccounts = new Set<string>();
    for (const a of audits) {
      const aid = (a as any)?.account_id;
      if (!aid) continue;
      const action = (a as any)?.action;
      if (ACTIVATION_AUDIT_ACTIONS.includes(action)) {
        activationAuditAccounts.add(aid);
      }
      if (action === SUSPEND_AUDIT_ACTION) {
        suspendAuditAccounts.add(aid);
      }
    }

    let liveDealerAccounts = 0;
    let newlyActivated = 0;
    let newAccounts = 0;
    let newIncompleteActivations = 0;
    let lostActiveAccess = 0;

    for (const account of accounts) {
      const members = membersByAccount.get(account.id) || [];
      const live = isLiveDealerAccount(account, members, nowMs);

      if (live) {
        liveDealerAccounts += 1;
        // Newly activated: became fully live since lastSeen.
        const activatedAt = (account as any)?.first_activated_at;
        if (activatedAt) {
          const ms = new Date(activatedAt).getTime();
          if (Number.isFinite(ms) && ms > sinceMs) {
            newlyActivated += 1;
          }
        }
      }

      // New dealer accounts created since lastSeen.
      const createdAt = (account as any)?.created_date;
      if (createdAt) {
        const ms = new Date(createdAt).getTime();
        if (Number.isFinite(ms) && ms > sinceMs) {
          newAccounts += 1;
        }
      }

      if (!live) {
        const activationLabel = soundproofActivationState(
          account,
          members,
          nowMs
        ).label;
        const firstActivatedAt = (account as any)?.first_activated_at
          ? new Date((account as any).first_activated_at).getTime()
          : null;
        const wasActivatedBefore = firstActivatedAt !== null;

        // New incomplete activations: started activation since lastSeen but not
        // yet fully live. Detected via recent membership activity or a recent
        // activation audit. Does not count all stale inactive eligible
        // accounts — only those with genuine new activity since lastSeen.
        const startedSince =
          membershipActivityAccounts.has(account.id) ||
          activationAuditAccounts.has(account.id);
        if (startedSince) {
          newIncompleteActivations += 1;
        }

        // Lost active access: was previously live (first_activated_at set) and
        // is no longer live, due to expiry or suspension since lastSeen.
        if (wasActivatedBefore) {
          const expiry = (account as any)?.soundproof_access_expires_at;
          let expiredSince = false;
          if (expiry) {
            const expMs = new Date(expiry).getTime();
            if (
              Number.isFinite(expMs) &&
              expMs < nowMs &&
              expMs > sinceMs
            ) {
              expiredSince = true;
            }
          }
          const suspendedSince = suspendAuditAccounts.has(account.id);
          // An expired or suspended account that was activated before counts as
          // lost access only if the expiry/suspension happened since lastSeen.
          if (
            (activationLabel === 'Expired' && expiredSince) ||
            (activationLabel === 'Suspended' && suspendedSince)
          ) {
            lostActiveAccess += 1;
          }
        }
      }
    }

    // New dealer projects: genuinely new projects (created_date) by dealer
    // accounts, excluding internal/platform-admin projects. Design
    // variations, report generations and updates to existing projects are
    // excluded because they update existing records, not create new ones.
    const dealerAccountIds = new Set(accounts.map((a: any) => a.id));
    let newDealerProjects = 0;
    for (const project of recentProjects) {
      const tier = (project as any)?.commercial_tier;
      if (tier === 'INTERNAL') continue;
      const aid = (project as any)?.account_id;
      if (!aid || !dealerAccountIds.has(aid)) continue;
      newDealerProjects += 1;
    }

    return Response.json(
      {
        liveDealerAccounts,
        newlyActivated,
        newAccounts,
        newIncompleteActivations,
        lostActiveAccess,
        newDealerProjects,
        lastSeen,
      },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to load account access summary.' },
      { status: 500 }
    );
  }
}