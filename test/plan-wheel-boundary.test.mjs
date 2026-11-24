import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the real hook with inert React hooks and a controlled hit-test DOM.
// No browser or application data is changed by these synthetic event tests.
const source = fs.readFileSync(new URL('../src/components/room/rv/hooks/usePlanWheelZoom.jsx', import.meta.url), 'utf8')
  .replace(/^import .*from "react";\n/, '').replaceAll('export function ', 'function ');
function setup() {
  const effects = [], listeners = new Map(), winListeners = new Map(), wheelListeners = new Map();
  let visible = true, overlay = false, hitOutside = false;
  const child = {}, other = {};
  const doc = {
    elementFromPoint(x,y) { return visible && !overlay && !hitOutside && x>=100 && x<800 && y>=150 && y<700 ? child : other; },
    addEventListener(n,f) { listeners.set(n,f); }, removeEventListener(n) { listeners.delete(n); },
    defaultView: {addEventListener(n,f){winListeners.set(n,f);},removeEventListener(n){winListeners.delete(n);}},
  };
  const svg = {ownerDocument:doc,contains:n=>n===child,getBoundingClientRect:()=>({left:100,top:50,width:700,height:1000})};
  const el = {ownerDocument:doc,addEventListener(n,f){wheelListeners.set(n,f);},removeEventListener(n){wheelListeners.delete(n);}};
  const state={zoom:1,panX:0,panY:0};
  const context=vm.createContext({useCallback:f=>f,useEffect:f=>effects.push(f),useRef:x=>({current:x}),console:{info(){}}});
  vm.runInContext(source+'\nthis.hook=usePlanWheelZoom;',context);
  context.hook({planBoundsRef:{current:el},svgRef:{current:svg},...state,
    setZoom:v=>state.zoom=v,setPanX:v=>state.panX=v,setPanY:v=>state.panY=v,setViewOffsetPx(){}});
  const cleanup=effects[0]();
  return {state,cleanup,listeners,winListeners,wheelListeners,
    pointer(x,y){listeners.get('pointermove')({clientX:x,clientY:y});},
    outside(){listeners.get('pointerout')({relatedTarget:null});},
    overlay(v){overlay=v;}, visible(v){visible=v;}, hitOutside(v){hitOutside=v;},
    wheel(x=400,y=300,ctrlKey=false){const e={clientX:x,clientY:y,deltaY:-100,ctrlKey,prevented:false,preventDefault(){this.prevented=true;},stopPropagation(){}};wheelListeners.get('wheel')(e);return e;}
  };
}
test('ordinary wheel and pinch both zoom inside; existing formula/anchor retained',()=>{
  for(const ctrl of [false,true]) {const h=setup();h.pointer(400,300);assert.equal(h.wheel(400,300,ctrl).prevented,true);assert.equal(h.state.zoom,Math.exp(.1));assert.ok(Math.abs(h.state.panX+300*h.state.zoom-300)<1e-10);assert.ok(Math.abs(h.state.panY+250*h.state.zoom-250)<1e-10);}
});
test('SVG rectangle alone cannot accept a clipped toolbar point',()=>{const h=setup();h.pointer(400,120);assert.equal(h.wheel(400,120,true).prevented,false);assert.equal(h.state.zoom,1);});
test('right controls and outside workspace are not consumed',()=>{for(const p of [[850,300],[50,300],[400,750]]){const h=setup();h.pointer(...p);assert.equal(h.wheel(...p).prevented,false);assert.equal(h.state.zoom,1);}});
test('menu overlay within SVG bounds blocks zoom',()=>{const h=setup();h.overlay(true);h.pointer(400,300);assert.equal(h.wheel().prevented,false);});
test('latched wheel target and coordinates cannot zoom after pointer exits',()=>{const h=setup();h.pointer(400,300);h.pointer(850,300);assert.equal(h.wheel().prevented,false);assert.equal(h.state.zoom,1);});
test('page scroll cannot start zoom by moving canvas under an outside pointer',()=>{const h=setup();h.hitOutside(true);h.pointer(400,300);h.hitOutside(false);assert.equal(h.wheel().prevented,false);h.pointer(401,300);assert.equal(h.wheel(401,300).prevented,true);});
test('document exit and blur block retained wheel sequences',()=>{for(const action of ['exit','blur']){const h=setup();h.pointer(400,300);if(action==='exit')h.outside();else h.winListeners.get('blur')();assert.equal(h.wheel().prevented,false);}});
test('resize/clipping changes are checked again on each event',()=>{const h=setup();h.pointer(400,300);h.visible(false);assert.equal(h.wheel().prevented,false);});
test('cleanup removes every interaction listener',()=>{const h=setup();h.cleanup();assert.equal(h.listeners.size+h.winListeners.size+h.wheelListeners.size,0);});

