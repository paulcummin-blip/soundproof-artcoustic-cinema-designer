/**
 * designIntentProductionAttempt.js (shared)
 * ----------------------------------------
 * ONE production Project Report Design Intent attempt, end to end, in exactly the
 * order the production generator runs it: the saved project, the saved design
 * version, the Project Report the narrative belongs to, the writer's own switch,
 * the frozen report evidence, the confirmed report geometry, the Project Library's
 * pictures, and then runReportDesignIntent — the ONE writer.
 *
 * It exists so that the production generator and a read-only preview cannot drift
 * apart into two writers. Both call this, so a preview is the real production path
 * with the real evidence read, the real interpretation input, the real writing
 * contract and the real prompt version — and not a second, simplified writer. The
 * only difference between the two callers is what they do with the result: the
 * generator saves an accepted narrative beside the report, and the preview saves
 * nothing at all.
 *
 * It READS ONLY. There is no write, no publish, no approval, no readiness change
 * and no snapshot update anywhere in this module. Its entity clients and its
 * provider call are injected rather than constructed, so a preview can hand it
 * clients that physically refuse to write, and the module is then incapable of
 * writing even if it tried.
 *
 * Pure apart from the injected calls: no React, no SDK, no runtime-specific APIs.
 */

import { readProposalReportEvidence } from '../proposalReportEvidenceReader.js';
import { GPT_WRITER_FLAG_FIELD, resolveGptWriterFlag } from '../proposalWriter/proposalWriterFlag.js';
import { DESIGN_INTENT_REFUSAL, runReportDesignIntent } from './reportDesignIntentRunner.js';
import { buildReportGeometryContext } from './reportGeometryContext.js';
import { buildReportVisualContext } from './reportVisualContext.js';

/** Why a production attempt could not be set up at all. */
export const DESIGN_INTENT_ATTEMPT_BLOCK = Object.freeze({
  INVALID_REQUEST: 'invalid_request',
  PROJECT_NOT_FOUND: 'project_not_found',
  VERSION_NOT_FOUND: 'version_not_found',
  NO_REPORT: 'project_report_missing',
});

/** A setup refusal, in the shape every caller reports. */
function blocked(code, status, error, reason = null) {
  return { ok: false, block: { code, status, error, reason } };
}

/**
 * Run one production attempt.
 *
 * @param {Object} input
 * @param {Object} input.entities — the user-scoped entity client
 * @param {Object} input.authorityEntities — the engineering-authority entity client
 * @param {Function} input.invokeLLM — the server-side provider call
 * @param {string} input.projectId
 * @param {string} input.versionId
 * @param {Object} [input.user]
 * @param {string} [input.accountIdFallback] — the login's account, where the
 *   project itself states none
 * @param {boolean} [input.isMasterAdmin]
 * @param {string} [input.now]
 * @param {Function} [input.onEvidencePack] — observability only: handed the very
 *   pack and writer input the writer was given, so a caller can report the exact
 *   evidence an attempt wrote from without building a second evidence path.
 * @returns {Promise<Object>} `{ ok: true, project, version, snapshot, flag, attempt }`
 *   or `{ ok: false, block }`
 */
export async function runProductionDesignIntentAttempt({
  entities,
  authorityEntities,
  invokeLLM,
  projectId = null,
  versionId = null,
  user = null,
  accountIdFallback = null,
  isMasterAdmin = false,
  now = null,
  onEvidencePack = null,
} = {}) {
  if (!projectId || !versionId) {
    return blocked(DESIGN_INTENT_ATTEMPT_BLOCK.INVALID_REQUEST, 400, 'project_id and version_id are required.');
  }

  const project = await entities.Project.get(projectId).catch(() => null);
  if (!project?.id) return blocked(DESIGN_INTENT_ATTEMPT_BLOCK.PROJECT_NOT_FOUND, 404, 'That project was not found.');

  const version = await entities.ProjectVersion.get(versionId).catch(() => null);
  if (!version?.id || String(version.project_id || '') !== String(projectId)) {
    return blocked(DESIGN_INTENT_ATTEMPT_BLOCK.VERSION_NOT_FOUND, 404, 'That design version is not part of this project.');
  }

  // The saved Project Report this narrative belongs to. A report that has not been
  // generated has no frozen evidence to write from, so no attempt is made.
  const snapshotPage = await entities.ReportSnapshot.filter(
    { project_id: projectId, version_id: versionId, report_type: 'project' },
    { limit: 1 },
  );
  const snapshot = (snapshotPage?.items || [])[0] || null;
  if (!snapshot) {
    return blocked(
      DESIGN_INTENT_ATTEMPT_BLOCK.NO_REPORT,
      409,
      'The Project Report has not been generated for this version yet, so there is no frozen evidence to write from.',
      DESIGN_INTENT_REFUSAL.NO_EVIDENCE,
    );
  }

  // ── THE PROJECT LIBRARY'S OWN PICTURES, for the writer's visual context ──
  // Read with the DESIGNER'S OWN session, never the service role, so the same
  // record-level access that governs the Library governs this read. A library that
  // cannot be read is simply no visual context at all: the attempt continues and
  // writes the text-only narrative it has always written.
  const assetPage = await entities.ProposalAsset
    .filter({ project_id: projectId }, { limit: 100 })
    .catch(() => null);
  const libraryImages = assetPage?.items || [];

  // ── The writer's own switch, before any evidence is read ──
  const configResult = await authorityEntities.SystemConfig.filter({}, { limit: 1 });
  const configRecord = (Array.isArray(configResult) ? configResult : (configResult?.items || []))[0] || null;
  const flag = resolveGptWriterFlag({
    config: configRecord?.[GPT_WRITER_FLAG_FIELD] || null,
    accountId: project.account_id || accountIdFallback || null,
    email: user?.email || null,
    isMasterAdmin: isMasterAdmin === true,
  });

  const attempt = await runReportDesignIntent({
    flag,
    versionIds: [version.id],
    project,
    // The evidence the narrative is saved against: the exact source inputs the
    // saved Project Report was generated from.
    sourceFingerprints: snapshot.source_fingerprints || null,
    user,
    now,
    readEvidence: async ({ versionIds }) => {
      const page = await entities.ProjectVersion.filter(
        { project_id: projectId, id: { $in: versionIds } },
        { limit: 50 },
      );
      const rows = page?.items || [];
      const versions = versionIds.map((id) => rows.find((row) => row.id === id));
      if (versions.some((row) => !row)) {
        throw new Error('That design version could not be read, so its saved report evidence is unavailable.');
      }
      return readProposalReportEvidence(entities, projectId, versions, {
        authorityEntities,
      });
    },
    invokeLLM,
    // ── THE REPORT'S OWN GEOMETRY, CONFIRMED ──
    // The room and the seat coordinates that produced this saved report and its
    // drawings, read from the report's own frozen geometry and confirmed against the
    // saved design version. Where the saved version has moved to a different room it
    // is not used at all, and the writer is given the pack exactly as before.
    readGeometryContext: async ({ evidence }) => buildReportGeometryContext({
      reportEvidence: evidence?.[0]?.evidence?.project || null,
      version,
      projectId,
      versionId: version.id,
      reportSnapshotId: snapshot.id,
    }),
    readVisualContext: async () => buildReportVisualContext({
      assets: libraryImages,
      versionId: version.id,
    }),
    onEvidencePack,
  });

  return { ok: true, project, version, snapshot, flag, attempt };
}

export default runProductionDesignIntentAttempt;