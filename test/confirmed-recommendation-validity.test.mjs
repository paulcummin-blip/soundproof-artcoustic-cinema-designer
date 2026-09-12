import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectWinnerWithProtection } from "../src/components/room/bass/improveBassV2/improveBassV2Engine.js";
import { isMaterialImprovement } from "../src/components/room/bass/improveBassV2/materialityGate.js";
import { validateConfirmedCandidate } from "../src/components/room/bass/improveBassV2/confirmedCandidateValidity.js";
import { rankRecommendations } from "../src/components/room/bass/improveBassV2/recommendationRanker.js";
import Results from "../src/components/room/bass/improveBassV2/ImproveBassV2Results.jsx";
const {current,calibration,position,snapshot}=JSON.parse(fs.readFileSync(new URL("./_confirmed-recommendation-fixture.json",import.meta.url)));
// Executed canonical reference data. This validates selection/presentation, not natural discovery.
const select=(rows,extra={})=>selectWinnerWithProtection(rows,{...snapshot,...extra},current);
test("A: material calibration alone is the applicable recommendation",()=>{const s=select([calibration]);assert.equal(s.winner.candidateId,calibration.candidateId);assert.equal(s.recommendations.length,1);assert.equal(s.terminalOutcome,"material");});
test("B: material position alone",()=>assert.equal(select([position]).winner.candidateId,position.candidateId));
test("C: both use one recommendation authority",()=>{const s=select([calibration,position]);assert.equal(s.recommendations.length,2);assert.equal(s.winner.candidateId,s.recommendations[0].result.candidateId);assert.strictEqual(rankRecommendations(s),s.recommendations);});
test("D: complete valid immaterial evaluation",()=>{const s=select([{...current,candidateKind:"calibration",candidateId:"no-benefit",configurationKey:"different"}]);assert.equal(s.winner,null);assert.equal(s.terminalOutcome,"below-materiality");});
test("Same positions and inherited isCurrent do not erase calibration",()=>assert.equal(select([{...calibration,isCurrent:true}]).winner.candidateId,calibration.candidateId));
test("Reference follows the existing 1 dB same-level primary path",()=>{const m=isMaterialImprovement(current,calibration);assert.equal(m.material,true);assert.ok(Math.abs(m.details.improvement-1.1745106187541694)<1e-9);});
for(const [name,edit] of [
 ["empty",r=>{r.perSeatP19=[];r.perSeatP20=[]}], ["missing",r=>r.perSeatP19.pop()],
 ["duplicate",r=>r.perSeatP20[1].seatId=r.perSeatP20[0].seatId], ["wrong seat",r=>r.perSeatP19[0].seatId="wrong"],
 ["null",r=>r.perSeatP19[0].variationDbRaw=null], ["NaN",r=>r.perSeatP20[0].variationDbRaw=NaN],
 ["Infinity",r=>r.perSeatP20[0].variationDbRaw=Infinity], ["grade mismatch",r=>r.perSeatP19[0].level=4],
 ["band",r=>r.assessmentEndHz=null], ["output",r=>r.operatingOutputDb=null],
 ["physical",r=>r.physicalValidation={passed:false}], ["stale",r=>r.inputIdentity="old"],
 ["timing version",r=>r.timingVersion="old"], ["source identity",r=>r.appliedTuning[1].sourceId=r.appliedTuning[0].sourceId],
])test("E: fail closed on "+name,()=>{const r=structuredClone(calibration);edit(r);const s=select([r]);assert.equal(s.winner,null);assert.equal(s.terminalOutcome,"incomplete");assert.equal(s.evaluations[0].status,"invalid");});
test("Invalid Current cannot authorise a recommendation",()=>assert.equal(selectWinnerWithProtection([calibration],snapshot,{...current,perSeatP19:[]}).terminalOutcome,"incomplete"));
test("Invalid alternative cannot conceal a valid material calibration",()=>{const s=select([{...position,perSeatP19:[]},calibration]);assert.equal(s.winner.candidateId,calibration.candidateId);assert.ok(s.evaluations.some(e=>e.status==="invalid"));});
test("Empty seats never pass standalone materiality",()=>assert.equal(isMaterialImprovement(current,{...calibration,perSeatP19:[],perSeatP20:[]}).material,false));
test("Primary safety still rejects a canonical level regression",()=>{const r=structuredClone(calibration);r.perSeatP19[1].variationDbRaw=3.5;r.perSeatP19[1].level=3;const s=select([r]);assert.equal(s.winner,null);assert.equal(s.evaluations[0].status,"safety-rejected");});
test("Insufficient operating output remains rejected",()=>{const r={...calibration,operatingOutputDb:114,requestedP14Pass:false};assert.equal(select([r]).evaluations[0].status,"safety-rejected");});
test("A-C: card, comparison and top Apply IDs agree; lower cards cannot Apply",()=>{for(const rows of [[calibration],[position],[calibration,position]]){const s=select(rows);const html=renderToStaticMarkup(React.createElement(Results,{selection:s,snapshot,currentInstances:snapshot.allInstances,roomDims:{widthM:5.5,lengthM:5.29,heightM:2.4},seatingPositions:snapshot.validationContext.seats,onApply:()=>{},onApplyCalibration:()=>{}}));for(const r of s.recommendations){assert.ok(html.includes('data-candidate-id="'+r.result.candidateId+'"'));assert.ok(html.includes('data-comparison-candidate-id="'+r.result.candidateId+'"'));assert.equal(html.includes('data-apply-candidate-id="'+r.result.candidateId+'"'),r.isWinner);}assert.ok(html.includes("SEAT"));}});
