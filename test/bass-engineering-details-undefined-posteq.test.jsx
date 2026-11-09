import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import BassEngineeringDetails from "@/components/room/bass/BassEngineeringDetails.jsx";

// Room D disposable version (6af1978b...) completed with four SUB3-12 cabinets
// and a 95 Hz crossover. The saved optimisation result carried P19 L4 / 1.470 dB,
// Primary P20 L4 / 2.785 dB, Secondary/overall P20 L1 / 7.916 dB, but NO
// top-level result.finalPostEqCurve — the canonical curve lives on
// selectedCandidate.finalPostEqCurve. The previous code called .find() on the
// undefined top-level field and crashed the whole page-content segment.
const baseProps = {
  enabled: true,
  designEqEnabled: true,
  rspPosition: { x: 2.25, y: 3.6, z: 1.2 },
  seatingPositions: [{ id: "rsp", x: 2.25, y: 3.6, z: 1.2 }],
  contract: {},
  detailedStatus: "complete",
  rspRawCurve: [
    { frequency: 20, spl: 95 },
    { frequency: 30, spl: 98 },
    { frequency: 50, spl: 101 },
  ],
  perSeatRawCurves: [],
  priorityMode: "rsp",
  systemLimits: { activeSubs: [{ modelKey: "SUB3-12" }], usableLfHz: 20 },
  multiSeries: [],
  runtimeCapture: null,
  smoothingMode: "none",
  lifecycle: { status: "complete" },
  graphCandidateId: "cand-1",
  graphFilterBankSignature: "sig",
  graphSeries: [],
  transitionFrequencyHz: 95,
  normalizedTransferResult: null,
};

function callComponent(props) {
  // React function components return a JSX element tree without rendering
  // children, so the .find() crash at module evaluation of the body surfaces
  // here without needing a DOM.
  return BassEngineeringDetails(props);
}

test("does not throw when result.finalPostEqCurve is undefined (Room D crash)", () => {
  const result = {
    selectedCandidate: {
      candidateId: "cand-1",
      finalPostEqCurve: [
        { frequency: 20, spl: 97 },
        { frequency: 30, spl: 99 },
        { frequency: 50, spl: 101 },
      ],
      generatedFilterBank: [],
    },
    selectedFilters: [],
    // NOTE: result.finalPostEqCurve intentionally absent.
  };
  assert.doesNotThrow(() => callComponent({ ...baseProps, result }));
});

test("falls back to selectedCandidate.finalPostEqCurve and builds the correction curve", () => {
  const result = {
    selectedCandidate: {
      candidateId: "cand-1",
      finalPostEqCurve: [
        { frequency: 20, spl: 97 },
        { frequency: 30, spl: 99 },
        { frequency: 50, spl: 101 },
      ],
      generatedFilterBank: [],
    },
    selectedFilters: [],
  };
  const tree = callComponent({ ...baseProps, result });
  assert.ok(tree, "component returned a tree (did not crash)");
  // The correction curve (finalPostEqCurve - rspRawCurve) should be embedded in
  // the DesignEqFilterBankDiagnostic child via combinedEqCurve.
  const correctionChild = findChild(tree, (node) =>
    node?.props?.combinedEqCurve !== undefined);
  assert.ok(correctionChild, "DesignEqFilterBankDiagnostic child present");
  const correction = correctionChild.props.combinedEqCurve;
  assert.equal(correction.length, 3, "correction built from selectedCandidate curve");
  assert.equal(correction[0].spl, 2, "20 Hz: 97 - 95 = 2 dB");
  assert.equal(correction[1].spl, 1, "30 Hz: 99 - 98 = 1 dB");
  assert.equal(correction[2].spl, 0, "50 Hz: 101 - 101 = 0 dB");
});

test("uses top-level result.finalPostEqCurve when present (legacy alias preserved)", () => {
  const result = {
    selectedCandidate: {
      candidateId: "cand-1",
      finalPostEqCurve: [{ frequency: 20, spl: 200 }], // should be ignored
      generatedFilterBank: [],
    },
    selectedFilters: [],
    finalPostEqCurve: [
      { frequency: 20, spl: 97 },
      { frequency: 30, spl: 99 },
      { frequency: 50, spl: 101 },
    ],
  };
  const tree = callComponent({ ...baseProps, result });
  const correctionChild = findChild(tree, (node) =>
    node?.props?.combinedEqCurve !== undefined);
  const correction = correctionChild.props.combinedEqCurve;
  assert.equal(correction[0].spl, 2, "prefers top-level result.finalPostEqCurve");
});

test("does not throw and produces no correction when neither curve is present", () => {
  const result = {
    selectedCandidate: { candidateId: "cand-1", generatedFilterBank: [] },
    selectedFilters: [],
    // No finalPostEqCurve anywhere.
  };
  let tree;
  assert.doesNotThrow(() => { tree = callComponent({ ...baseProps, result }); });
  assert.ok(tree, "component returned a tree");
  const correctionChild = findChild(tree, (node) =>
    node?.props?.combinedEqCurve !== undefined);
  assert.ok(correctionChild, "DesignEqFilterBankDiagnostic child present");
  assert.equal(correctionChild.props.combinedEqCurve.length, 0, "no invented correction curve");
  // SourceDomainCapabilityDiagnostic must receive an array, not undefined.
  const sourceChild = findChild(tree, (node) =>
    node?.type?.name === "SourceDomainCapabilityDiagnostic" ||
    (Array.isArray(node?.props?.postEqCurve) && node?.props?.usableLfHz !== undefined && node?.props?.activeSubs !== undefined && node?.props?.optimisationResult !== undefined && node?.props?.rawCurve !== undefined && node?.props?.combinedEqCurve === undefined && node?.props?.postEqCurve !== undefined));
  assert.ok(sourceChild, "SourceDomainCapabilityDiagnostic child present");
  assert.ok(Array.isArray(sourceChild.props.postEqCurve), "postEqCurve is always an array");
  assert.equal(sourceChild.props.postEqCurve.length, 0, "postEqCurve empty when no evidence");
});

test("does not throw when result is null", () => {
  assert.doesNotThrow(() => callComponent({ ...baseProps, result: null }));
});

// Walk a React element tree (children / props.children) and return the first
// matching node, depth-first.
function findChild(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  const children = element.props?.children;
  if (children === undefined || children === null) return null;
  const arr = Array.isArray(children) ? children : [children];
  for (const child of arr) {
    const found = findChild(child, predicate);
    if (found) return found;
  }
  return null;
}