import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { resolveAccountAccess } from "../../shared/accountAccessAuthority.js";
import {
  fetchDealerDirectory,
  validateDealerDirectory,
} from "../../shared/dealerDirectory/dealerDirectoryClient.js";
import {
  classifyDirectoryMatches,
  sectorToDealerGroup,
  DIRECTORY_SOURCE_SYSTEM,
} from "../../shared/dealerDirectory/dealerDirectoryMatching.js";

const STALE_LOCK_MS = 15 * 60 * 1000;

function summariseError(error) {
  return String(error?.message || error || "Unknown error").slice(0, 800);
}

function mintRunId() {
  return `ddi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function finishRun(service, runRecordId, patch) {
  if (!runRecordId) return;
  try {
    await service.entities.DealerDirectoryImportRun.update(runRecordId, patch);
  } catch {
    // Preserve the primary failure response; never mask it with a lock-write error.
  }
}

/**
 * Master-admin-only dealer-directory import.
 *
 * Performs a FRESH directory read and matching check before any write, aborts
 * on identity conflicts, is idempotent (re-runs create nothing duplicate),
 * refuses to overlap another in-progress run, audits every created account
 * and link, and never grants access, memberships, credits or turnover.
 *
 * Newly imported dealers are created with Sound Proof status `inactive` and no
 * memberships — Sound Proof access is NO by default.
 */
export default async function importDealerDirectory(req) {
  let service = null;
  let runRecordId = null;
  let runId = null;

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const accessContext = await resolveAccountAccess(base44, user);
    if (!accessContext?.isMasterAdmin) {
      return Response.json({ error: "Master admin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const limit = Number(body?.limit) || 200;

    const turnoverUrl = secrets.get("PARTNER_PORTAL_TURNOVER_URL");
    const directoryKey = secrets.get("PARTNER_PORTAL_DIRECTORY_KEY");
    if (!turnoverUrl || !directoryKey) {
      return Response.json({
        status: "SECRETS_MISSING",
        message: "PARTNER_PORTAL_TURNOVER_URL and PARTNER_PORTAL_DIRECTORY_KEY must be configured.",
      }, { status: 503 });
    }

    service = base44.asServiceRole;

    // Overlap lock — dry runs hold no lock and may always run.
    if (!dryRun) {
      const runningRuns = await service.entities.DealerDirectoryImportRun.filter(
        { status: "RUNNING" },
        "-started_at",
        50,
      );
      const now = Date.now();
      const active = [];
      for (const run of runningRuns || []) {
        const startedMs = new Date(run.started_at).getTime();
        if (Number.isFinite(startedMs) && now - startedMs < STALE_LOCK_MS) {
          active.push(run);
        }
      }
      if (active.length > 0) {
        return Response.json({
          status: "IMPORT_IN_PROGRESS",
          run_id: active[0].run_id,
          started_at: active[0].started_at,
          message: "Another dealer directory import is already running.",
        }, { status: 409 });
      }
      // Clear stale RUNNING locks so a crashed run never blocks forever.
      for (const run of runningRuns || []) {
        const startedMs = new Date(run.started_at).getTime();
        if (Number.isFinite(startedMs) && now - startedMs >= STALE_LOCK_MS) {
          await service.entities.DealerDirectoryImportRun.update(run.id, {
            status: "FAILED",
            completed_at: new Date().toISOString(),
            error_summary: "Stale RUNNING lock cleared by a new import run.",
          });
        }
      }

      runId = mintRunId();
      const runRecord = await service.entities.DealerDirectoryImportRun.create({
        run_id: runId,
        status: "RUNNING",
        dry_run: false,
        started_at: new Date().toISOString(),
        requested_by_user_id: String(user.id || ""),
        requested_by_email: String(user.email || ""),
        dealers_received: 0,
        accounts_created: 0,
        links_created: 0,
        accounts_preserved: 0,
        conflicts_count: 0,
        created_summary: [],
        conflicts: [],
      });
      runRecordId = runRecord.id;
    }

    // Fresh directory read.
    let directory;
    try {
      directory = await fetchDealerDirectory({ turnoverUrl, key: directoryKey, limit });
    } catch (error) {
      await finishRun(service, runRecordId, {
        status: "FAILED",
        completed_at: new Date().toISOString(),
        error_summary: `Directory fetch failed: ${summariseError(error)}`,
      });
      return Response.json({
        status: "DIRECTORY_FETCH_FAILED",
        message: summariseError(error),
        run_id: runId,
      }, { status: 502 });
    }

    const validation = validateDealerDirectory({ records: directory.records, sourceTotal: directory.pagination.sourceTotal });
    if (!validation.passed) {
      await finishRun(service, runRecordId, {
        status: "FAILED",
        completed_at: new Date().toISOString(),
        error_summary: `Directory validation failed: ${validation.errors.join("; ")}`,
      });
      return Response.json({
        status: "DIRECTORY_VALIDATION_FAILED",
        errors: validation.errors,
        run_id: runId,
      }, { status: 422 });
    }

    // Existing accounts + links, read fresh for this run.
    const [accounts, externalLinks] = await Promise.all([
      service.entities.Account.list("-created_date", 5000),
      service.entities.ExternalAccountLink.filter({ source_system: DIRECTORY_SOURCE_SYSTEM }),
    ]);
    const accountList = Array.isArray(accounts) ? accounts : [];
    const linkList = Array.isArray(externalLinks) ? externalLinks : [];

    // Matching — identity only, never by name alone.
    const classification = classifyDirectoryMatches({
      directoryRecords: directory.records,
      accounts: accountList,
      externalLinks: linkList,
    });

    // Abort on any identity conflict (ambiguous names or unlinked name matches).
    const conflicts = [
      ...classification.ambiguous.map((c) => ({ kind: "ambiguous", ...c })),
      ...classification.accountsNeedingLinking.map((c) => ({ kind: "name_match_unlinked", ...c })),
    ];
    if (conflicts.length > 0) {
      await finishRun(service, runRecordId, {
        status: "ABORTED",
        completed_at: new Date().toISOString(),
        conflicts_count: conflicts.length,
        conflicts: conflicts.slice(0, 100),
        abort_reason: "Identity conflicts detected; no accounts or links created.",
      });
      return Response.json({
        status: "CONFLICTS_DETECTED",
        run_id: runId,
        conflicts_count: conflicts.length,
        conflicts: conflicts.slice(0, 50),
        message: "Identity conflicts detected. No accounts or links were created.",
      }, { status: 409 });
    }

    const toCreate = classification.newAccounts;
    const preservedCount = classification.exactMatches.length;

    if (dryRun) {
      return Response.json({
        status: "DRY_RUN",
        dry_run: true,
        dealers_received: directory.records.length,
        accounts_preserved: preservedCount,
        proposed_account_creates: toCreate.length,
        conflicts_count: 0,
        proposed_creates_sample: toCreate.slice(0, 20).map((r) => ({
          dealer_account_id: r.dealer_account_id,
          portal_user_id: r.portal_user_id,
          account_name: r.account_name,
          sector: r.sector,
        })),
      }, { status: 200 });
    }

    // Create accounts + links. Idempotency is guaranteed by the fresh matching
    // above: any dealer already linked is classified as an exact match, never
    // re-created. The overlap lock prevents two runs racing.
    //
    // Pacing: the platform limits entity_create to 400 requests per 60s per
    // caller. Each dealer needs two creates (account + link), so a full import
    // would exceed that. A self-regulating window pacer keeps the create rate
    // under the limit without a long blocking sleep; for a small delta re-run
    // it never engages.
    const WINDOW_MS = 60000;
    const CREATES_PER_WINDOW = 380;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let windowStart = Date.now();
    let windowCount = 0;

    const createdSummary = [];
    let accountsCreated = 0;
    let linksCreated = 0;
    const errors = [];

    for (const record of toCreate) {
      windowCount += 2;
      if (windowCount >= CREATES_PER_WINDOW) {
        const elapsed = Date.now() - windowStart;
        if (elapsed < WINDOW_MS) await sleep(WINDOW_MS - elapsed + 500);
        windowStart = Date.now();
        windowCount = 0;
      }
      try {
        const account = await service.entities.Account.create({
          name: record.account_name,
          account_type: "dealer",
          dealer_group: sectorToDealerGroup(record.sector),
          status: "inactive",
          territory: null,
          notes: "Mirrored from Artcoustic Partner Portal dealer directory. No Sound Proof access granted.",
          project_count: 0,
        });
        const link = await service.entities.ExternalAccountLink.create({
          account_id: account.id,
          source_system: DIRECTORY_SOURCE_SYSTEM,
          partner_user_id: record.portal_user_id,
          portal_dealer_account_id: record.dealer_account_id,
          external_account_number: record.trading_account_number ?? record.dealer_account_id,
          external_account_name: record.account_name,
          active: true,
        });
        accountsCreated += 1;
        linksCreated += 1;
        createdSummary.push({
          account_id: account.id,
          external_link_id: link.id,
          dealer_account_id: record.dealer_account_id,
          portal_user_id: record.portal_user_id,
          account_name: record.account_name,
          sector: record.sector,
        });
      } catch (error) {
        errors.push(`Create failed for ${record.account_name} (${record.dealer_account_id}): ${summariseError(error)}`);
      }
    }

    const finalStatus = errors.length > 0 ? "PARTIAL" : "COMPLETED";
    await finishRun(service, runRecordId, {
      status: finalStatus,
      completed_at: new Date().toISOString(),
      dealers_received: directory.records.length,
      accounts_created: accountsCreated,
      links_created: linksCreated,
      accounts_preserved: preservedCount,
      created_summary: createdSummary,
      error_summary: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
    });

    return Response.json({
      status: finalStatus,
      dry_run: false,
      run_id: runId,
      dealers_received: directory.records.length,
      accounts_created: accountsCreated,
      links_created: linksCreated,
      accounts_preserved: preservedCount,
      conflicts_count: 0,
      created_count: createdSummary.length,
      created_summary: createdSummary,
      errors: errors.slice(0, 50),
    }, { status: 200 });
  } catch (error) {
    await finishRun(service, runRecordId, {
      status: "FAILED",
      completed_at: new Date().toISOString(),
      error_summary: summariseError(error),
    });
    return Response.json({
      status: "FAILED",
      error: summariseError(error),
      run_id: runId,
    }, { status: 500 });
  }
}