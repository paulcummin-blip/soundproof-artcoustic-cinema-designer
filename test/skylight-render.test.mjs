import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./_alias-loader.mjs',import.meta.url);
const React = await import('react');
const {renderToStaticMarkup} = await import('react-dom/server');
const {default:Layer} = await import('../src/components/room/rv/render/RvRoomElementsLayer.jsx');
const base={hasRoomRect:true,roomElements:[{id:'s',type:'skylight',x_m:3,y_m:3,length_m:3.5,width_m:2.32}],widthM:6,lengthM:6,heightM:2.8,scale:100,meterToCanvasX:x=>x*100,meterToCanvasY:y=>y*100,getModelDimsM:()=>({round:true,diameterM:0.3,widthM:0.3,heightM:0.3,depthM:0.08}),getSpeakerVisibility:()=>true,getCanonicalRole:x=>x,appState:{},rolesForLayout:()=>['TFL'],handleMouseDown:()=>{}};
test('plan renders exact skylight size and orange clash; clearing speaker clears orange',()=>{
 const sp={id:'t',role:'TFL',model:'ARCHITECT 2-1',position:{x:3,y:3,z:2.6}};
 const draw=placedSpeakers=>renderToStaticMarkup(React.createElement(Layer,{...base,placedSpeakers}));
 const hit=draw([sp]);
 assert.match(hit,/width="350"/); assert.match(hit,/height="23[12]/);
 assert.match(hit,/#C76A1B/); assert.match(hit,/<circle/);
 assert.doesNotMatch(draw([{...sp,position:{x:0.5,y:0.5,z:2.6}}]),/#C76A1B/);
 assert.match(hit,/cursor:grab/);
});
