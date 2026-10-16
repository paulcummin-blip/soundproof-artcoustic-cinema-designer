// Minimal in-process stand-in for the parts of `vitest` these suites use, so the
// focused P7 suites can be run in this workspace (vitest is not installed here).
// `test` / `it` / `describe` run immediately, and the assertion helpers the
// suites actually call are implemented on top of node:assert — a suite that
// reaches for a matcher this stub does not implement used to report a FAILURE
// for something that had not been asserted at all, which is worse than useless:
// it hides the real state of the code behind a tooling gap.
import assert from "node:assert/strict";

export const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, error: null });
  } catch (error) {
    results.push({ name, error: error?.message || String(error) });
  }
}

export const it = test;

export function describe(_name, fn) {
  fn();
}

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