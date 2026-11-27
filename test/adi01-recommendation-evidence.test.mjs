import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker as NodeWorker } from "node:worker_threads";
import React from "react";
import Renderer, { act } from "react-test-renderer";
import { runFullStage1Search } from "@/components/room/bass/stage1/stage1PlacementEngine";
import { computeStage1Fingerprint } from "@/components/room/bass/stage1/stage1Fingerprint";
import { prepareStage1Context, evaluateCandidate } from "@/components/room/bass/stage1/stage1CandidateEvaluation";
import { createStage1EvaluationPool } from "@/components/room/bass/stage1/stage1EvaluationPool";
import { screenCandidate } from "@/components/room/bass/stage1/stage1Screening";
import { DEFAULT_BEST_SUB_LAYOUT_PHYSICS as physicsOptions } from "@/components/room/bass/best-layout/bestSubLayoutPhysicsSnapshot";
import { buildStage1Recommendations, recommendationTarget } from "@/components/room/bass/bda/stage1RecommendationSelection";
import { buildStage1PreviewFromEvidence, normalisePreviewsForDisplay } from "@/components/room/bass/bda/stage1ResponseRecovery";
import { refineMissingResponse, resultField } from "@/components/room/bass/bda/repairStage1Recommendation";
import { syncStage1PlacementCache, hydrateStage1PlacementCache, isStage1CacheValid, restoreRecommendationBuckets, saveRepairedResponse } from "@/components/room/bass/stage1/stage1PlacementPersistence";
import Cards, { formatDepression } from "@/components/room/bass/bda/Stage1LayoutCards";
import Graph from "@/components/room/bass/bda/Stage1ResponseGraph";

const quantities = [1, 2, 4];
function diskEntity(dir) {
  const path = join(dir, "stage1.json");
  const save = row => writeFileSync(path, JSON.stringify(row));
  let exists = false;
  return {
    read: () => JSON.parse(readFileSync(path, "utf8")), save,
    async filter() { return exists ? [this.read()] : []; },
    async create(payload) { save({ id: "internal-fixture", ...payload }); exists = true; },
    async updateMany(match, { $set }) {
      const row = this.read();
      if (!Object.entries(match).every(([k,v]) => JSON.stringify(row[k]) === JSON.stringify(v))) return { updated: 0 };
      for (const [key,value] of Object.entries($set)) {
        const parts = key.split(".");
        const field = parts.pop();
        parts.reduce((o,k) => o[k], row)[field] = value;
      }
      save(row);
      return { updated: 1 };
    },
  };
}

// Exercise the application's real worker module and message protocol in a
// separate thread. Only the browser event transport is adapted for node:test.
function threadFactory() {
  const url = new URL("../src/components/room/bass/stage1/stage1Evaluation.worker.js", import.meta.url).href;
  const bootstrap = `import {parentPort} from "node:worker_threads";
    globalThis.self = {postMessage: m => parentPort.postMessage(m)};
    await import(${JSON.stringify(url)});
    parentPort.on("message", data => self.onmessage({data}));`;
  const worker = new NodeWorker(new URL("data:text/javascript," + encodeURIComponent(bootstrap)), {execArgv: ["--import", new URL("./_alias-register.mjs", import.meta.url).href]});
  return { terminate: () => worker.terminate(), postMessage: m => worker.postMessage(m),
    addEventListener: (name,fn) => worker.on(name, m => fn(name === "message" ? {data:m} : m)) };
}

test("primary depression retains 9.5 dB at 40 Hz, genuine zero and missing input", () => {
  const curve = Array.from({length:124},(_,i) => {
    const frequency = 10 * 2 ** (i/32);
    return {frequency, spl:85-18*Math.exp(-0.5*(Math.log2(frequency/40)/0.07)**2)};
  });
  const primary = data => screenCandidate({ transferResult: {rspCurve:curve, seatCurves: [{originalSeatId:"P",responseData:data}]},
    seatingPositions:[{id:"P",priority:"primary"}], candidate:{id:"x",familyId:"RP22_C",sources:[{}]} }).deepestPrimaryDepression;
  assert.equal(formatDepression(primary(curve)), "−9.5 dB @ 40 Hz");
  assert.equal(formatDepression(primary(curve.map(p => ({...p,spl:85})))), "0.0 dB");
  assert.equal(formatDepression(primary([])), "NOT CALCULATED");
});

for (const [widthM,lengthM,heightM,rows,columns] of [[3.6,5.2,2.35,1,2],[4.5,6,2.4,2,3],[6.2,9.3,3.1,3,4]]) {
  test(`${widthM} × ${lengthM} × ${heightM} m, ${rows} rows: selection, disk reopen and each missing response`, async t => {
    const dir = mkdtempSync(join(tmpdir(),"adi01-")); t.after(() => rmSync(dir,{ recursive:true,force:true }));
    const entity = diskEntity(dir);
    const seatingPositions = Array.from({length:rows*columns},(_,i) => ({
      id:"seat-"+i, x:(1+i%columns)*widthM/(columns+1), y:lengthM*(0.48+Math.floor(i/columns)*0.14), z:1.2,
      priority:i<columns?"primary":"secondary",
    }));
    const ctx = {roomDims:{widthM,lengthM,heightM},rspPosition:{x:widthM/2,y:lengthM*0.48,z:1.2},seatingPositions,physicsOptions};
    const fingerprint = computeStage1Fingerprint(ctx) + "|rec:1,2,4";
    assert.equal(computeStage1Fingerprint({...ctx,selectedSubModel:"different",p14Target:"L4"})+"|rec:1,2,4",fingerprint);
    const prepared = prepareStage1Context(ctx);
    const refined = new Map(); let discoveryCalls = 0;
    const pool = {evaluate: async (candidate, options) => {
      const result = evaluateCandidate(candidate,prepared,options);
      if (options?.returnResponseEvidence) {
        assert.equal(options.pointsPerOctave,32);
        refined.set(result.responseEvidence.key, result);
      } else discoveryCalls++;
      return result;
    }};
    const {results} = await runFullStage1Search({...ctx, pool, recommendationQuantities:quantities});
    const count = Object.values(results).reduce((n,r)=>n+r.candidateCount,0);
    assert.equal(count,discoveryCalls);
    assert.ok(Object.values(results).every(r=>r.refinementCandidateCount>=12 && r.refinementCandidateCount<=15));
    const options = rs => buildStage1Recommendations({status:"complete",fingerprint,...rs},ctx);
    const complete = options(results);
    for (const card of complete) {
      assert.ok(card.ready);
      const original = refined.get(card.evidenceKey);
      assert.equal(original.id,card.finalistId);
      assert.deepEqual(card.responseEvidence,original.responseEvidence);
      assert.deepEqual(card.screening.deepestPrimaryDepression, original.screening.deepestPrimaryDepression);
      assert.deepEqual(card.screening.deepestRspDepression, original.screening.deepestRspDepression);
      assert.deepEqual(card.coordinates.map(c=>[c.x,c.y]), original.sources.map(s=>[+(s.xNorm*widthM).toFixed(3),+(s.yNorm*lengthM).toFixed(3)]));
      assert.ok(card.coordinates.every(c=>c.y===0 || c.y===lengthM));
    }
    const previews = cards => normalisePreviewsForDisplay(cards.map(o=>buildStage1PreviewFromEvidence(o,seatingPositions)));
    const allPreviews = previews(complete);
    let applied;
    const view = Renderer.create(React.createElement(Cards,{...ctx,status:"complete",options:complete,
      stage1Previews:allPreviews,stage1Fingerprint:fingerprint,stage1CandidateCount:count,subwooferInstances:[],
      commitInstances: instances => {applied=instances;}}));
    const graphs = view.root.findAllByType(Graph);
    assert.deepEqual(graphs.map(g=>g.props.preview.evidenceKey),complete.map(c=>c.evidenceKey));
    assert.equal(new Set(graphs.map(g=>[g.props.yMin,g.props.yMax].join("/"))).size,1);
    assert.equal(view.root.findAllByType("title").filter(n=>n.children[0]==="Reference seating position (RSP)").length,3);
    assert.equal(view.root.findAllByType("title").filter(n=>String(n.children[0]).startsWith("Seat ")).length,3*seatingPositions.length);
    const buttons = () => view.root.findAllByType("button");
    act(()=>buttons().filter(b=>b.children.includes("Select"))[2].props.onClick());
    act(()=>buttons().find(b=>b.children[0]==="Apply ").props.onClick());
    assert.equal(applied.filter(s=>s.enabled!==false).length,4);
    view.unmount();
    assert.ok(await syncStage1PlacementCache("p","v",fingerprint,results,null,entity));
    const originalRow = entity.read();
    const read = () => hydrateStage1PlacementCache("p","v",entity);
    const open = async () => {
      const saved = await read(); assert.ok(isStage1CacheValid(saved,fingerprint));
      return restoreRecommendationBuckets(saved,fingerprint,seatingPositions);
    };
    assert.deepEqual(options(await open()),complete);
    let repairs = 0;
    for (const [index, quantity] of quantities.entries()) {
      const field = resultField[quantity];
      const damaged = structuredClone(originalRow);
      recommendationTarget(damaged[field]).responseEvidence=null;
      entity.save(damaged);
      assert.deepEqual(options(await open()),complete); // second matching saved copy
      recommendationTarget(damaged.completed_by_fingerprint[fingerprint][field]).responseEvidence=null;
      entity.save(damaged);
      const saved = await open();
      const cards = options(saved);
      assert.equal(cards[index].screening,null);
      assert.deepEqual(previews(cards).previews.map(p=>p.evidenceKey),complete.filter(c=>c.quantity!==quantity).map(c=>c.evidenceKey));
      const swapped = structuredClone(saved);
      recommendationTarget(swapped[field]).responseEvidence=complete[(index+1)%3].responseEvidence;
      assert.equal(options(swapped)[index].ready,false);
      const swappedMetrics = structuredClone(results);
      recommendationTarget(swappedMetrics[field]).screening=structuredClone(recommendationTarget(results[resultField[quantities[(index+1)%3]]]).screening);
      assert.equal(options(swappedMetrics)[index].ready,false);
      const signal = new AbortController().signal;
      const evidence = await refineMissingResponse(saved[field],cards[index],ctx,signal, params =>
        createStage1EvaluationPool({...params,workerFactory:threadFactory,
          onProgress:d=>{if(d.event==="job_posted") repairs++;}}));
      assert.deepEqual(evidence.responseEvidence,complete[index].responseEvidence);
      await saveRepairedResponse("p","v",cards[index],evidence,seatingPositions,signal,entity);
      assert.deepEqual(options(await open()),complete);
      assert.deepEqual(entity.read()[field],entity.read().completed_by_fingerprint[fingerprint][field]);
    }
    assert.equal(repairs,3);
    t.diagnostic(JSON.stringify({count,refinements:[...refined.values()].length,repairs, primary:complete.map(c=>formatDepression(c.screening.deepestPrimaryDepression))}));
  });
}
