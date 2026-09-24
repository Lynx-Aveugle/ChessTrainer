import {positionKeyFromFen,normalizeMove} from '../chess/position.js';

export function globalMoveKey(parentFen,move){
  const m=normalizeMove(move);
  return `${positionKeyFromFen(parentFen)}|${m.from}-${m.to}-${m.promotion||''}`;
}

export function legacyGlobalMoveKey(parentFen,san){
  return `${positionKeyFromFen(parentFen)}|${String(san||'')}`;
}

export function getStoredGlobalAnnotations(globalAnnotations,parentFen,move){
  const m=normalizeMove(move);
  if(!parentFen||!m.from||!m.to)return [];
  const current=globalAnnotations?.[globalMoveKey(parentFen,m)]?.annotations;
  const legacy=globalAnnotations?.[legacyGlobalMoveKey(parentFen,m.san)]?.annotations;
  return [...new Set([...(Array.isArray(current)?current:[]),...(Array.isArray(legacy)?legacy:[])])];
}

export function getEffectiveAnnotations(node,globalAnnotations={}){
  if(!node)return [];
  const suppressed=new Set(Array.isArray(node.suppressedAnnotations)?node.suppressedAnnotations:[]);
  return [...new Set([
    ...(Array.isArray(node.annotations)?node.annotations:[]),
    ...getStoredGlobalAnnotations(globalAnnotations,node.parent?.fen,node.move)
  ])].filter(icon=>!suppressed.has(icon));
}

export function setGlobalAnnotation(globalAnnotations,parentFen,move,icon,enabled){
  if(!globalAnnotations||!parentFen||!move||!icon)return;
  const key=globalMoveKey(parentFen,move);
  const legacyKey=legacyGlobalMoveKey(parentFen,normalizeMove(move).san);
  const current=getStoredGlobalAnnotations(globalAnnotations,parentFen,move);
  const set=new Set(current);
  if(enabled)set.add(icon);else set.delete(icon);
  if(!set.size){
    delete globalAnnotations[key];
    if(legacyKey!==key)delete globalAnnotations[legacyKey];
    return;
  }
  globalAnnotations[key]={annotations:[...set]};
  if(legacyKey!==key)delete globalAnnotations[legacyKey];
}

export function upsertGlobalAnnotations(globalAnnotations,parentFen,move,annotations){
  if(!globalAnnotations||!parentFen||!move)return;
  const key=globalMoveKey(parentFen,move);
  const legacyKey=legacyGlobalMoveKey(parentFen,normalizeMove(move).san);
  const set=new Set(getStoredGlobalAnnotations(globalAnnotations,parentFen,move));
  for(const icon of Array.isArray(annotations)?annotations:[])if(icon)set.add(icon);
  if(set.size)globalAnnotations[key]={annotations:[...set]};
  if(legacyKey!==key)delete globalAnnotations[legacyKey];
}

export function removeGlobalAnnotation(globalAnnotations,parentFen,move,icon){
  setGlobalAnnotation(globalAnnotations,parentFen,move,icon,false);
}

export function mergeGlobalAnnotations(current={},incoming={}){
  const out={...current};
  for(const [key,value] of Object.entries(incoming||{})){
    const existing=Array.isArray(out[key]?.annotations)?out[key].annotations:[];
    const added=Array.isArray(value?.annotations)?value.annotations:[];
    const merged=[...new Set([...existing,...added])];
    if(merged.length)out[key]={...out[key],...value,annotations:merged};
    else if(!out[key]&&value&&typeof value==='object')out[key]={...value};
  }
  return out;
}
