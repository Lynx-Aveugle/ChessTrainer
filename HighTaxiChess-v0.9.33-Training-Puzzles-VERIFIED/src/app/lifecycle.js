export async function runBoot({migrate,load,onLoaded,onError}={}){
  try{await migrate?.();const games=await load?.();await onLoaded?.(games);return games;}
  catch(error){await onError?.(error);return null;}
}
export function registerServiceWorker(path='./sw.js'){
  if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return Promise.resolve(null);
  return navigator.serviceWorker.register(path).catch(()=>null);
}
