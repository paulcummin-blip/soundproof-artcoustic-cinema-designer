import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const parse = (path) => JSON.parse(read(path));

test("commercial source and audit entities are admin-only", () => {
  for (const name of [
    "ExternalAccountLink",
    "CapacityLedger",
    "TurnoverRecord",
    "TurnoverMilestone",
    "TurnoverRewardSyncRun",
  ]) {
    const entity = parse(`base44/entities/${name}.jsonc`);
    assert.deepEqual(entity.rls.read, { user_condition: { role: "admin" } }, name);
  }
});

test("nightly reconciliation is fixed to 02:00 Europe/London", () => {
  const workflow = parse("base44/workflows/Daily UK Turnover Reward Sync.jsonc");
  assert.equal(workflow.trigger.config.cron_expression, "0 2 * * *");
  assert.equal(workflow.trigger.config.timezone, "Europe/London");
  const step = workflow.definition.do[0].sync_turnover;
  assert.equal(step.with.function_name, "syncUkTurnoverRewards");
  assert.equal(step.with.args.dry_run, false);
});

test("dealer project header exposes only balance and separate special access", () => {
  const projects = read("src/pages/Projects.jsx");
  assert.match(projects, /Professional Projects:[\s\S]*available/);
  assert.match(projects, /Special access: Unlimited until/);
  for (const forbidden of [
    "TURNOVER CREDITS",
    "credits earned from turnover",
    "Next 5 at",
    "Sales history",
    "commercial tier",
  ]) {
    assert.equal(projects.includes(forbidden), false, forbidden);
  }
});

test("unlimited access is decided before balance and does not debit the ledger", () => {
  const source = read("base44/functions/createProfessionalProject/entry.ts");
  const promotionStart = source.indexOf("UNLIMITED_PRO_PROJECTS");
  const capacityCheck = source.indexOf("await getAvailableCapacity");
  assert.ok(promotionStart >= 0, "promotion check missing");
  assert.ok(capacityCheck > promotionStart, "capacity checked before promotion");

  const promotionBranchEnd = source.indexOf("await getAvailableCapacity", promotionStart);
  const promotionBranch = source.slice(promotionStart, promotionBranchEnd);
  assert.match(promotionBranch, /PromotionUsage/);
  assert.match(promotionBranch, /activation_ledger_entry_id:\s*null/);
  assert.equal(promotionBranch.includes("CapacityLedger.create"), false);

  const paidBranch = source.slice(capacityCheck);
  assert.match(paidBranch, /transaction_type:\s*["']PROJECT_ACTIVATION["']/);
  assert.match(paidBranch, /delta:\s*-1/);
});
