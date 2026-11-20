// Keep a confirmed grant stable across retries, dialog closes and page reloads.
// Storage is required before the first write; uncertainty never creates a new grant.
export function preparePromotionRequest(storage, key, signature, build, recipientIds, today) {
  const previous=JSON.parse(storage.getItem(key) || 'null');
  if(previous && previous.signature===signature && (!previous.completed || previous.day===today))
    return previous;
  if(previous && !previous.completed)
    throw new Error('An unfinished promotion is saved. Restore its original selection and retry it before starting another grant.');
  const request={signature,day:today,completed:false,promotion:build(),recipient_ids:[...recipientIds].sort()};
  storage.setItem(key,JSON.stringify(request));
  return request;
}
export function completePromotionRequest(storage,key,request) {
  storage.setItem(key,JSON.stringify({...request,completed:true}));
}
