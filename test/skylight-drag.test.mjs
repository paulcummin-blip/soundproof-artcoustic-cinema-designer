import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
register('./_alias-loader.mjs', import.meta.url);
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { create, act } = await import('react-test-renderer');
const { useMouseDownHandler } = await import('../src/components/room/rv/hooks/useMouseDownHandler.jsx');
const { useRoomCanvasMouseMove } = await import('../src/components/room/rv/hooks/useRoomCanvasMouseMove.jsx');
const { finishPointerDrag } = await import('../src/components/room/rv/utils/rvDragGesture.js');
const { skylightRectM } = await import('../src/components/room/rv/utils/skylightGeometry.js');
const { default: Layer } = await import('../src/components/room/rv/render/RvRoomElementsLayer.jsx');
const { default: Dims } = await import('../src/components/room/rv/render/RvRoomElementDragDims.jsx');
const { default: RoomElements } = await import('../src/components/room/RoomElements.jsx');
const { serializeProject } = await import('../src/components/utils/serializeProject.jsx');
const { hydrateProjectIntoAppState } = await import('../src/components/utils/hydrateProjectIntoAppState.jsx');

// Execute the production callback in a small harness, without mounting the
// unrelated acoustic engines and provider network requests of RoomVisualisation.
const source = fs.readFileSync(new URL('../src/components/room/RoomVisualisation.jsx', import.meta.url), 'utf8');
const start = source.indexOf('const handleRoomElementDrag = useCallback(');
const end = source.indexOf('\n  // Projector drag', start);
const callbackSource = source.slice(start, end);
const getDrag = new Function('useCallback', 'onSetRoomElements', 'roomElements',
  'widthM', 'lengthM', 'setRoomElementDragInfo', 'skylightRectM',
  callbackSource + '\nreturn handleRoomElementDrag;');
const sky = { id:'sky', type:'skylight', surface:'ceiling', label:'Skylight', x_m:3, y_m:4, length_m:3.5, width_m:2.32 };
const wall = { id:'wall', type:'door', wall:'rear', length_m:0.9, pos_m:1, x_m:1, y_m:1 };
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, a+' != '+b);
function setup(widthM=6,lengthM=8) {
  let elements=[{...sky},{...wall}], info;
  const update = fn => { elements=fn(elements); };
  const drag = (id,pos) => getDrag(fn=>fn,update,elements,widthM,lengthM,v=>{info=v;},skylightRectM)(id,pos);
  return {drag,get elements(){return elements;},get info(){return info;},widthM,lengthM};
}
function draw(h, speakers=[]) {
  return renderToStaticMarkup(React.createElement(Layer,{
    hasRoomRect:true,roomElements:h.elements,widthM:h.widthM,lengthM:h.lengthM,heightM:2.8,
    scale:100,meterToCanvasX:x=>x*100,meterToCanvasY:y=>y*100,
    placedSpeakers:speakers,getModelDimsM:()=>({round:true,diameterM:0.3}),
    getSpeakerVisibility:()=>true,getCanonicalRole:x=>x,appState:{},
    rolesForLayout:()=>['TFL'],handleMouseDown:()=>{}
  }));
}
function guides(h) {
  return renderToStaticMarkup(React.createElement(Dims,{dragInfo:h.info,
    widthM:h.widthM,lengthM:h.lengthM,scale:100,meterToCanvasX:x=>x*100,meterToCanvasY:y=>y*100,
    svgW:1000,svgH:900}));
}
test('actual start/move hooks preserve an off-centre grab at normal and zoomed/panned views; release stops movement',()=>{
  for (const zoom of [1,1.7]) {
    const h=setup();
    const ref=()=>({current:null});
    const activeDragRef=ref(), dragOffsetRoomRef=ref(), isAnyDraggingRef=ref(), rsDragLockRef=ref();
    const roomRect={x:20,y:30,width:600,height:800}, scale=100;
    const tx=63,ty=-22;
    const svg={
      querySelector:()=>({getScreenCTM:()=>({inverse:()=>({})})}),
      createSVGPoint:()=>({x:0,y:0,matrixTransform(){return {x:(this.x-tx)/zoom,y:(this.y-ty)/zoom};}}),
      setPointerCapture:()=>{}
    };
    const common={activeDragRef,dragOffsetRoomRef,isAnyDraggingRef,rsDragLockRef,
      svgRef:{current:svg},roomRect,scale,viewOffsetPx:{x:13,y:9},
      setDragState:()=>{},setDragWarning:()=>{},byId:new Map(),roomElements:h.elements,widthM:6,lengthM:8};
    let down,move;
    function Harness() {
      down=useMouseDownHandler(common).handleMouseDown;
      move=useRoomCanvasMouseMove({...common,handleRoomElementDrag:h.drag}).handleMouseMove;
      return null;
    }
    renderToStaticMarkup(React.createElement(Harness));
    const event=(x,y,buttons=1)=>({clientX:tx+zoom*(20+x*100),clientY:ty+zoom*(30+y*100),
      button:0,buttons,pointerId:1,preventDefault(){},stopPropagation(){}});
    down(event(2.1,3.4),'sky','roomElement');
    close(dragOffsetRoomRef.current.x,0.9); close(dragOffsetRoomRef.current.y,0.6);
    move(event(2.1,3.4));
    close(h.elements[0].x_m,3);close(h.elements[0].y_m,4);
    move(event(2.6,4.1));
    close(h.elements[0].x_m,3.5);close(h.elements[0].y_m,4.7);
    finishPointerDrag(activeDragRef,event(2.6,4.1,0));
    move(event(4,5,0));
    close(h.elements[0].x_m,3.5);close(h.elements[0].y_m,4.7);
  }
});
test('all four edges clamp the complete opening, retain size and leave wall records untouched',()=>{
  const h=setup();
  for(const [x,y,ex,ey] of [[-10,-10,1.75,1.16],[99,99,4.25,6.84],[-10,99,1.75,6.84],[99,-10,4.25,1.16]]){
    h.drag('sky',{x,y});
    close(h.elements[0].x_m,ex);close(h.elements[0].y_m,ey);
    assert.equal(h.elements[0].length_m,3.5);assert.equal(h.elements[0].width_m,2.32);
    assert.equal(h.elements[0].surface,'ceiling');assert.deepEqual(h.elements[1],wall);
    assert.deepEqual(h.info.rectM,skylightRectM(h.elements[0]));
  }
  const tiny=setup(3,2);tiny.drag('sky',{x:99,y:-99});
  close(tiny.elements[0].x_m,1.5);close(tiny.elements[0].y_m,1);
  assert.equal(tiny.elements[0].length_m,3.5);assert.equal(tiny.elements[0].width_m,2.32);
});
test('live guides measure opening edges and form fields read the updated centres',()=>{
  const h=setup();h.drag('sky',{x:2.5,y:3.2});
  const html=guides(h);
  for(const side of ['left','right','front','rear']) assert.match(html,new RegExp('data-clearance="'+side+'"'));
  for(const v of ['0.75','1.75','2.04','3.64']) assert.ok(html.includes(v+' m'),v);
  assert.match(html,/stroke-dasharray="3,3"/);
  let form;
  const props={elements:h.elements,onChange:()=>{},roomDims:{widthM:6,lengthM:8,heightM:2.8}};
  act(()=>{form=create(React.createElement(RoomElements,props));});
  const header=form.root.findAll(n=>n.type==='div' && n.props.className==='flex justify-between items-center px-4 py-2.5 cursor-pointer select-none')[0];
  act(()=>header.props.onClick());
  const values=()=>form.root.findAllByType('input').map(n=>Number(n.props.value));
  assert.ok(values().includes(2.5));assert.ok(values().includes(3.2));
  h.drag('sky',{x:3.1,y:4.2});
  act(()=>form.update(React.createElement(RoomElements,{...props,elements:h.elements})));
  assert.ok(values().includes(3.1));assert.ok(values().includes(4.2));
  act(()=>form.unmount());
  h.drag('sky',{x:-99,y:-99});
  assert.doesNotMatch(guides(h),/data-clearance="left"|data-clearance="front"/);
});
test('dragged skylight orange clash appears and clears; save/hydrate retains exact moved geometry',()=>{
  const h=setup();
  const sp={id:'t',role:'TFL',positionSource:'user',model:'test',position:{x:1,y:1.5,z:2.6}};
  assert.doesNotMatch(draw(h,[sp]),/#C76A1B/);
  h.drag('sky',{x:2,y:2});
  assert.match(draw(h,[sp]),/#C76A1B/);assert.match(draw(h,[sp]),/<circle/);
  const saved=JSON.parse(JSON.stringify(serializeProject({roomElements:h.elements,roomDims:{widthM:6,lengthM:8,heightM:2.8}})));
  let restored;
  hydrateProjectIntoAppState(saved,{}, {setRoomElements:v=>{restored=v;}});
  assert.deepEqual(restored,h.elements);
  assert.match(draw({...h,elements:restored},[sp]),/#C76A1B/);
  h.drag('sky',{x:4,y:6});
  assert.doesNotMatch(draw(h,[sp]),/#C76A1B/);
  assert.match(draw(h,[sp]),/width="350"/);
});
test('legacy wall dragging remains constrained along its wall',()=>{
  const h=setup();h.drag('wall',{x:4,y:2});
  close(h.elements[1].pos_m,3.55);
  assert.deepEqual(h.elements[0],sky);assert.equal(h.info.wall,'rear');
});
