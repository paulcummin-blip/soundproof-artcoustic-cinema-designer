import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCESS_LEVELS,
  MAX_ACCOUNT_SEATS,
  buildCapabilities,
  legacyAppRoleForAccess,
  normaliseAccessLevel,
  normaliseEmail,
  resolveAccountAccess,
} from "../base44/shared/accountAccessAuthority.js";

test("account seat limit is one admin plus four additional logins", () => {
  assert.equal(MAX_ACCOUNT_SEATS, 5);
});

test("master admin has every capability", () => {
  assert.deepEqual(
    buildCapabilities({
      isMasterAdmin: true,
      isAccountAdmin: false,
      accessLevel: ACCESS_LEVELS.PRICE_LIST_ONLY,
    }),
    {
      soundProof: true,
      priceList: true,
      commercial: true,
      manageUsers: true,
      masterAdmin: true,
    },
  );
});

test("account admin has full access and user management", () => {
  assert.deepEqual(
    buildCapabilities({
      isMasterAdmin: false,
      isAccountAdmin: true,
      accessLevel: ACCESS_LEVELS.FULL_ACCESS,
    }),
    {
      soundProof: true,
      priceList: true,
      commercial: true,
      manageUsers: true,
      masterAdmin: false,
    },
  );
});

test("full access excludes local administration for additional users", () => {
  assert.deepEqual(
    buildCapabilities({
      isMasterAdmin: false,
      isAccountAdmin: false,
      accessLevel: ACCESS_LEVELS.FULL_ACCESS,
    }),
    {
      soundProof: true,
      priceList: true,
      commercial: true,
      manageUsers: false,
      masterAdmin: false,
    },
  );
});

test("Sound Proof Only cannot see price or commercial data", () => {
  assert.deepEqual(
    buildCapabilities({
      isMasterAdmin: false,
      isAccountAdmin: false,
      accessLevel: ACCESS_LEVELS.SOUND_PROOF_ONLY,
    }),
    {
      soundProof: true,
      priceList: false,
      commercial: false,
      manageUsers: false,
      masterAdmin: false,
    },
  );
});

test("Price List Only cannot see Sound Proof or commercial data", () => {
  assert.deepEqual(
    buildCapabilities({
      isMasterAdmin: false,
      isAccountAdmin: false,
      accessLevel: ACCESS_LEVELS.PRICE_LIST_ONLY,
    }),
    {
      soundProof: false,
      priceList: true,
      commercial: false,
      manageUsers: false,
      masterAdmin: false,
    },
  );
});

test("permission inputs and emails are canonicalised", () => {
  assert.equal(normaliseEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(normaliseAccessLevel("sound_proof_only"), ACCESS_LEVELS.SOUND_PROOF_ONLY);
  assert.equal(legacyAppRoleForAccess(ACCESS_LEVELS.PRICE_LIST_ONLY), "Viewer");
  assert.equal(legacyAppRoleForAccess(ACCESS_LEVELS.FULL_ACCESS, true), "Administrator");
});

function createBase44Mock(seed) {
  const store = structuredClone(seed);
  let nextId = 1;
  const entities = new Proxy({}, {
    get(_target, entityName) {
      const rows = store[entityName] ||= [];
      return {
        async filter(query) {
          return rows.filter((row) =>
            Object.entries(query).every(([key, value]) => row[key] === value)
          );
        },
        async update(id, patch) {
          const row = rows.find((item) => item.id === id);
          if (!row) throw new Error(`Missing ${String(entityName)} ${id}`);
          Object.assign(row, patch);
          return { ...row };
        },
        async create(data) {
          const row = { id: `new-${nextId++}`, ...data };
          rows.push(row);
          return { ...row };
        },
      };
    },
  });
  return { base44: { asServiceRole: { entities } }, store };
}

test("pending invitation binds the authenticated user to one account on first login", async () => {
  const { base44, store } = createBase44Mock({
    User: [{
      id: "user-1",
      email: "Designer@Example.com",
      role: "user",
      account_role: "account_user",
    }],
    Account: [{ id: "account-1", name: "Dealer One", status: "active" }],
    AccountMembership: [{
      id: "membership-1",
      email: "designer@example.com",
      account_id: "account-1",
      membership_role: "sound_proof_only",
      access_level: ACCESS_LEVELS.SOUND_PROOF_ONLY,
      is_account_admin: false,
      status: "pending",
    }],
    AccountUserAudit: [],
  });

  const context = await resolveAccountAccess(base44, { id: "user-1" });

  assert.equal(context.allowed, true);
  assert.equal(context.account.id, "account-1");
  assert.equal(context.accessLevel, ACCESS_LEVELS.SOUND_PROOF_ONLY);
  assert.equal(context.capabilities.soundProof, true);
  assert.equal(context.capabilities.priceList, false);
  assert.equal(store.User[0].account_id, "account-1");
  assert.equal(store.AccountMembership[0].user_id, "user-1");
  assert.equal(store.AccountMembership[0].status, "active");
  assert.equal(store.AccountUserAudit[0].action, "INVITATION_ACCEPTED");
});

test("ambiguous invitations across accounts fail closed", async () => {
  const { base44, store } = createBase44Mock({
    User: [{ id: "user-2", email: "shared@example.com", role: "user" }],
    Account: [
      { id: "account-1", name: "Dealer One", status: "active" },
      { id: "account-2", name: "Dealer Two", status: "active" },
    ],
    AccountMembership: [
      { id: "membership-1", email: "shared@example.com", account_id: "account-1", status: "pending" },
      { id: "membership-2", email: "shared@example.com", account_id: "account-2", status: "pending" },
    ],
    AccountUserAudit: [],
  });

  const context = await resolveAccountAccess(base44, { id: "user-2" });

  assert.equal(context.allowed, false);
  assert.equal(context.reason, "ACCOUNT_NOT_LINKED");
  assert.equal(store.User[0].account_id, undefined);
});
