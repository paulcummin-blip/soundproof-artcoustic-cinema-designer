# DATA-01 shared-room publication validation

**Guarded application saves pass. Production release is on hold.** Candidate source is retained in `review/data01/DATA-01.patch` on the private `data01-engineering-publication` branch. It applies to source commit `b37d3c4adaa12a1a4dcf5eb501549b728e7523ed`. No candidate handler or schema was deployed to Production.

## TEST

After staging an engineering result, pause its final version write. Save different physical room dimensions through the candidate shared-room handler before allowing the pending write to resume. Inspect the Project, ProjectVersion, authoritative cache record and evidence reader. Exercise each axis, a sibling version, ordinary overlap, interrupted commit, genuine reversion and a metadata-only change.

## EXPECTED

The previous committed fingerprint and cache-record ID survive a superseding room save. A current read identifies old-room evidence as stale. Historical reads remain available. A calculation for the newly saved room can commit normally.

## ACTUAL

All eight requested cases passed with disposable hosted records in **Sound Proof — STAGING**. The test ran the branch handlers in a harness. Authentication was substituted with the internal fixture identity and the SDK entity calls were transported through the authenticated Base44 management connector to the actual hosted database. These are persisted interleavings and readbacks. They do not measure Deno runtime performance or certify a dealer login.

| Hosted test | Actual |
|---|---|
| Width | 5 m → 6 m. Old publication returned 409. Prior fingerprint and row ID were preserved. The fresh publication returned 200 and resolved. |
| Length | 6 m → 7 m. Same conflict, preserved pair and verified fresh publication. |
| Height | 2.5 m → 3.5 m. Same conflict, preserved pair and verified fresh publication. |
| Sibling version | Shared width 6 m → 7 m. The publishing sibling retained its own pair and subsequently published for the new width. |
| Concurrent publication without a design change | The winner returned 200. The competing request returned 409. The reader verified the winner in its committed cache row. |
| Interrupted commit | The staged entry and the previous committed pair were present. Retrying committed the staged result. |
| Genuine reversion | Restore at the changed width returned 409. Restoring the original width allowed the prior immutable publication to become current with its original publication timestamp. |
| Unrelated metadata | A notes edit at final commit persisted. The publication returned 200 and verified on readback. |

The final reader also verified a separate hosted fingerprint-only fixture after the test removed its new room metadata and authoritative row reference. The private regression run passed 82 handler, save, contract, access and issued-export cases plus 18 report/proposal readiness cases. Room orientation passed 16/16 and room-dimension integrity passed 15/15. The frontend built. The broader ADI and publication selection had the same named failures as the starting source (runner summary 22 passed, 10 failed). The separate project-edit suite reported the same unsupported assertion matcher on the candidate and baseline.

## DELTA

Room Designer auto/manual saves, sparse project-dialog edits and the legacy dimensions adapter now use the guarded save when geometry changes. A transient `Project.pending_room_save` is claimed using the existing caller's Project update rights. Before persisting dimensions, the save cancels pending publications for all versions owned by that project. The final save compares its unique token and the original values. A publisher checks the saved physical room after reserving and staging and can commit only with its surviving version token. The room check accounts for version orientation and screen wall. Changing metadata can skip the room reservation.

Only four nullable fields were added to the separate staging app for these tests. Their schemas were read back against the backup. All pre-existing schema and access rules compared equal. The staging app also contains a disposable permission fixture. Its workspace credential successfully wrote a dimension with a direct field-write restriction configured. This result leaves ordinary dealer enforcement unverified. The proposed Project field rule permits editor-level access. A privileged direct edit bypassing the application save protocol is outside the demonstrated guarantee.

## SEVERITY

Release blocker for unrestricted direct room edits and outstanding dealer-role verification. The confirmed shared-room race is corrected for the guarded application paths. The staging run did not exercise an authenticated dealer browser or the deployed Deno runtime. The unchanged broader-suite failures preclude fresh end-to-end ADI sign-off.

## NEXT TEST

Use a disposable non-editor dealer in an isolated environment with the candidate field rules and readers active. Verify ordinary dealer save and reopen, rejection of uncoordinated geometry writes, Technical Report, Client Proposal and ADI through their actual UI paths. Account for every editor or integration permitted to write room geometry directly before deployment. Verify a complete deployed-function archive, including function names and entry/source files, before requesting any Production rollout. The platform connector truncated the deployed-function export and the CLI had no authenticated session. No device login was restarted.

## Backups and rollback

The existing backend/source archive has SHA-256 `be697021bf98cfa8eadacfd3daf57ee5d47163147f03272f70813cb5717bfa2f`. The candidate patch has SHA-256 `30c054fbc018c2eca79448a7134ea9aa1b9c95781fec28364450b4b95ad7f18d` and passed `git apply --check`. The branch contains `schema-before.json` and `staging-schema-before-room-test.json`. The source archive is distinct from a verified backup of what is currently deployed. Leave compatible readers and pointer fields in place if guarded writers must be paused.

## Hosted fixture record IDs and observations

Staging app `6afeeef25ba169e763497e49`. Disposable project `6b097a31323587ed0469c934`.

```json
[
  {
    "test": "initial A and B",
    "committed": true
  },
  {
    "test": "width",
    "conflict": 409,
    "before": 5,
    "after": 6,
    "keptPriorPair": true,
    "staleRead": "stale",
    "freshReadback": "eng:v1:data01-host-fresh-width",
    "cache": "6b097a43a9f308644437b9d6"
  },
  {
    "test": "length",
    "conflict": 409,
    "before": 6,
    "after": 7,
    "keptPriorPair": true,
    "staleRead": "stale",
    "freshReadback": "eng:v1:data01-host-fresh-length",
    "cache": "6b097a43a9f308644437b9d6"
  },
  {
    "test": "height",
    "conflict": 409,
    "before": 2.5,
    "after": 3.5,
    "keptPriorPair": true,
    "staleRead": "stale",
    "freshReadback": "eng:v1:data01-host-fresh-height",
    "cache": "6b097a43a9f308644437b9d6"
  },
  {
    "test": "sibling",
    "conflict": 409,
    "before": 6,
    "after": 7,
    "keptPriorPair": true,
    "staleRead": "stale",
    "freshReadback": "eng:v1:data01-host-fresh-sibling",
    "cache": "6b097a4498a543dbe6f06047"
  },
  {
    "test": "concurrent unchanged",
    "winner": 200,
    "contender": 409,
    "readback": "eng:v1:data01-host-race-winner",
    "cache": "6b097a43a9f308644437b9d6"
  },
  {
    "test": "interrupted commit",
    "previous": "eng:v1:data01-host-race-winner",
    "staged": "eng:v1:data01-host-interrupted",
    "retry": 200,
    "readback": "eng:v1:data01-host-interrupted"
  },
  {
    "test": "genuine reversion",
    "width": 7,
    "earlyRestore": 409,
    "restored": "eng:v1:data01-host-interrupted",
    "preservedPublicationTime": true
  },
  {
    "test": "metadata at commit",
    "status": 200,
    "readback": "eng:v1:data01-host-metadata"
  },
  {
    "test": "legacy cold read from final reader",
    "fingerprint": "eng:v1:data01-host-fresh-sibling",
    "version": "6b097a4198a543dbe6f06043",
    "cache": "6b097a4498a543dbe6f06047",
    "ack": true
  }
]
```

## Candidate paths

```
src/components/adapters/Base44EntityAdapter.jsx
src/components/documentWorkflow/useDocumentWorkflowStatus.js
src/components/engineering/versionedEngineeringAuthority.js
src/components/hooks/useP17SavedVersionComparison.jsx
src/components/hooks/useProjectLoader.jsx
src/components/projects/NewProjectDialog.jsx
src/components/proposal/engineeringAuthority/useEngineeringPublicationEffect.js
src/components/proposal/sourceAuthority/useProposalReadiness.js
src/components/room/bass/bda/bdaCheckpointAuthority.js
src/components/state/conditionalDesignSave.js
src/components/state/sharedRoomSave.js
src/components/versions/useVersionDocumentStatus.js
src/components/versions/versionDocumentStatus.js
src/pages/RoomDesigner.jsx
test/concurrent-design-save.test.mjs
test/data01-publication-reservation.test.mjs
test/proposal-generate-readiness-agreement.test.mjs
base44/entities/Project.jsonc
base44/entities/ProjectAnalysisCache.jsonc
base44/entities/ProjectVersion.jsonc
base44/functions/generateProposal/entry.ts
base44/functions/publishEngineering/entry.ts
base44/functions/readPublishedEngineering/entry.ts
base44/functions/recordReportReadinessIncident/entry.ts
base44/functions/saveSharedRoom/entry.ts
base44/shared/proposalReportEvidenceReader.js
base44/shared/publicationRoom.js
base44/shared/publicationRow.js
base44/shared/publishedEngineeringRead.js
```
