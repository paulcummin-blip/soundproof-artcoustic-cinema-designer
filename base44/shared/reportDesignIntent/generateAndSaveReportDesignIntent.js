/**
 * generateAndSaveReportDesignIntent.js (shared)
 * ---------------------------------------------
 * THE PRODUCTION SAVE WRAPPER.
 *
 * It does exactly two things, in this order and no other:
 *
 *   1. builds the attempt with buildReportDesignIntentAttempt — the pure generation
 *      core, the one writer, which cannot write; and
 *   2. performs the ONE production write: an accepted narrative is saved beside the
 *      report it was written for.
 *
 * Nothing is written unless the draft passed validation. A refused, failed or
 * timed-out attempt returns the reason and stores nothing, so an incomplete draft can
 * never reach the page. The saved narrative is written against the exact version and
 * the exact evidence fingerprints it was written from, and it is never regenerated on
 * opening a report.
 *
 * This is the only module in the Design Intent path that may write. It imports no
 * delete, no create, no publish and no approval helper, and it is deliberately absent
 * from the preview's imports — so the preview is incapable of the save by
 * construction rather than by discipline.
 *
 * Pure apart from its injected calls: no React, no SDK, no runtime-specific APIs.
 */

import { buildReportDesignIntentAttempt } from './buildReportDesignIntentAttempt.js';

/**
 * Build one attempt and save it when it was accepted.
 *
 * @param {Object} input — exactly buildReportDesignIntentAttempt's input
 * @returns {Promise<Object>}
 *   `{ ok: false, block }` — the attempt could not be set up; nothing was written
 *   `{ ok: true, saved: false, ... }` — the writer refused or failed; nothing was written
 *   `{ ok: true, saved: true, ... }` — an accepted narrative was saved
 */
export async function generateAndSaveReportDesignIntent(input = {}) {
  const outcome = await buildReportDesignIntentAttempt(input);
  if (!outcome.ok) return { ok: false, block: outcome.block };

  const { project, version, snapshot, flag, attempt, generation } = outcome;

  // A refusal is a result, not a record: nothing is written, and the report keeps its
  // own deterministic Design Intent.
  if (!attempt.ok) {
    return { ok: true, saved: false, project, version, snapshot, flag, attempt, generation };
  }

  // ── THE ONE WRITE, and only for an accepted narrative ──
  const payload = {
    ...(snapshot.payload && typeof snapshot.payload === 'object' ? snapshot.payload : {}),
    design_intent: attempt.record,
  };
  const saved = await input.entities.ReportSnapshot.update(snapshot.id, { payload });

  return {
    ok: true,
    saved: true,
    project,
    version,
    flag,
    attempt,
    generation,
    snapshot,
    snapshot_id: saved?.id || snapshot.id,
  };
}

export default generateAndSaveReportDesignIntent;