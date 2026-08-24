import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import {
  buildThresholdReconciliationPlan,
  validateEntitlementContract,
} from "../../shared/turnoverRewardReconciliationAuthority.js";

const SOURCE_SYSTEM = "ARTCOUSTIC_PARTNER_PORTAL";
const CONTRACT_VERSION = 1;
const DEFAULT_ENTITLEMENT_URL =
  "https://jzwuhrmbshfyybxbeckf.supabase.co/functions/v1/soundproof-credit-entitlements";

function summarizeError(error) {
  return String(error?.message || error || "Unknown error").slice(0, 500);
}

function latestMilestoneByThreshold(milestones) {
  const map = new Map();
  for (const milestone of Array.isArray(milestones) ? milestones : []) {
    const threshold = Number(milestone?.milestone_value_gbp);
    if (!Number.isFinite(threshold)) continue;
    const prior = map.get(threshold);
    if (!prior || String(milestone?.updated_date || milestone?.created_date || "")
      > String(prior?.updated_date || prior?.created_date || "")) {
      map.set(threshold, milestone);
    }
  }
  return map;
}

async function updateSyncRun(base44, syncRunId, data) {
  if (!syncRunId) return;
  await base44.asServiceRole.entities.TurnoverRewardSyncRun.update(syncRunId, data);
}

export default async function syncUkTurnoverRewards(req) {
  let base44;
  let syncRunId = null;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.bootstrap === true) {
      return Response.json({
        status: "BOOTSTRAP_DISABLED",
        message: "External entitlement sync never creates or links Sound Proof accounts.",
      }, { status: 400 });
    }

    const dryRun = body.dry_run === true;
    const calendarYear = Number(body.calendar_year) || new Date().getFullYear();
    if (!Number.isInteger(calendarYear) || calendarYear < 2020 || calendarYear > 2100) {
      return Response.json({ status: "INVALID_YEAR" }, { status: 400 });
    }

    const entitlementUrl =
      secrets.get("PARTNER_PORTAL_ENTITLEMENT_URL") || DEFAULT_ENTITLEMENT_URL;
    const bridgeKey = secrets.get("PARTNER_PORTAL_TURNOVER_API_KEY");
    if (!bridgeKey) {
      return Response.json({
        status: "SECRETS_MISSING",
        message: "PARTNER_PORTAL_TURNOVER_API_KEY must be configured.",
        dry_run: dryRun,
      }, { status: 503 });
    }

    const startedAt = new Date().toISOString();
    const syncRun = await base44.asServiceRole.entities.TurnoverRewardSyncRun.create({
      started_at: startedAt,
      calendar_year: calendarYear,
      contract_version: CONTRACT_VERSION,
      status: dryRun ? "DRY_RUN" : "RUNNING",
      dry_run: dryRun,
      dealers_received: 0,
      dealers_matched: 0,
      dealers_unmatched: 0,
      dealers_updated: 0,
      dealers_reconciled: 0,
      milestones_awarded: 0,
      projects_awarded: 0,
      milestones_reversed: 0,
      projects_reversed: 0,
      milestones_reinstated: 0,
      projects_reinstated: 0,
      discrepancy_count: 0,
      error_count: 0,
      error_summary: "",
    });
    syncRunId = syncRun.id;

    let rawContract;
    try {
      const response = await fetch(entitlementUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sound-proof-api-key": bridgeKey,
        },
        body: JSON.stringify({ calendar_year: calendarYear }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Entitlement endpoint HTTP ${response.status}`);
      rawContract = await response.json();
    } catch (error) {
      await updateSyncRun(base44, syncRunId, {
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_count: 1,
        error_summary: `Entitlement fetch failed: ${summarizeError(error)}`,
      });
      return Response.json({
        status: "ENTITLEMENT_FETCH_FAILED",
        sync_run_id: syncRunId,
      }, { status: 502 });
    }

    let contract;
    try {
      contract = validateEntitlementContract(rawContract, calendarYear);
    } catch (error) {
      await updateSyncRun(base44, syncRunId, {
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_count: 1,
        error_summary: `Contract rejected: ${summarizeError(error)}`,
      });
      return Response.json({
        status: "CONTRACT_REJECTED",
        sync_run_id: syncRunId,
      }, { status: 422 });
    }

    const [allLinks, allMilestones, allLedgerEntries] = await Promise.all([
      base44.asServiceRole.entities.ExternalAccountLink.filter({
        source_system: SOURCE_SYSTEM,
        active: true,
      }),
      base44.asServiceRole.entities.TurnoverMilestone.filter({
        calendar_year: calendarYear,
      }),
      base44.asServiceRole.entities.CapacityLedger.list("-created_date", 5000),
    ]);

    const linksByDealerId = new Map();
    for (const link of Array.isArray(allLinks) ? allLinks : []) {
      const dealerId = String(link?.partner_user_id || "").trim();
      if (!dealerId) continue;
      if (linksByDealerId.has(dealerId)) {
        const message = `Duplicate active stable dealer link: ${dealerId}`;
        await updateSyncRun(base44, syncRunId, {
          status: "FAILED",
          finished_at: new Date().toISOString(),
          error_count: 1,
          error_summary: message,
        });
        return Response.json({
          status: "DUPLICATE_ACCOUNT_LINK",
          sync_run_id: syncRunId,
        }, { status: 422 });
      }
      linksByDealerId.set(dealerId, link);
    }

    const milestonesByAccount = new Map();
    for (const milestone of Array.isArray(allMilestones) ? allMilestones : []) {
      if (!milestonesByAccount.has(milestone.account_id)) {
        milestonesByAccount.set(milestone.account_id, []);
      }
      milestonesByAccount.get(milestone.account_id).push(milestone);
    }

    const ledgerByAccount = new Map();
    for (const entry of Array.isArray(allLedgerEntries) ? allLedgerEntries : []) {
      if (!ledgerByAccount.has(entry.account_id)) ledgerByAccount.set(entry.account_id, []);
      ledgerByAccount.get(entry.account_id).push(entry);
    }

    let dealersMatched = 0;
    let dealersUnmatched = 0;
    let dealersUpdated = 0;
    let dealersReconciled = 0;
    let milestonesAwarded = 0;
    let projectsAwarded = 0;
    let milestonesReversed = 0;
    let projectsReversed = 0;
    let milestonesReinstated = 0;
    let projectsReinstated = 0;
    let errorCount = 0;
    const errors = [];
    const dealerResults = [];

    for (const dealerEntitlement of contract.dealers) {
      const dealerId = dealerEntitlement.dealer_account_id;
      const link = linksByDealerId.get(dealerId);
      if (!link?.account_id) {
        dealersUnmatched += 1;
        dealerResults.push({
          dealer_account_id: dealerId,
          match_status: "UNMATCHED",
          planned_actions: 0,
        });
        continue;
      }

      dealersMatched += 1;
      const accountId = link.account_id;
      const accountLedger = ledgerByAccount.get(accountId) || [];
      let actions;
      try {
        actions = buildThresholdReconciliationPlan({
          accountId,
          calendarYear,
          earnedThresholds: dealerEntitlement.earned_thresholds_gbp,
          ledgerEntries: accountLedger,
        });
      } catch (error) {
        errorCount += 1;
        errors.push(`Account ${accountId}: ${summarizeError(error)}`);
        dealerResults.push({
          dealer_account_id: dealerId,
          sound_proof_account_id: accountId,
          match_status: "LEDGER_INCONSISTENT",
          planned_actions: 0,
        });
        continue;
      }

      dealersReconciled += 1;
      const milestoneMap = latestMilestoneByThreshold(milestonesByAccount.get(accountId) || []);
      const appliedActions = [];

      for (const action of actions) {
        if (dryRun) {
          appliedActions.push({ kind: action.kind, threshold_gbp: action.threshold });
        } else {
          const duplicate = await base44.asServiceRole.entities.CapacityLedger.filter({
            idempotency_key: action.idempotency_key,
          });
          if (Array.isArray(duplicate) && duplicate.length > 0) continue;

          const ledgerEntry = await base44.asServiceRole.entities.CapacityLedger.create({
            account_id: accountId,
            transaction_type: action.kind === "REVERSE" ? "REVERSAL" : "UK_TURNOVER_REWARD",
            delta: action.delta,
            idempotency_key: action.idempotency_key,
            source_system: SOURCE_SYSTEM,
            source_ref: {
              reward_program: "UK_TURNOVER_REWARD",
              dealer_account_id: dealerId,
              calendar_year: calendarYear,
              milestone_value_gbp: action.threshold,
              contract_version: contract.contract_version,
              entitlement_calculated_at: contract.calculated_at,
              previous_event_id: action.previous_event_id,
            },
            reason: action.kind === "REVERSE"
              ? `UK turnover reward reversal £${action.threshold.toLocaleString()} milestone (${calendarYear})`
              : action.kind === "REINSTATE"
                ? `UK turnover reward reinstated £${action.threshold.toLocaleString()} milestone (${calendarYear})`
                : `UK turnover reward £${action.threshold.toLocaleString()} milestone (${calendarYear})`,
            reversal_of: action.reversal_of,
          });
          accountLedger.push(ledgerEntry);

          const nowIso = new Date().toISOString();
          const existingMilestone = milestoneMap.get(action.threshold);
          const milestoneFields = {
            account_id: accountId,
            calendar_year: calendarYear,
            milestone_value_gbp: action.threshold,
            reward_projects: Math.abs(action.delta),
            status: action.kind === "REVERSE" ? "REVERSED" : "ACTIVE",
            latest_ledger_entry_id: ledgerEntry.id,
            last_reconciled_at: nowIso,
            source_calculated_at: contract.calculated_at,
          };

          if (existingMilestone) {
            await base44.asServiceRole.entities.TurnoverMilestone.update(existingMilestone.id, {
              ...milestoneFields,
              reward_ledger_entry_id:
                existingMilestone.reward_ledger_entry_id
                || (action.delta > 0 ? ledgerEntry.id : null),
              reversal_ledger_entry_id:
                action.kind === "REVERSE"
                  ? ledgerEntry.id
                  : existingMilestone.reversal_ledger_entry_id || null,
              reinstatement_count:
                Number(existingMilestone.reinstatement_count || 0)
                + (action.kind === "REINSTATE" ? 1 : 0),
              reversal_count:
                Number(existingMilestone.reversal_count || 0)
                + (action.kind === "REVERSE" ? 1 : 0),
            });
          } else {
            const milestone = await base44.asServiceRole.entities.TurnoverMilestone.create({
              ...milestoneFields,
              reward_ledger_entry_id: action.delta > 0 ? ledgerEntry.id : null,
              reversal_ledger_entry_id: action.kind === "REVERSE" ? ledgerEntry.id : null,
              reinstatement_count: action.kind === "REINSTATE" ? 1 : 0,
              reversal_count: action.kind === "REVERSE" ? 1 : 0,
            });
            milestoneMap.set(action.threshold, milestone);
          }
          appliedActions.push({ kind: action.kind, threshold_gbp: action.threshold });
        }

        if (action.kind === "AWARD") {
          milestonesAwarded += 1;
          projectsAwarded += action.delta;
        } else if (action.kind === "REVERSE") {
          milestonesReversed += 1;
          projectsReversed += Math.abs(action.delta);
        } else if (action.kind === "REINSTATE") {
          milestonesReinstated += 1;
          projectsReinstated += action.delta;
        }
      }

      if (appliedActions.length > 0) dealersUpdated += 1;
      dealerResults.push({
        dealer_account_id: dealerId,
        sound_proof_account_id: accountId,
        match_status: "MATCHED",
        entitlement_threshold_count: dealerEntitlement.earned_thresholds_gbp.length,
        planned_actions: appliedActions,
      });
    }

    const finalStatus = dryRun
      ? "DRY_RUN"
      : (errorCount > 0 || dealersUnmatched > 0 ? "PARTIAL" : "SUCCESS");
    const finishedAt = new Date().toISOString();

    await updateSyncRun(base44, syncRunId, {
      finished_at: finishedAt,
      source_last_updated: contract.calculated_at,
      status: finalStatus,
      dealers_received: contract.dealers.length,
      dealers_matched: dealersMatched,
      dealers_unmatched: dealersUnmatched,
      dealers_updated: dealersUpdated,
      dealers_reconciled: dealersReconciled,
      milestones_awarded: milestonesAwarded,
      projects_awarded: projectsAwarded,
      milestones_reversed: milestonesReversed,
      projects_reversed: projectsReversed,
      milestones_reinstated: milestonesReinstated,
      projects_reinstated: projectsReinstated,
      discrepancy_count: errorCount,
      error_count: errorCount,
      error_summary: errors.join("; ").slice(0, 2000),
    });

    return Response.json({
      status: finalStatus,
      dry_run: dryRun,
      calendar_year: calendarYear,
      contract_version: contract.contract_version,
      entitlement_calculated_at: contract.calculated_at,
      sync_run_id: syncRunId,
      summary: {
        dealers_received: contract.dealers.length,
        dealers_matched: dealersMatched,
        dealers_unmatched: dealersUnmatched,
        dealers_reconciled: dealersReconciled,
        dealers_updated: dealersUpdated,
        milestones_awarded: milestonesAwarded,
        projects_awarded: projectsAwarded,
        milestones_reversed: milestonesReversed,
        projects_reversed: projectsReversed,
        milestones_reinstated: milestonesReinstated,
        projects_reinstated: projectsReinstated,
        error_count: errorCount,
      },
      dealers: dealerResults,
    });
  } catch (error) {
    if (base44 && syncRunId) {
      try {
        await updateSyncRun(base44, syncRunId, {
          status: "FAILED",
          finished_at: new Date().toISOString(),
          error_count: 1,
          error_summary: summarizeError(error),
        });
      } catch {
        // Preserve the original failure response.
      }
    }
    return Response.json({
      status: "FAILED",
      error: summarizeError(error),
      sync_run_id: syncRunId,
    }, { status: 500 });
  }
}
