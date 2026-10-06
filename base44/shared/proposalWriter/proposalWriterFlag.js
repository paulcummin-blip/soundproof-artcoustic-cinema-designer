/**
 * proposalWriterFlag.js (shared)
 * ------------------------------
 * THE Phase 6 feature flag: whether the controlled GPT proposal writer may be
 * used at all, and by whom.
 *
 * Default OFF, and OFF is the whole of the normal product: no action is shown in
 * the editor and no provider call can be reached, so the current proposal flow
 * carries on exactly as it did.
 *
 * When the master switch is on, the flag is scoped — never "on for everybody":
 *
 *   master OFF                        → nobody, and no provider call
 *   master ON, accounts/emails listed → only those accounts, or those emails
 *   master ON, both lists empty       → only master admins
 *
 * Resolution happens on the server, from the SystemConfig record, so a browser
 * cannot enable the writer for itself. The browser is told the resolved state
 * only — never the raw configuration.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The SystemConfig field the flag lives in. */
export const GPT_WRITER_FLAG_FIELD = 'gpt_proposal_writer';

/** What the action is called, wherever it is shown. */
export const GPT_WRITER_ACTION_LABEL = 'Generate with GPT writer';

/** The action is a controlled test tool, and says so. */
export const GPT_WRITER_BETA_LABEL = 'Beta — test tool';

/** What the test tool writes from, stated wherever the action is offered. */
export const GPT_WRITER_DISCLAIMER =
  'Writes proposal copy from the saved Visual and Technical Report evidence of the selected versions only. '
  + 'It cannot change a figure, a Performance Level or a product, and every draft it returns is checked against '
  + 'the frozen evidence before it can be used.';

/** The scope a resolved flag is in. */
export const GPT_WRITER_MODE = Object.freeze({
  OFF: 'off',
  ADMIN_ONLY: 'admin_only',
  SCOPED: 'scoped',
});

/** Why the writer is unavailable, when it is. */
export const GPT_WRITER_FLAG_REASON = Object.freeze({
  FLAG_OFF: 'flag_off',
  NOT_AUTHORISED: 'not_authorised',
});

/** The sentence a caller shows when the writer is switched off. */
export const GPT_WRITER_DISABLED_MESSAGE =
  'The GPT proposal writer is switched off. This proposal carries on exactly as before.';

/** The sentence a caller shows when the writer is on but not for this login. */
export const GPT_WRITER_NOT_AUTHORISED_MESSAGE =
  'The GPT proposal writer is switched on, but it is not enabled for this account.';

function cleanText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const entry of value) {
    const text = cleanText(entry);
    if (text) seen.add(text);
  }
  return [...seen];
}

/**
 * The flag configuration, read from the stored record and normalised.
 *
 * @param {Object} [value] — the SystemConfig.gpt_proposal_writer object
 * @returns {{ enabled: boolean, accounts: Array<string>, emails: Array<string>,
 *   model: string|null, scoped: boolean, updated_at: string|null, updated_by: string|null }}
 */
export function normaliseGptWriterConfig(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const accounts = cleanList(source.accounts);
  const emails = cleanList(source.emails).map((entry) => entry.toLowerCase());

  return {
    enabled: source.enabled === true,
    accounts,
    emails,
    model: cleanText(source.model),
    scoped: accounts.length > 0 || emails.length > 0,
    updated_at: cleanText(source.updated_at),
    updated_by: cleanText(source.updated_by),
  };
}

/**
 * Resolve the flag for one login. This is the only place the decision is made.
 *
 * @param {Object} input
 * @param {Object} [input.config] — the stored flag configuration
 * @param {string} [input.accountId] — the account of the login
 * @param {string} [input.email] — the email of the login
 * @param {boolean} [input.isMasterAdmin] — whether the login is a master admin
 * @returns {{ enabled: boolean, mode: string, reason: string|null, model: string|null, scoped: boolean }}
 */
export function resolveGptWriterFlag({
  config = null,
  accountId = null,
  email = null,
  isMasterAdmin = false,
} = {}) {
  const normalised = normaliseGptWriterConfig(config);

  if (!normalised.enabled) {
    return { enabled: false, mode: GPT_WRITER_MODE.OFF, reason: GPT_WRITER_FLAG_REASON.FLAG_OFF, model: null, scoped: false };
  }

  if (normalised.scoped) {
    const account = cleanText(accountId);
    const mail = cleanText(email)?.toLowerCase() || null;
    const listed = (account !== null && normalised.accounts.includes(account))
      || (mail !== null && normalised.emails.includes(mail));

    return listed
      ? { enabled: true, mode: GPT_WRITER_MODE.SCOPED, reason: null, model: normalised.model, scoped: true }
      : { enabled: false, mode: GPT_WRITER_MODE.SCOPED, reason: GPT_WRITER_FLAG_REASON.NOT_AUTHORISED, model: null, scoped: true };
  }

  return isMasterAdmin
    ? { enabled: true, mode: GPT_WRITER_MODE.ADMIN_ONLY, reason: null, model: normalised.model, scoped: false }
    : { enabled: false, mode: GPT_WRITER_MODE.ADMIN_ONLY, reason: GPT_WRITER_FLAG_REASON.NOT_AUTHORISED, model: null, scoped: false };
}

/**
 * What the browser is allowed to know: whether the action may be shown, and the
 * label it must carry. The raw configuration, the scope lists and the account
 * identities are never part of it.
 *
 * @param {Object} flag — resolveGptWriterFlag output
 */
export function gptWriterClientState(flag = null) {
  const enabled = flag?.enabled === true;
  return {
    enabled,
    mode: flag?.mode ?? GPT_WRITER_MODE.OFF,
    label: GPT_WRITER_ACTION_LABEL,
    beta: GPT_WRITER_BETA_LABEL,
    disclaimer: GPT_WRITER_DISCLAIMER,
    message: enabled
      ? null
      : (flag?.reason === GPT_WRITER_FLAG_REASON.NOT_AUTHORISED
        ? GPT_WRITER_NOT_AUTHORISED_MESSAGE
        : GPT_WRITER_DISABLED_MESSAGE),
  };
}

/**
 * The flag configuration as it is written back by a master admin.
 *
 * @param {Object} input
 * @param {boolean} [input.enabled]
 * @param {Array<string>} [input.accounts]
 * @param {Array<string>} [input.emails]
 * @param {string|null} [input.model]
 * @param {string} [input.updatedBy]
 * @param {string} [input.updatedAt]
 */
export function gptWriterFlagPayload({
  enabled = false,
  accounts = [],
  emails = [],
  model = null,
  updatedBy = null,
  updatedAt = null,
} = {}) {
  const normalised = normaliseGptWriterConfig({ enabled, accounts, emails, model });
  return {
    enabled: normalised.enabled,
    accounts: normalised.accounts,
    emails: normalised.emails,
    model: normalised.model,
    updated_at: updatedAt,
    updated_by: updatedBy,
  };
}

export default resolveGptWriterFlag;