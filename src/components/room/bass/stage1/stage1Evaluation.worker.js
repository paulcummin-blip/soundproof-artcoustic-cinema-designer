// stage1Evaluation.worker.js
// ---------------------------------------------------------------------------
// One Stage 1 candidate-evaluation worker. A POOL of these workers provides
// bounded concurrency for the coarse and fine evaluation phases.
//
// Protocol (matches stage1EvaluationPool.js):
//   init:     { type: "init", requestId, context }
//             → stores the shared room/source context, computes preparedModes
//               inside (deterministic, same inputs as the serial engine), and
//               replies { type: "ready", requestId }.
//   evaluate: { requestId, type: "evaluate", candidate }
//             → runs evaluateCandidate against the stored context and replies
//               { type: "complete", requestId, result } where result is the
//               evaluated candidate object or null for an incomplete transfer.
//               On a thrown error: { type: "error", requestId, error }.
//
// This worker is CALCULATION ONLY. No database writes, no ranking, no
// finalist selection — those stay on the orchestrator (the Stage 1 worker).
// ---------------------------------------------------------------------------

import { prepareStage1Context, evaluateCandidate } from "./stage1CandidateEvaluation";

let context = null;

self.onmessage = (event) => {
  const message = event.data || {};

  if (message.type === "init") {
    context = prepareStage1Context(message.context || {});
    self.postMessage({ type: "ready", requestId: message.requestId });
    return;
  }

  if (message.type === "evaluate") {
    if (!context) {
      self.postMessage({
        type: "error",
        requestId: message.requestId,
        error: "Stage 1 evaluation worker not initialised",
      });
      return;
    }
    try {
      const result = evaluateCandidate(message.candidate, context);
      self.postMessage({ type: "complete", requestId: message.requestId, result });
    } catch (err) {
      self.postMessage({
        type: "error",
        requestId: message.requestId,
        error: err?.message || String(err),
      });
    }
    return;
  }
};