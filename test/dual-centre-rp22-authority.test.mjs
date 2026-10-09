import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeAllSeatSplMetrics, getSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';
import { resolveSpeakerSplMeta } from '@/components/utils/spl/speakerSplMeta';
import { effectiveCentreAcousticMidpoint } from '@/components/utils/dualCentrePairAuthority';
import { DUAL_CENTRE_SPL_GAIN_DB } from '@/components/utils/frontStageModeAuthority';
import { discreteChannelCounts } from '../shared/channelArchitecture.js';
import { computeP6Authority } from '@/components/utils/rp22/canonicalP6Authority';
import { resolveRp22DesignValue } from '@/components/utils/rp22/resolveRp22DesignValue';
const point = (x,y,z=1.2) => ({x,y,z});
const sp = (role,x,y,model='c4-1') => ({id:role,role,model,position:point(x,y)});
const unchanged = [sp('FL',.5,.2,'q8-5'),sp('FR',4.5,.2,'q8-5'),sp('SL',.1,3),sp('SR',4.9,3),sp('SBL',1,5.8),sp('SBR',4,5.8),sp('TFL',1,2)];
const pair = [sp('FCL',1,.2),sp('FCR',4,.2)];
const single = sp('FC',2.5,.2);
const seats = [{id:'left',...point(1.5,3.5)},{id:'right',...point(3.5,3.5)}];
const maps = (speakers, powerW=100, headroom=0) => computeAllSeatSplMetrics({
  seats, placedSpeakers:speakers, getCanonicalRole:r=>r,
  getEffectiveSplInputs:()=>({powerW,radiationMode:'half-space'}),
  getModelDimsM:resolveSpeakerSplMeta, mlpPoint:point(2.5,3.5),
  widthM:5,lengthM:6,heightM:2.4,eqHeadroom_dB:headroom
});
const fc = (m,id='mlp') => getSeatSplMetrics(m,id).screen.FC;
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
test('virtual FC uses existing midpoint and is symmetric across mirrored seats',()=>{
 const m=maps([...unchanged,...pair]);
 near(fc(m,'left').value,fc(m,'right').value);
 near(fc(m).debug.distance_m ?? fc(m).debug.distanceM,3.3);
 assert.deepEqual(effectiveCentreAcousticMidpoint(pair),single.position);
});
// Acceptance: the virtual centre carries the selected model's EXISTING SPL
// calculation at the full channel power, then the approved allowance once — so a
// model reading 105 dB as one speaker reads 109 dB in dual-centre mode.
test('approved allowance enters the one virtual centre once, at full channel power',()=>{
 const dual=maps([...unchanged,...pair]);
 const full=maps([...unchanged,single]);
 near(fc(dual).value,fc(full).value+DUAL_CENTRE_SPL_GAIN_DB);
 near(fc(dual).theoretical,fc(full).theoretical+DUAL_CENTRE_SPL_GAIN_DB);
});
test('cabinet ordering cannot change logical centre output',()=>{
 for(const id of ['mlp','left','right']) near(fc(maps([...unchanged,...pair]),id).value,fc(maps([...unchanged,...pair.toReversed()]),id).value);
});
test('one logical FC, two physical cabinet records and no input mutation',()=>{
 const inputs=structuredClone([...unchanged,...pair]);const before=structuredClone(inputs);
 const s=getSeatSplMetrics(maps(inputs),'mlp').screen;
 assert.deepEqual(Object.keys(s).sort(),['FC','FL','FR']);assert.deepEqual(inputs,before);
 assert.equal(inputs.filter(x=>x.role==='FCL'||x.role==='FCR').length,2);
});
test('one logical centre channel retains conventional P2 counts',()=>{
 assert.deepEqual(discreteChannelCounts([...unchanged,...pair]),discreteChannelCounts([...unchanged,single]));
});
test('P6 and P13 input categories are identical for single versus dual',()=>{
 const a=maps([...unchanged,single]),b=maps([...unchanged,...pair]);
 for(const id of ['mlp','left','right']){
 const x=getSeatSplMetrics(a,id),y=getSeatSplMetrics(b,id);
 for(const key of ['surrounds','uppers','listenerLevelSurrounds']) assert.deepEqual(x[key],y[key]);
 const p=m=>computeP6Authority({seatListeners:getSeatSplMetrics(m,id).listenerLevelSurrounds,rspListeners:getSeatSplMetrics(m,'mlp').listenerLevelSurrounds});
 assert.deepEqual(p(a),p(b));
 }
});
test('headroom and screen-channel neighbours remain unchanged',()=>{
 const a=maps([...unchanged,...pair]),b=maps([...unchanged,...pair],100,5);
 near(fc(a).value-fc(b).value,5);
 const singleMaps=maps([...unchanged,single]);
 for(const id of ['mlp','left','right']) for(const role of ['FL','FR']) assert.deepEqual(getSeatSplMetrics(a,id).screen[role],getSeatSplMetrics(singleMaps,id).screen[role]);
});
test('P12 feeder receives approved corrected centre capability at RSP',()=>{
 const dual=getSeatSplMetrics(maps([...unchanged,...pair]),'mlp').screen;
 const full=getSeatSplMetrics(maps([...unchanged,single]),'mlp').screen;
 const actual=resolveRp22DesignValue(12,Math.min(...Object.values(dual).map(v=>v.value)));
 const expected=resolveRp22DesignValue(12,Math.min(dual.FL.value,full.FC.value+4,dual.FR.value));
 assert.equal(actual,expected);
});
test('partial pair cannot claim two-cabinet allowance',()=>{
 const partial=maps([...unchanged,pair[0]]);
 const reference=maps([...unchanged,{...pair[0],role:'FC'}]);
 near(fc(partial).value,fc(reference).value);
});
test('centre card consumes shared FC instead of independently adding allowance',()=>{
 const src=readFileSync('src/components/speakers/LcrSplCard.jsx','utf8');
 assert.ok(!src.includes('base + DUAL_CENTRE_SPL_GAIN_DB'));
 assert.ok(!src.includes('computeSingleSeatSplAtDistance'));
});

import { hasMinimumSystemForAsdr } from '@/components/utils/minimumSystemForAsdr';
const bassState = {subwooferInstances:[{id:'sub',enabled:true}]};
test('complete dual-centre stage passes the existing minimum-system handoff gate',()=>{
 assert.equal(hasMinimumSystemForAsdr([...unchanged,...pair],bassState),true);
});
test('partial or uninstalled dual-centre stage remains incomplete',()=>{
 for(const centres of [[pair[0]],[pair[0],{...pair[1],model:'none'}],[pair[0],{...pair[1],position:null}]]){
 assert.equal(hasMinimumSystemForAsdr([...unchanged,...centres],bassState),false);
 }
});
test('dual centre cannot bypass missing left/right, surrounds or subwoofer',()=>{
 assert.equal(hasMinimumSystemForAsdr(pair,bassState),false);
 assert.equal(hasMinimumSystemForAsdr([...unchanged,...pair],{}),false);
 assert.equal(hasMinimumSystemForAsdr([...unchanged.filter(s=>['FL','FR'].includes(s.role)),...pair],bassState),false);
});
test('conventional minimum-system eligibility is unchanged',()=>{
 assert.equal(hasMinimumSystemForAsdr([...unchanged,single],bassState),true);
 assert.equal(hasMinimumSystemForAsdr(unchanged,bassState),false);
});