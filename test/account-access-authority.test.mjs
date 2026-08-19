import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCESS_LEVELS,
  MAX_ACCOUNT_SEATS,
  buildCapabilities,
  legacyAppRoleForAccess,
  normaliseAccessLevel,
  normaliseEmail,
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
