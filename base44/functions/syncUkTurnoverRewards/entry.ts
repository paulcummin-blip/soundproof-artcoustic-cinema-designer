import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

const MILESTONE_STEP = 10000;
const REWARD_PER_MILESTONE = 5;
const SOURCE_SYSTEM = 'ARTCOUSTIC_PARTNER_PORTAL';
const INTERNAL_LEDGER = '44-000-01';
const HIGH_TURNOVER_THRESHOLD = 100000;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const bootstrap = body.bootstrap === true;
    const calendarYear = Number(body.calendar_year) || new Date().getFullYear();

    // ── Secrets check ──
    const bridgeUrl = secrets.get("PARTNER_PORTAL_TURNOVER_URL");
    const bridgeKey = secrets.get("PARTNER_PORTAL_TURNOVER_API_KEY");
    if (!bridgeUrl || !bridgeKey) {
      return Response.json({
        status: 'SECRETS_MISSING',
        message: 'PARTNER_PORTAL_TURNOVER_URL and PARTNER_PORTAL_TURNOVER_API_KEY must be configured before running the sync. Set them in dashboard settings → environment variables.',
        dry_run: dryRun
      }, { status: 503 });
    }

    // ── Create sync run audit record ──
    const startedAt = new Date().toISOString();
    const syncRun = await base44.asServiceRole.entities.TurnoverRewardSyncRun.create({
      started_at: startedAt,
      calendar_year: calendarYear,
      status: dryRun ? 'DRY_RUN' : 'RUNNING',
      dry_run: dryRun,
      dealers_received: 0,
      dealers_matched: 0,
      dealers_unmatched: 0,
      dealers_updated: 0,
      milestones_awarded: 0,
      projects_awarded: 0,
      discrepancy_count: 0,
      error_count: 0,
      error_summary: ''
    });

    // ── Fetch from Partner Portal bridge ──
    let dealerRows: any[];
    let sourceLastUpdated: string | null = null;
    try {
      const url = new URL(bridgeUrl);
      url.searchParams.set('year', String(calendarYear));
      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${bridgeKey}`,
          'x-api-key': bridgeKey,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) {
        throw new Error(`Bridge HTTP ${res.status}`);
      }
      const raw = await res.json();
      dealerRows = Array.isArray(raw) ? raw : (raw.dealers || raw.data || []);
    } catch (fetchErr: any) {
      await base44.asServiceRole.entities.TurnoverRewardSyncRun.update(syncRun.id, {
        status: 'FAILED',
        finished_at: new Date().toISOString(),
        error_count: 1,
        error_summary: `Bridge fetch failed: ${fetchErr.message}`
      });
      return Response.json({
        status: 'BRIDGE_FAILED',
        message: fetchErr.message,
        sync_run_id: syncRun.id
      }, { status: 502 });
    }

    // ── Fail-closed: duplicate partner_user_id check ──
    const seenIds = new Set<string>();
    for (const row of dealerRows) {
      const pid = row?.partner_user_id;
      if (!pid) continue;
      if (seenIds.has(pid)) {
        await base44.asServiceRole.entities.TurnoverRewardSyncRun.update(syncRun.id, {
          status: 'FAILED',
          finished_at: new Date().toISOString(),
          error_count: 1,
          error_summary: `Duplicate partner_user_id: ${pid}`
        });
        return Response.json({
          status: 'DUPLICATE_IDENTITY',
          message: `Bridge response contains duplicate partner_user_id (${pid}). Aborting for safety.`,
          sync_run_id: syncRun.id
        }, { status: 422 });
      }
      seenIds.add(pid);
    }

    // ── Load canonical partner links into a map ──
    const allLinks = await base44.asServiceRole.entities.ExternalAccountLink.filter({
      source_system: SOURCE_SYSTEM,
      active: true
    });
    const linksByPartnerId = new Map<string, any>();
    for (const link of allLinks) {
      if (link.partner_user_id) {
        linksByPartnerId.set(link.partner_user_id, link);
      }
    }

    // ── Load existing milestones for this year ──
    const existingMilestones = await base44.asServiceRole.entities.TurnoverMilestone.filter({
      calendar_year: calendarYear
    });
    const milestoneSet = new Set<string>();
    for (const m of existingMilestones) {
      milestoneSet.add(`${m.account_id}:${m.calendar_year}:${m.milestone_value_gbp}`);
    }

    // ── Process each dealer row ──
    const dealerResults: any[] = [];
    let dealersReceived = 0, dealersMatched = 0, dealersUnmatched = 0;
    let dealersUpdated = 0, milestonesAwarded = 0, projectsAwarded = 0;
    let discrepancyCount = 0, errorCount = 0;
    const errors: string[] = [];
    const discrepancies: any[] = [];

    for (const row of dealerRows) {
      dealersReceived++;
      const partnerUserId = row?.partner_user_id;
      const ledgerNumber = row?.primary_ledger_account_number || '';
      const turnoverGbp = Number(row?.current_turnover_gbp);
      const lastUpdated = row?.last_updated || null;
      const accountName = row?.account_name || '';
      const isInternal = ledgerNumber === INTERNAL_LEDGER || accountName === 'Artcoustic';

      if (lastUpdated && (!sourceLastUpdated || lastUpdated > sourceLastUpdated)) {
        sourceLastUpdated = lastUpdated;
      }

      // Validate row
      if (!partnerUserId || !Number.isFinite(turnoverGbp)) {
        errorCount++;
        errors.push(`Invalid row: partner_user_id=${partnerUserId}, turnover=${row?.current_turnover_gbp}`);
        dealerResults.push({
          partner_user_id: partnerUserId, ledger: ledgerNumber, name: accountName,
          match_status: 'INVALID_ROW', is_internal: isInternal,
          turnover_gbp: turnoverGbp, milestones_due: [],
          milestones_already_awarded: [], milestones_would_award: [],
          projects_would_add: 0, high_turnover_flag: false
        });
        continue;
      }

      // Match to Sound Proof Account
      const link = linksByPartnerId.get(partnerUserId);
      if (!link) {
        dealersUnmatched++;
        dealerResults.push({
          partner_user_id: partnerUserId, ledger: ledgerNumber, name: accountName,
          match_status: 'UNMATCHED', is_internal: isInternal,
          turnover_gbp: turnoverGbp, milestones_due: [],
          milestones_already_awarded: [], milestones_would_award: [],
          projects_would_add: 0, high_turnover_flag: turnoverGbp >= HIGH_TURNOVER_THRESHOLD
        });
        continue;
      }

      const accountId = link.account_id;
      dealersMatched++;

      // Check existing TurnoverRecord for discrepancy detection
      const existingRecords = await base44.asServiceRole.entities.TurnoverRecord.filter({
        account_id: accountId, calendar_year: calendarYear, source_system: SOURCE_SYSTEM
      });
      const existingRecord = existingRecords.length > 0 ? existingRecords[0] : null;
      let discrepancyFlagged = false;

      if (existingRecord && Number(existingRecord.eligible_turnover_gbp) > turnoverGbp) {
        discrepancyFlagged = true;
        discrepancyCount++;
        discrepancies.push({
          account_id: accountId, partner_user_id: partnerUserId,
          previous_gbp: existingRecord.eligible_turnover_gbp,
          new_gbp: turnoverGbp,
          delta: turnoverGbp - Number(existingRecord.eligible_turnover_gbp)
        });
      }

      // Calculate due milestones
      const milestonesDue: number[] = [];
      for (let m = MILESTONE_STEP; m <= turnoverGbp; m += MILESTONE_STEP) {
        milestonesDue.push(m);
      }
      const milestonesAlreadyAwarded: number[] = [];
      const milestonesWouldAward: number[] = [];
      for (const mv of milestonesDue) {
        const key = `${accountId}:${calendarYear}:${mv}`;
        if (milestoneSet.has(key)) milestonesAlreadyAwarded.push(mv);
        else milestonesWouldAward.push(mv);
      }
      const projectsWouldAdd = milestonesWouldAward.length * REWARD_PER_MILESTONE;

      // ── LIVE MODE: write ──
      if (!dryRun && !bootstrap) {
        if (existingRecord) {
          await base44.asServiceRole.entities.TurnoverRecord.update(existingRecord.id, {
            eligible_turnover_gbp: turnoverGbp,
            source_last_updated: lastUpdated,
            sync_date: new Date().toISOString(),
            source_turnover: turnoverGbp,
            source_currency: 'GBP'
          });
        } else {
          await base44.asServiceRole.entities.TurnoverRecord.create({
            account_id: accountId, external_account_link_id: link.id,
            calendar_year: calendarYear, eligible_turnover_gbp: turnoverGbp,
            source_currency: 'GBP', source_turnover: turnoverGbp,
            source_system: SOURCE_SYSTEM, source_last_updated: lastUpdated,
            sync_date: new Date().toISOString()
          });
        }
        dealersUpdated++;

        for (const mv of milestonesWouldAward) {
          const idemKey = `uk_turnover:${accountId}:${calendarYear}:${mv}`;
          const existingLedger = await base44.asServiceRole.entities.CapacityLedger.filter({ idempotency_key: idemKey });
          if (existingLedger.length > 0) continue;

          const ledgerEntry = await base44.asServiceRole.entities.CapacityLedger.create({
            account_id: accountId, transaction_type: 'UK_TURNOVER_REWARD',
            delta: REWARD_PER_MILESTONE, idempotency_key: idemKey,
            source_system: SOURCE_SYSTEM,
            source_ref: { turnover_record_account_id: accountId, milestone_value_gbp: mv },
            reason: `UK turnover reward £${mv.toLocaleString()} milestone (${calendarYear})`
          });
          await base44.asServiceRole.entities.TurnoverMilestone.create({
            account_id: accountId, calendar_year: calendarYear,
            milestone_value_gbp: mv, reward_projects: REWARD_PER_MILESTONE,
            reward_ledger_entry_id: ledgerEntry.id, source_turnover_gbp: turnoverGbp
          });
          milestoneSet.add(`${accountId}:${calendarYear}:${mv}`);
          milestonesAwarded++;
          projectsAwarded += REWARD_PER_MILESTONE;
        }
      }

      dealerResults.push({
        partner_user_id: partnerUserId, ledger: ledgerNumber, name: accountName,
        sound_proof_account_id: accountId, match_status: 'MATCHED',
        is_internal: isInternal, turnover_gbp: turnoverGbp, last_updated: lastUpdated,
        discrepancy_flagged: discrepancyFlagged,
        milestones_due: milestonesDue,
        milestones_already_awarded: milestonesAlreadyAwarded,
        milestones_would_award: milestonesWouldAward,
        projects_would_add: projectsWouldAdd,
        high_turnover_flag: turnoverGbp >= HIGH_TURNOVER_THRESHOLD
      });
    }

    // ── Bootstrap mode: create missing accounts + links ──
    if (bootstrap && !dryRun) {
      for (const result of dealerResults) {
        if (result.match_status !== 'UNMATCHED' || result.is_internal) continue;
        const newAccount = await base44.asServiceRole.entities.Account.create({
          name: result.name || `Partner ${result.partner_user_id}`,
          account_type: 'dealer', dealer_group: 'PREMIUM_PARTNER',
          territory: 'UK', status: 'active'
        });
        await base44.asServiceRole.entities.ExternalAccountLink.create({
          account_id: newAccount.id, source_system: SOURCE_SYSTEM,
          partner_user_id: result.partner_user_id,
          external_account_number: result.ledger || result.partner_user_id,
          external_account_name: result.name, territory: 'UK',
          currency: 'GBP', active: true
        });
        result.match_status = 'BOOTSTRAPPED';
        result.sound_proof_account_id = newAccount.id;
      }
    }

    // ── Finalize sync run ──
    const finishedAt = new Date().toISOString();
    const finalStatus = dryRun ? 'DRY_RUN' : (errorCount > 0 || discrepancyCount > 0 ? 'PARTIAL' : 'SUCCESS');
    const errorSummaryParts = [...errors, ...discrepancies.map(d => `Turnover drop: ${d.partner_user_id} £${d.previous_gbp}→£${d.new_gbp}`)];
    await base44.asServiceRole.entities.TurnoverRewardSyncRun.update(syncRun.id, {
      finished_at: finishedAt, status: finalStatus,
      source_last_updated: sourceLastUpdated,
      dealers_received: dealersReceived, dealers_matched: dealersMatched,
      dealers_unmatched: dealersUnmatched, dealers_updated: dealersUpdated,
      milestones_awarded: milestonesAwarded, projects_awarded: projectsAwarded,
      discrepancy_count: discrepancyCount, error_count: errorCount,
      error_summary: errorSummaryParts.join('; ').substring(0, 2000)
    });

    return Response.json({
      status: finalStatus, dry_run: dryRun, calendar_year: calendarYear,
      sync_run_id: syncRun.id,
      summary: {
        dealers_received: dealersReceived, dealers_matched: dealersMatched,
        dealers_unmatched: dealersUnmatched, dealers_updated: dealersUpdated,
        milestones_awarded: milestonesAwarded, projects_awarded: projectsAwarded,
        discrepancy_count: discrepancyCount, error_count: errorCount
      },
      dealers: dealerResults,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}