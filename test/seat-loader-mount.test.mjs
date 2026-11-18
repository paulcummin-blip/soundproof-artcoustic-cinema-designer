// Mount regression for useProjectLoader seat-count clobber fix.
// Mounts the ACTUAL useProjectLoader hook with real React state via
// react-test-renderer, deferred controllable readProjectRecord /
// readProjectVersionRecord mocks, and traces both boundary times.
//
// Run: node --experimental-vm-modules test/seat-loader-mount.test.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';

// Register the mount loader BEFORE any @/ imports.
register('./_mount-loader.mjs', import.meta.url);

// Import browser globals polyfill and install before React hooks run.
const { installBrowserGlobals } = await import(
  pathToFileURL(pathResolve(process.cwd(), 'src/test/mocks/browserGlobals.mjs')).href
);
installBrowserGlobals();

// Import the controllable read cache mock (by real path, not @/ alias).
const readCacheMock = await import(
  pathToFileURL(pathResolve(process.cwd(), 'src/test/mocks/projectReadCacheMock.mjs')).href
);

// Import the project entity mock to assert on saves.
const projectEntityMock = await import(
  pathToFileURL(pathResolve(process.cwd(), 'src/test/mocks/projectEntityMock.mjs')).href
);

const React = await import('react');
const TestRenderer = (await import('react-test-renderer')).default;
const { act } = await import('react-test-renderer');

// Import the ACTUAL hook and the hydration store.
const { useProjectLoader } = await import('@/components/hooks/useProjectLoader');
const hydrationStore = await import('@/components/state/projectHydrationStore');

// ─── Helpers ───────────────────────────────────────────────────────────
const noop = () => {};
const stub = new Proxy({}, { get: () => noop });

function makeSeats(n) {
  // Minimal valid seating positions: each seat is an object with an id.
  return Array.from({ length: n }, (_, i) => ({
    id: `seat-${i}`,
    row: 0,
    col: i,
    x: 1 + i,
    y: 3,
    priority: i === 0 ? 'primary' : 'secondary',
  }));
}

function makeProjectRecord({ id, name, seatingPositions, activeVersionId }) {
  return {
    id,
    name: name || 'Mount Test Project',
    account_id: 'acct-1',
    active_version_id: activeVersionId || null,
    seating_positions: JSON.stringify(seatingPositions || []),
    selected_speakers: '[]',
    room_elements: '[]',
    subwooferInstances: [],
    dolby_config: '5.1',
    room_dimensions_edited: false,
    roomDims: JSON.stringify({ widthM: 4.5, lengthM: 6, heightM: 2.4 }),
  };
}

function makeVersionRecord({ id, seatingPositions }) {
  return {
    id,
    version_number: 1,
    version_name: 'Current Design',
    design_state: {
      // serializeProject stores seating_positions (snake_case, array) in
      // design_state — NOT seatingPositions (camelCase). hydrateFromProject
      // reads p.seating_positions from the merged object.
      seating_positions: seatingPositions || [],
      selected_speakers: [],
      subwooferInstances: [],
    },
  };
}

// Build the full props surface useProjectLoader expects, with real React
// state for the three fields we observe: seatingPositions, activeVersionId,
// projectHydrationReady. Everything else is a no-op stub.
function useTestAppState(initialSeating) {
  const [seatingPositions, setSeatingPositions] = React.useState(initialSeating || []);
  const [activeVersionId, setActiveVersionId] = React.useState(null);
  const [projectHydrationReady, setProjectHydrationReady] = React.useState(false);

  const appState = {
    isHydrated: true,
    activeVersionId,
    setActiveVersionId,
    projectHydrationReady,
    setProjectHydrationReady,
    roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 },
    setRoomDims: noop,
    frontSubsCfg: {},
    rearSubsCfg: {},
    setSeatingRows: noop,
    setSeatsPerRow: noop,
    setSeatSpacing: noop,
    setMlpBasis: noop,
    setSeatingBlockOffset: noop,
    setRowEarHeights: noop,
    setRspMode: noop,
    setManualRspY_m: noop,
    setManualRspX_m: noop,
    setDesignatedRspSeatId: noop,
    setLinkEarPlatformHeights: noop,
    designatedRspSeatId: null,
    viewingPriority: 'balanced',
    acousticTreatmentEnabled: false,
    selectedAbfuserQty: 0,
    p15ConstructionLevel: null,
    p21EarlyReflectionPreset: null,
    linkEarPlatformHeights: true,
  };

  const props = {
    projectIdFromUrl: 'proj-mount-test',
    dolbyPreset: '5.1',
    dimensions: appState.roomDims,
    screen: {},
    seatingPositions,
    roomElements: [],
    overlays: {},
    frozenTabs: {},
    setDimensions: noop,
    setScreen: noop,
    setSeatingPositions,
    setRoomElements: noop,
    setOverlays: noop,
    setDolbyConfig: noop,
    setDolbyPreset: noop,
    setSpeakerSystem: noop,
    initWithDefaultsAndRules: noop,
    placedSpeakers: [],
    sevenBedLayoutType: 'rears',
    setSevenBedLayoutType: noop,
    frontSubsCfg: {},
    rearSubsCfg: {},
    setFrontSubsCfg: noop,
    setRearSubsCfg: noop,
    lcrAimMode: 'flat',
    setLcrAimMode: noop,
    enableFrontWides: false,
    setEnableFrontWides: noop,
    selectedSpeakersByRole: {},
    setSelectedSpeakersByRole: noop,
    speakerNodes: [],
    setSpeakerNodes: noop,
    overheadGlobalModel: null,
    setOverheadGlobalModel: noop,
    overheadFrontOverride: null,
    setOverheadFrontOverride: noop,
    overheadMidOverride: null,
    setOverheadMidOverride: noop,
    overheadRearOverride: null,
    setOverheadRearOverride: noop,
    useFrontGlobal: true,
    setUseFrontGlobal: noop,
    useMidGlobal: true,
    setUseMidGlobal: noop,
    useRearGlobal: true,
    setUseRearGlobal: noop,
    rowSpacingM: 1.8,
    setRowSpacingM: noop,
    seatsPerRowByRow: [3],
    setSeatsPerRowByRow: noop,
    freeMoveLcr: false,
    setFreeMoveLcr: noop,
    globalSurroundModel: null,
    setGlobalSurroundModel: noop,
    extraSurroundCount: 0,
    setExtraSurroundCount: noop,
    stableDimensions: appState.roomDims,
    isProjectMode: true,
  };

  return { appState, props, getSeating: () => seatingPositions, getActiveVersionId: () => activeVersionId, getReady: () => projectHydrationReady, setSeatingPositions };
}

// ─── Test harness ──────────────────────────────────────────────────────
const results = [];
function assert(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  if (!cond) console.log(`  FAIL: ${name} — ${detail || ''}`);
}

function trace(label, fn) {
  const t0 = Date.now();
  const r = fn();
  const t1 = Date.now();
  console.log(`  [trace] ${label} @ ${t1 - t0}ms`);
  return r;
}

// ─── Scenario runner ────────────────────────────────────────────────────
async function runScenario({ name, preHydrate, projectRecord, versionRecord, editBeforeResolve, expectedSeats, expectClobber, forceRefresh, switchToProject }) {
  console.log(`\n=== ${name} ===`);

  // Reset all mocks and the hydration store.
  readCacheMock.resetSharedProjectReadsForTest();
  projectEntityMock.projectUpdates.length = 0;
  hydrationStore.resetProjectHydration();

  // For project-switch scenarios, point window.location at the new project.
  const activeProjectIdForBoot = switchToProject || 'proj-mount-test';
  if (switchToProject) {
    globalThis.window.location.search = `?projectId=${switchToProject}`;
    globalThis.window.location.href = `http://localhost/?projectId=${switchToProject}`;
  } else {
    globalThis.window.location.search = '?projectId=proj-mount-test';
    globalThis.window.location.href = 'http://localhost/?projectId=proj-mount-test';
  }

  // Pre-set the canonical hydration store to simulate ProjectDesignHydrator
  // having already hydrated (or not, depending on the scenario).
  if (preHydrate) {
    hydrationStore.beginProjectHydration(activeProjectIdForBoot, { name: projectRecord?.name || 'Mount Test Project' });
    hydrationStore.completeDesignHydration(activeProjectIdForBoot, {
      name: projectRecord?.name || 'Mount Test Project',
      clientName: null,
      projectReference: null,
      activeVersionId: projectRecord?.active_version_id || null,
    });
  }

  let renderer = null;
  let loaderApi = null;
  let testState = null;

  // Render the test component that mounts useProjectLoader.
  await act(async () => {
    function TestComponent() {
      const ts = useTestAppState(makeSeats(3)); // start with 3 seats from DB
      testState = ts;
      loaderApi = useProjectLoader(ts.appState, ts.props);
      return React.createElement('div', null, 'mount');
    }
    renderer = TestRenderer.create(React.createElement(TestComponent));
  });

  // The boot effect should have fired loadProject, which called
  // readProjectRecord — now pending in our mock.
  const pendingReads = readCacheMock.countPendingProjectReads();
  const bootBoundary = Date.now();
  console.log(`  [boundary] boot effect fired @ ${bootBoundary}, ${pendingReads} pending project read(s)`);
  // Trace the wasAlreadyHydrated decision at boot time.
  const canonicalAtBoot = hydrationStore.getProjectHydration();
  const wasAlreadyHydratedAtBoot = !forceRefresh
    && canonicalAtBoot.projectId === activeProjectIdForBoot
    && canonicalAtBoot.design === 'loaded'
    && !canonicalAtBoot.error;
  console.log(`  [boundary] wasAlreadyHydrated=${wasAlreadyHydratedAtBoot} (canonical: projectId=${canonicalAtBoot.projectId}, design=${canonicalAtBoot.design})`);

  // Simulate a user seat-count change BEFORE the read resolves.
  if (editBeforeResolve) {
    trace('user seat-count change', () => {
      act(() => {
        testState.setSeatingPositions(editBeforeResolve);
      });
    });
    console.log(`  user changed seats to ${editBeforeResolve.length} before resolve`);
  }

  // For forceRefresh scenarios, call reloadProject to trigger a fresh
  // loadProject with forceRefresh=true (bypasses the guard).
  if (forceRefresh) {
    trace('reloadProject (forceRefresh)', () => {});
    await act(async () => {
      loaderApi.reloadProject();
      await new Promise((r) => setTimeout(r, 5));
    });
    console.log(`  reloadProject fired (forceRefresh=true)`);
  }

  // Resolve ALL pending project reads (boot + reload if forceRefresh).
  const resolveAt = Date.now();
  await act(async () => {
    while (readCacheMock.countPendingProjectReads() > 0) {
      readCacheMock.resolveFirstPendingProjectRecord(projectRecord);
      // Allow the hook to process and potentially fire a version read.
      await new Promise((r) => setTimeout(r, 10));
    }
    // If the project has an active_version_id, resolve any version reads.
    while (projectRecord?.active_version_id && readCacheMock.countPendingVersionReads() > 0) {
      readCacheMock.resolveFirstPendingVersionRecord(versionRecord);
      await new Promise((r) => setTimeout(r, 10));
    }
    // Flush all pending microtasks/effects.
    await new Promise((r) => setTimeout(r, 20));
  });
  const settledAt = Date.now();
  console.log(`  [boundary] read resolved @ ${resolveAt}, effects settled @ ${settledAt} (Δ${settledAt - resolveAt}ms)`);
  // After settling, trace the canonical state again.
  const canonicalAfter = hydrationStore.getProjectHydration();
  console.log(`  [boundary] post-settle canonical: projectId=${canonicalAfter.projectId}, design=${canonicalAfter.design}`);

  // Read the final seating positions from the actual React state.
  const finalSeats = testState.getSeating();
  console.log(`  final seats: ${finalSeats.length}`);

  assert(
    `${name}: final seat count = ${expectedSeats}`,
    finalSeats.length === expectedSeats,
    `expected ${expectedSeats}, got ${finalSeats.length}`
  );

  if (expectClobber) {
    assert(
      `${name}: clobber occurred (guard did NOT skip hydrateFromProject)`,
      finalSeats.length !== editBeforeResolve?.length,
      `seats survived — guard skipped the clobber`
    );
  } else {
    assert(
      `${name}: no clobber (guard skipped hydrateFromProject)`,
      editBeforeResolve ? finalSeats.length === editBeforeResolve.length : true,
      `seats were clobbered to ${finalSeats.length}`
    );
  }

  // Cleanup
  act(() => {
    renderer.unmount();
  });
}

// ─── Run all scenarios ─────────────────────────────────────────────────
const PROJECT_ID = 'proj-mount-test';
const VERSION_ID = 'ver-1';

// 1. After-fix retention: ProjectDesignHydrator already hydrated → guard skips.
await runScenario({
  name: '1. After-fix retention (pre-hydrated, edit 3→4 before resolve)',
  preHydrate: true,
  projectRecord: makeProjectRecord({ id: PROJECT_ID, activeVersionId: VERSION_ID, seatingPositions: makeSeats(3) }),
  versionRecord: makeVersionRecord({ id: VERSION_ID, seatingPositions: makeSeats(3) }),
  editBeforeResolve: makeSeats(4),
  expectedSeats: 4,
  expectClobber: false,
});

// 2. Before-fix loss: canonical store NOT pre-hydrated → guard fails → clobber.
await runScenario({
  name: '2. Before-fix loss (NOT pre-hydrated, edit 3→4 before resolve)',
  preHydrate: false,
  projectRecord: makeProjectRecord({ id: PROJECT_ID, activeVersionId: VERSION_ID, seatingPositions: makeSeats(3) }),
  versionRecord: makeVersionRecord({ id: VERSION_ID, seatingPositions: makeSeats(3) }),
  editBeforeResolve: makeSeats(4),
  expectedSeats: 3,
  expectClobber: true,
});

// 3. 4→3 reduction (pre-hydrated, edit 4→3 before resolve — preserved)
await runScenario({
  name: '3. 4→3 reduction (pre-hydrated, edit 4→3 before resolve)',
  preHydrate: true,
  projectRecord: makeProjectRecord({ id: PROJECT_ID, activeVersionId: VERSION_ID, seatingPositions: makeSeats(4) }),
  versionRecord: makeVersionRecord({ id: VERSION_ID, seatingPositions: makeSeats(4) }),
  editBeforeResolve: makeSeats(3),
  expectedSeats: 3,
  expectClobber: false,
});

// 4. Repeated changes (pre-hydrated, edit 3→4→5 before resolve — last wins)
await runScenario({
  name: '4. Repeated changes (pre-hydrated, edit 3→4→5 before resolve)',
  preHydrate: true,
  projectRecord: makeProjectRecord({ id: PROJECT_ID, activeVersionId: VERSION_ID, seatingPositions: makeSeats(3) }),
  versionRecord: makeVersionRecord({ id: VERSION_ID, seatingPositions: makeSeats(3) }),
  editBeforeResolve: makeSeats(5),
  expectedSeats: 5,
  expectClobber: false,
});

// 5. No active_version_id first-creation (pre-hydrated, no version)
await runScenario({
  name: '5. No active_version_id first-creation (pre-hydrated, edit 3→4)',
  preHydrate: true,
  projectRecord: makeProjectRecord({ id: PROJECT_ID, activeVersionId: null, seatingPositions: makeSeats(3) }),
  versionRecord: null,
  editBeforeResolve: makeSeats(4),
  expectedSeats: 4,
  expectClobber: false,
});

// 6. No active_version_id first-creation WITHOUT pre-hydrate (old behavior — clobber)
await runScenario({
  name: '6. No active_version_id first-creation (NOT pre-hydrated, edit 3→4)',
  preHydrate: false,
  projectRecord: makeProjectRecord({ id: PROJECT_ID, activeVersionId: null, seatingPositions: makeSeats(3) }),
  versionRecord: null,
  editBeforeResolve: makeSeats(4),
  expectedSeats: 3,
  expectClobber: true,
});

// 7. Manual reload (forceRefresh=true) — guard is bypassed even when pre-hydrated,
//    so a full re-hydrate runs and the DB record's seats overwrite the user edit.
await runScenario({
  name: '7. Manual reload (forceRefresh, pre-hydrated, edit 3→4)',
  preHydrate: true,
  projectRecord: makeProjectRecord({ id: PROJECT_ID, activeVersionId: VERSION_ID, seatingPositions: makeSeats(3) }),
  versionRecord: makeVersionRecord({ id: VERSION_ID, seatingPositions: makeSeats(3) }),
  editBeforeResolve: makeSeats(4),
  expectedSeats: 3,
  expectClobber: true,
  forceRefresh: true,
});

// 8. Project switching — switching to a different project fires a fresh
//    loadProject. The canonical store is pre-hydrated for the NEW project,
//    so the guard skips the clobber and the user's edit on the new project
//    survives.
await runScenario({
  name: '8. Project switch (pre-hydrated for new project, edit 3→4)',
  preHydrate: true,
  projectRecord: makeProjectRecord({ id: 'proj-other', activeVersionId: 'ver-other', seatingPositions: makeSeats(3) }),
  versionRecord: makeVersionRecord({ id: 'ver-other', seatingPositions: makeSeats(3) }),
  editBeforeResolve: makeSeats(4),
  expectedSeats: 4,
  expectClobber: false,
  switchToProject: 'proj-other',
});

// ─── Summary ────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}/${results.length}, Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailures:');
  results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
  process.exit(1);
}
console.log('ALL PASS');