import React from "react";
import { renderToString } from "react-dom/server";

// Stub the externalised modules so the OAC bundle (which imports @base44/sdk,
// lucide-react, react, react-dom) can load in a pure-Node render test.
globalThis.React = React;

const cases = [
  { label: "AdiOptimiserProgress idle", Comp: (await import("./adi-bundle.mjs")).default, props: { v2State: null, workflowPhase: "idle", isCalculating: false, isComplete: false } },
  { label: "AdiOptimiserProgress complete-null", Comp: (await import("./adi-bundle.mjs")).default, props: { v2State: null, workflowPhase: "complete", stageDisplay: null, isCalculating: false, isComplete: true, receipt: null, recommendations: null } },
  { label: "AdiOptimiserProgress active", Comp: (await import("./adi-bundle.mjs")).default, props: { v2State: { status: "running", phase: "calibrating", phaseLabel: "Phase", progressCurrent: 2, progressTotal: 5, stageVerdicts: {} }, workflowPhase: "optimising", stageDisplay: { activeStageKey: "delays", stages: [{ key: "delays", status: "active" }], stageVerdicts: {} }, isCalculating: true, isComplete: false } },
];

let failed = 0;
for (const c of cases) {
  try {
    const html = renderToString(React.createElement(c.Comp, c.props));
    console.log(`OK   | ${c.label} | ${html.length} chars`);
  } catch (e) {
    failed++;
    console.log(`FAIL | ${c.label} | ${e.message}`);
    console.log(String(e.stack).split("\n").slice(1, 3).join("\n"));
  }
}

// Now the critical test: OptimiseAndCalculate first-render (the TDZ case).
// We cannot easily feed it full props, but we can at least confirm the module
// evaluates and its default export is a function (the TDZ would only fire on
// render, not import). The render of the default export with minimal props
// exercises the stageDisplay useMemo on first render.
try {
  const Oac = (await import("./oac-bundle.mjs")).default;
  console.log(`OAC default export type: ${typeof Oac}`);
  // Attempt a first render with the minimal prop set the component reads before
  // the useMemo. Many props are optional / defaulted; the component reads
  // appState, subwooferInstances, shared, workflowState, v2State early.
  const html = renderToString(React.createElement(Oac, {
    roomDims: { widthM: 4.5, lengthM: 6, heightM: 2.4 },
    seatingPositions: [],
    subwooferInstances: [],
    frontSubsCfg: null,
    rearSubsCfg: null,
    appState: { activeVersionId: null, splConfig: {}, updateGlobalSpl: () => {} },
    shared: { canCalculate: false, calculationInProgress: false },
    hasCanonicalInstances: true,
    hasResults: false,
  }));
  console.log(`OK   | OptimiseAndCalculate first render | ${html.length} chars`);
} catch (e) {
  failed++;
  console.log(`FAIL | OptimiseAndCalculate first render | ${e.message}`);
  console.log(String(e.stack).split("\n").slice(1, 5).join("\n"));
}

console.log(`\n${failed} failures`);
process.exit(failed ? 1 : 0);