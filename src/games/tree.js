import {openingLineUltraFast} from '../../pgn.js';
import {positionKeyFromFen} from '../chess/position.js';
import {classifyAnnotations,mergeAnnotationCounts} from '../analysis/classification.js';

function userSide(game,user='HighTaxi'){
  const target=String(user||'').trim().toLowerCase();
  const w=String(game?.white||'').trim().toLowerCase()===target;
  const b=String(game?.black||'').trim().toLowerCase()===target;
  return w&&!b?'w':b&&!w?'b':null;
}
function resultBucket(result){return result==='1-0'?'white':result==='0-1'?'black':result==='1/2-1/2'?'draw':null}
function annotationsForStep(analysisNode,san){return analysisNode?.children?.find(n=>n.san===san)||null}
const openingPrefixCache=new Map();
function openingPrefixForGame(game,maxPlies){
  const id=String(game?.id||'');const key=String(game?.pgn||'');const cached=openingPrefixCache.get(id);
  if(cached?.key===key&&cached.maxPlies===maxPlies)return cached.value;
  const value=openingLineUltraFast(key,maxPlies);openingPrefixCache.set(id,{key,maxPlies,value});return value;
}

export function buildGlobalTree(games,{maxPlies=24,sideFilter='all',user='HighTaxi',globalAnnotations={},onProgress=null}={}){
  const source=Array.isArray(games)?games.filter(g=>g?.pgn&&(!sideFilter||sideFilter==='all'||userSide(g,user)===sideFilter)):[];
  const nodes=new Map();
  const getNode=(key,fen,gameId=null,ply=0)=>{
    let node=nodes.get(key);
    if(!node){node={key,fen,count:0,children:new Map(),incoming:new Map(),sampleGameId:gameId,samplePly:ply};nodes.set(key,node)}
    else if(!node.sampleGameId&&gameId){node.sampleGameId=gameId;node.samplePly=ply}
    return node;
  };
  getNode(positionKeyFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  source.forEach((game,index)=>{
    const parsed=openingPrefixForGame(game,maxPlies);
    const startFen=parsed.startFen;
    let parent=getNode(positionKeyFromFen(startFen),startFen,game.id,0);
    const bucket=resultBucket(game.result);
    parent.count++;
    let analysisNode=game.analysisTree||null;
    const seenNodes=new Set([parent.key]);
    const seenEdges=new Set();
    for(const step of parsed.out||[]){
      const key=positionKeyFromFen(step.fen);
      const move=step.move||{};
      const moveKey=`${move.from||''}-${move.to||''}-${move.promotion||''}`;
      let edge=parent.children.get(moveKey);
      if(!edge){edge={node:getNode(key,step.fen,game.id,seenNodes.size),san:step.san,move:{from:move.from,to:move.to,promotion:move.promotion||null},count:0,stats:{white:0,draw:0,black:0},sampleGameId:game.id,playedByUser:0,annotations:{},good:0,bad:0,neutral:0,classification:'neutral'};parent.children.set(moveKey,edge)}
      const edgeKey=`${parent.key}|${moveKey}`;
      if(!seenEdges.has(edgeKey)){
        seenEdges.add(edgeKey);edge.count++;if(bucket)edge.stats[bucket]++;
        const turn=String(step.from||'').split(/\s+/)[1]||'';if((turn==='w'&&userSide(game,user)==='w')||(turn==='b'&&userSide(game,user)==='b'))edge.playedByUser++;
        const analysisChild=annotationsForStep(analysisNode,step.san);
        const globalKey=`${positionKeyFromFen(step.from)}|${moveKey}`;
        const legacyKey=`${positionKeyFromFen(step.from)}|${step.san}`;
        const sourceAnnotations=globalAnnotations?.[globalKey]?.annotations||globalAnnotations?.[legacyKey]?.annotations||[];
        const combinedAnnotations=[...(analysisChild?.annotations||[]),...sourceAnnotations];
        if(combinedAnnotations.length){
          mergeAnnotationCounts(edge.annotations,combinedAnnotations);
          const unique=[...new Set(combinedAnnotations)];
          for(const icon of unique){const c=classifyAnnotations([icon]);if(c==='good'||c==='excellent'||c==='brilliant')edge.good++;else if(c==='error'||c==='blunder')edge.bad++;else edge.neutral++;}
          edge.classification=classifyAnnotations(Object.keys(edge.annotations));
        }
      }
      const child=edge.node;
      child.incoming.set(`${parent.key}|${moveKey}`,step.san);
      if(!seenNodes.has(child.key)){child.count++;seenNodes.add(child.key)}
      parent=child;
      analysisNode=analysisChildSafe(analysisNode,step.san);
    }
    if(typeof onProgress==='function')onProgress(index+1,source.length);
  });
  for(const node of nodes.values())for(const edge of node.children.values())edge.classification=edge.classification||classifyAnnotations(Object.keys(edge.annotations||{}));
  return {nodes,edges:[...nodes.values()].flatMap(n=>[...n.children.values()]),revision:Date.now(),filter:sideFilter,_filter:sideFilter};
}
function analysisChildSafe(node,san){return node?.children?.find(n=>n.san===san)||null}
