// apply-recalc-settle-authority.test.mjs
// Regression tests for the post-Apply recalculation settle authority.
//
// Locks in the confirmed correction: the recalculation must NOT fire until the
// live calculation fingerprint has transitioned away from the pre-apply
// identity AND is stable across the threshold of consecutive renders, so a
// transient intermediate fingerprint is never mistaken for the settled,
// committed arrangement identity.
//
// Run: node --import ./test/_alias-register.mjs --test test/apply-recalc-settle-authority.test.mjs

import {
  createApplyRecalcSettleState,
  resolveApplyRecalcSettle,
  APPLY_SETTLE_DEFAULTS,
} from '../src/components/room/bass/bda/applyRecalcSettleAuthority.js';

let tests = 0;
let passes = 0;
function check(name, actual, expected) {
  tests += 1;
  if (actual === expected) {
    passes += 1;
  } else {
    console.error(`FAIL ${name}: expected ${expected}, got ${actual}`);
  }
}

// Drive the authority through a sequence of (liveFp, gateReady) observations,
// returning the ordered list of actions.
function drive(preApplyFp, steps, opts) {
  let state = createApplyRecalcSettleState(preApplyFp);
  const actions = [];
  for (const [liveFp, gateReady] of steps) {
    const res = resolveApplyRecalcSettle(state, liveFp, gateReady, opts);
    state = res.state;
    actions.push(res.action);
    if (res.action === "fire" || res.action === "release") break;
  }
  return actions;
}

// 1. Does not fire while the fingerprint equals the pre-apply identity, even
//    when the gate is ready — the committed arrangement has not propagated.
{
  const actions = drive("cal:v8:6e86b584c39ce1aa", [
    ["cal:v8:6e86b584c39ce1aa", true],
    ["cal:v8:6e86b584c39ce1aa", true],
    ["cal:v8:6e86b584c39ce1aa", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
  ]);
  check("waits while fingerprint equals pre-apply", actions[0], "wait");
  check("waits while fingerprint equals pre-apply (2nd)", actions[1], "wait");
  check("waits while fingerprint equals pre-apply (3rd)", actions[2], "wait");
  // Once transitioned, the stable sequence must reach the threshold before firing.
  check("transition observed (not fire)", actions[3], "observe");
  check("stable count 2 (not fire)", actions[4], "observe");
  check("stable count 3 -> fire", actions[5], "fire");
  check("fires exactly once (sequence ends)", actions.length, 6);
}

// 2. Reproduces the reported scenario: pre-apply 6e86b -> transient 35174 ->
//    settled e2b65. Must NOT fire against the transient 35174; must fire
//    against the settled e2b65.
{
  const actions = drive("cal:v8:6e86b584c39ce1aa", [
    ["cal:v8:35174ecaf5b06584", true],   // transient
    ["cal:v8:e2b65100c15244b2", true],   // settled
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
  ]);
  check("transient 35174 not fired (observe)", actions[0], "observe");
  check("settled e2b65 first observation (observe)", actions[1], "observe");
  check("settled e2b65 second observation (observe)", actions[2], "observe");
  check("settled e2b65 third observation -> fire", actions[3], "fire");
  check("fires exactly once", actions.length, 4);
}

// 3. A two-step transient chain (6e86b -> 35174 -> X -> e2b65) still fires
//    against the settled value, never against an intermediate.
{
  const actions = drive("cal:v8:6e86b584c39ce1aa", [
    ["cal:v8:35174ecaf5b06584", true],
    ["cal:v8:AAAAAAAAAAAAAAAA", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
  ]);
  check("two-step transient: never fires on intermediate", actions.indexOf("fire"), 4);
  check("two-step transient: fires on settled", actions[4], "fire");
}

// 4. A false-stable gap (35174 persists two renders then moves to e2b65) does
//    not fire against the transient, because the threshold is 3 and the value
//    moves before it is reached.
{
  const actions = drive("cal:v8:6e86b584c39ce1aa", [
    ["cal:v8:35174ecaf5b06584", true],   // observe (stableCount 1)
    ["cal:v8:35174ecaf5b06584", true],   // observe (stableCount 2)
    ["cal:v8:e2b65100c15244b2", true],   // moved -> reset
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
  ]);
  check("false-stable gap: transient not fired (1st)", actions[0], "observe");
  check("false-stable gap: transient not fired (2nd)", actions[1], "observe");
  check("false-stable gap: moved -> observe (reset)", actions[2], "observe");
  check("false-stable gap: settled stableCount 2 (observe)", actions[3 + 0], "observe");
  check("false-stable gap: fires on settled (threshold reached)", actions[3 + 1], "fire");
}

// 5. Gate not ready (calculation in progress or canCalculate false): retains
//    the pending request (wait), does not clear it prematurely.
{
  const state0 = createApplyRecalcSettleState("cal:v8:6e86b584c39ce1aa");
  const r1 = resolveApplyRecalcSettle(state0, "cal:v8:35174ecaf5b06584", false);
  check("gate not ready -> wait", r1.action, "wait");
  check("gate not ready -> pending retained", r1.state.pending, true);
  const r2 = resolveApplyRecalcSettle(r1.state, "cal:v8:35174ecaf5b06584", true);
  check("gate ready after wait -> observe (transition)", r2.action, "observe");
}

// 6. After fire, the authority becomes idle (pending false) so a later
//    re-run never fires a second recalculation.
{
  let state = createApplyRecalcSettleState("cal:v8:6e86b584c39ce1aa");
  let fired = 0;
  for (let i = 0; i < 10; i += 1) {
    const res = resolveApplyRecalcSettle(state, "cal:v8:e2b65100c15244b2", true);
    state = res.state;
    if (res.action === "fire") fired += 1;
  }
  check("fires exactly once across continued observations", fired, 1);
  check("pending cleared after fire", state.pending, false);
  const after = resolveApplyRecalcSettle(state, "cal:v8:e2b65100c15244b2", true);
  check("idle after fire (no second fire)", after.action, "idle");
}

// 7. Safety valve: if the gate never becomes ready, the authority releases
//    cleanly after the bound so the UI never hangs.
{
  const opts = { maxAttempts: 3, stableThreshold: 3 };
  let state = createApplyRecalcSettleState("cal:v8:6e86b584c39ce1aa");
  let lastAction = null;
  for (let i = 0; i < 10; i += 1) {
    const res = resolveApplyRecalcSettle(state, null, false, opts);
    state = res.state;
    lastAction = res.action;
    if (res.action === "release") break;
  }
  check("safety valve releases after bound", lastAction, "release");
  check("safety valve clears pending", state.pending, false);
}

// 8. Pre-apply fingerprint null (fresh design): transition is observed as soon
//    as a non-null fingerprint arrives.
{
  const actions = drive(null, [
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
    ["cal:v8:e2b65100c15244b2", true],
  ]);
  check("null pre-apply: transition observed", actions[0], "observe");
  check("null pre-apply: stable 2", actions[1], "observe");
  check("null pre-apply: fire", actions[2], "fire");
}

if (passes === tests) {
  console.log(`apply-recalc-settle-authority: ${passes}/${tests} passed`);
  process.exit(0);
} else {
  console.error(`apply-recalc-settle-authority: ${passes}/${tests} passed`);
  process.exit(1);
}