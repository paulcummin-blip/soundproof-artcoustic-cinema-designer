/**
 * A refused generation's message must not outlive the verdict that produced it.
 *
 * Reported symptom: the readiness card read Current, yet the wizard's last step
 * still showed the refused attempt's "stale Project Report" message, because the
 * message is dropped only when the readiness VERDICT changes — and a refusal that
 * arrives while the verdict already reads Current changes nothing, so the message
 * stayed for the rest of the session.
 *
 * The message is a readiness verdict, so it is shown only while the readiness
 * result states it; a failure the readiness authority does not speak about (a
 * provider failure, an unconfirmed handoff) is never a readiness verdict and is
 * left exactly as it was.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'vitest';

import { isReadinessRefusalMessage } from '../components/proposal/sourceAuthority/proposalReadinessAuthority.js';

const WIZARD = fs.readFileSync(
  new URL('../components/proposal/CreateProposalWizard.jsx', import.meta.url),
  'utf8',
);

// ── TEST 1 — the gate's own refusals are recognised ──────────────────────────
test('TEST 1 — every refusal the generation gate can state about the gated report is a readiness verdict', () => {
  // The reader's own wording, verbatim (base44/shared/proposalReportEvidenceReader.js).
  const refusals = [
    'Original Design: stale Project Report. The design changed after it was generated. Regenerate it before creating a proposal.',
    'Original Design: stale Project Report. Regenerate it before creating a proposal.',
    'Original Design: missing Project Report. Generate it before creating a proposal.',
    'Original Design: incomplete Project Report evidence (2 values did not match). Regenerate the Project Report for this version, then try again.',
    'Original Design: Project Report is current, but it needs a one-time evidence refresh. Open the Project Report for this version once to recover its stored evidence, then try again.',
    'Original Design: the stored Project Report evidence belongs to another version. Regenerate the Project Report for this version, then try again.',
    'Living Room needs a current Project Report.',
  ];
  for (const message of refusals) {
    assert.equal(isReadinessRefusalMessage(message), true, message);
  }
});

// ── TEST 2 — a failure the authority does not speak about is untouched ───────
test('TEST 2 — a failure the generation itself produced is never treated as a readiness verdict', () => {
  const failures = [
    'Generation failed. Please try again.',
    'No proposal ID returned',
    'The writer returned no output for the system overview section.',
    'The proposal was saved but its sections could not be confirmed.',
    'Project account does not match the active account.',
    'A proposal with this request already exists.',
    '',
    null,
    undefined,
  ];
  for (const message of failures) {
    assert.equal(isReadinessRefusalMessage(message), false, String(message));
  }
});

// ── TEST 3 — the last step drops the message when the verdict reads Current ──
test('TEST 3 — the clearing effect listens to the message as well as the verdict', () => {
  const start = WIZARD.indexOf('// A refused generation leaves its reason on screen');
  const end = WIZARD.indexOf('// The preparation step, from the SAME readiness rows');
  assert.ok(start !== -1 && end > start, 'the clearing effect is still in the wizard');
  const effect = WIZARD.slice(start, end);

  // The defect: keyed on the verdict alone, a refusal that arrived under an
  // already-Current verdict could never be cleared.
  assert.doesNotMatch(effect, /\}, \[readiness\.ready\]\);/);
  assert.match(effect, /\}, \[readiness\.ready, error\]\);/);

  // It clears a readiness verdict's message, and only that.
  assert.match(effect, /if \(!readiness\.ready \|\| !error\) return;/);
  assert.match(effect, /if \(!isReadinessRefusalMessage\(error\)\) return;/);
  assert.match(effect, /setError\(null\);/);
});

// ── TEST 4 — the message the last step shows is the state this effect clears ─
test('TEST 4 — the state the last step renders is the state the effect clears', () => {
  assert.match(WIZARD, /const \[error, setError\] = useState\(null\);/);
  assert.match(WIZARD, /\{!snapshotLoading && error && \(/);
  assert.match(WIZARD, /setError\(errorData\?\.error \|\| err\?\.message \|\| 'Generation failed\. Please try again\.'\);/);
});