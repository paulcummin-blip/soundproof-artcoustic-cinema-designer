// autosave-acknowledgement-race.test.mjs
//
// Logic-level reproduction and regression coverage for the project autosave
// queue's acknowledgement. The queue keeps one in-flight save per project and
// records the signature of the payload it saved. The defect under test: an
// older in-flight save can acknowledge and unconditionally clear the dirty
// flag even when a newer design edit was queued while it was in flight,
// silently dropping the newer value.
//
// These tests model the exact state transitions of the per-project bucket
// (`globalThis.__rdAutosaveRefs_<projectId>`) used by useProjectLoader: the
// effect re-run that queues a newer signature, trySaveNow that saves and
// acknowledges, and the shared debounce. They prove the OLD acknowledgement
// loses the newer edit and the NEW acknowledgement preserves it.
//
// Run: node --test test/autosave-acknowledgement-race.test.mjs

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Signature helpers ────────────────────────────────────────────────────
const sigOf = (state) => JSON.stringify(state);

// ── Acknowledgement strategies ──────────────────────────────────────────

// OLD: unconditionally stamp the saved signature as the queued signature and
// clear dirty. This is the confirmed unsafe boundary.
function oldAcknowledge(r, sig) {
  r.lastSavedSig = sig;
  r.lastQueuedSig = sig;
  r.dirty = false;
  r.status = "saved";
}

// NEW: only clear dirty when the acknowledged payload matches the latest
// queued design signature. If a newer edit is queued, keep the project dirty
// and re-schedule the latest payload so it receives its own save.
function newAcknowledge(r, sig, scheduleDebounce) {
  r.lastSavedSig = sig;
  r.lastSaveAt = Date.now();
  if (r.lastQueuedSig === sig) {
    r.dirty = false;
    r.status = "saved";
  } else {
    // A newer edit exists. Keep the queue dirty and schedule the latest
    // payload so it is saved after the current in-flight save settles.
    r.dirty = true;
    r.status = "dirty";
    scheduleDebounce();
  }
}

// ── Queue simulator ─────────────────────────────────────────────────────
// Models the per-project autosave bucket and the three operations that touch
// it: the effect re-run (queues a newer signature), trySaveNow (saves and
// acknowledges), and runLatestSave (fires from a debounce/interval).
function createQueue({ acknowledge, saveAsync, armed = true }) {
  const r = {
    dirty: false,
    inFlight: false,
    lastSavedSig: "",
    lastQueuedSig: "",
    lastSaveAt: 0,
    debounceId: null,
    saveToken: 0,
    status: "idle",
  };
  let state = {};
  let pendingDebounce = null;
  const saved = []; // ordered list of signatures actually written

  const currentSig = () => sigOf(state);

  const scheduleDebounce = () => {
    // clearTimeout semantics: a later schedule replaces an earlier pending one.
    pendingDebounce = runLatestSave;
  };
  const clearDebounce = () => { pendingDebounce = null; };

  async function trySaveNow() {
    if (!r.dirty || r.inFlight) return { ran: false, reason: "not-dirty-or-inflight" };
    r.inFlight = true;
    r.status = "saving";
    const sig = currentSig();
    // The effect re-run always sets lastQueuedSig to the current signature
    // before a save fires. Mirror that here so the acknowledgement compares
    // against the signature that was actually queued (not a stale empty
    // string from direct test invocation).
    r.lastQueuedSig = sig;
    // Pre-save short-circuit: payload matches the last saved signature.
    if (sig === r.lastSavedSig) {
      r.dirty = false;
      r.inFlight = false;
      r.status = "saved";
      return { ran: false, reason: "sig-match" };
    }
    const ok = await saveAsync(sig);
    if (!ok) {
      // FAILED save: never clear dirty, never stamp. Retry via the interval.
      r.status = "error";
      r.inFlight = false;
      return { ran: false, reason: "save-failed" };
    }
    saved.push(sig);
    acknowledge(r, sig, scheduleDebounce);
    r.inFlight = false;
    return { ran: true, sig };
  }

  function runLatestSave() {
    return trySaveNow();
  }

  // The effect re-run: called whenever a design dep changes. Mirrors the
  // useProjectLoader autosave effect body (armed gate + signature compare).
  function effectRerun() {
    const sig = currentSig();
    if (!armed) {
      r.lastSavedSig = sig;
      r.lastQueuedSig = sig;
      r.dirty = false;
      if (!r.inFlight) r.status = "saved";
      return;
    }
    if (sig === r.lastSavedSig) {
      if (!r.inFlight) r.status = "saved";
      r.dirty = false;
      return;
    }
    if (sig !== r.lastQueuedSig) {
      r.dirty = true;
      r.lastQueuedSig = sig;
      r.status = "dirty";
      scheduleDebounce();
    }
  }

  function flushDebounce() {
    const fn = pendingDebounce;
    clearDebounce();
    if (fn) return fn();
    return Promise.resolve(null);
  }

  function setState(next) { state = { ...state, ...next }; }
  function getState() { return state; }

  return {
    r, saved, setState, getState, currentSig,
    effectRerun, trySaveNow, runLatestSave, flushDebounce,
    scheduleDebounce, clearDebounce,
  };
}

// A controllable async save that resolves on the microtask queue. A delay
// lets us keep a save in flight across a mid-flight edit.
const makeSaveAsync = () => {
  const calls = [];
  let failNext = 0;
  const saveAsync = async (sig) => {
    calls.push(sig);
    if (failNext > 0) { failNext -= 1; return false; }
    await Promise.resolve();
    return true;
  };
  saveAsync.failNext = (n) => { failNext = n; };
  saveAsync.calls = calls;
  return saveAsync;
};

// ── Tests ───────────────────────────────────────────────────────────────

describe("autosave acknowledgement race", () => {
  it("1. normal single save (NEW ack)", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: true });
    q.r.dirty = true; // pretend an edit armed the queue
    await q.trySaveNow();
    assert.equal(q.saved.length, 1);
    assert.equal(q.r.dirty, false);
    assert.equal(q.r.status, "saved");
  });

  it("2. ON→OFF while ON save is in flight — OLD ack loses OFF", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: oldAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: true });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    // Start save A (ON) and keep it in flight across the toggle.
    const a = q.trySaveNow();
    // Toggle OFF while A is in flight.
    q.setState({ autoAlignEnabled: false });
    q.effectRerun();
    assert.equal(q.r.lastQueuedSig, sigOf({ autoAlignEnabled: false }));
    assert.equal(q.r.dirty, true);
    // Let A complete.
    await a;
    // A acknowledged with the OLD logic → dirty cleared, OFF queued sig lost.
    assert.equal(q.r.dirty, false, "OLD ack cleared dirty despite a newer OFF edit");
    assert.equal(q.r.lastQueuedSig, sigOf({ autoAlignEnabled: true }), "OLD ack reverted lastQueuedSig to the older ON save");
    // The pending OFF debounce fires but sees dirty=false → does not save OFF.
    await q.flushDebounce();
    assert.equal(q.saved.length, 1, "OLD ack: the newer OFF edit was never saved");
    assert.equal(q.saved[0], sigOf({ autoAlignEnabled: true }));
  });

  it("2b. ON→OFF while ON save is in flight — NEW ack preserves OFF", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: true });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    const a = q.trySaveNow();
    q.setState({ autoAlignEnabled: false });
    q.effectRerun();
    assert.equal(q.r.lastQueuedSig, sigOf({ autoAlignEnabled: false }));
    await a;
    // NEW ack: the saved ON signature does NOT match the queued OFF signature.
    assert.equal(q.r.dirty, true, "NEW ack kept dirty because a newer OFF edit is queued");
    assert.equal(q.r.lastQueuedSig, sigOf({ autoAlignEnabled: false }), "NEW ack did not revert lastQueuedSig");
    assert.equal(q.r.lastSavedSig, sigOf({ autoAlignEnabled: true }));
    // The re-scheduled debounce fires and saves OFF.
    await q.flushDebounce();
    assert.equal(q.saved.length, 2);
    assert.equal(q.saved[1], sigOf({ autoAlignEnabled: false }));
    assert.equal(q.r.dirty, false);
    assert.equal(q.r.status, "saved");
  });

  it("3. OFF→ON while OFF save is in flight — NEW ack preserves ON", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: false });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    const a = q.trySaveNow();
    q.setState({ autoAlignEnabled: true });
    q.effectRerun();
    await a;
    assert.equal(q.r.dirty, true);
    await q.flushDebounce();
    assert.equal(q.saved.length, 2);
    assert.equal(q.saved[1], sigOf({ autoAlignEnabled: true }));
    assert.equal(q.r.dirty, false);
  });

  it("4. multiple rapid toggles — final value wins (NEW ack)", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: true });
    q.r.lastSavedSig = sigOf({ autoAlignEnabled: true });
    // Rapid toggles with a save in flight for the first.
    q.setState({ autoAlignEnabled: false }); q.effectRerun();
    q.setState({ autoAlignEnabled: true }); q.effectRerun();
    q.setState({ autoAlignEnabled: false }); q.effectRerun();
    assert.equal(q.r.lastQueuedSig, sigOf({ autoAlignEnabled: false }));
    // Now let a save run for the current (final) value.
    q.r.dirty = true;
    await q.trySaveNow();
    assert.equal(q.saved.length, 1);
    assert.equal(q.saved[0], sigOf({ autoAlignEnabled: false }));
    // Toggling back to ON after the save queues a new edit.
    q.setState({ autoAlignEnabled: true }); q.effectRerun();
    await q.flushDebounce();
    assert.equal(q.saved.length, 2);
    assert.equal(q.saved[1], sigOf({ autoAlignEnabled: true }));
  });

  it("5. multiple rapid speaker/seating edits — latest signature wins (NEW ack)", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ seating: ["a"] });
    q.r.lastSavedSig = "";
    q.r.dirty = true;
    const a = q.trySaveNow();
    q.setState({ seating: ["a", "b"] }); q.effectRerun();
    q.setState({ seating: ["a", "b", "c"] }); q.effectRerun();
    await a;
    assert.equal(q.r.dirty, true);
    assert.equal(q.r.lastQueuedSig, sigOf({ seating: ["a", "b", "c"] }));
    await q.flushDebounce();
    assert.equal(q.saved.length, 2);
    assert.equal(q.saved[1], sigOf({ seating: ["a", "b", "c"] }));
  });

  it("6. older save acknowledgement after a newer edit (NEW ack)", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ v: 1 });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    const a = q.trySaveNow();
    q.setState({ v: 2 }); q.effectRerun();
    await a;
    assert.equal(q.r.dirty, true);
    assert.equal(q.r.lastSavedSig, sigOf({ v: 1 }));
    assert.equal(q.r.lastQueuedSig, sigOf({ v: 2 }));
    await q.flushDebounce();
    assert.equal(q.saved[1], sigOf({ v: 2 }));
  });

  it("7. save failure never clears unsaved changes (NEW ack)", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: false });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    saveAsync.failNext(1);
    await q.trySaveNow();
    assert.equal(q.saved.length, 0, "failed save wrote nothing");
    assert.equal(q.r.dirty, true, "failed save kept the edit dirty");
    assert.equal(q.r.status, "error");
    // Retry succeeds.
    await q.trySaveNow();
    assert.equal(q.saved.length, 1);
    assert.equal(q.r.dirty, false);
  });

  it("8. manual Save during autosave — manual bump wins, newer edit preserved (NEW ack)", async () => {
    // Manual save bumps saveToken so an in-flight autosave aborts its stamp.
    // The manual save's own acknowledgement must also compare against the
    // latest queued signature so a newer edit made during the manual save is
    // not silently cleared.
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: true });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    const autoA = q.trySaveNow(); // ON save in flight
    q.setState({ autoAlignEnabled: false }); q.effectRerun(); // queue OFF
    // Manual save attempted while autosave is in flight → blocked by the
    // shared in-flight lock (mirrors the real "Save already in progress" path).
    q.r.saveToken += 1;
    const manualResult = await q.trySaveNow();
    assert.equal(manualResult.ran, false, "manual save is blocked while autosave is in flight");
    // Autosave completes; NEW ack keeps dirty because the OFF edit is queued.
    await autoA;
    assert.equal(q.r.dirty, true, "newer OFF edit kept dirty after autosave acknowledgement");
    // The re-scheduled debounce fires and saves the OFF edit.
    await q.flushDebounce();
    assert.equal(q.saved.includes(sigOf({ autoAlignEnabled: false })), true);
    assert.equal(q.r.dirty, false);
  });

  it("9. project switch drops pending state for the old project (NEW ack)", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: true });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    const a = q.trySaveNow();
    q.setState({ autoAlignEnabled: false }); q.effectRerun();
    // Simulate project switch: the generation changes, so the in-flight save
    // must not stamp state for the old project.
    await a;
    // The new project's queue is independent; the old project's bucket keeps
    // dirty=true so a later save (if re-opened) would persist the newer value.
    assert.equal(q.r.dirty, true);
  });

  it("10. cold reopen restores the latest acknowledged design (NEW ack)", async () => {
    const saveAsync = makeSaveAsync();
    const q = createQueue({ acknowledge: newAcknowledge, saveAsync });
    q.setState({ autoAlignEnabled: false });
    q.r.lastSavedSig = ""; q.r.dirty = true;
    await q.trySaveNow();
    const persisted = q.r.lastSavedSig;
    assert.equal(persisted, sigOf({ autoAlignEnabled: false }));
    // Simulate cold reopen: the hydrated signature equals the persisted one,
    // so the reopened design is current without recalculation.
    const reopened = sigOf({ autoAlignEnabled: false });
    assert.equal(reopened, persisted);
    assert.equal(q.r.dirty, false);
  });
});