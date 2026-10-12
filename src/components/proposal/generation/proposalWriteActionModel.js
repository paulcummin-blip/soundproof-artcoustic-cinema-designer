/**
 * proposalWriteActionModel.js
 * ---------------------------
 * When regeneration is offered, what it says, and which attempt a retry would
 * point at.
 *
 * Pure and dependency-free, so the visibility rule is testable and is not spread
 * through the component: while the flag is off the action does not exist at all —
 * there is no button to press and no call to make — and the proposal's own
 * sections carry on being edited exactly as before.
 *
 * Props of the model, all from the server:
 * - writer: the resolved flag state from readProposalEditLayer
 * - layer: the copy layer (which attempts exist, and which failed)
 * - readOnly: the proposal is archived
 */

/**
 * The one label the regeneration action carries. Regeneration is a secondary
 * action in the editor: it is asked for by name, and it never presents itself as
 * a test tool or explains how the writer works.
 */
const REGENERATE_LABEL = 'Regenerate Copy';

/** The attempts that failed and can be retried. */
function failedAttempts(layer) {
  return Array.isArray(layer?.failures) ? layer.failures : [];
}

export function proposalWriteActionModel({ writer = null, layer = null, readOnly = false } = {}) {
  // Who may regenerate is decided on the server: the master flag plus the accounts
  // and emails it names are resolved into `writer` when the layer is read. This
  // model adds no role requirement of its own, because regenerating is part of a
  // dealer's own workflow — an authorised dealer asks for their copy again through
  // this same validated path. The dev-facing diagnostics are the audit trail and
  // the diagnostics page, which stay with a master admin.
  const enabled = writer?.enabled === true;

  if (!enabled || readOnly) {
    return {
      visible: false,
      enabled: false,
      label: null,
      beta: null,
      disclaimer: null,
      message: writer?.message || null,
      has_valid_copy: false,
      generate_label: null,
      retry_generation_id: null,
      retry_label: null,
    };
  }

  const failures = failedAttempts(layer);
  const newestFailure = failures[0] || null;
  const hasValidCopy = layer?.mode === 'edit_layer';

  return {
    visible: true,
    enabled: true,
    label: REGENERATE_LABEL,
    beta: null,
    disclaimer: null,
    message: null,
    has_valid_copy: hasValidCopy,
    generate_label: REGENERATE_LABEL,
    // Retry points at the newest failed attempt. The server refuses a retry whose
    // evidence has moved on and says so, rather than relinking it silently.
    retry_generation_id: newestFailure?.generation_id || null,
    retry_label: newestFailure ? 'Retry that attempt' : null,
  };
}

/** The sentence shown once an attempt has been recorded. */
export function generationOutcomeSentence(status) {
  switch (status) {
    case 'valid_generated':
      return 'The copy was written and passed every rule. It is ready to be reviewed, edited or issued.';
    case 'needs_human_review':
      return 'The draft was written but broke an evidence rule, so it is kept for review and cannot be issued.';
    case 'validation_failed':
      return 'The draft did not come back in the contract\u2019s shape, so it is kept for review and cannot be issued.';
    case 'provider_failed':
      return 'The writer did not return anything. The attempt has been recorded and can be retried.';
    default:
      return 'The attempt has been recorded.';
  }
}

export default proposalWriteActionModel;