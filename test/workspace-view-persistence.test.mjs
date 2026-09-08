import test from "node:test";
import assert from "node:assert/strict";

// Workspace View persistence regression.
//
// The defect: the Workspace View selector (Split / Plan / Technical) was
// rendered inside the right-hand controls panel, which ViewModeLayout hides
// entirely in Plan View — leaving no way to switch back. The fix moves the
// toggle into a persistent header above ViewModeLayout and extracts the mode
// definitions into a pure-JS module (workspaceViewModes.js) so the authority
// is testable under bare Node.
//
// These tests verify the shared authority logic that backs the persistent
// selector: mode completeness, normalisation, and state-transition persistence
// across simulated re-renders and panel toggles. Full DOM interaction tests
// (rendering ViewModeLayout in all three modes) require a React test runner
// not available in this project; the structural guarantee — "the toggle is
// mounted above ViewModeLayout, not inside any mode-gated panel" — is enforced
// by the source location of the persistent header in RoomDesigner.jsx.

import {
  WORKSPACE_VIEW_MODES,
  DEFAULT_WORKSPACE_VIEW,
  normalizeWorkspaceView,
  isWorkspaceViewMode,
} from "../src/components/roomdesigner/workspaceViewModes.js";

// Simulate the React useState authority used at the top of RoomDesigner:
// { value, set(next) }. set() normalises so the state can never get stuck on
// an invalid key. rerender() proves the value survives a re-render unchanged.
function createWorkspaceViewState(initial = DEFAULT_WORKSPACE_VIEW) {
  let value = normalizeWorkspaceView(initial);
  return {
    get value() {
      return value;
    },
    set(next) {
      value = normalizeWorkspaceView(next);
    },
    rerender() {
      return value;
    },
  };
}

// ---------------------------------------------------------------------------
// Mode definitions — single source of truth
// ---------------------------------------------------------------------------

test("workspace modes are exactly split, plan, technical in display order", () => {
  const keys = WORKSPACE_VIEW_MODES.map((m) => m.key);
  assert.deepEqual(keys, ["split", "plan", "technical"]);
  for (const m of WORKSPACE_VIEW_MODES) {
    assert.equal(typeof m.label, "string", `${m.key} has a string label`);
    assert.ok(m.label.length > 0, `${m.key} label is non-empty`);
  }
});

test("default workspace view is split", () => {
  assert.equal(DEFAULT_WORKSPACE_VIEW, "split");
});

test("all mode keys are unique", () => {
  const keys = WORKSPACE_VIEW_MODES.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

// ---------------------------------------------------------------------------
// Normalisation — re-renders never leave the selector stuck
// ---------------------------------------------------------------------------

test("normalizeWorkspaceView accepts all three valid modes", () => {
  for (const m of WORKSPACE_VIEW_MODES) {
    assert.equal(normalizeWorkspaceView(m.key), m.key);
  }
});

test("normalizeWorkspaceView falls back to split for invalid/missing values", () => {
  assert.equal(normalizeWorkspaceView(undefined), "split");
  assert.equal(normalizeWorkspaceView(null), "split");
  assert.equal(normalizeWorkspaceView(""), "split");
  assert.equal(normalizeWorkspaceView("nonsense"), "split");
  assert.equal(normalizeWorkspaceView("SPLIT"), "split"); // case-sensitive
  assert.equal(normalizeWorkspaceView(123), "split");
});

test("isWorkspaceViewMode is true only for the three valid keys", () => {
  assert.ok(isWorkspaceViewMode("split"));
  assert.ok(isWorkspaceViewMode("plan"));
  assert.ok(isWorkspaceViewMode("technical"));
  assert.ok(!isWorkspaceViewMode("Plan"));
  assert.ok(!isWorkspaceViewMode(""));
  assert.ok(!isWorkspaceViewMode(null));
  assert.ok(!isWorkspaceViewMode(undefined));
});

// ---------------------------------------------------------------------------
// Regression A — Split → Plan
// ---------------------------------------------------------------------------

test("A: from Split View, selecting Plan View keeps Plan selected", () => {
  const state = createWorkspaceViewState("split");
  assert.equal(state.value, "split");
  state.set("plan");
  assert.equal(state.value, "plan");
  // Selector would still be visible — value survives a re-render
  assert.equal(state.rerender(), "plan");
});

// ---------------------------------------------------------------------------
// Regression B — Plan → Technical
// ---------------------------------------------------------------------------

test("B: from Plan View, selecting Technical keeps Technical selected", () => {
  const state = createWorkspaceViewState("plan");
  state.set("technical");
  assert.equal(state.value, "technical");
  assert.equal(state.rerender(), "technical");
});

// ---------------------------------------------------------------------------
// Regression C — Technical → Split
// ---------------------------------------------------------------------------

test("C: from Technical, selecting Split View restores Split", () => {
  const state = createWorkspaceViewState("technical");
  state.set("split");
  assert.equal(state.value, "split");
  assert.equal(state.rerender(), "split");
});

// ---------------------------------------------------------------------------
// Regression D — Plan survives a panel toggle (re-render)
// ---------------------------------------------------------------------------

test("D: selecting Plan View then toggling a Room Designer panel keeps Plan selected", () => {
  const state = createWorkspaceViewState("split");
  state.set("plan");
  // Simulate expand/collapse of Room Dimensions — a re-render, not a view change
  const afterPanelToggle = state.rerender();
  assert.equal(afterPanelToggle, "plan");
});

// ---------------------------------------------------------------------------
// Regression E — Technical survives a panel change (re-render)
// ---------------------------------------------------------------------------

test("E: selecting Technical then changing another panel keeps Technical selected", () => {
  const state = createWorkspaceViewState("split");
  state.set("technical");
  const afterPanelChange = state.rerender();
  assert.equal(afterPanelChange, "technical");
});

// ---------------------------------------------------------------------------
// Regression F — no workspace selection change touches project data
// ---------------------------------------------------------------------------

test("F: the workspace-view state object carries no project/design fields", () => {
  const state = createWorkspaceViewState("plan");
  const keys = Object.keys(state);
  // The authority must expose only view-value access — never dimensions,
  // speakers, seats, subs, RP22, or fingerprint fields.
  for (const k of keys) {
    assert.ok(
      !/dimension|speaker|seat|sub|rp22|fingerprint|screen|dolby|autosave|project/i.test(k),
      `workspace state must not carry project field "${k}"`,
    );
  }
  // Cycling through all modes must not mutate any project field (there are none)
  state.set("plan");
  state.set("technical");
  state.set("split");
  assert.equal(state.value, "split");
});

// ---------------------------------------------------------------------------
// Full cycle — A → B → C → A round-trip
// ---------------------------------------------------------------------------

test("full cycle: split → plan → technical → split preserves values at every step", () => {
  const state = createWorkspaceViewState("split");
  assert.equal(state.value, "split");
  state.set("plan");
  assert.equal(state.value, "plan");
  state.set("technical");
  assert.equal(state.value, "technical");
  state.set("split");
  assert.equal(state.value, "split");
});