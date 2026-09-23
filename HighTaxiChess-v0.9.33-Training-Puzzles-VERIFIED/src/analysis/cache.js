const cache=new Map();
const MAX_ENTRIES=128;
export function getArrowCacheKey({positionKey,dataRevision=0,sideFilter='all',annotationRevision=0,engineRevision=0}={}){
  return [positionKey,dataRevision,sideFilter,annotationRevision,engineRevision].join('|');
}
export function getCachedArrows(key){return cache.get(String(key))||null;}
function copyArrows(arrows){
  return Object.freeze((Array.isArray(arrows)?arrows:[]).map(arrow=>Object.freeze({
    ...arrow,
    resultStats:Object.freeze({...arrow.resultStats}),
    annotations:Object.freeze({...arrow.annotations})
  })));
}
export function setCachedArrows(key,arrows){
  const k=String(key),value=copyArrows(arrows);
  if(cache.has(k))cache.delete(k);
  cache.set(k,value);
  while(cache.size>MAX_ENTRIES)cache.delete(cache.keys().next().value);
  return value;
}
export function clearArrowCache(){cache.clear();}
export function arrowCacheSize(){return cache.size;}
