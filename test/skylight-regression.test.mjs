import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./_alias-loader.mjs', import.meta.url);
const { skylightClashingSpeakers, skylightRectM, nudgeOverheadsOutOfSkylights } = await import('../src/components/room/rv/utils/skylightGeometry.js');
const opts = {widthM:6,lengthM:6,heightM:2.4,getModelDimsM:()=>({round:true,diameterM:0.3,widthM:0.3,heightM:0.3,depthM:0.08})};
const speaker=(x,y)=>({id:'TFL',role:'TFL',model:'test',position:{x,y,z:2.2}});
const sky=(x,y,l,w)=>({id:'sky',type:'skylight',surface:'ceiling',x_m:x,y_m:y,length_m:l,width_m:w});
test('round ceiling face edge overlap is detected despite shallow cabinet depth',()=>{
 assert.equal(skylightClashingSpeakers([speaker(3,1.9)],{x:2,y:2,w:2,h:2},opts).length,1);
 assert.equal(skylightClashingSpeakers([speaker(3,1.8)],{x:2,y:2,w:2,h:2},opts).length,0);
});
test('impossible placement preserves speaker and reports no change on repeated calls',()=>{
 const a=[speaker(0.15,3)], skies=[sky(3,3,6,6)];
 const first=nudgeOverheadsOutOfSkylights(a,skies,opts);
 assert.equal(first.changed,false); assert.deepEqual(first.speakers,a);
 assert.equal(nudgeOverheadsOutOfSkylights(first.speakers,skies,opts).changed,false);
});
test('multiple skylights and wall-adjacent opening clear every opening and settle',()=>{
 const skies=[sky(1,3,2,3),sky(3,3,2,3),sky(4,2,2,2)];
 const first=nudgeOverheadsOutOfSkylights([speaker(1,3)],skies,opts);
 assert.equal(first.changed,true);
 for (const el of skies) assert.equal(skylightClashingSpeakers(first.speakers,skylightRectM(el,opts),opts).length,0);
 assert.equal(nudgeOverheadsOutOfSkylights(first.speakers,skies,opts).changed,false);
});
test('manual placement, lower wall speakers and no-skylight layouts are unchanged',()=>{
 const a=[{...speaker(3,3),positionSource:'user'},{...speaker(3,3),id:'L',role:'L',position:{x:3,y:3,z:1.2}}];
 assert.deepEqual(nudgeOverheadsOutOfSkylights(a,[sky(3,3,3.5,2.32)],opts).speakers,a);
 assert.equal(nudgeOverheadsOutOfSkylights([speaker(3,3)],[],opts).changed,false);
});
test('actual project serialize/hydrate retains skylight and legacy wall fields',async()=>{
 const {serializeProject}=await import('../src/components/utils/serializeProject.jsx');
 const {hydrateProjectIntoAppState}=await import('../src/components/utils/hydrateProjectIntoAppState.jsx');
 const elements=[{...sky(2.1,3.2,3.5,2.32),label:'Validation skylight'},{id:'wall',type:'door',wall:'rear',length_m:0.9,pos_m:1,z_position:0,height:2.1}];
 const saved=JSON.parse(JSON.stringify(serializeProject({roomElements:elements,roomDims:{widthM:6,lengthM:6,heightM:2.8}})));
 assert.deepEqual(saved.room_elements,elements);
 let hydrated;
 hydrateProjectIntoAppState(saved,{setRoomElements:v=>{hydrated=v;}});
 assert.deepEqual(hydrated,elements);
});
