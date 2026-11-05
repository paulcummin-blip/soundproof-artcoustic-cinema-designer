import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { register } from "node:module";
// Authentication only gates developer details; no account/network is needed for rendering.
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s,c,next) {
  if(s.includes("AuthContext")) return {url:"data:text/javascript,export function useAuth(){return {user:null}}",shortCircuit:true};
  return next(s,c);
}`), import.meta.url);
const {default:Journey} = await import("../src/components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx");

for (const state of ["failed","no_useful_improvement"]) {
  test(state+" owns the panel over an existing applied receipt",()=>{
    const receipt={status:"applied",appliedCacheKey:"same",candidate:{integrationVerified:true}};
    const before=JSON.stringify(receipt);
    const message=state==="failed"?"The worker failed. Retry the optimisation.":"ADI checked the current design and did not find a worthwhile improvement.";
    let renderer;
    act(()=>{renderer=TestRenderer.create(React.createElement(Journey,{
      projectId:"terminal-test",versionId:state,currentDesignFingerprint:"same",
      jointRecommendation:receipt,onRunOptimisationPlan:()=>{},onReoptimiseCalibration:()=>{},
      presentation:{state,outcome:state==="failed"?"unable_to_evaluate":state,
        statusLabel:state,outcomeLabel:state==="failed"?null:"No Improvement Found",
        message,notes:[],canRun:true,action:"retest",actionLabel:"Re-test Bass Optimisation",
        nextAction:"Try again.",showPlan:true},
    }));});
    const html=JSON.stringify(renderer.toJSON());
    const runButtons=renderer.root.findAll(n=>n.type==="button" && n.props["data-adi-rerun-plan"]==="true");
    act(()=>renderer.unmount());
    assert.ok(html.includes(message));
    assert.ok(!html.includes("Crossover and subwoofer integration applied and verified."));
    assert.ok(!html.includes("REVIEW IMPROVEMENT"));
    assert.equal(runButtons.length,1);
    assert.equal(JSON.stringify(receipt),before);
  });
}
