import test from "node:test";
import assert from "node:assert/strict";

import { desiredAccessFlag } from "../base44/shared/soundProofAccessFlagAuthority.js";

test("active member on an active, unexpired account keeps access", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: true, membershipStatus: "active" }),
    true,
  );
});

test("pending member on an active, unexpired account keeps access", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: true, membershipStatus: "pending" }),
    true,
  );
});

test("removed member has the flag cleared even on an active account", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: true, membershipStatus: "removed" }),
    false,
  );
});

test("suspended member has the flag cleared even on an active account", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: true, membershipStatus: "suspended" }),
    false,
  );
});

test("a suspended account clears every flag", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: false, membershipStatus: "active" }),
    false,
  );
});

test("an expired account clears every flag", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: false, membershipStatus: "active" }),
    false,
  );
});

test("legacy user with no membership record keeps access on an active, unexpired account", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: true, membershipStatus: undefined }),
    true,
  );
});

test("membership status is case-insensitive", () => {
  assert.equal(
    desiredAccessFlag({ accountAllowsAccess: true, membershipStatus: "REMOVED" }),
    false,
  );
});