import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
const source=fs.readFileSync(new URL('../src/components/room/rv/hooks/usePlanWheelZoom.jsx',import.meta.url),'utf8').replace(/^import .*from "react";\n/,'').replaceAll('export function ','function ');
function target(){const listeners=new Map();return {listeners,addEventListener(n,f){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f);},removeEventListener(n,f){listeners.get(n)?.delete(f);},emit(n,e){for(const f of listeners.get(n)||[]){f(e);if(e.stopped)break;}}};}
function setup(){
 const win=Object.assign(target(),{innerWidth:1000,innerHeight:800,PointerEvent:class{constructor(type,p){this.type=type;Object.assign(this,p);}}});
 let overlay=false,visible=true,cancels=0;
 const child={dispatchEvent(e){cancels++;win.emit(e.type,e);}}, other={};
 const doc={defaultView:win,elementFromPoint:(x,y)=>visible&&!overlay&&x>=100&&x<800&&y>=150&&y<700?child:other};
 const svg={ownerDocument:doc,contains:n=>n===child,getBoundingClientRect:()=>({left:100,right:800,top:50,bottom:1050,width:700,height:1000}),getScreenCTM:()=>({inverse:()=>({})}),createSVGPoint:()=>({x:0,y:0,matrixTransform(){return {x:(this.x-100)*2,y:(this.y-50)*2};}})};
 const el=Object.assign(target(),{ownerDocument:doc,clientHeight:550,getBoundingClientRect:()=>({left:100,right:800,top:150,bottom:700,width:700,height:550})});
 const refs={svgRef:{current:svg},planBoundsRef:{current:el}};
 const ctx=vm.createContext({...React,console,Math});vm.runInContext(source+'\nthis.hook=usePlanWheelZoom;',ctx);
 let result,state,rerender;
 function Probe(){const [zoom,setZoom]=React.useState(1),[panX,setPanX]=React.useState(0),[panY,setPanY]=React.useState(0),[viewOffsetPx,setViewOffsetPx]=React.useState({x:0,y:0});const [tick,setTick]=React.useState(0);rerender=()=>setTick(tick+1);state={zoom,panX,panY,viewOffsetPx};result=ctx.hook({...refs,...state,setZoom,setPanX,setPanY,setViewOffsetPx});return null;}
 let root;act(()=>{root=Renderer.create(React.createElement(Probe));});
 const event=(p={})=>({clientX:400,clientY:300,pointerType:'mouse',target:child,preventDefault(){this.prevented=true;},stopPropagation(){},stopImmediatePropagation(){this.stopped=true;},...p});
 return {get state(){return state;},get result(){return result;},win,el,child,other,get cancels(){return cancels;},rerender(){act(rerender);},cleanup(){act(()=>root.unmount());},overlay(v){overlay=v;},visible(v){visible=v;},
 pointer(x,y,type='pointermove'){act(()=>win.emit(type,event({clientX:x,clientY:y})));},
 out(){act(()=>win.emit('pointerout',event({relatedTarget:other})));},
 wheel(p={}){const e=event({deltaX:0,deltaY:100,deltaMode:0,ctrlKey:false,...p});act(()=>el.emit('wheel',e));return e;},
 touch(type,id,x,y){const e=event({type,pointerType:'touch',pointerId:id,clientX:x,clientY:y});act(()=>win.emit(type,e));return e;},
 };
}
test('ordinary scroll pans both axes without changing zoom; Shift+wheel pans horizontally',()=>{const h=setup();h.pointer(400,300);h.wheel({deltaX:20,deltaY:50});assert.equal(h.state.zoom,1);assert.deepEqual({...h.state.viewOffsetPx},{x:-40,y:-100});h.wheel({shiftKey:true,deltaY:20});assert.deepEqual({...h.state.viewOffsetPx},{x:-80,y:-100});h.cleanup();});
test('trackpad pinch preserves exponential sensitivity and SVG point anchor after pan',()=>{const h=setup();h.pointer(400,300);h.wheel({deltaX:20,deltaY:50});const world={x:640,y:600};h.wheel({ctrlKey:true,deltaY:-100});assert.equal(h.state.zoom,Math.exp(.1));assert.ok(Math.abs(h.state.panX+h.state.viewOffsetPx.x+world.x*h.state.zoom-600)<1e-9);assert.ok(Math.abs(h.state.panY+h.state.viewOffsetPx.y+world.y*h.state.zoom-500)<1e-9);h.cleanup();});
test('unknown pointer fails closed even if wheel target/coordinates are inside',()=>{const h=setup();assert.ok(!h.wheel({ctrlKey:true}).prevented);assert.equal(h.state.zoom,1);h.cleanup();});
test('all outside zones leave zoom AND pan unchanged, including latched inside wheel coordinates',()=>{for(const p of [[400,90],[400,120],[850,300],[50,300],[400,750]]){const h=setup();h.pointer(400,300);h.pointer(...p);for(const ctrlKey of [false,true])assert.ok(!h.wheel({ctrlKey}).prevented);assert.equal(h.state.zoom,1);assert.deepEqual({...h.state.viewOffsetPx},{x:0,y:0});h.cleanup();}});
test('pointer exit, mouse fallback, overlay and blur cancel retained gestures',()=>{for(const action of ['exit','mouse','overlay','blur']){const h=setup();h.pointer(400,300);if(action==='exit')h.out();if(action==='mouse')h.pointer(850,300,'mousemove');if(action==='overlay')h.overlay(true);if(action==='blur')h.win.emit('blur',{});assert.ok(!h.wheel({ctrlKey:true}).prevented);h.cleanup();}});
test('React rerenders retain pointer authority and install exactly one wheel listener',()=>{const h=setup();h.pointer(400,300);h.wheel({ctrlKey:true,deltaY:-100});h.rerender();h.pointer(850,300);assert.ok(!h.wheel({ctrlKey:true}).prevented);assert.equal(h.state.zoom,Math.exp(.1));assert.equal(h.el.listeners.get('wheel').size,1);h.cleanup();assert.ok([...h.win.listeners.values(),...h.el.listeners.values()].every(s=>s.size===0));});
test('touch pinch cancels pending single-pointer drag, zooms and cannot resume after leaving canvas',()=>{const h=setup();assert.ok(!h.touch('pointerdown',1,300,300).stopped);assert.ok(h.touch('pointerdown',2,500,300).stopped);assert.equal(h.cancels,2);assert.ok(h.touch('pointermove',2,600,300).stopped);assert.equal(h.state.zoom,1.5);h.touch('pointermove',2,850,300);h.touch('pointermove',2,650,300);assert.equal(h.state.zoom,1.5);h.touch('pointerup',2,650,300);assert.ok(h.touch('pointermove',1,310,300).stopped);h.touch('pointerup',1,310,300);h.cleanup();});
test('a touch starting outside cannot join a canvas pinch',()=>{const h=setup();h.touch('pointerdown',1,300,300);h.touch('pointerdown',2,850,300);h.touch('pointermove',2,600,300);assert.equal(h.state.zoom,1);assert.equal(h.cancels,0);h.cleanup();});
test('zoom buttons and reset work independently of wheel ownership',()=>{const h=setup();act(()=>h.result.zoomIn());assert.ok(h.state.zoom>1);act(()=>h.result.zoomOut());assert.ok(Math.abs(h.state.zoom-1)<1e-12);act(()=>h.result.resetView());assert.equal(h.state.zoom,1);assert.deepEqual({...h.state.viewOffsetPx},{x:0,y:0});h.cleanup();});
