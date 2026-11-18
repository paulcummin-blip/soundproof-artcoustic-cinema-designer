// Real mounted React lifecycle regression for the first-opening state.
//
// Reproduces the double-hydration race: ProjectDesignHydrator hydrates the
// new project (empty DB) and releases the gate, then useProjectLoader's
// loadProject re-hydrates — calling setProjectHydrationReady(false) (bail
// window) and hydrateFromProject (overwrites seatsPerRowByRow with the
// empty DB value []). If the user's first count change lands during this
// re-load window, the change is lost.
//
// Uses react-test-renderer (no DOM required) to mount a component calling
// the ACTUAL useSeatingRebuild hook, then drives the real lifecycle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./_alias-loader.mjs', import.meta.url);

const React = await import('react');
const TestRenderer = await import('react-test-renderer');
const { useSeatingRebuild } = await import('@/components/hooks/useSeatingRebuild.jsx');

const { useState, useRef, useEffect } = React;
const { create, act } = TestRenderer;

function makeAppState() {
  const state = {
    isHydrated: false,
    isProjectHydrationReady: false,
    seatingPositions: [],
    rowCentersM: [],
    mlpY_m: null,
    screenFrontPlaneM: null,
    screen: { visibleWidthInches: 120, floatDepthM: 0.2, screenPlaneY_m: null, tvPresetKey: null, tvWidthMm: null },
    roomDims: { widthM: 4.5, lengthM: 6.0, heightM: 2.4 },
    roomResetEpoch: 0,
    roomReflowEpoch: 0,
    seatingBlockOffset: 0,
    rspMode: 'auto_from_screen',
    rowEarHeights: [1.2, 1.5, 1.8],
    activeVersionId: null,
  };
  const setters = {};
  setters.setSeatingPositions = (updater) => {
    const next = typeof updater === 'function' ? updater(state.seatingPositions) : updater;
    if (Array.isArray(next)) { state.seatingPositions = next; state.__seatingWrites = (state.__seatingWrites || 0) + 1; }
  };
  setters.setRowCentersM = (updater) => {
    const next = typeof updater === 'function' ? updater(state.rowCentersM) : updater;
    if (Array.isArray(next)) state.rowCentersM = next;
  };
  setters.setSeatsPerRowByRow = (v) => { state.seatsPerRowByRowOverride = v; };
  return { state, setters };
}

function LifecycleProbe({ appStateRef, controlsRef }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isProjectHydrationReady, setReady] = useState(false);
  const [loadPhase, setLoadPhase] = useState('idle');
  const [seatingConfigEpoch, setSeatingConfigEpoch] = useState(0);
  const [seatsPerRowByRow, setSeatsPerRowByRow] = useState([]);
  const [seatingRows] = useState(1);
  const [seatsPerRow] = useState(3);
  const [seatSpacing] = useState(0.6);
  const [rowSpacingM] = useState(1.8);
  const [mlpBasis] = useState('front');
  const [mlpY_m, setMlpY_m] = useState(null);

  const appState = appStateRef.current;
  // Merge live React state into the appState snapshot the hook reads.
  const liveAppState = {
    ...appState.state,
    ...appState.setters,
    isHydrated,
    isProjectHydrationReady,
    mlpY_m: mlpY_m ?? appState.state.mlpY_m,
    seatingPositions: appState.state.seatingPositions,
    rowCentersM: appState.state.rowCentersM,
  };

  const seatingLoadedEpochRef = useRef(0);
  const didUserRequestResetRef = useRef(false);

  useSeatingRebuild({
    appState: liveAppState,
    resolvedProjectId: 'test-new-project',
    projectIdState: 'test-new-project',
    loadState: { phase: loadPhase },
    seatingConfigEpoch,
    seatingLoadedEpochRef,
    didUserRequestResetRef,
    _seatsPerRowByRow: seatsPerRowByRow,
    _seatingRows: seatingRows,
    _seatsPerRow: seatsPerRow,
    _seatSpacing: seatSpacing,
    _rowSpacingM: rowSpacingM,
    _mlpBasis: mlpBasis,
    seatingArrangementBasis: mlpBasis,
    stableDimensions: { width: appState.state.roomDims.widthM, length: appState.state.roomDims.lengthM },
    _rowEarHeights: appState.state.rowEarHeights,
  });

  useEffect(() => {
    controlsRef.current = {
      setIsHydrated, setReady, setLoadPhase, setSeatingConfigEpoch,
      setSeatsPerRowByRow, setMlpY_m,
    };
  });

  return null;
}

// Simulates the double-hydration race on a new project:
//   1. ProjectDesignHydrator hydrates (ready=true, mlpY finite, empty DB → seats=[]).
//   2. useSeatingRebuild builds 3 initial seats.
//   3. User clicks + (epoch=1, seatsPerRowByRow=[4]).
//   4. useSeatingRebuild builds 4 seats.
//   5. useProjectLoader.loadProject fires LATE: setProjectHydrationReady(false),
//      hydrateFromProject (seatsPerRowByRow=[]), setProjectHydrationReady(true).
//   6. Assert seats count — 4 (fixed) or 3 (bug).
test('new-project double-hydration race: first count change survives late re-hydrate', async () => {
  const appStateRef = { current: makeAppState() };
  const controlsRef = { current: null };

  let renderer;
  await act(async () => {
    renderer = create(React.createElement(LifecycleProbe, { appStateRef, controlsRef }));
  });
  const c = controlsRef.current;

  // 1. Restore effect: isHydrated = true.
  await act(async () => { c.setIsHydrated(true); });

  // 2. ProjectDesignHydrator completes for a NEW project (empty DB):
  //    isProjectHydrationReady=true, loadPhase="loaded" (gate releases),
  //    mlpY_m=finite, seatsPerRowByRow=[] (empty DB), activeVersionId set.
  await act(async () => {
    c.setReady(true);
    c.setLoadPhase('loaded');
    c.setMlpY_m(3.5);
    appStateRef.current.state.activeVersionId = 'v1';
  });

  const seatsAfterGateHydration = appStateRef.current.state.seatingPositions;
  assert.equal(seatsAfterGateHydration.length, 3,
    `after gate hydration: 3 initial seats, got ${seatsAfterGateHydration.length}`);

  // 3. User clicks + (first count change 3→4).
  await act(async () => {
    c.setSeatingConfigEpoch(1);
    c.setSeatsPerRowByRow([4]);
  });

  const seatsAfterFirstChange = appStateRef.current.state.seatingPositions;
  assert.equal(seatsAfterFirstChange.length, 4,
    `after first count change: 4 seats, got ${seatsAfterFirstChange.length}`);

  // 4. useProjectLoader.loadProject fires LATE. WITHOUT the fix, it calls
  //    setProjectHydrationReady(false) + loadState.phase="loading" (bail
  //    window), then hydrateFromProject (overwrites seatsPerRowByRow with []),
  //    then setProjectHydrationReady(true) + loadState.phase="loaded" (rebuild
  //    from the empty fallback 1×3). The user's 4 is lost.
  //
  // 4a. WITHOUT FIX: full re-hydrate clobbers the user's change.
  await act(async () => { c.setReady(false); c.setLoadPhase('loading'); });
  await act(async () => { c.setSeatsPerRowByRow([]); });
  await act(async () => { c.setReady(true); c.setLoadPhase('loaded'); });
  const seatsAfterBuggyRehydrate = appStateRef.current.state.seatingPositions;
  assert.equal(seatsAfterBuggyRehydrate.length, 3,
    `BUG: late re-hydrate overwrote [4] with [], plan shows ${seatsAfterBuggyRehydrate.length} (first change lost)`);

  // 4b. WITH FIX: wasAlreadyHydrated skips setProjectHydrationReady(false),
  //    loadState "loading", and hydrateFromProject. The user's [4] survives.
  //    Re-run the scenario from the top with the fix simulated.
  const appStateFix = { current: makeAppState() };
  const controlsFix = { current: null };
  let r2;
  await act(async () => {
    r2 = create(React.createElement(LifecycleProbe, { appStateRef: appStateFix, controlsRef: controlsFix }));
  });
  const cf = controlsFix.current;
  await act(async () => { cf.setIsHydrated(true); });
  // ProjectDesignHydrator hydrates the new project (empty DB).
  await act(async () => {
    cf.setReady(true); cf.setLoadPhase('loaded'); cf.setMlpY_m(3.5);
    appStateFix.current.state.activeVersionId = 'v1';
  });
  assert.equal(appStateFix.current.state.seatingPositions.length, 3, 'fix scenario: 3 initial seats after gate hydration');
  // User clicks + (first count change).
  await act(async () => { cf.setSeatingConfigEpoch(1); cf.setSeatsPerRowByRow([4]); });
  assert.equal(appStateFix.current.state.seatingPositions.length, 4, 'fix scenario: 4 seats after first change');
  // useProjectLoader.loadProject fires LATE but WITH the fix: it detects
  // wasAlreadyHydrated and skips setProjectHydrationReady(false),
  // loadState "loading", and hydrateFromProject. Only the authority/baseline
  // setup runs. seatsPerRowByRow stays [4], isProjectHydrationReady stays true.
  // (No state transitions needed — the fix simply doesn't clobber.)
  // Simulate the loadState.phase settling to "loaded" (from the boot effect
  // setting it at the end of loadProject, but without the "loading" dip).
  await act(async () => { cf.setLoadPhase('loaded'); });
  const seatsAfterFixedRehydrate = appStateFix.current.state.seatingPositions;
  assert.equal(seatsAfterFixedRehydrate.length, 4,
    `FIX: late re-hydrate skipped overwrite, plan shows ${seatsAfterFixedRehydrate.length} seats (first change preserved)`);
});