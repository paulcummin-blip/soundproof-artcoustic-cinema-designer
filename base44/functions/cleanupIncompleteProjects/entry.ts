import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  isEligibleForCleanup,
  getCleanupReasons,
  getProjectAgeDays,
} from '../../shared/incompleteProjectCleanupAuthority.js';
import {
  findCleanupReversalEntry,
  findActivationEntry,
} from '../../shared/capacityAuthority.js';

/**
 * P2.2 — 7-day incomplete-project auto-cleanup.
 *
 * Business rule (strict OR):
 *   age >= 7 full days
 *   AND ( name incomplete OR client incomplete OR room_dimensions_edited !== true )
 *
 * Exclusions:
 *   - commercial_tier = INTERNAL
 *   - Projects belonging to internal/admin accounts
 *
 * Promotional path (commercial_source = PROMOTION):
 *   - Update PromotionUsage (usage_status = AUTO_CLEANED_INCOMPLETE)
 *   - Create ProjectCleanupLog
 *   - Delete Project
 *   - Do NOT touch CapacityLedger
 *
 * Normal path (capacity-funded):
 *   - Append idempotent REVERSAL +1 (idempotency_key = incomplete_cleanup_reversal:{project_id})
 *   - Create ProjectCleanupLog
 *   - Delete Project
 *   - Do NOT delete the original PROJECT_ACTIVATION entry
 *
 * Failure safety:
 *   - Never delete a normal project unless the REVERSAL has succeeded or is
 *     proven unnecessary (already exists).
 *   - Never delete a promotional project unless the PromotionUsage update and
 *     ProjectCleanupLog write have both succeeded.
 *   - Fail safe toward retaining the project.
 *
 * Dry-run mode (dry_run = true):
 *   - No deletions, no reversals, no PromotionUsage changes.
 *   - Returns the full candidate list for admin review.
 *
 * Returns:
 *   { status, dry_run, candidates, cleaned, skipped, errors, summary }
 */

const CLEANUP_REASON = 'INCOMPLETE_AFTER_7_DAYS';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Parse request body
    let body = {};
    try {
      body = await req.json();
    } catch (_e) {
      body = {};
    }
    const dryRun = body.dry_run === true;

    // ── 1. Fetch all accounts to identify internal/admin accounts ──
    const allAccounts = await base44.asServiceRole.entities.Account.list();
    const accountMap = new Map();
    const internalAccountIds = new Set();
    if (Array.isArray(allAccounts)) {
      for (const acct of allAccounts) {
        accountMap.set(acct.id, acct);
        if (acct.account_type === 'admin' || acct.account_type === 'internal' || acct.dealer_group === 'INTERNAL') {
          internalAccountIds.add(acct.id);
        }
      }
    }

    // ── 2. Fetch all projects ──
    const allProjects = await base44.asServiceRole.entities.Project.list('-created_date', 500);

    // ── 3. Filter candidates ──
    const candidates = [];
    const now = Date.now();

    for (const project of allProjects) {
      // Exclude INTERNAL commercial tier
      if (project.commercial_tier === 'INTERNAL') continue;

      // Exclude projects belonging to internal/admin accounts
      if (project.account_id && internalAccountIds.has(project.account_id)) continue;

      // Exclude explicitly archived projects (legitimate lifecycle handling)
      if (project.lifecycle_status === 'Archived') continue;

      // Check eligibility
      if (!isEligibleForCleanup(project, now)) continue;

      const reasons = getCleanupReasons(project);
      const ageDays = getProjectAgeDays(project, now);
      const account = project.account_id ? accountMap.get(project.account_id) : null;
      const isPromotional = project.commercial_source === 'PROMOTION';

      candidates.push({
        project_id: project.id,
        account_id: project.account_id,
        account_name: account?.name || '(unknown)',
        project_name: project.name,
        client_name: project.client_name || '',
        age_days: ageDays,
        room_dimensions_edited: project.room_dimensions_edited === true,
        commercial_tier: project.commercial_tier,
        commercial_source: project.commercial_source || '',
        promotion_id: project.promotion_id || null,
        cleanup_reasons: reasons,
        is_promotional: isPromotional,
        would_restore_credit: !isPromotional && !!project.activation_ledger_entry_id,
        original_activation_ledger_entry_id: project.activation_ledger_entry_id || null,
      });
    }

    // ── 4. Dry run — return candidates only ──
    if (dryRun) {
      return Response.json({
        status: 'SUCCESS',
        dry_run: true,
        candidates,
        candidate_count: candidates.length,
        summary: {
          total_candidates: candidates.length,
          promotional: candidates.filter(c => c.is_promotional).length,
          normal_credit_funded: candidates.filter(c => !c.is_promotional).length,
          would_restore_credit: candidates.filter(c => c.would_restore_credit).length,
        },
      }, { status: 200 });
    }

    // ── 5. Live cleanup ──
    const cleaned = [];
    const skipped = [];
    const errors = [];

    for (const candidate of candidates) {
      try {
        // Re-read the project immediately before action (defence against
        // concurrent changes between the candidate scan and the action).
        const freshProjects = await base44.asServiceRole.entities.Project.filter({ id: candidate.project_id });
        if (!Array.isArray(freshProjects) || freshProjects.length === 0) {
          // Already deleted — skip
          skipped.push({ project_id: candidate.project_id, reason: 'ALREADY_DELETED' });
          continue;
        }
        const freshProject = freshProjects[0];

        // Re-evaluate eligibility on the fresh record
        if (!isEligibleForCleanup(freshProject, now)) {
          skipped.push({ project_id: candidate.project_id, reason: 'NO_LONGER_ELIGIBLE' });
          continue;
        }

        const freshReasons = getCleanupReasons(freshProject);
        const reasonsDetail = freshReasons.join(', ');
        const cleanedAt = new Date().toISOString();
        const isPromotional = freshProject.commercial_source === 'PROMOTION';

        if (isPromotional) {
          // ── Promotional path ──
          // 1. Update PromotionUsage
          let usageUpdateOk = true;
          try {
            const usageEntries = await base44.asServiceRole.entities.PromotionUsage.filter({ project_id: freshProject.id });
            if (Array.isArray(usageEntries) && usageEntries.length > 0) {
              for (const usage of usageEntries) {
                await base44.asServiceRole.entities.PromotionUsage.update(usage.id, {
                  usage_status: 'AUTO_CLEANED_INCOMPLETE',
                  project_cleaned_at: cleanedAt,
                  cleanup_reason: CLEANUP_REASON,
                });
              }
            }
          } catch (usageErr) {
            usageUpdateOk = false;
            errors.push({
              project_id: freshProject.id,
              step: 'PROMOTION_USAGE_UPDATE',
              error: String(usageErr?.message || usageErr),
            });
          }

          if (!usageUpdateOk) {
            // Fail safe — do NOT delete the project
            skipped.push({ project_id: freshProject.id, reason: 'PROMOTION_USAGE_UPDATE_FAILED' });
            continue;
          }

          // 2. Create ProjectCleanupLog
          let cleanupLogOk = true;
          let cleanupLogId = null;
          try {
            const cleanupLog = await base44.asServiceRole.entities.ProjectCleanupLog.create({
              account_id: freshProject.account_id,
              project_id: freshProject.id,
              project_name: freshProject.name,
              client_name: freshProject.client_name || null,
              created_date: freshProject.created_date,
              cleaned_at: cleanedAt,
              commercial_tier: freshProject.commercial_tier,
              commercial_source: freshProject.commercial_source || null,
              promotion_id: freshProject.promotion_id || null,
              room_dimensions_edited: freshProject.room_dimensions_edited === true,
              cleanup_reason: CLEANUP_REASON,
              cleanup_reasons_detail: reasonsDetail,
              credit_restored: false,
              original_activation_ledger_entry_id: null,
              reversal_ledger_entry_id: null,
            });
            cleanupLogId = cleanupLog?.id || null;
          } catch (logErr) {
            cleanupLogOk = false;
            errors.push({
              project_id: freshProject.id,
              step: 'CLEANUP_LOG_CREATE',
              error: String(logErr?.message || logErr),
            });
          }

          if (!cleanupLogOk) {
            // Fail safe — do NOT delete the project
            skipped.push({ project_id: freshProject.id, reason: 'CLEANUP_LOG_CREATE_FAILED' });
            continue;
          }

          // 3. Delete the Project
          try {
            await base44.asServiceRole.entities.Project.delete(freshProject.id);
            cleaned.push({
              project_id: freshProject.id,
              account_id: freshProject.account_id,
              project_name: freshProject.name,
              age_days: getProjectAgeDays(freshProject, now),
              cleanup_reasons: freshReasons,
              is_promotional: true,
              credit_restored: false,
              cleanup_log_id: cleanupLogId,
            });
          } catch (delErr) {
            errors.push({
              project_id: freshProject.id,
              step: 'PROJECT_DELETE',
              error: String(delErr?.message || delErr),
            });
            skipped.push({ project_id: freshProject.id, reason: 'PROJECT_DELETE_FAILED' });
          }
        } else {
          // ── Normal capacity-funded path ──
          // 1. Check for existing reversal (idempotency)
          let reversalEntry = null;
          try {
            reversalEntry = await findCleanupReversalEntry(base44.asServiceRole, freshProject.id);
          } catch (_checkErr) {
            // If we can't check, we'll try to create anyway (the idempotency_key
            // on the ledger provides a secondary guard).
          }

          let reversalLedgerId = null;

          if (!reversalEntry) {
            // 2. Append REVERSAL +1
            try {
              reversalEntry = await base44.asServiceRole.entities.CapacityLedger.create({
                account_id: freshProject.account_id,
                transaction_type: 'REVERSAL',
                delta: 1,
                idempotency_key: `incomplete_cleanup_reversal:${freshProject.id}`,
                source_system: 'SOUND_PROOF',
                source_ref: {
                  project_id: freshProject.id,
                  cleanup_reason: CLEANUP_REASON,
                },
                reason: 'Automatic reversal — incomplete project removed after 7 days',
                reversal_of: freshProject.activation_ledger_entry_id || null,
              });
              reversalLedgerId = reversalEntry?.id || null;
            } catch (revErr) {
              // Fail safe — do NOT delete the project
              errors.push({
                project_id: freshProject.id,
                step: 'REVERSAL_CREATE',
                error: String(revErr?.message || revErr),
              });
              skipped.push({ project_id: freshProject.id, reason: 'REVERSAL_CREATE_FAILED' });
              continue;
            }
          } else {
            reversalLedgerId = reversalEntry.id;
          }

          // 3. Create ProjectCleanupLog
          let cleanupLogOk = true;
          let cleanupLogId = null;
          try {
            const cleanupLog = await base44.asServiceRole.entities.ProjectCleanupLog.create({
              account_id: freshProject.account_id,
              project_id: freshProject.id,
              project_name: freshProject.name,
              client_name: freshProject.client_name || null,
              created_date: freshProject.created_date,
              cleaned_at: cleanedAt,
              commercial_tier: freshProject.commercial_tier,
              commercial_source: freshProject.commercial_source || null,
              promotion_id: null,
              room_dimensions_edited: freshProject.room_dimensions_edited === true,
              cleanup_reason: CLEANUP_REASON,
              cleanup_reasons_detail: reasonsDetail,
              credit_restored: true,
              original_activation_ledger_entry_id: freshProject.activation_ledger_entry_id || null,
              reversal_ledger_entry_id: reversalLedgerId,
            });
            cleanupLogId = cleanupLog?.id || null;
          } catch (logErr) {
            cleanupLogOk = false;
            errors.push({
              project_id: freshProject.id,
              step: 'CLEANUP_LOG_CREATE',
              error: String(logErr?.message || logErr),
            });
          }

          if (!cleanupLogOk) {
            // The reversal has already been appended. The credit is restored.
            // We still skip deletion to avoid losing the project without an
            // audit record. The reversal idempotency key prevents a duplicate
            // on retry.
            skipped.push({ project_id: freshProject.id, reason: 'CLEANUP_LOG_CREATE_FAILED' });
            continue;
          }

          // 4. Delete the Project
          try {
            await base44.asServiceRole.entities.Project.delete(freshProject.id);
            cleaned.push({
              project_id: freshProject.id,
              account_id: freshProject.account_id,
              project_name: freshProject.name,
              age_days: getProjectAgeDays(freshProject, now),
              cleanup_reasons: freshReasons,
              is_promotional: false,
              credit_restored: true,
              reversal_ledger_entry_id: reversalLedgerId,
              cleanup_log_id: cleanupLogId,
            });
          } catch (delErr) {
            errors.push({
              project_id: freshProject.id,
              step: 'PROJECT_DELETE',
              error: String(delErr?.message || delErr),
            });
            skipped.push({ project_id: freshProject.id, reason: 'PROJECT_DELETE_FAILED' });
          }
        }
      } catch (candidateErr) {
        errors.push({
          project_id: candidate.project_id,
          step: 'CANDIDATE_PROCESSING',
          error: String(candidateErr?.message || candidateErr),
        });
      }
    }

    return Response.json({
      status: 'SUCCESS',
      dry_run: false,
      candidates,
      candidate_count: candidates.length,
      cleaned,
      cleaned_count: cleaned.length,
      skipped,
      skipped_count: skipped.length,
      errors,
      error_count: errors.length,
      summary: {
        total_candidates: candidates.length,
        promotional_cleaned: cleaned.filter(c => c.is_promotional).length,
        normal_cleaned: cleaned.filter(c => !c.is_promotional).length,
        credits_restored: cleaned.filter(c => c.credit_restored).length,
        skipped: skipped.length,
        errors: errors.length,
      },
    }, { status: 200 });

  } catch (error) {
    return Response.json({
      status: 'FAILED',
      error: String(error?.message || error),
    }, { status: 500 });
  }
}