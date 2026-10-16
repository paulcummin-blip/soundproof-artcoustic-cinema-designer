// Minimal in-process stand-in for the parts of `vitest` these suites use, so the
// focused suites can be run in this workspace (vitest is not installed here).
//
// `test` / `it` / `describe` run immediately. `it.each` / `test.each` /
// `describe.each` expand their cases. The lifecycle hooks (`beforeEach`,
// `afterEach`, `beforeAll`, `afterAll`) are honoured: a `beforeEach` failure
// fails the test it precedes.
//
// A suite whose helpers this stub does not implement used to report an ERROR for
// the whole FILE — every test in it silently unprotected — so the harness is
// completed rather than trimmed, and an async test is awaited (`settle`) instead
// of being reported as a pass before it has finished.
import assert from "node:assert/strict";

export const results = [];

const pending = [];
const beforeEachHooks = [];
const afterEachHooks = [];

const show = (value) => {
  try {
    return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

function matchers(value, negated) {
  const check = (pass, message) => {
    const ok = negated ? !pass : pass;
    if (!ok) throw new Error(negated ? `expected NOT ${message}` : message);
    return true;
  };

  const api = {
    toBe: (expected) => check(Object.is(value, expected), `${expected}, got ${show(value)}`),
    toEqual: (expected) => {
      let equal = true;
      try { assert.deepEqual(value, expected); } catch { equal = false; }
      return check(equal, `deep equal ${show(expected)}, got ${show(value)}`);
    },
    toStrictEqual: (expected) => {
      let equal = true;
      try { assert.deepStrictEqual(value, expected); } catch { equal = false; }
      return check(equal, `strictly deep equal ${show(expected)}, got ${show(value)}`);
    },
    toMatch: (pattern) => check(
      typeof value === "string" && (pattern instanceof RegExp
        ? pattern.test(value)
        : String(value).includes(String(pattern))),
      `to match ${pattern}`,
    ),
    toContain: (expected) => check(
      Array.isArray(value) ? value.includes(expected) : String(value).includes(String(expected)),
      `to contain ${show(expected)}`,
    ),
    toBeGreaterThan: (expected) => check(Number(value) > Number(expected), `> ${expected}, got ${show(value)}`),
    toBeGreaterThanOrEqual: (expected) => check(Number(value) >= Number(expected), `>= ${expected}, got ${show(value)}`),
    toBeLessThan: (expected) => check(Number(value) < Number(expected), `< ${expected}, got ${show(value)}`),
    toBeLessThanOrEqual: (expected) => check(Number(value) <= Number(expected), `<= ${expected}, got ${show(value)}`),
    toBeUndefined: () => check(value === undefined, `undefined, got ${show(value)}`),
    toBeDefined: () => check(value !== undefined, `defined, got undefined`),
    toBeNull: () => check(value === null, `null, got ${show(value)}`),
    toBeTruthy: () => check(Boolean(value), `truthy, got ${show(value)}`),
    toBeFalsy: () => check(!value, `falsy, got ${show(value)}`),
    toBeInstanceOf: (expected) => check(value instanceof expected, `instance of ${expected?.name}, got ${show(value)}`),
    toHaveLength: (expected) => check(Number(value?.length) === Number(expected), `length ${expected}, got ${show(value?.length)}`),
    get not() {
      return matchers(value, !negated);
    },
    get resolves() {
      return matchers(value, negated);
    },
  };
  return api;
}

export function expect(value) {
  return matchers(value, false);
}

/** "$name" · "$0" · "%s" — the case-name template forms the suites use. */
function interpolate(template, value) {
  let out = String(template ?? "");
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, entry]) => {
      out = out.split(`$${key}`).join(String(entry));
    });
  }
  const args = Array.isArray(value) ? value : [value];
  let index = 0;
  out = out.replace(/%[sdifjo]/g, () => show(args[index++]));
  out = out.replace(/\$(\d+)/g, (_, position) => show(args[Number(position)]));
  return out;
}

export function test(name, fn) {
  const record = { name: String(name), error: null };
  results.push(record);

  try {
    beforeEachHooks.forEach((hook) => hook());
  } catch (error) {
    record.error = error?.message || String(error);
    return;
  }

  const runAfterEach = () => {
    afterEachHooks.forEach((hook) => {
      try { hook(); } catch { /* an afterEach failure never rewrites a result */ }
    });
  };

  try {
    const returned = fn();
    if (returned && typeof returned.then === "function") {
      pending.push(returned.then(
        () => { runAfterEach(); },
        (error) => { record.error = error?.message || String(error); runAfterEach(); },
      ));
      return;
    }
  } catch (error) {
    record.error = error?.message || String(error);
  }
  runAfterEach();
}

export const it = test;

/** `it.each(cases)` (and `test.each`) — one test per case. */
function each(cases) {
  const list = Array.isArray(cases) ? cases : [];
  return (name, fn) => {
    list.forEach((entry) => {
      const title = typeof name === "function" ? String(name(entry)) : interpolate(name, entry);
      test(title, () => fn(entry));
    });
  };
}

test.each = each;
it.each = each;

export function describe(name, fn) {
  if (typeof name === "function") {
    name();
    return;
  }
  fn();
}

describe.each = (cases) => (name, fn) => {
  const list = Array.isArray(cases) ? cases : [];
  list.forEach((entry) => {
    const title = typeof name === "function" ? String(name(entry)) : interpolate(name, entry);
    describe(title, () => fn(entry));
  });
};

test.skip = () => {};
it.skip = () => {};
test.only = test;
it.only = test;

export function beforeEach(fn) { beforeEachHooks.push(fn); }
export function afterEach(fn) { afterEachHooks.push(fn); }
export function beforeAll(fn) { try { fn(); } catch { /* setup failures surface on the tests themselves */ } }
export function afterAll(fn) { try { fn(); } catch { /* teardown is never a result */ } }

/** Await every async test of the file just imported, so nothing prints early. */
export async function settle() {
  await Promise.allSettled(pending.slice());
  pending.length = 0;
}