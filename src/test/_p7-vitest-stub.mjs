// Minimal in-process stand-in for the parts of `vitest` these suites use, so the
// focused P7 suites can be run in this workspace (vitest is not installed here).
// Only `test` / `it` / `describe` are needed: the suites assert with node:assert.
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

export function expect(value) {
  return {
    toBe: (expected) => {
      if (value !== expected) throw new Error(`expected ${expected}, got ${value}`);
    },
  };
}