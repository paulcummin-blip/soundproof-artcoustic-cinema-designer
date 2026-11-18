/**
 * commitReportDesignIntent.js (shared)
 * -----------------------------------
 * THE COMMIT-ONLY WRITE: replace ONLY the Design Intent narrative on an existing
 * Project Report snapshot, preserving every other payload field and every source
 * fingerprint.
 *
 * It is the write half of the deliberate Regenerate Design Intent action. The
 * narrative record it commits is the exact record the writer produced and the
 * designer reviewed — it is never regenerated here, never re-read from the model,
 * and never reconstructed from the design. Nothing about the engineering
 * evidence, the drawings, the report pages, the source fingerprints or the
 * snapshot identity is touched: only `payload.design_intent` is overwritten.
 *
 * Pure apart from its injected entity client: no React, no SDK construction, no
 * runtime-specific APIs. The caller decides what it is physically able to reach.
 */

/** The minimum length a finished Design Intent paragraph must carry. */
const MIN_TEXT_LENGTH = 120;

/**
 * Commit one reviewed, accepted narrative record onto the existing Project Report
 * snapshot for this version.
 *
 * @param {Object} input
 * @param {Object} input.entities — the user-scoped entity client
 * @param {string} input.projectId
 * @param {string} input.versionId
 * @param {Object} input.narrativeRecord — the writer's accepted narrative record
 *   (status, text, evidence_fingerprints, geometry_fingerprint, …)
 * @param {string} [input.now]
 * @returns {Promise<Object>}
 *   `{ ok: false, block }` — the commit could not be set up; nothing was written
 *   `{ ok: true, snapshot_id, text }` — the narrative was committed
 */
export async function commitReportDesignIntent({
  entities,
  projectId = null,
  versionId = null,
  narrativeRecord = null,
  now = null,
} = {}) {
  if (!projectId || !versionId) {
    return { ok: false, block: { code: 'invalid_request', status: 400, error: 'project_id and version_id are required.' } };
  }
  if (!narrativeRecord || typeof narrativeRecord !== 'object' || Array.isArray(narrativeRecord)) {
    return { ok: false, block: { code: 'invalid_record', status: 400, error: 'A valid narrative record is required.' } };
  }
  if (narrativeRecord.status !== 'accepted') {
    return { ok: false, block: { code: 'not_accepted', status: 400, error: 'Only an accepted narrative may be committed.' } };
  }
  const text = typeof narrativeRecord.text === 'string' ? narrativeRecord.text.trim() : '';
  if (text.length < MIN_TEXT_LENGTH) {
    return { ok: false, block: { code: 'incomplete', status: 400, error: 'The narrative text is incomplete, so it was not saved.' } };
  }

  // The saved Project Report this narrative belongs to. A report that has not been
  // generated has no snapshot to commit against, so the commit is refused and
  // nothing is written.
  const snapshotPage = await entities.ReportSnapshot.filter(
    { project_id: projectId, version_id: versionId, report_type: 'project' },
    { limit: 1 },
  );
  const snapshot = (snapshotPage?.items || [])[0] || null;
  if (!snapshot) {
    return {
      ok: false,
      block: {
        code: 'project_report_missing',
        status: 409,
        error: 'The Project Report has not been generated for this version yet, so there is no report to update.',
      },
    };
  }

  // ── THE ONE WRITE, and only for the reviewed narrative ──
  // Every other payload field — the report evidence, the presentation inputs, the
  // page inventory, the source fingerprints — is preserved exactly as it stands.
  const existingPayload = (snapshot.payload && typeof snapshot.payload === 'object') ? snapshot.payload : {};
  const payload = { ...existingPayload, design_intent: narrativeRecord };
  const saved = await entities.ReportSnapshot.update(snapshot.id, { payload });

  return {
    ok: true,
    snapshot_id: saved?.id || snapshot.id,
    text: narrativeRecord.text,
  };
}

export default commitReportDesignIntent;