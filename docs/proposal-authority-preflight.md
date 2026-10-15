# Proposal authority preflight

Required before any change to the proposal writer, the evidence validator, the
Narrative Steer authority or the proposal copy pass. It is a gate, not a report:
every suite in it must be green before the change is accepted.

## Commands

```
npm run test:proposal-authority      # the guard suite on its own
npm run verify:proposal-authority    # the preflight gate — run this
```

The preflight is deliberately **not** wired into `npm run build`: the production
build must not depend on a test runner.

## What the guard suite covers

`test/proposal-authority-guardrails.test.mjs` exercises the real shared
authorities against one frozen fixture
(`test/fixtures/marqueeOriginalGuardFixture.mjs` — Marquee Home / Original
Design: 100" TV, 5.1, SUB2-12 pair, L4 technical results):

1. a client benefit carried by a strength story **and** its scoped result is valid (mixed provenance)
2. a bare scoped result still cannot authorise an invented benefit
3. a descriptive "recommended position" is not new design advice
4. a real recommendation still requires recommendation authority
5. the Narrative Steer survives persistence value for value (and the Proposal schema declares it)
6. the seating exclusion reaches the writer, and every figure stays
7. the P18 wording is valid at its own level, and any other figure fails (21 Hz negative control)
8. the display is a 100" TV: neither 88" nor projection wording is allowed
9. the equipment package states 1/1/1/2/2, and a 0 count fails
10. the frozen Marquee acceptance case validates end to end
11. a **saved** proposal keeps its steer, and the seating story stays out of the final copy

The preflight also runs the surrounding narrative authorities —
`narrative-steer-wiring`, `narrative-priority-authority`,
`p1-p20-narrative-rules`, `client-benefit-writing-standard` — so a change that
fixes the writer by breaking the narrative authorities is caught in the same run.

## Restore-protection rule

The guard suite asserts accepted product behaviour. Where one fails, do **not**
update the expected result to make it green. First decide whether the agreed
product authority has intentionally changed; where it has not, the behaviour
regressed and the behaviour is what must be restored.

## Known pre-existing failures (excluded from the gate)

These suites were already failing before the guard suite was written and are not
part of the preflight. They are not caused by proposal-authority work and must
not be "fixed" by weakening a guard:

- `test/sound-proof-writing-authority.test.mjs` (1 failure)
- `test/proposal-neutral-copy.test.mjs` (8 failures)
- `test/proposal-typography.test.mjs` (1 failure)
- the Vitest-only proposal suites (`proposal-writer-contract`, `proposal-evidence-pack`,
  `proposal-writer-precision`, `proposal-scoped-claims`, `p18-authority-parity`), which
  cannot run under `node --test