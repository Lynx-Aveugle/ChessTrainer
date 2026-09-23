export const CLASSIFICATION_PRIORITY=['blunder','error','brilliant','excellent','good','theoretical','neutral'];

const ICON_CLASSIFICATION=new Map([
  ['??','blunder'],['❌','blunder'],
  ['?','error'],['?!','error'],
  ['★','brilliant'],
  ['!!','excellent'],
  ['!','good'],['👍','good'],['✓','good'],
  ['📖','theoretical']
]);

export function annotationClassification(icon){return ICON_CLASSIFICATION.get(String(icon||''))||'neutral'}

export function mergeAnnotationCounts(target,annotations){
  const out=target||{};
  for(const icon of new Set(Array.isArray(annotations)?annotations:[]))out[icon]=(out[icon]||0)+1;
  return out;
}

export function classifyAnnotations(annotations){
  const counts={};
  for(const icon of new Set(Array.isArray(annotations)?annotations:[])){
    const classification=annotationClassification(icon);
    counts[classification]=(counts[classification]||0)+1;
  }
  return CLASSIFICATION_PRIORITY.find(name=>(counts[name]||0)>0)||'neutral';
}

export function classificationCounts(annotations){
  const counts={blunder:0,error:0,brilliant:0,excellent:0,good:0,theoretical:0,neutral:0};
  for(const icon of new Set(Array.isArray(annotations)?annotations:[]))counts[annotationClassification(icon)]++;
  return counts;
}
