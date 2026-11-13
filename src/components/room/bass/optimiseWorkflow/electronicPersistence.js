// Registered by the hydrated project save owner; never writes through a second autosave path.
const owners=new Map();
const key=(p,v)=>p+"::"+v;
export function registerElectronicPersistence(projectId,versionId,handler){
  const k=key(projectId,versionId);owners.set(k,handler);
  return()=>{if(owners.get(k)===handler)owners.delete(k);};
}
export function withElectronicPersistence(projectId,versionId,work){
  const owner=owners.get(key(projectId,versionId));
  if(!owner)throw new Error("The current project is not ready to save ADI settings.");
  return owner(work);
}
