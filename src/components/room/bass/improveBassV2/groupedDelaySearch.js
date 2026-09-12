import { resumWithTuning } from "../stage2/stage2TuningSearch.js";

const GEOMETRY_TOLERANCE_M = 0.01;
const now = () => performance.now();
const compare = (a,b) => a.score-b.score || a.adjustmentMs-b.adjustmentMs || a.id.localeCompare(b.id);

export function defineDelayGroups(instances, roomDims) {
  const active=(instances || []).filter(s=>s.enabled!==false);
  const skipped=reason=>({status:"skipped",reason,groups:[]});
  const ambiguous=reason=>({status:"ambiguous",reason,groups:[]});
  if(active.length<=1)return skipped("One source: no inter-sub delay search; position options remain available.");
  const W=Number(roomDims?.widthM),L=Number(roomDims?.lengthM);
  if(!(W>0&&L>0)||new Set(active.map(s=>s.id)).size!==active.length||active.some(s=>!s.id||!Number.isFinite(s.position?.x)||!Number.isFinite(s.position?.y)))return ambiguous("Missing or duplicate source identity/geometry.");
  const side=s=>s.position.y<L/2-GEOMETRY_TOLERANCE_M?"front":s.position.y>L/2+GEOMETRY_TOLERANCE_M?"rear":null;
  for(const s of active){const declared=s.legacyGroup || s.group;if(["front","rear"].includes(declared)&&declared!==side(s))return ambiguous("Group metadata conflicts with source geometry: "+s.id);}
  const group=(id,label,rows)=>({id,label,sourceIds:rows.map(s=>s.id).sort()});
  if(active.length===4){
    const front=active.filter(s=>side(s)==="front"),rear=active.filter(s=>side(s)==="rear");
    if(front.length!==2||rear.length!==2)return ambiguous("Four-source timing requires two front and two rear sources.");
    return {status:"eligible",groups:[group("A","Front pair",front),group("B","Rear pair",rear)]};
  }
  if(active.length===2){
    const [a,b]=active;
    if(side(a)&&side(a)===side(b)&&Math.abs(a.position.y-b.position.y)<=GEOMETRY_TOLERANCE_M&&Math.abs(a.position.x+b.position.x-W)<=GEOMETRY_TOLERANCE_M)return skipped("Symmetric same-wall pair: differential grouped timing is disabled by default.");
    const ordered=[...active].sort((a,b)=>a.position.y-b.position.y||a.id.localeCompare(b.id));
    return {status:"eligible",groups:[group("A","First source",[ordered[0]]),group("B","Second source",[ordered[1]])]};
  }
  return ambiguous("Grouped delay search supports one, two or four active sources.");
}

export function createGroupedDelayCandidate(grouping, baseline, direction, adjustmentMs, processorDelayLimitMs=null) {
  const group=grouping.groups.find(g=>g.id===direction);
  if(adjustmentMs!==0&&(!group||!Number.isFinite(adjustmentMs)||adjustmentMs<0||adjustmentMs>30))throw Error("Invalid grouped delay adjustment");
  const tuning=baseline.map(t=>({...t,delayMs:t.delayMs+(group?.sourceIds.includes(t.sourceId)?adjustmentMs:0)}));
  const id=adjustmentMs===0?"current":"grouped-delay:"+JSON.stringify(group.sourceIds)+":"+adjustmentMs;
  const limit=typeof processorDelayLimitMs==="number"&&Number.isFinite(processorDelayLimitMs)?processorDelayLimitMs:null;
  const rejection=limit!==null&&tuning.some(t=>t.delayMs>limit)?"Effective delay exceeds established processor limit ("+limit+" ms)":null;
  return {id,direction:adjustmentMs===0?"current":direction,adjustmentMs,tuning,rejection,isCurrent:adjustmentMs===0};
}

export function generateGroupedCoarseCandidates(grouping, baseline, processorDelayLimitMs=null) {
  if(!Array.isArray(baseline)||!baseline.length||new Set(baseline.map(t=>t?.sourceId)).size!==baseline.length||baseline.some(t=>!t?.sourceId||!Number.isFinite(t.delayMs)||t.delayMs<0||!Number.isFinite(t.gainDb)||![0,1,-1,180].includes(t.polarity)))throw Error("Missing valid frozen effective source tuning");
  const rows=[createGroupedDelayCandidate(grouping,baseline,"current",0,processorDelayLimitMs)];
  if(grouping.status!=="eligible")return rows;
  const groupedIds=grouping.groups.flatMap(g=>g.sourceIds);
  if(groupedIds.length!==baseline.length||new Set(groupedIds).size!==baseline.length||groupedIds.some(id=>!baseline.some(t=>t.sourceId===id)))throw Error("Group membership does not match effective source identities");
  for(const group of grouping.groups)for(let adjustment=1;adjustment<=30;adjustment++)rows.push(createGroupedDelayCandidate(grouping,baseline,group.id,adjustment,processorDelayLimitMs));
  return rows;
}

// These are raw response proxies, never P19/P20 grades. Canonical confirmation
// determines eligibility, materiality and the one final recommendation order.
export function scoreGroupedCandidate(rawTransfer, candidate) {
  if(candidate.rejection)return {...candidate,proxy:null};
  const responses=resumWithTuning(rawTransfer.perSourcePerSeatComplexTransfers,candidate.tuning,rawTransfer.seatIds);
  const priorities=new Map(rawTransfer.seatPriorityMap || []),ranges={};
  for(const [id,response] of Object.entries(responses)){
    const values=response.splDb.filter((v,i)=>response.freqsHz[i]>=20&&response.freqsHz[i]<=120);
    ranges[id]=values.length&&values.every(Number.isFinite)?Math.max(...values)-Math.min(...values):Infinity;
  }
  const seats=Object.keys(ranges).filter(id=>id!=="rsp"),primary=seats.filter(id=>priorities.get(id)==="primary");
  const worst=ids=>ids.length?Math.max(...ids.map(id=>ranges[id])):Infinity;
  const proxy={primaryRangeDb:worst(primary.length?primary:seats),allSeatRangeDb:worst(seats),rspRangeDb:ranges.rsp,ranges};
  return {...candidate,proxy,rejection:seats.length&&Number.isFinite(proxy.allSeatRangeDb)?null:"Invalid or empty recombined response"};
}

// Retain each direction's primary-seat and all-seat minima. For each minimum,
// retain its stronger ADJACENT coarse neighbour and their half-step. This keeps
// separate basins separate, and cannot average two unrelated minima.
// Frozen canonical reference: this policy retains every material option and
// the best P19 option; RSP top-one alone misses that best option.
export function planGroupedRefinement(coarse) {
  const retained=new Set(),intervals=new Map(),reasons={};
  const keep=(row,reason)=>{retained.add(row.id);(reasons[row.id] ||= []).push(reason);};
  for(const direction of ["A","B"])for(const metric of ["primaryRangeDb","allSeatRangeDb"]){
    const rows=coarse.filter(r=>r.direction===direction&&!r.rejection&&Number.isFinite(r.proxy?.[metric]));
    const ranked=rows.map(r=>({...r,score:r.proxy[metric]})).sort(compare),seed=ranked[0];
    if(!seed)continue;
    keep(seed,direction+" "+metric+" minimum");
    const adjacent=coarse.filter(r=>!r.rejection&&(r.direction===direction||r.isCurrent)&&Math.abs(r.adjustmentMs-seed.adjustmentMs)===1&&Number.isFinite(r.proxy?.[metric])).map(r=>({...r,score:r.proxy[metric]})).sort(compare)[0];
    if(!adjacent)continue;
    keep(adjacent,"Adjacent to "+seed.id+" by "+metric);
    const adjustmentMs=(seed.adjustmentMs+adjacent.adjustmentMs)/2,key=direction+":"+adjustmentMs;
    intervals.set(key,{direction,adjustmentMs,neighbours:[seed.id,adjacent.id]});
  }
  return {retainedIds:[...retained],intervals:[...intervals.values()],reasons};
}

export function runGroupedDelaySearch({rawTransfer,instances,roomDims,effectiveBaseline,processorDelayLimitMs=null}) {
  const start=now(),active=(instances || []).filter(s=>s.enabled!==false),byId=new Map((effectiveBaseline || []).map(t=>[t.sourceId,t]));
  if(!rawTransfer?.perSourcePerSeatComplexTransfers?.length||active.length!==rawTransfer.sources?.length)throw Error("Grouped search requires Current's untuned source/seat transfers");
  // Stage 2 transfers are index-addressed. Prove the captured order before
  // binding settings; a reordered design must supply correspondingly ordered transfers.
  active.forEach((s,i)=>{const raw=rawTransfer.sources[i];if(Math.abs(raw.x-s.position.x)>1e-6||Math.abs(raw.y-s.position.y)>1e-6||!Number.isFinite(raw.x)||!Number.isFinite(raw.y))throw Error("Captured source geometry/order does not match Current: "+s.id);});
  const baseline=active.map(s=>byId.get(s.id)),grouping=defineDelayGroups(active,roomDims);
  const generated=generateGroupedCoarseCandidates(grouping,baseline,processorDelayLimitMs);
  const preparedAt=now(),coarse=generated.map(c=>scoreGroupedCandidate(rawTransfer,c)),coarseAt=now();
  const plan=planGroupedRefinement(coarse);
  const fine=plan.intervals.map(i=>({...scoreGroupedCandidate(rawTransfer,createGroupedDelayCandidate(grouping,baseline,i.direction,i.adjustmentMs,processorDelayLimitMs)),neighbours:i.neighbours})),fineAt=now();
  const candidates=[...coarse.filter(c=>plan.retainedIds.includes(c.id)&&!c.isCurrent&&!c.rejection),...fine.filter(c=>!c.rejection)];
  const promoted=new Set(candidates.map(c=>c.id));
  const ledger=[...coarse,...fine].map(c=>({...c,promotionReason:c.rejection || (c.isCurrent?"Frozen Current control":promoted.has(c.id)?plan.reasons[c.id]?.join("; ") || "Adjacent half-step refinement":"Outside bounded directional primary/all-seat intervals"),promoted:promoted.has(c.id)}));
  return {status:grouping.status,grouping,candidates,ledger,current:coarse[0],shortlistComplete:false,coarseCount:coarse.length,fineCount:fine.length,retainedCandidateCount:candidates.length,timings:{prepareMs:preparedAt-start,coarseMs:coarseAt-preparedAt,fineMs:fineAt-coarseAt,totalMs:fineAt-start}};
}
