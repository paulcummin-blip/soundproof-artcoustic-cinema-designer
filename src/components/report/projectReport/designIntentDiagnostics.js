/**
 * designIntentDiagnostics.js
 * --------------------------
 * The technical detail of a REFUSED Astra Design Intent attempt, read back to a
 * master admin in the words the backend used.
 *
 * Where the designer reads "The draft was not accepted, so the report keeps its
 * own Design Intent", this reads the refused attempt back in full: why it was
 * refused, which validator rule refused it, the offending sentence or clause, the
 * claim ID that was cited as its evidence, the exact validation response, and the
 * draft the writer returned.
 *
 * Rules this module holds:
 *   - Nothing is interpreted. The code, the detail, the rule, the sentence and the
 *     draft are the ones the validation and the provider returned.
 *   - The evidence reference is the claim IDs the draft cited, stated as they are.
 *     No claim is re-evaluated here and no evidence is fetched.
 *   - A rejection that names nothing is reported as unclassified rather than
 *     blamed on a field.
 *   - Master admins only. A dealer never sees a diagnostic: this module is the
 *     gate, and the backend does not send the detail to anyone else either.
 *
 * Presentation only: it reads a response, it writes nothing, it changes no
 * engineering value, and it never touches the report or the saved narrative.
 *
 * Pure: rows in, rows out. No reads, no writes, no records.
 */

import { isMasterAdmin } from '@/lib/accountAccess';

/** The heading the master admin sees. */
export const DESIGN_INTENT_DIAGNOSTICS_TITLE = 'TECHNICAL DETAIL — ASTRA DESIGN INTENT';

export const DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE = 'Not available';
export const DESIGN_INTENT_DIAGNOSTIC_NONE_REPORTED = 'None reported';

const SOURCE_FINGERPRINT_LABELS = Object.freeze([
  ['engineeringFingerprint', 'Published engineering fingerprint'],
  ['calculationFingerprint', 'Bass assessment fingerprint'],
  ['seatPriorityFingerprint', 'Seating priority fingerprint'],
]);

/** Who may see the technical detail of a refused Design Intent. Master admins only. */
export function canViewDesignIntentDiagnostics(user) {
  return isMasterAdmin(user);
}

function text(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => text(entry)) : [];
}

/** The validation response the backend returned, unchanged. */
export function designIntentValidationResponse(diagnostics) {
  const validation = diagnostics?.validation;
  return validation && typeof validation === 'object' ? validation : null;
}

/**
 * Every violation the validation reported, normalised for reading. Each entry
 * keeps the rule, the offending text and the evidence reference the validation
 * itself attached — nothing is re-derived here.
 */
export function designIntentDiagnosticViolations(diagnostics) {
  const response = designIntentValidationResponse(diagnostics);
  const reported = Array.isArray(response?.violations) ? response.violations : [];

  return reported.map((entry, index) => {
    const cited = list(entry?.cited_claim_ids ?? entry?.claim_ids);
    const matched = text(entry?.matched_substring);
    const span = entry?.span && Number.isFinite(entry.span.start)
      ? `${entry.span.start}–${entry.span.end}`
      : null;
    return {
      key: `${entry?.code || 'violation'}_${entry?.section || 'document'}_${index}`,
      index,
      code: text(entry?.code) || 'unclassified_violation',
      rule_id: text(entry?.rule_id),
      section: text(entry?.section),
      detail: text(entry?.detail),
      sentence: text(entry?.sentence),
      clause: text(entry?.clause),
      matched_substring: matched,
      span,
      cited_claim_ids: cited,
      blocked_claim_id: text(entry?.block_id),
    };
  });
}

/**
 * WHICH GATE ended the attempt. This is read against the validator's own answer
 * rather than against the refusal code, because the two can only be read together:
 * a reason of "validation failed" beside a validation that passed is the one
 * reading that must never be believed, and it is stated here for what it is.
 */
export function designIntentAcceptanceGate(diagnostics) {
  const reason = text(diagnostics?.reason);
  const response = designIntentValidationResponse(diagnostics);

  if (reason === 'validation_failed') {
    if (!response) {
      return 'Acceptance — no validation result was returned, so the draft could not be accepted.';
    }
    if (response.valid === true) {
      return 'Acceptance — the validator passed this draft with no violations, so the refusal was made after validation, not by it.';
    }
    return `Validation — the validator refused the draft (${designIntentDiagnosticViolations(diagnostics).length} violation(s)).`;
  }

  return REFUSAL_GATE_LABEL[reason] || 'Acceptance — the attempt ended at an unclassified gate.';
}

/** The gate each non-validation refusal ended at. */
const REFUSAL_GATE_LABEL = Object.freeze({
  writer_flag_off: 'Writer switch — the Astra writer is not enabled for this login.',
  report_evidence_unavailable: 'Evidence — the frozen report evidence could not be read.',
  provider_failed: 'Provider — no draft was received, so there was nothing to validate.',
  accepted_text_missing:
    'Acceptance — the validator passed the draft with no violations, but no section text could be read from it.',
});

/** The draft the writer returned, verbatim, in a form that can be read. */
export function designIntentDraftText(diagnostics) {
  const draft = diagnostics?.draft;
  if (typeof draft === 'string') {
    const raw = draft.trim();
    if (raw.length === 0) return null;
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
  if (draft && typeof draft === 'object') {
    try {
      return JSON.stringify(draft, null, 2);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The attempt's own identity and the evidence it was refused against, in the
 * order they are read.
 */
export function buildDesignIntentDiagnosticRows(diagnostics) {
  if (!diagnostics) return [];
  const response = designIntentValidationResponse(diagnostics);
  const provider = diagnostics.provider || {};
  const fingerprints = diagnostics.source_fingerprints || {};
  const violations = designIntentDiagnosticViolations(diagnostics);

  const rows = [
    { key: 'reason', label: 'Refusal reason', value: text(diagnostics.reason) || 'Unclassified refusal' },
    { key: 'detail', label: 'Reported detail', value: text(diagnostics.detail) || DESIGN_INTENT_DIAGNOSTIC_NONE_REPORTED },
    // The gate that actually ended the attempt, so the reason and the validation
    // outcome are never read against each other and misbelieved.
    { key: 'acceptance_gate', label: 'Acceptance gate', value: designIntentAcceptanceGate(diagnostics) },
    {
      key: 'validation_outcome',
      label: 'Validation outcome',
      value: response
        ? (response.valid === true ? 'Passed validation' : 'Refused by the validator')
        : DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE,
    },
    {
      key: 'violations',
      label: 'Violations reported',
      value: response ? String(violations.length) : DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE,
    },
    { key: 'provider', label: 'Provider', value: text(provider.provider) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE },
    { key: 'model', label: 'Model', value: text(provider.model) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE },
    {
      key: 'prompt_version',
      label: 'Prompt version',
      value: text(provider.prompt_version) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE,
    },
    {
      key: 'contract_version',
      label: 'Contract version',
      value: response?.contract_version != null
        ? String(response.contract_version)
        : (provider.contract_version != null ? String(provider.contract_version) : DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE),
    },
    {
      key: 'duration',
      label: 'Attempt duration',
      value: Number.isFinite(provider.duration_ms) ? `${provider.duration_ms} ms` : DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE,
    },
    { key: 'project', label: 'Project ID', value: text(diagnostics.project_id) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE },
    { key: 'version', label: 'Version ID', value: text(diagnostics.version_id) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE },
    {
      key: 'evidence_pack',
      label: 'Evidence pack fingerprint',
      value: text(response?.pack_fingerprint) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE,
    },
    {
      key: 'writer_input',
      label: 'Writer input fingerprint',
      value: text(diagnostics.input_fingerprint) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE,
    },
    { key: 'attempted_at', label: 'Attempted at', value: text(diagnostics.attempted_at) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE },
  ];

  // The evidence the saved report stands on: the attempt is refused against these
  // exact inputs, so they are part of the diagnostic rather than a footnote.
  SOURCE_FINGERPRINT_LABELS.forEach(([key, label]) => {
    rows.push({ key: `source_${key}`, label, value: text(fingerprints[key]) || DESIGN_INTENT_DIAGNOSTIC_NOT_AVAILABLE });
  });

  // The sections the validation read, when it reported them.
  const sections = Array.isArray(response?.sections) ? response.sections : [];
  sections.forEach((section) => {
    rows.push({
      key: `section_${section?.section}`,
      label: `Section read — ${section?.section || 'unnamed'}`,
      value: `${section?.words ?? 0} words against a ${section?.word_limit ?? '?'} word limit · `
        + `${list(section?.claim_ids).length} cited claim ID(s)`,
    });
  });

  return rows;
}

/**
 * The diagnostic as plain text for COPY DIAGNOSTICS — the same detail the panel
 * shows, in the order it shows it, and nothing that is not on screen.
 */
export function formatDesignIntentDiagnosticsText(diagnostics) {
  const lines = [DESIGN_INTENT_DIAGNOSTICS_TITLE, ''];
  if (!diagnostics) {
    lines.push('No refused attempt is held in this session.');
    return lines.join('\n');
  }

  buildDesignIntentDiagnosticRows(diagnostics).forEach((row) => {
    lines.push(`${row.label}: ${row.value}`);
  });

  const violations = designIntentDiagnosticViolations(diagnostics);
  lines.push('');
  lines.push(`VIOLATIONS (${violations.length})`);
  if (violations.length === 0) {
    lines.push('None reported by the validation.');
  }
  violations.forEach((entry) => {
    lines.push('');
    lines.push(`#${entry.index + 1} ${entry.code}${entry.section ? ` · section ${entry.section}` : ''}`);
    if (entry.rule_id && entry.rule_id !== entry.code) lines.push(`  rule: ${entry.rule_id}`);
    if (entry.detail) lines.push(`  detail: ${entry.detail}`);
    if (entry.sentence) lines.push(`  offending sentence: ${entry.sentence}`);
    if (entry.clause) lines.push(`  offending clause: ${entry.clause}`);
    if (entry.matched_substring) lines.push(`  matched text: ${entry.matched_substring}`);
    if (entry.span) lines.push(`  span in section text: ${entry.span}`);
    lines.push(`  evidence reference (cited claim IDs): ${entry.cited_claim_ids.length > 0 ? entry.cited_claim_ids.join(', ') : DESIGN_INTENT_DIAGNOSTIC_NONE_REPORTED}`);
    if (entry.blocked_claim_id) lines.push(`  blocked claim: ${entry.blocked_claim_id}`);
  });

  const draft = designIntentDraftText(diagnostics);
  lines.push('');
  lines.push('DRAFT REFUSED BY THE VALIDATOR');
  lines.push(draft || 'The draft was not returned.');
  lines.push('');
  lines.push('Nothing was saved: the report keeps its own Design Intent.');
  return lines.join('\n');
}

export default buildDesignIntentDiagnosticRows;