# DATA-01 private review candidate

**Release blocked.** The patch failed the shared physical room save test. Keep the candidate outside active application paths. Nothing in this package activates the new writer.

## TEST

The changed publication, Technical Report engineering read and Client Proposal evidence handlers ran with a disposable SQLite-backed entity adapter. Authentication and SDK transport were substituted. Each assertion inspected records read back from SQLite. The adapter keeps timestamps equal to exercise the version token and map revision checks. These results establish handler behaviour in the fixture. Hosted conditional-write results from earlier testing do not establish hosted behaviour of the complete candidate.

## EXPECTED

Retain the committed evidence through contention and interruptions, verify the staged entry before committing the fingerprint and record ID together, refuse superseded calculations, and preserve legacy and issued-document access.

## ACTUAL

Eight of the nine targeted tests passed. The release blocker was a one-metre change to the shared physical room width after staging and before pointer advancement. The saved Project row contained the new width. The older calculation received HTTP 200 and ProjectVersion pointed to its fingerprint. A change to ProjectVersion.design_state in the same interval correctly returned 409 and preserved the previous publication.

Eighteen proposal-readiness agreement and report-readiness cases passed. The proposal agreement fixtures now supply contract-valid publications and expect the verification error for missing evidence. Fifteen concurrent design-save cases, twelve producer contract cases and thirty-seven combined access, project creation and issued-export recovery cases passed. The broader ADI and publication regression selection reported the same failures on the starting checkpoint and the candidate. A frontend bundle was produced. Full hosted dealer workflows, opening issued client documents and hosted backend timings remain unverified.

## DELTA

ProjectVersion owns the publication pointer, while Project owns the shared physical room geometry. The current version predicate cannot detect a concurrent save to another record. A precommit read on its own leaves a time window. The candidate retains nullable published_cache_record_id and pending_publication on ProjectVersion and engineering_publications_revision on ProjectAnalysisCache. No migration or cache cleanup was performed.

## SEVERITY

Release blocker. A pointer can resolve to intact evidence for the wrong physical room.

## NEXT TEST

Review the narrow addition needed to coordinate shared-room saves with publication across affected versions, including interrupted shared saves and concurrent version creation. Repeat the paused-commit case for the edited version and a sibling version. The old calculation must receive a conflict and the previous committed pair must stay intact. Confirm using disposable hosted records and the actual save, reopen, Technical Report, Client Proposal, document-readiness and ADI workflows before requesting deployment.

## Backups and deployment

Starting main checkpoint `6b09550653a42facb6766fb8`, source commit `b37d3c4adaa12a1a4dcf5eb501549b728e7523ed`. The source archive contains the starting backend handlers, entity definitions, shared modules, app source and tests. The separate schema snapshot is from the platform schema read. The deployed-functions listing was truncated. An independent complete copy of the deployed function versions remains a prerequisite to deployment.

Patch SHA-256 `6e4206e0d8d40b18ff3d9092e20d9bddcb7a08c6ffde756127f46976b258c7e6`. The patch applies to the starting commit with `git apply --check`. In an isolated copy with installed dependencies, run `node --loader ./test/_alias-loader.mjs --test test/data01-publication-reservation.test.mjs`.

Any future rollout needs separate approval. Confirm the exact deployed backups, apply additive schemas, stage compatible readers, quiesce and drain all old publication writers including in-flight requests, deploy guarded writers with their updated callers, and validate disposable records before reopening writes. Roll back by pausing the writer and retaining compatible readers and fields for any records already committed. Restoring an old writer while it can reach the new records is unsafe.

## Files and recorded results

```
base44/entities/ProjectAnalysisCache.jsonc
base44/entities/ProjectVersion.jsonc
base44/functions/generateProposal/entry.ts
base44/functions/publishEngineering/entry.ts
base44/functions/readPublishedEngineering/entry.ts
base44/functions/recordReportReadinessIncident/entry.ts
base44/shared/proposalReportEvidenceReader.js
base44/shared/publicationRow.js
base44/shared/publishedEngineeringRead.js
src/components/documentWorkflow/useDocumentWorkflowStatus.js
src/components/engineering/versionedEngineeringAuthority.js
src/components/hooks/useP17SavedVersionComparison.jsx
src/components/hooks/useProjectLoader.jsx
src/components/proposal/engineeringAuthority/useEngineeringPublicationEffect.js
src/components/proposal/sourceAuthority/useProposalReadiness.js
src/components/room/bass/bda/bdaCheckpointAuthority.js
src/components/versions/useVersionDocumentStatus.js
src/components/versions/versionDocumentStatus.js
src/pages/RoomDesigner.jsx
test/data01-publication-reservation.test.mjs
test/proposal-generate-readiness-agreement.test.mjs
✔ ordinary publication commits identity, initializes legacy revision and cold reads the pinned evidence (144.862735ms)
✔ equal-time competing publishers and retention retain current and staged evidence during commit (189.235657ms)
✔ design save between stage and commit rejects superseded calculation (183.542087ms)
✔ interruption before stage preserves current and permits recovery (127.922942ms)
✔ interruption before commit preserves current and permits recovery (173.307241ms)
✔ expired reservation permits another calculation; resumed stale stage cannot erase its commit (134.314148ms)
✔ map nonce guards equal timestamps, conflicts remerge, retry budget ends at three (89.296794ms)
✖ a shared physical room edit at commit must also supersede the captured calculation (103.815162ms)
✔ proposal evidence verifies the same committed row as the report and refuses an invalid explicit reference (90.979261ms)
ℹ pass 8
ℹ fail 1
✖ failing tests:
../baseline.log:22 passed, 10 failed
../contract.log:ℹ tests 12
../contract.log:ℹ pass 12
../contract.log:ℹ fail 0
../regression.log:22 passed, 10 failed
../access-issued.log:ℹ tests 37
../access-issued.log:ℹ pass 37
../access-issued.log:ℹ fail 0
../agreement-readiness.log:18 passed, 0 failed

```
