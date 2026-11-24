import {safeDiagnostic,safeRoute,requestFailureWarrantsAlert} from '../../../base44/shared/systemHealth/clientIncidentPolicy.js';
let transport=null, context={}, queue=[], sending=false, timer=null;
const recent=new Map();
const storageKey='soundproof-pending-ux-incidents-v1';
const browser=()=>typeof window!=='undefined';
function persist(){try{if(browser())sessionStorage.setItem(storageKey,JSON.stringify(queue.slice(-20)));}catch{}}
export function setExperienceContext(value){context={...value};}
export function getExperienceContext(){return {...context};}
export function configureExperienceTransport(invoke){
 transport=invoke;
 try{if(browser())queue=JSON.parse(sessionStorage.getItem(storageKey)||'[]').filter(x=>Date.now()-x.at<86400000).slice(-20);}catch{queue=[];}
 if(browser()){window.addEventListener('online',flushExperienceIncidents);timer=setInterval(flushExperienceIncidents,30000);}
 void flushExperienceIncidents();
}
export async function flushExperienceIncidents(){
 if(sending||!transport||!queue.length||(browser()&&navigator.onLine===false))return;
 sending=true;
 try{
  const item=queue[0];
  if(item.userId&&context.userId&&item.userId!==context.userId){queue.shift();persist();return;}
  const response=await transport('recordClientExperienceIncident',item.payload);
  if(response?.data?.recorded || response?.recorded){queue.shift();persist();}
 }catch(e){if([400,403].includes(e?.response?.status)){queue.shift();persist();}}
 finally{sending=false;}
}
export function reportClientFailure({code,operation='application',error,detail,stack,...scope}={}){
 try{
  const current={...context,...scope};
  const payload={error_code:code,operation,project_id:current.projectId||null,version_id:current.versionId||null,
   page_path:safeRoute(current.pagePath || (browser()?location.pathname:'/')),
   error_detail:safeDiagnostic(detail || error?.message || error?.name || ''),
   component_stack:safeDiagnostic(stack || error?.stack || '',1800)};
  const key=[payload.error_code,payload.operation,payload.project_id,payload.version_id,payload.page_path].join('::');
  if(Date.now()-(recent.get(key)||0)<300000)return;
  recent.set(key,Date.now());if(recent.size>200)recent.delete(recent.keys().next().value);
  queue.push({payload,at:Date.now(),userId:context.userId||null});queue=queue.slice(-20);persist();void flushExperienceIncidents();
 }catch{/* Monitoring must never break the user's action. */}
}
const excluded=/^(recordClientExperienceIncident|recordReportReadinessIncident|manageMonitoredOperation|manageSystemHealthConfig|generateProposal)$/;
export function instrumentClientExperience(client){
 const wrap=(fn,owner,operation)=>function(...args){
  const scope=getExperienceContext();
  // Capture only operation names; never request arguments, form values or files.
  const operationId=typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : `ux-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let monitorStart=null;
  const slow=setTimeout(()=>{if(transport)monitorStart=transport('manageMonitoredOperation',{action:'start',operation_id:operationId,operation_type:'client_request',project_id:scope.projectId||null,version_id:scope.versionId||null,initial_stage:operation}).catch(()=>null);},15000);
  const finish=()=>{clearTimeout(slow);clearTimeout(timeout);if(monitorStart)void monitorStart.then(r=>{if(r?.data?.recorded)return transport('manageMonitoredOperation',{action:'complete',operation_id:operationId});}).catch(()=>{});};
  const timeout=setTimeout(()=>reportClientFailure({code:'DATA_REQUEST_STALLED',operation,...scope,detail:'Request has not settled after 120 seconds.'}),120000);
  let result;try{result=fn.apply(owner,args);}catch(error){finish();throw error;}
  return Promise.resolve(result).then(value=>{finish();return value;},error=>{
   finish();
   if(requestFailureWarrantsAlert(error))reportClientFailure({code:'DATA_REQUEST_FAILED',operation,...scope,error,
    detail:`Request failed. HTTP status: ${error?.response?.status||error?.status||'unavailable'}. ${safeDiagnostic(error?.message,300)}`});
   throw error;
  });
 };
 const functionClient=new Proxy(client.functions,{get(target,key){
  if(key!=='invoke')return Reflect.get(target,key);
  return (name,...args)=>excluded.test(name)?target.invoke(name,...args):wrap(target.invoke,target,`function:${name}`)(name,...args);
 }});
 const entities=new Proxy(client.entities,{get(target,entity){
  const api=Reflect.get(target,entity);if(!api||typeof api!=='object')return api;
  return new Proxy(api,{get(owner,method){const fn=Reflect.get(owner,method);return typeof fn==='function' && /^(get|list|filter|create|update|delete|bulkCreate|deleteMany|updateMany|importEntities|bulkDelete)$/.test(String(method))?wrap(fn,owner,`data:${String(entity)}.${String(method)}`):typeof fn==='function'?fn.bind(owner):fn;}});
 }});
 return new Proxy(client,{get(target,key){if(key==='functions')return functionClient;if(key==='entities')return entities;return Reflect.get(target,key);}});
}
export function installGlobalExperienceMonitoring(){
 if(!browser())return()=>{};
 const onError=e=>{
  if(e.filename&&/^(chrome|moz)-extension:/.test(e.filename))return;
  if(!e.error&&!e.message)return;
  reportClientFailure({code:'UNHANDLED_ERROR',operation:'browser',error:e.error,detail:e.message});
 };
 const onReject=e=>{if(!requestFailureWarrantsAlert(e.reason))return;reportClientFailure({code:'UNHANDLED_REJECTION',operation:'async-action',error:e.reason});};
 let last=performance.now(),visible=document.visibilityState==='visible';
 const visibility=()=>{last=performance.now();visible=document.visibilityState==='visible';};
 const heartbeat=setInterval(()=>{const now=performance.now(),delay=now-last;last=now;
  if(visible&&document.visibilityState==='visible'&&delay>15000&&delay<120000)
   reportClientFailure({code:'UI_UNRESPONSIVE',operation:'foreground-ui',detail:`Foreground event loop delayed by ${Math.round((delay-5000)/1000)} seconds. Cause not yet established.`});
 },5000);
 window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onReject);document.addEventListener('visibilitychange',visibility);
 return()=>{clearInterval(heartbeat);window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject);document.removeEventListener('visibilitychange',visibility);};
}
