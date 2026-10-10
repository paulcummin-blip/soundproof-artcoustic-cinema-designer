import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildHistoricalEvidenceCandidate, validateHistoricalEvidenceCandidate, evidenceDiff } from '../../shared/historicalReportEvidenceCandidate.js';
import { checkPinnedReportEvidenceParity, stableEvidence } from '../../shared/pinnedReportEvidenceParity.js';
import { selectStrengthStoriesFromReportEvidence } from '../../shared/strengthEvidenceContext.js';
import { resolveSavedReportCell } from '../../shared/proposalReadinessAuthority.js';

// ALL-OR-NOTHING repair of exactly two approved historical reportEvidence payloads.
// Both candidates are fully re-validated before either record is written; if either
// fails at any gate, NOTHING is written. Only payload.reportEvidence and
// payload.evidence_parity are touched — identity, status, generated_at, source
// fingerprints, the human report payload, ProjectVersion, publications and the bass
// cache are never read for write and never modified.
const APPROVED = {
  '6ac9040e4eb1d249ea0bc045': {
    label: 'GENESIS',
    engineeringFingerprint: 'eng:v1:c3bc6139a955a04f',
    preStateFingerprint: 're1-da75edae-1c35b',
    candidateFingerprint: 're1-58d7fa18-1c8ec',
    expectedOrder: ['tonal-consistency', 'immersive-layout', 'bass-output', 'spatial-resolution', 'viewing-geometry'],
  },
  '6ac8dcf3c383de099580b031': {
    label: 'MARQUEE',
    engineeringFingerprint: 'eng:v1:bcd7564a7c3136f8',
    preStateFingerprint: 're1-3ec02e0d-204fe',
    candidateFingerprint: 're1-fab81eb8-20e65',
    expectedOrder: ['dynamic-capability', 'tonal-consistency', 'bass-output', 'immersive-layout', 'low-frequency-extension', 'spatial-resolution', 'viewing-geometry'],
  },
};

// The only evidence paths this repair is allowed to change (identical to the
// candidate validator's allow-list).
const ALLOWED = [
  /^(screen\.display_type|evidence_fingerprint|bass\.(current|rsp_curve_ref)|bass\.p19\.rsp\.(raw_value|display_value|level|state)|seating\.rsp_bass(?:\.|$))/,
  /^(parameter_index\.P\d+|parameters\[\d+\])(?:\.supporting_per_seat\[\d+\])?\.state$/,
  /^(parameter_index\.P5|parameters\[4\])\./,
];
const isAllowedPath = path => ALLOWED.some(re => re.test(path));

const restOfPayload = payload => {
  const copy = { ...(payload || {}) };
  delete copy.reportEvidence;
  delete copy.evidence_parity;
  return stableEvidence(copy);
};

const protectedShape = snapshot => ({
  id: snapshot.id,
  project_id: snapshot.project_id,
  version_id: snapshot.version_id,
  account_id: snapshot.account_id,
  report_type: snapshot.report_type,
  report_schema_version: snapshot.report_schema_version,
  source_fingerprints: stableEvidence(snapshot.source_fingerprints),
  generated_at: snapshot.generated_at,
  created_date: snapshot.created_date,
  status: snapshot.status,
  status_reason: snapshot.status_reason ?? null,
  payload_keys: Object.keys(snapshot.payload || {}).sort(),
  payload_other: restOfPayload(snapshot.payload),
});

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin-only historical repair' }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    const ids = Array.isArray(input.snapshot_ids) ? input.snapshot_ids : Object.keys(APPROVED);
    if (!Array.isArray(ids) || ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => !APPROVED[id])) {
      return Response.json({ error: 'Exactly the two approved historical snapshot IDs are required' }, { status: 400 });
    }
    const offered = input.candidate_fingerprints || {};
    for (const id of ids) {
      if (offered[id] && offered[id] !== APPROVED[id].candidateFingerprint) {
        return Response.json({ error: `Offered candidate fingerprint for ${id} is not the validated one` }, { status: 409 });
      }
    }

    // ── STAGE 1: re-read, gate, and prepare both candidates. No writes yet. ──
    const prepared = [];
    for (const id of ids) {
      const spec = APPROVED[id];
      const snapshot = await base44.asServiceRole.entities.ReportSnapshot.get(id);
      const page = await base44.asServiceRole.entities.ProjectAnalysisCache.filter(
        { project_id: snapshot.project_id, version_id: snapshot.version_id }, { limit: 50 },
      );
      const rows = Array.isArray(page) ? page : (page?.items || []);
      if (page?.has_more) throw new Error('Ambiguous cache page; repair stopped without writes');
      const fingerprint = snapshot.source_fingerprints?.engineeringFingerprint;
      const owners = rows.filter(row => row.engineering_publications?.[fingerprint]);
      if (owners.length !== 1) throw new Error(`Exact pinned publication must resolve once for ${spec.label}`);
      const publication = owners[0].engineering_publications[fingerprint];

      const storedFingerprint = snapshot.payload?.reportEvidence?.evidence_fingerprint ?? null;
      const before = protectedShape(snapshot);
      const validation = validateHistoricalEvidenceCandidate(snapshot, publication, spec.expectedOrder);
      const candidate = buildHistoricalEvidenceCandidate(snapshot, publication);

      const gates = {
        engineering_fingerprint_pinned: snapshot.source_fingerprints?.engineeringFingerprint === spec.engineeringFingerprint
          && publication.engineering_fingerprint === spec.engineeringFingerprint,
        source_state_unchanged: storedFingerprint === spec.preStateFingerprint,
        parity_mismatch_zero: validation.parity.mismatch_count === 0,
        parity_passed: validation.parity.passed === true,
        proposal_ready: validation.proposal_ready === true,
        strength_parity: validation.strength_parity === true,
        expected_order_match: validation.expected_order_match === true,
        p19_ineligible: validation.p19?.eligible === false,
        p20_preserved: validation.p20_diagnostics_preserved === true,
        candidate_fingerprint: validation.evidence_fingerprint === spec.candidateFingerprint
          && candidate.evidence_fingerprint === spec.candidateFingerprint,
        only_allowed_paths: validation.unrelated_changes.length === 0
          && evidenceDiff(snapshot.payload.reportEvidence, candidate).every(row => isAllowedPath(row.path)),
      };
      prepared.push({ id, spec, snapshot, publication, candidate, validation, before, gates });
    }

    const failed = prepared.flatMap(p => Object.entries(p.gates).filter(([, ok]) => !ok).map(([gate]) => ({ id: p.id, label: p.spec.label, gate })));
    if (failed.length) {
      return Response.json({
        applied: false,
        aborted: true,
        reason: 'A candidate failed validation; both writes aborted, nothing changed',
        failed_gates: failed,
      }, { status: 409 });
    }

    // ── STAGE 2: apply both evidence-only payload writes. ──
    const nextPayload = p => ({
      ...(p.snapshot.payload || {}),
      reportEvidence: p.candidate,
      evidence_parity: { proposal_ready: p.validation.parity.passed === true },
    });
    for (const p of prepared) {
      await base44.asServiceRole.entities.ReportSnapshot.update(p.id, { payload: nextPayload(p) });
    }

    // ── STAGE 3: read back and verify. ──
    const verifications = [];
    for (const p of prepared) {
      const stored = await base44.asServiceRole.entities.ReportSnapshot.get(p.id);
      const evidence = stored.payload?.reportEvidence ?? null;
      const storedDiff = evidenceDiff(p.snapshot.payload.reportEvidence, evidence).map(row => row.path);
      const parity = checkPinnedReportEvidenceParity({
        evidence,
        publication: p.publication,
        snapshot: { ...stored, payload: { ...stored.payload, reportEvidence: p.snapshot.payload.reportEvidence } },
      });
      const readiness = resolveSavedReportCell({ saved: stored, currentFingerprints: stored.source_fingerprints });
      const selection = selectStrengthStoriesFromReportEvidence(evidence);
      const after = protectedShape(stored);
      verifications.push({
        id: p.id,
        label: p.spec.label,
        evidence_fingerprint: evidence?.evidence_fingerprint ?? null,
        fingerprint_ok: evidence?.evidence_fingerprint === p.spec.candidateFingerprint,
        parity_mismatch_count: parity.mismatch_count,
        proposal_ready: evidence?.proposal_ready === true && readiness.current === true,
        strength_order: selection.selected,
        strength_order_ok: stableEvidence(selection.selected) === stableEvidence(p.spec.expectedOrder),
        p19_ineligible: selection.byKey?.p19?.eligible === false,
        p20_preserved: JSON.stringify(p.snapshot.payload.reportEvidence.bass?.p20) === JSON.stringify(evidence?.bass?.p20),
        changed_paths_only_allowed: storedDiff.every(isAllowedPath),
        changed_path_count: storedDiff.length,
        protected_unchanged: stableEvidence(after) === stableEvidence(p.before),
        protected: after,
      });
    }

    return Response.json({
      applied: true,
      persisted: true,
      verified: verifications.every(v => v.fingerprint_ok && v.parity_mismatch_count === 0 && v.proposal_ready
        && v.strength_order_ok && v.p19_ineligible && v.p20_preserved && v.changed_paths_only_allowed && v.protected_unchanged),
      results: verifications.map(v => ({
        id: v.id, label: v.label, evidence_fingerprint: v.evidence_fingerprint, fingerprint_ok: v.fingerprint_ok,
        parity_mismatch_count: v.parity_mismatch_count, proposal_ready: v.proposal_ready,
        strength_order: v.strength_order, strength_order_ok: v.strength_order_ok,
        p19_ineligible: v.p19_ineligible, p20_preserved: v.p20_preserved,
        changed_path_count: v.changed_path_count, changed_paths_only_allowed: v.changed_paths_only_allowed,
        protected_unchanged: v.protected_unchanged,
      })),
    });
  } catch (error) {
    return Response.json({ applied: false, aborted: true, error: error.message }, { status: 409 });
  }
}