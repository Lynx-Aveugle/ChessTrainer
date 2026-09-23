export function normalizeEngineEvaluation(fen,evaluation={}){
  const side=String(fen||'').trim().split(/\s+/)[1]==='b'?-1:1;
  const rawCp=Number(evaluation?.cp);
  const rawMate=evaluation?.mate===null||evaluation?.mate===undefined?null:Number(evaluation.mate);
  return {
    cp:Number.isFinite(rawCp)?(rawCp===0?0:rawCp*side):0,
    mate:rawMate===null||!Number.isFinite(rawMate)?null:rawMate*side
  };
}
