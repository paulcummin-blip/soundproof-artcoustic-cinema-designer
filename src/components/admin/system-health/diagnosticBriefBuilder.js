/**
 * diagnosticBriefBuilder.js
 * -------------------------
 * Builds a structured plain-text diagnostic brief from a SystemHealthIncident
 * record, suitable for pasting directly into ChatGPT for a Base44 DISCUSS,
 * DO THIS or Work investigation.
 *
 * Pure: no React, no SDK, no side effects.
 * Never includes proposal text, client briefs, passwords, API keys or
 * confidential documents. Only safe diagnostic codes, timestamps, stage
 * names, and operation identifiers.
 */

function safe(value, fallback = 'Unknown') {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
}

function formatTime(iso) {
  if (!iso) return 'Unknown';
  try {
    return new Date(iso).toISOString();
  } catch {
    return String(iso);
  }
}

function formatTimeline(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) return 'No stage timeline recorded.';
  return timeline.map((entry, i) => {
    const stage = safe(entry.stage, 'unknown');
    const ts = formatTime(entry.timestamp);
    return `  ${i + 1}. ${stage} at ${ts}`;
  }).join('\n');
}

function describeExpected(errorCode, component) {
  const code = errorCode || 'UNKNOWN';
  const expectations = {
    DRAFT_REJECTED: 'The approved writer should produce a draft that passes the validation contract, which is then published into the proposal sections.',
    SECTION_MAPPING_FAILED: 'The validated writer copy should be mapped to the proposal section structure with no unmapped sections.',
    PROVIDER_FAILED: 'The AI provider should return a valid response that the writer can process.',
    WRITER_REFUSAL: 'The writer should accept the evidence pack and begin writing. A refusal means a pre-condition was not met.',
    OPERATION_STALLED: 'The operation should continue reporting progress until it completes or fails with a known error.',
    EVIDENCE_READ_FAILED: 'The evidence reader should build the frozen evidence pack from the saved Project Report.',
    READINESS_GATE_FAILED: 'The readiness gate should pass, confirming the Project Report is current and proposal-ready.',
    COMPARISON_EVIDENCE_MISSING: 'Comparison evidence should be built for every selected version.',
    COMPARISON_TABLE_EMPTY: 'The comparison table should be built with at least one row.',
    STORAGE_FAILED: 'The report PDF should be stored to the issued-document library and verified.',
    PRINT_PREPARATION_FAILED: 'Print preparation should complete so the print dialogue can open.',
    EXPORT_FAILED: 'The report export should complete successfully.',
    UNEXPECTED_ERROR: 'The operation should complete without an unexpected error.',
  };
  return expectations[code] || 'The operation should complete successfully.';
}

function describeActual(incident) {
  const parts = [];
  parts.push(`Error code: ${safe(incident.error_code)}`);
  if (incident.diagnostic_summary) {
    parts.push(`Diagnostic: ${incident.diagnostic_summary}`);
  }
  if (incident.stage_failed) {
    parts.push(`Stopped at stage: ${incident.stage_failed}`);
  }
  if (incident.cause_classification === 'confirmed') {
    parts.push(`Cause: Confirmed — ${incident.cause_summary || 'see diagnostic summary'}`);
  } else if (incident.cause_classification === 'suspected') {
    parts.push(`Cause: Suspected — ${incident.cause_summary || 'see diagnostic summary'}`);
  } else {
    parts.push(`Cause: Unknown — ${incident.cause_summary || 'the cause has not been determined'}`);
  }
  return parts.join('\n');
}

function describeDelta(incident) {
  const code = incident.error_code || 'UNKNOWN';
  const deltas = {
    DRAFT_REJECTED: 'The writer produced a draft, but it failed the validation contract. The proposal was not saved.',
    SECTION_MAPPING_FAILED: 'The writer produced valid copy, but it could not be mapped to the proposal section structure. The proposal was not saved.',
    PROVIDER_FAILED: 'The AI provider did not return a usable response. No draft was produced.',
    WRITER_REFUSAL: 'The writer refused to start. No draft was produced. A pre-condition was not met.',
    OPERATION_STALLED: 'The operation stopped reporting progress and did not complete or fail with a known error within the stall threshold.',
    EVIDENCE_READ_FAILED: 'The evidence reader could not build the evidence pack from the saved Project Report.',
    READINESS_GATE_FAILED: 'The readiness gate blocked generation because the Project Report is stale or missing.',
    STORAGE_FAILED: 'The report PDF was not stored to the issued-document library.',
    PRINT_PREPARATION_FAILED: 'Print preparation failed before the print dialogue could open.',
    EXPORT_FAILED: 'The report export failed during preparation.',
    UNEXPECTED_ERROR: 'An unexpected error occurred. The operation did not complete.',
  };
  return deltas[code] || 'The operation did not complete as expected.';
}

function describeSeverity(incident) {
  const sev = incident.severity || 'medium';
  const impact = {
    critical: 'Critical — the system is broken. The dealer cannot use the affected feature until the defect is fixed.',
    high: 'High — the user experience was disrupted. Review the recorded impact and recovery options.',
    medium: 'Medium — a structural or operational failure. The dealer may be able to retry.',
    low: 'Low — a pre-condition was not met. The dealer needs to fix the condition before retrying.',
  };
  return impact[sev] || impact.medium;
}

function describeNextTest(incident) {
  const code = incident.error_code || 'UNKNOWN';
  const nextTests = {
    DRAFT_REJECTED: 'Inspect the ProposalGeneration audit record (if available) for the full validation error list. Check whether the violation codes indicate a prompt issue, an evidence issue, or a contract schema mismatch.',
    SECTION_MAPPING_FAILED: 'Check the writer output section types against the proposal section definitions. The unmapped section types are recorded in the diagnostic summary.',
    PROVIDER_FAILED: 'Check whether the AI provider is operational. Review the function logs for the provider error message. If intermittent, test with a retry.',
    WRITER_REFUSAL: 'Check the refusal reason in the diagnostic summary. Verify whether the evidence pack was complete, the writer flag was on, or a pre-condition was missing.',
    OPERATION_STALLED: 'Check whether the operation is still running (browser tab open), whether the browser crashed, or whether a network interruption occurred. The stall is evidence of no progress, not proof of the cause. Inspect the function logs for the last stage.',
    EVIDENCE_READ_FAILED: 'Check whether the Project Report exists and is current. The evidence reader may have failed because the report is stale, incomplete, or missing.',
    READINESS_GATE_FAILED: 'Regenerate the Project Report for the affected version. The design changed after the report was generated.',
    STORAGE_FAILED: 'Check the issued-document storage pipeline. Verify whether the upload, verification or registration step failed.',
    UNEXPECTED_ERROR: 'Inspect the function logs for the full stack trace. The error was not caught by any known failure path.',
  };
  return nextTests[code] || 'Inspect the function logs for more detail. The error code does not match a known failure path.';
}

function describeDataIntegrity(incident) {
  if (incident.data_integrity_summary) return incident.data_integrity_summary;
  if (incident.data_committed === true) return 'Durable data was committed. The operation may have partially completed before the failure.';
  if (incident.data_committed === false) return 'All data was rolled back. No durable data was committed.';
  return 'Unknown — whether data was committed has not been recorded.';
}

/**
 * Build the full diagnostic brief as plain text.
 *
 * @param {Object} incident — the SystemHealthIncident record
 * @param {Object} identity — { dealerName, projectName, clientName }
 * @returns {string} plain-text brief suitable for ChatGPT
 */
export function buildDiagnosticBrief(incident, identity = {}) {
  const ref = safe(incident.incident_reference);
  const dealerName = identity.dealerName || incident.dealer_name || incident.account_name || 'Unknown';
  const projectName = identity.projectName || incident.project_name || 'Unknown';
  const clientName = identity.clientName ? ` (client: ${identity.clientName})` : '';

  const lines = [];
  lines.push(`SOUND PROOF SYSTEM HEALTH DIAGNOSTIC BRIEF`);
  lines.push(`Incident Reference: ${ref}`);
  lines.push(`=` .repeat(60));
  lines.push('');
  lines.push(`TEST`);
  lines.push(`Operation: ${safe(incident.operation)}`);
  lines.push(`Component: ${safe(incident.component)}`);
  lines.push(`Intended result: ${describeExpected(incident.error_code, incident.component)}`);
  lines.push('');
  lines.push(`EXPECTED`);
  lines.push(describeExpected(incident.error_code, incident.component));
  lines.push('');
  lines.push(`ACTUAL`);
  lines.push(describeActual(incident));
  lines.push('');
  lines.push(`DELTA`);
  lines.push(describeDelta(incident));
  lines.push('');
  lines.push(`SEVERITY`);
  lines.push(describeSeverity(incident));
  lines.push('');
  lines.push(`EVIDENCE`);
  lines.push(`Incident reference: ${ref}`);
  lines.push(`Operation ID: ${safe(incident.operation_id)}`);
  lines.push(`Error code: ${safe(incident.error_code)}`);
  lines.push(`Started at: ${formatTime(incident.operation_started_at)}`);
  lines.push(`Last progress at: ${formatTime(incident.operation_last_progress_at)}`);
  lines.push(`Failed at: ${formatTime(incident.operation_failed_at)}`);
  lines.push(`Stage where it stopped: ${safe(incident.stage_failed)}`);
  lines.push('');
  lines.push(`Stage timeline:`);
  lines.push(formatTimeline(incident.stage_timeline));
  lines.push('');
  lines.push(`Cause classification: ${safe(incident.cause_classification)}`);
  if (incident.cause_summary) {
    lines.push(`Cause summary: ${incident.cause_summary}`);
  }
  lines.push(`Occurrences: ${safe(incident.occurrence_count, '1')}`);
  if (incident.proposal_generation_id) {
    lines.push(`Proposal generation audit ID: ${incident.proposal_generation_id}`);
  }
  if (incident.proposal_id) {
    lines.push(`Proposal ID: ${incident.proposal_id}`);
  }
  lines.push('');
  lines.push(`DATA INTEGRITY`);
  lines.push(describeDataIntegrity(incident));
  lines.push('');
  lines.push(`DEALER IMPACT`);
  lines.push(`Account: ${safe(incident.account_name)} (${safe(incident.account_id)})`);
  lines.push(`Dealer: ${dealerName}`);
  lines.push(`Project ID: ${safe(incident.project_id)}`);
  lines.push(`Reference: ${safe(incident.project_reference)}`);
  lines.push(`Version: ${safe(incident.version_name)} (${safe(incident.version_id)})`);
  lines.push(`Page: ${safe(incident.page_path)}`);
  if (incident.error_detail) lines.push(`Error detail: ${incident.error_detail}`);
  if (incident.component_stack) lines.push(`Stack: ${incident.component_stack}`);
  lines.push(`Project: ${projectName}${clientName}`);
  lines.push(`User blocked: ${incident.user_blocked === true ? 'Yes' : incident.user_blocked === false ? 'No' : 'Unknown'}`);
  lines.push(`Workaround available: ${incident.workaround_available === true ? 'Yes' : incident.workaround_available === false ? 'No' : 'Unknown'}`);
  lines.push(`Dealer contacted: ${incident.dealer_contacted ? 'Yes' : 'No'}`);
  lines.push('');
  lines.push(`RECOVERY`);
  lines.push(`Recovery attempted: ${incident.recovery_attempted ? 'Yes' : 'No'}`);
  lines.push(`Recovery successful: ${incident.recovery_successful ? 'Yes' : 'No'}`);
  if (incident.recovery_summary) {
    lines.push(`Recovery summary: ${incident.recovery_summary}`);
  }
  lines.push('');
  lines.push(`NEXT TEST`);
  lines.push(describeNextTest(incident));
  lines.push('');
  lines.push(`=` .repeat(60));
  lines.push(`This brief was generated by Sound Proof System Health.`);
  lines.push(`No client content, credentials, proposal text or confidential`);
  lines.push(`information is included. Only safe diagnostic codes, timestamps,`);
  lines.push(`stage names and operation identifiers are present.`);

  return lines.join('\n');
}

export default buildDiagnosticBrief;