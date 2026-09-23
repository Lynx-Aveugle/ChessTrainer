export const state={
  allGames:[],activeGame:null,currentNode:null,chess:null,selectedSquare:null,lastMove:null,
  globalTree:null,globalTreeBuilding:false,globalTreeBuiltFor:0,globalTreeProgress:{done:0,total:0},
  globalTreeSideFilter:'all',globalTreePendingFilter:null,analysisScope:'all',dataRevision:0,trainingCacheRevision:-1,trainingCache:[],trainingPuzzles:[],trainingScanActive:false,
  engineWorker:null,engineReadyPromise:null,engineSearchToken:0,engineLastFen:'',enginePendingFen:null,engineBusy:false,engineUnavailable:false,
  globalMoveAnnotations:{},appSettings:{autoEngine:true,showArrows:true,compactMoves:false,chesscomUser:'HighTaxi'}
};
export const revisions={data:0,annotations:0,engine:0,tree:0};
export function bumpRevision(name){revisions[name]=(revisions[name]||0)+1;return revisions[name];}
