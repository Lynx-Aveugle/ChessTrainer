import {classifyAnnotations} from './classification.js';
import {normalizeMove,sameMove} from '../chess/position.js';

function edgeMove(edge){return normalizeMove(edge?.move||{from:'',to:'',promotion:null,san:edge?.san||null});}

export function buildArrowDescriptors(positionKey,tree,{sideFilter='all',user=null,engineBest=null}={}){
  const node=tree?.nodes?.get(positionKey);
  if(!node?.children)return [];
  let edges=[...node.children.values()];
  const sideToMove=String(node.fen||'').split(/\s+/)[1]||'w';
  if((sideFilter==='w'||sideFilter==='b')&&sideFilter===sideToMove){
    const mine=edges.filter(edge=>Number(edge.playedByUser||0)>0);
    if(mine.length)edges=mine;
  }else if(user && user.side && user.side===sideToMove){
    const mine=edges.filter(edge=>Number(edge.playedByUser||0)>0);
    if(mine.length)edges=mine;
  }
  const descriptors=edges.map(edge=>{
    const move=edgeMove(edge);
    const annotations=edge.annotations||[];
    return Object.freeze({
      from:move.from,to:move.to,promotion:move.promotion,san:move.san||edge.san||'',
      count:Number(edge.count||0),userCount:Number(edge.playedByUser||0),
      resultStats:Object.freeze({...edge.stats}),annotations:Object.freeze({...annotations}),
      classification:edge.classification||classifyAnnotations(Object.keys(annotations).flatMap(k=>Array(Number(annotations[k]||0)).fill(k))),
      engineBest:false,source:'database'
    });
  });
  if(engineBest){
    const em=normalizeMove(engineBest);
    const existing=descriptors.find(d=>sameMove(d,em));
    if(existing){
      return Object.freeze(descriptors.map(d=>d===existing?Object.freeze({...d,engineBest:true}):d));
    }
    descriptors.push(Object.freeze({from:em.from,to:em.to,promotion:em.promotion,san:em.san||'',count:0,userCount:0,resultStats:Object.freeze({white:0,draw:0,black:0}),annotations:Object.freeze({}),classification:'neutral',engineBest:true,source:'engine'}));
  }
  return Object.freeze(descriptors);
}
