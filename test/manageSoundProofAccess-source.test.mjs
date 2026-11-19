import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../base44/functions/manageSoundProofAccess/entry.ts", import.meta.url),
  "utf8",
);

test("set_eligible rejects a missing or non-boolean eligible value", () => {
  assert.match(source, /typeof body\.eligible !== 'boolean'/);
  assert.match(source, /eligible must be a boolean/);
});

test("the validated eligible value is passed into processAccount, not read from body inside it", () => {
  assert.match(source, /eligible: eligibleValue/);
  assert.match(source, /async function processAccount\(base44, \{ action, accountId, actor, now, eligible \}\)/);
  // The set_eligible branch must use the passed `eligible`, not `body?.eligible`.
  const setEligibleBlock = source.slice(
    source.indexOf("if (action === 'set_eligible')"),
    source.indexOf("if (action === 'enable')"),
  );
  assert.match(setEligibleBlock, /newEligible = eligible === true/);
  assert.doesNotMatch(setEligibleBlock, /body\?\.eligible/);
});

// The set_eligible block inside processAccount (not the outer handler
// validation block, which also contains the word "status" in its 400
// response).
function setEligibleBlockInsideProcessAccount() {
  const processAccountStart = source.indexOf("async function processAccount");
  const start = source.indexOf("if (action === 'set_eligible')", processAccountStart);
  const end = source.indexOf("if (action === 'enable')", processAccountStart);
  return source.slice(start, end);
}

test("set_eligible writes only soundproof_eligible, not status, expiry or user flags", () => {
  const setEligibleBlock = setEligibleBlockInsideProcessAccount();
  assert.match(setEligibleBlock, /soundproof_eligible: newEligible/);
  assert.doesNotMatch(setEligibleBlock, /status:/);
  assert.doesNotMatch(setEligibleBlock, /soundproof_access_expires_at/);
  assert.doesNotMatch(setEligibleBlock, /soundproof_access_enabled/);
});

test("set_eligible preserves the SOUNDPROOF_ELIGIBILITY_SET audit event with a valid target_email string", () => {
  const setEligibleBlock = setEligibleBlockInsideProcessAccount();
  assert.match(setEligibleBlock, /SOUNDPROOF_ELIGIBILITY_SET/);
  // target_email must be a non-null string expression, never null.
  assert.match(
    setEligibleBlock,
    /target_email: account\.contact_email \|\| account\.name \|\| String\(accountId\)/,
  );
  assert.doesNotMatch(setEligibleBlock, /target_email: null/);
});

test("flag sync uses the shared desiredAccessFlag decision and computes per-user", () => {
  assert.match(source, /import \{ desiredAccessFlag \} from '\.\.\/\.\.\/shared\/soundProofAccessFlagAuthority\.js'/);
  assert.match(source, /desiredAccessFlag\(/);
  assert.match(source, /membershipStatusByUserId/);
});

test("removed members are included so their flag can be cleared", () => {
  // The linkedUserIds set must not filter out removed members.
  const linkedBlock = source.slice(
    source.indexOf("const linkedUserIds = new Set("),
    source.indexOf("const accountUsers"),
  );
  assert.doesNotMatch(linkedBlock, /!== 'removed'/);
});

test("partial flag-update failures are collected and reported, not swallowed", () => {
  assert.match(source, /const flagFailures = \[\]/);
  assert.match(source, /flagFailures\.push\(/);
  assert.match(source, /flag_sync_ok: flagSyncOk/);
  assert.match(source, /flag_failures: flagFailures/);
});

test("access-action audit records use a valid target_email string, never null", () => {
  const auditStart = source.indexOf("// Audit trail.");
  const returnEnd = source.lastIndexOf("return {");
  const auditBlock = source.slice(auditStart, returnEnd);
  assert.match(
    auditBlock,
    /target_email: account\.contact_email \|\| account\.name \|\| String\(accountId\)/,
  );
  assert.doesNotMatch(auditBlock, /target_email: null/);
});

test("restore does not re-enable users when the 90-day term has expired", () => {
  const restoreBlock = source.slice(
    source.indexOf("else if (action === 'restore')"),
    source.indexOf("// Update the account."),
  );
  assert.match(restoreBlock, /accountAllowsAccess = false/);
  assert.match(restoreBlock, /accountAllowsAccess = true/);
});