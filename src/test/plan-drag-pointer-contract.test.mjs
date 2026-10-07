import { register } from 'node:module';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
register('../../test/_alias-loader.mjs', import.meta.url);
const { useSeatGesture } = await import('../components/room/rv/hooks/useSeatGesture.jsx');
const { useRoomCanvasMouseMove } = await import('../components/room/rv/hooks/useRoomCanvasMouseMove.jsx');
const { solveSpeakerDragConstraints } = await import('../components/room/rv/utils/solveSpeakerDragConstraints.jsx');
const { beginPointerDrag, finishPointerDrag, primaryButtonHeld, isDragPointer, releaseDragCapture } =
  await import('../components/room/rv/utils/rvDragGesture.js');

const evt = (overrides = {}) => ({
  button: 0, buttons: 1, pointerId: 7, pointerType: 'mouse', isPrimary: true,
  clientX: 100, clientY: 100, preventDefault() {}, stopPropagation() {}, ...overrides,
});
test('primary pointer owns a drag synchronously; capture is stable; rapid release is idempotent', () => {
  const ref = { current: null }, captures = [], releases = [];
  const svg = { setPointerCapture: id => captures.push(id), releasePointerCapture: id => releases.push(id) };
  assert.equal(beginPointerDrag(ref, evt({ button: 2 }), { id:'FL', type:'speaker', captureTarget:svg }), false);
  assert.equal(beginPointerDrag(ref, evt({ isPrimary:false }), { id:'FL', type:'speaker', captureTarget:svg }), false);
  assert.equal(beginPointerDrag(ref, evt(), { id:'FL', type:'speaker', captureTarget:svg }), true);
  assert.equal(beginPointerDrag(ref, evt(), { id:'seat', type:'seat', captureTarget:svg }), false);
  assert.equal(finishPointerDrag(ref, evt({ pointerId:8 })), null);
  const gesture = finishPointerDrag(ref, evt({ buttons:0 }));
  assert.equal(ref.current, null);
  assert.equal(gesture.id, 'FL');
  releaseDragCapture(gesture);
  assert.equal(finishPointerDrag(ref, evt()), null);
  assert.deepEqual(captures, [7]); assert.deepEqual(releases, [7]);
});
test('pointer movement without primary button cannot update objects', () => {
  for (const buttons of [0,2,4,undefined]) assert.equal(primaryButtonHeld({buttons}), false);
  assert.equal(primaryButtonHeld({buttons:1}), true);
  assert.equal(primaryButtonHeld({buttons:3}), true);
  assert.equal(isDragPointer({pointerId:7}, {pointerId:8}), false);
});

function seatHarness(mode='hud') {
  const listeners = {};
  globalThis.window = {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
  };
  const calls = { start:[], move:[], end:[], click:[] };
  let api;
  function Harness() {
    api = useSeatGesture({
      mode,
      handleMouseDown: (e,id,type) => calls.start.push({e,id,type}),
      handleMouseMove: e => calls.move.push(e),
      handleMouseUp: e => calls.end.push(e),
      handleSeatClick: s => calls.click.push(s.id),
    });
    return null;
  }
  let renderer;
  act(() => { renderer=TestRenderer.create(React.createElement(Harness)); });
  const fire=(type,event=evt())=>act(() => (listeners[type] || []).slice().forEach(fn=>fn(event)));
  const press=(event=evt())=>act(()=>api.seatGesture.onSeatPointerDown(event,{id:'seat-1'}));
  const unmount=()=>act(()=>renderer.unmount());
  return { calls, api:()=>api, fire, press, unmount, listeners };
}
afterEach(()=>{ delete globalThis.window; });
for (const mode of ['hud','dimensions']) {
  test('single seat click preserves '+mode+' inspection', () => {
    const h=seatHarness(mode); h.press(); h.fire('pointerup',evt({buttons:0}));
    assert.equal(h.calls.start.length,0);
    if(mode==='hud') assert.deepEqual(h.calls.click,['seat-1']);
    else assert.equal(h.api().dimensionSeatId,'seat-1');
    h.unmount();
  });
}
for (const terminal of ['pointerup','pointercancel','lostpointercapture','blur']) {
  test('seat drag explicitly ends on '+terminal+' and never becomes a click', () => {
    const h=seatHarness(); h.press(); h.fire('pointermove',evt({clientY:120}));
    assert.equal(h.calls.start.length,1);
    assert.equal(h.calls.start[0].e.clientY,100,'baseline is the original press, not the threshold frame');
    assert.equal(h.calls.move.length,1,'threshold frame is applied immediately');
    h.fire(terminal,evt({buttons:0}));
    assert.equal(h.calls.end.length,1);
    h.fire('pointermove',evt({buttons:0,clientY:140}));
    h.fire('pointerup',evt({buttons:0}));
    assert.equal(h.calls.end.length,1); assert.equal(h.calls.start.length,1);
    assert.deepEqual(h.calls.click,[]);
    assert.equal(h.listeners.pointermove.length,0);
    h.unmount();
  });
}
test('seat release by another pointer is ignored; no-button move cancels instead of latching', () => {
  const h=seatHarness(); h.press(); h.fire('pointermove',evt({pointerId:8,clientY:130}));
  assert.equal(h.calls.start.length,0);
  h.fire('pointermove',evt({clientY:120}));
  h.fire('pointerup',evt({pointerId:8,buttons:0})); assert.equal(h.calls.end.length,0);
  h.fire('pointermove',evt({buttons:0,clientY:180})); assert.equal(h.calls.end.length,1);
  assert.deepEqual(h.calls.click,[]); h.unmount();
});
test('a stationary hold has no timer; right-button seat press starts nothing', () => {
  const h=seatHarness(); h.press(evt({button:2,buttons:2})); h.fire('pointermove',evt({buttons:2,clientY:180}));
  assert.equal(h.calls.start.length,0); h.press(); h.fire('pointermove',evt({clientY:102}));
  assert.equal(h.calls.start.length,0); h.fire('pointerup',evt({buttons:0}));
  assert.deepEqual(h.calls.click,['seat-1']); h.unmount();
});

test('actual move hook passes unchanged room targets to every object handler through pan/zoom', () => {
  const roomRect={x:100,y:50,width:450,height:600}, scale=100;
  for(const view of [{offset:{x:120,y:90},zoom:1},{offset:{x:-80,y:140},zoom:1.5}]) {
    const calls=[], activeDragRef={current:null};
    const svg={
      querySelector:()=>({getScreenCTM:()=>({inverse:()=>({_apply:p=>({
        x:(p.x-view.offset.x)/view.zoom, y:(p.y-view.offset.y)/view.zoom,
      })})})}),
      createSVGPoint:()=>({x:0,y:0,matrixTransform(m){return m._apply(this);}}),
    };
    let move;
    function Harness() {
      move=useRoomCanvasMouseMove({
        activeDragRef, setDragState:()=>{}, setDragWarning:()=>{},
        svgRef:{current:svg},roomRect,scale,viewOffsetPx:view.offset,
        dragOffsetRoomRef:{current:{x:0.04,y:-0.03}},mlpDragActiveRef:{current:false},
        ...Object.fromEntries(['Speaker','Seat','Sub','Projector','RoomElement'].map(s=>[
          'handle'+s+'Drag',(id,pos)=>calls.push({id,pos}),
        ])),
      }).handleMouseMove; return null;
    }
    let renderer; act(()=>{renderer=TestRenderer.create(React.createElement(Harness));});
    for(const type of ['speaker','seat','sub','projector','roomElement']) {
      activeDragRef.current={id:type,type,pointerId:7};
      act(()=>move(evt({clientX:view.offset.x+view.zoom*300, clientY:view.offset.y+view.zoom*350})));
      const pos=calls.at(-1).pos; assert.ok(Math.abs(pos.x-2.04)<1e-9); assert.ok(Math.abs(pos.y-2.97)<1e-9);
      const n=calls.length; act(()=>move(evt({buttons:0,clientX:999,clientY:999}))); assert.equal(calls.length,n);
      finishPointerDrag(activeDragRef,evt()); act(()=>move(evt())); assert.equal(calls.length,n);
    }
    act(()=>renderer.unmount());
  }
});
test('LCR drag honours canonical minX/maxX corridors instead of collapsing against centre', () => {
  const speakers=[
    {id:'FL',role:'FL',position:{x:1,y:0.01,z:1.2}},
    {id:'FR',role:'FR',position:{x:3.5,y:0.01,z:1.2}},
  ];
  for(const role of ['FL','FR']) {
    const result=solveSpeakerDragConstraints({
      speakerId:role,spk:speakers.find(s=>s.id===role),canonicalRole:role,
      newRoomPos:{x:2.25,y:0.01},widthM:4.5,lengthM:6,
      centerX_m:2.25,screenCenterX_m:2.25,placedSpeakers:speakers,
      constraintZones:{FL:{clamp:{minX:0.8,maxX:1.3}},FR:{clamp:{minX:3.2,maxX:3.7}}},
      getModelDimsM:()=>({widthM:0.27,depthM:0.11}),getCanonicalRole:r=>r,
    });
    assert.equal(result.finalPositions.length,2);
    const fl=result.finalPositions.find(s=>s.id==='FL'),fr=result.finalPositions.find(s=>s.id==='FR');
    assert.ok(fl.position.x>=0.8&&fl.position.x<=1.3); assert.ok(fr.position.x>=3.2&&fr.position.x<=3.7);
    assert.equal(fl.position.y,0.01);assert.equal(fr.position.y,0.01);
    assert.equal(fl.position.z,1.2); assert.equal(fr.position.z,1.2);
    assert.ok(fr.position.x-fl.position.x>1.8);
  }
});
test('non-finite speaker targets fail closed', () => {
  assert.deepEqual(solveSpeakerDragConstraints({newRoomPos:{x:NaN,y:1}}).finalPositions,[]);
});
test('running canvas has one pointer movement authority, no legacy mouse/touch drag or leave-to-end', () => {
  const canvas=fs.readFileSync('src/components/room/rv/render/RvPlanCanvas.jsx','utf8');
  const main=fs.readFileSync('src/components/room/RoomVisualisation.jsx','utf8');
  const move=fs.readFileSync('src/components/room/rv/hooks/useRoomCanvasMouseMove.jsx','utf8');
  assert.doesNotMatch(canvas,/onMouseMove=\{handleMouseMove\}|onMouseUp=\{handleMouseUp\}|onMouseLeave=\{handleMouseUp\}/);
  assert.match(main,/addEventListener\('pointerup', onEnd, true\)/);
  assert.match(main,/addEventListener\('pointermove', onMove, true\)/);
  assert.match(main,/finishPointerDrag\(activeDragRef, e\)/);
  assert.doesNotMatch(move,/roomToCanvas|canvasToRoom/);
});
