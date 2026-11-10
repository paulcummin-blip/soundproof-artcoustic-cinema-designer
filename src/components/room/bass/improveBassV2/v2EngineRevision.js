// v2EngineRevision.js
// A lightweight, non-sensitive identifier for the V2 engine revision actually
// executing in the browser. Source checkout hash and build commands cannot
// prove which code the runtime loaded — this constant is embedded in the
// module the browser imports, so it travels with the code that runs.
//
// It is read by V2RuntimeMetrics and surfaced in run evidence so a saved run
// can be compared against the source it claims to have executed.
//
// NOT a secret. NOT a build artefact. It is a short, stable string that changes
// only when the engine's Phase 9B observability contract changes.

/**
 * The V2 engine revision executed by this module bundle.
 *
 * Bumped when the engine's observable contract (Phase 9B diagnostics, timing
 * stages, runtime identity) changes. Read by V2RuntimeMetrics.toReport() and
 * attached to run results and persisted evidence.
 */
export const V2_ENGINE_REVISION = "phase9b-observability-v1";