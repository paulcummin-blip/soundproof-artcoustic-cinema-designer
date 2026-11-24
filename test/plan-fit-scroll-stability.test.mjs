import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/components/room/rv/hooks/usePlanResizeObserver.jsx',import.meta.url),'utf8').replace(/^import .*from "react";\n/,'').replaceAll('export function ','function ');
test('outer scroll changes clipping but not drawing fit; real viewport/divider resize still updates',()=>{
 let width=718,height=50,top=1195,ro,cleanup,containerW,containerH;
 const listeners=new Map(),win={innerHeight:986,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const el={ownerDocument:{defaultView:win},getBoundingClientRect:()=>({width,height,top}),closest:()=>({getBoundingClientRect:()=>({top:top-129})})};
 const context=vm.createContext({useEffect:f=>cleanup=f(),requestAnimationFrame:()=>1,cancelAnimationFrame(){},ResizeObserver:class{constructor(f){ro=f;}observe(){}disconnect(){}}});
 vm.runInContext(source+'\nthis.hook=usePlanResizeObserver;',context);
 context.hook({planBoundsRef:{current:el},setContainerW:f=>containerW=f(containerW),setContainerH:f=>containerH=f(containerH)});
 assert.equal(containerW,718);assert.equal(containerH,825);
 for(const values of [[598,423],[299,718],[145,825]]){[top,height]=values;ro([{contentRect:{width,height}}]);assert.equal(containerH,825);}
 width=900;ro([{contentRect:{width,height}}]);assert.equal(containerW,900);assert.equal(containerH,825);
 win.innerHeight=1086;listeners.get('resize')();assert.equal(containerH,925);
 cleanup();assert.equal(listeners.size,0);
});
