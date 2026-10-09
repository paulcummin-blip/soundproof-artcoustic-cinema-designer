# Report/proposal cleanup verification

Date: 2026-10-09

## Safety boundary

Only stale tests, isolated fixtures, source-contract checks and documentation are in scope. No live SDK execution, backend-function invocation, proposal generation, report regeneration, or production entity writes/deletes are permitted. Genesis and all Project, ProjectVersion, ReportSnapshot, ProposalGeneration and ProposalEdit records are untouched by this cleanup turn.

Tests use pure functions, static source reads, explicit SDK mocks or stand-in entity clients. Snapshot persistence tests use `createSnapshotClient` and `loadSnapshotStore` from `src/test/fixtures/reportSnapshotStoreHarness.mjs`: writes affect an in-memory Map, not Base44 records. Report-evidence reader tests pass fixture-backed entity clients; they do not invoke the deployed reader or generateProposal.

## Stale export assertion repaired

`src/test/export-comparison-structure.test.mjs`, TEST 4, previously expected a strong P20 comparison result to use “consistent bass from seat to seat”. The shipped client fallback instead uses the evidence-neutral explanation: “Measured seat-to-seat variation; lower variation means less difference between seats.” This was an outdated test expectation, not a reason to change production wording or metric logic.

The assertion now checks the exact current fallback, verifies that levels alone do not invent a strength claim, and verifies that a supplied frozen `client_meaning` remains authoritative. The existing single-report supported-level assertion is preserved. No application behaviour changed.

## Static gate finding, outside cleanup scope

`base44/shared/proposalReportEvidenceReader.js`, `readProposalReportEvidence`, still selects `technical` and `visual` snapshots and requires evidence from both. `base44/functions/generateProposal/entry.ts` calls that reader and returns 409 on a reader refusal. This residual dual-report dependency does not match the consolidated Project Report readiness gate. It is a pre-existing runtime integration risk, not fixed by updating comments or test expectations; repairing it requires a separately scoped functional change.

The fixture-backed legacy reader tests verify the reader as it currently exists. Passing those tests must not be described as proof that a Project-Report-only live proposal generation succeeds. No live Genesis flow is executed or newly verified in this turn.

## Excluded destructive/live verification

Not safely executable within this task: any live generateProposal invocation, proposal-generation/end-to-end flow that may create/update/delete production records, report regeneration, version/project changes, generation/edit-history mutation, and any integration requiring destructive production permissions. These paths are deliberately not invoked; they are excluded scenarios, not Vitest skipped-test counters. No production permission was requested.

## Final verification

Final selected batch: 26 suites passed; 277 tests passed; 0 failed; 0 runner-skipped tests. Production build: passed, exit status 0. `git diff --check` also passed. The build emitted a non-blocking outdated Browserslist-data warning; no dependencies were changed.

The safe batch covers project restore and version routing; proposal source, readiness, return context and static generation gates; report snapshot generation, identity, canonical selection and in-memory atomic writes; publication gate/handoff and atomic provenance; library readiness/vocabulary; report evidence completeness, refresh, permanence and seating; P19 RSP scope; proposal evidence-pack construction; and comparison export structure/copy.

Destructive/live scenarios remain excluded as listed above, with no executable live test attempted. This audit covers only the selected cleanup batch, not the entire repository test suite or live UI execution.