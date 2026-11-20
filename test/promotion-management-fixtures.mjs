export function memoryStore(seed={}) {
 const data=Object.fromEntries(['Account','User','Promotion','CapacityLedger','PromotionUsage','Project','ProjectCreationReceipt'].map(n=>[n,structuredClone(seed[n]||[])]));
 const controls={};let id=0;
 const matches=(row,q)=>Object.entries(q).every(([k,v])=>v===null ? row[k]==null : row[k]===v);
 const entities=Object.fromEntries(Object.keys(data).map(n=>[n,{
  async filter(q={},sort,limit=500,skip=0) {
   if(n==='CapacityLedger' && controls.failSecondRead && String(q.idempotency_key).endsWith(':s2')) {
    controls.failSecondRead=false;throw new Error('Injected read failure after first committed grant');
   }
   return data[n].filter(r=>matches(r,q)).slice(skip,skip+limit);
  },
  async list(sort,limit=500,skip=0) {return data[n].slice(skip,skip+limit);},
  async create(row) {
   if(controls.beforeCreate) await controls.beforeCreate(n,row);
   if(n==='CapacityLedger' && controls.failLedgerWrite) {controls.failLedgerWrite=false;throw new Error('Unknown write outcome');}
   const result={...structuredClone(row),id:n+'-'+(++id)};data[n].push(result);
   if(n==='CapacityLedger' && controls.loseLedgerAck) {controls.loseLedgerAck=false;throw new Error('Committed but acknowledgement lost');}
   if(n==='Promotion' && controls.losePromotionAck) {controls.losePromotionAck=false;throw new Error('Promotion committed but acknowledgement lost');}
   return result;
  },
  async update(id,patch) {const row=data[n].find(r=>r.id===id);if(!row)throw new Error('not found');Object.assign(row,structuredClone(patch));return row;},
  async updateMany(q,patch) {const rows=data[n].filter(r=>matches(r,q));rows.forEach(r=>Object.assign(r,patch.$set));return {updated:rows.length};},
  async delete(id) {const i=data[n].findIndex(r=>r.id===id);if(i>=0)data[n].splice(i,1);},
 }]));
 return {data,service:{entities},controls};
}
export const syntheticAccounts=[
 {id:'s1',name:'Synthetic A',dealer_group:'PREMIUM_PARTNER',status:'active',account_type:'dealer'},
 {id:'s2',name:'Synthetic B',dealer_group:'PREMIUM_PARTNER',status:'active',account_type:'dealer'},
 {id:'s3',name:'Synthetic other',dealer_group:'OTHER_DEALER',status:'inactive',account_type:'dealer'},
 {id:'internal',name:'Synthetic admin',account_type:'admin'},
];
