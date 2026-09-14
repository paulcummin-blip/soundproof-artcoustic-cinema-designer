// Execute from the repository root: node test/technical-report-geometry-authority.test.mjs
// Render the real static canvas and all PDF captures; only the acoustic builder
// is replaced by a prop probe. No geometry resolver or renderer is mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const root=process.cwd(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'report-geometry-'));
const out=path.join(tmp,'renderer.cjs');
await build({
  stdin:{contents: [
    "export {default as React} from 'react';",
    "export {renderToStaticMarkup as render} from 'react-dom/server';",
    "export {default as Canvas} from './src/components/report/RvStaticCanvas.jsx';",
    "export {default as Captures} from './src/components/report/ReportHiddenCaptures.jsx';",
    "export {computeEffectiveRsp} from './src/components/room/rsp/computeEffectiveRsp.js';",
    "export {resolveRspInputs} from './src/components/room/rsp/rspInputResolver.js';",
    "export {resolveEffectiveViewableDimsM} from './src/components/models/screen/resolveEffectiveScreen.js';",
  ].join('\n'),resolveDir:root,loader:'jsx'},
  bundle:true,platform:'node',format:'cjs',outfile:out,alias:{'@':root+'/src'},logLevel:'error',
  plugins:[{name:'acoustic-builder-prop-probe',setup(b){
    b.onResolve({filter:/\/room\/RoomVisualisation$/},()=>({path:'builder',namespace:'probe'}));
    b.onLoad({filter:/.*/,namespace:'probe'},()=>({
      contents:"import React from 'react'; export default p=>React.createElement('span',{'data-builder-rsp-mode':p.rspMode,'data-builder-rsp-y':p.manualRspY_m,'data-builder-rsp-x':p.manualRspX_m});",
      loader:'jsx',resolveDir:root
    }));
  }}]
});
const {React,render,Canvas,Captures,computeEffectiveRsp,resolveRspInputs,resolveEffectiveViewableDimsM}=createRequire(import.meta.url)(out);
const seats=[1.15,1.95,2.75,3.55,4.35].map((x,i)=>({id:'seat-r1-c'+(i+1),x,y:3.81,z:1.2,rowNumber:1,isPrimary:i===2}));
const screen={tvPresetKey:'tv100',tvWidthMm:2230,visibleWidthInches:87.8,aspectRatio:'16:9',screenPlaneY_m:.102,floatDepthM:.2,borderThicknessM:.005};
const app={roomDims:{widthM:5.5,lengthM:5.29,heightM:2.4},rspMode:'manual_position',manualRspY_m:3.81,manualRspX_m:0,designatedRspSeatId:null,screenFrontPlaneM:null,seatingPositions:seats};
let passed=0;
function attrs(tag){
  assert.ok(tag,'required rendered geometry exists');
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
}
function geometry(html){
  const room=attrs(html.match(/<rect\b[^>]*stroke="#DCDBD6"[^>]*>/)?.[0]);
  const scr=attrs(html.match(/<rect\b[^>]*fill="#1a1a1a"[^>]*>/)?.[0]);
  const label=html.match(/<g data-layer="export-rsp-label"[^>]*>\s*(<text\b[^>]*>)/)?.[1];
  const marker=html.match(/<g data-testid="mlp-marker"[^>]*>\s*(<circle\b[^>]*>)/)?.[1];
  const rsp=attrs(label||marker), scale=+room.width/5.5;
  return {
    x:((label?+rsp.x-18:+rsp.cx)-(+room.x))/scale,
    y:((label?+rsp.y-5:+rsp.cy)-(+room.y))/scale,
    screenY:(+scr.y-(+room.y))/scale,
    screenCentreX:(+scr.x+(+scr.width)/2-(+room.x))/scale,
    screenWidth:+scr.width/scale,
    tolerance:1.1/scale
  };
}
function check(name,state=app,scr=screen,extra={}){
  const expected=computeEffectiveRsp(resolveRspInputs({appState:state,screen:scr,seatingPositions:seats,roomWidthM:5.5,roomLengthM:5.29}));
  const html=render(React.createElement(Canvas,{appState:state,screen:scr,seatingPositions:seats,exportWidthPx:1200,exportHeightPx:800,overlays:{EXPORT_RSP_LABEL:true},showMlpRuler:true,...extra}));
  const g=geometry(html), dims=resolveEffectiveViewableDimsM(scr);
  assert.ok(Math.abs(g.x-expected.effectiveRspX_m)<=g.tolerance,name+' RSP X');
  assert.ok(Math.abs(g.y-expected.effectiveRspY_m)<=g.tolerance,name+' RSP Y');
  assert.ok(Math.abs(g.screenY-.102)<1e-12,name+' screen plane');
  assert.ok(Math.abs(g.screenCentreX-2.75)<=g.tolerance,name+' screen centre');
  assert.ok(Math.abs(g.screenWidth-(dims.widthM+.01))<=g.tolerance,name+' screen width');
  console.log('PASS '+name+' '+JSON.stringify(g)); passed++;
}
try {
  check('saved manual RSP without explicit capture props');
  check('explicit null front-plane retains live screen authority',app,screen,{screenFrontPlaneM:null});
  check('designated seat-bound RSP',{...app,rspMode:'seat_bound',designatedRspSeatId:'seat-r1-c1'});
  check('row-derived RSP',{...app,rspMode:'all_rows_average'});
  check('automatic RSP',{...app,rspMode:'auto_from_screen'});
  check('manual screen dimensions override TV preset',app,{...screen,manualSize:{enabled:true,mode:'wh',widthM:3,heightM:1.6}});
  const html=render(React.createElement(Captures,{app,screen,seats,placedSpeakers:[],primarySeatingPosition:{x:2.75,y:3.81,z:1.2},dolbyLayout:'5.1'}));
  const svgs=html.match(/<svg\b[\s\S]*?<\/svg>/g);
  assert.equal(svgs.length,3,'all three real PDF capture canvases render');
  for(const i of [0,2]){
    const g=geometry(svgs[i]);
    assert.ok(Math.abs(g.y-3.81)<=g.tolerance,'PDF capture '+i+' retains saved manual RSP');
    assert.ok(Math.abs(g.screenY-.102)<1e-12,'PDF capture '+i+' screen plane');
  }
  const dimensionText = svgs[1].replace(/<[^>]*>/g, '');
  assert.ok(dimensionText.includes('3.81m'),'dimension drawing labels the current front-wall distance');
  assert.ok(dimensionText.includes('3.71m'),'dimension drawing uses canonical screen-to-RSP distance');
  assert.ok(!dimensionText.includes('2.13m'),'automatic RSP must not replace manual RSP');
  assert.ok(html.includes('data-builder-rsp-mode="manual_position"'));
  assert.ok(html.includes('data-builder-rsp-y="3.81"'));
  console.log('PASS all PDF captures and acoustic builder retain saved RSP and screen inputs'); passed++;
  console.log(JSON.stringify({passed,failed:0}));
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
