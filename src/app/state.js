export const state={
  allGames:[],activeGame:null,currentNode:null,chess:null,selectedSquare:null,lastMove:null,
  globalTree:null,globalTreeBuilding:false,globalTreeBuiltFor:0,globalTreeProgress:{done:0,total:0},
  globalTreeSideFilter:'all',globalTreePendingFilter:null,analysisScope:'all',dataRevision:0,trainingCacheRevision:-1,trainingCache:[],trainingPuzzles:[],trainingPuzzlesRevision:0,trainingSolvedPositions:[],trainingScanActive:false,
  engineWorker:null,engineReadyPromise:null,engineSearchToken:0,engineLastFen:'',enginePendingFen:null,engineBusy:false,engineUnavailable:false,
  globalMoveAnnotations:{},appSettings:{autoEngine:true,showArrows:true,compactMoves:false,chesscomUser:'HighTaxi'}
};
export const revisions={data:0,annotations:0,engine:0,tree:0};
export function bumpRevision(name){revisions[name]=(revisions[name]||0)+1;return revisions[name];}

export function resetUserScopedState(target=state){
  target.activeGame=null;
  target.currentNode=null;
  target.selectedSquare=null;
  target.lastMove=null;
  target.globalTree=null;
  target.globalTreeBuilding=false;
  target.globalTreeBuiltFor=0;
  target.globalTreeProgress={done:0,total:0};
  target.globalTreeSideFilter='all';
  target.globalTreePendingFilter=null;
  target.analysisScope='all';
  target.dataRevision=Number(target.dataRevision||0)+1;
  target.trainingCacheRevision=-1;
  target.trainingCache=[];
  target.trainingPuzzlesRevision=Number(target.trainingPuzzlesRevision||0)+1;
  target.trainingSolvedPositions=[];
  target.trainingScanActive=false;
  target.engineSearchToken=Number(target.engineSearchToken||0)+1;
  target.engineLastFen='';
  target.enginePendingFen=null;
  target.engineBusy=false;
  target.engineUnavailable=false;
  return target;
}
