import {parsePGN} from '../../pgn.js';

export function validateBackupPayload(data,maxSchemaVersion=3){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Format de sauvegarde invalide');
  if(data.format!=='HighTaxi Chess Backup'||!Array.isArray(data.games))throw new Error('Format de sauvegarde invalide');
  const schema=Number(data.schemaVersion||1);
  if(!Number.isInteger(schema)||schema<1)throw new Error('Version de schéma invalide');
  if(schema>maxSchemaVersion)throw new Error('Sauvegarde créée par une version plus récente');
  const games=[];
  for(const game of data.games){
    if(!game||typeof game!=='object'||!String(game.id||'').trim()||typeof game.pgn!=='string'||!game.pgn.trim())throw new Error('Certaines parties sont invalides');
    let parsed;
    try{parsed=parsePGN(game.pgn)}catch{throw new Error('Certaines parties sont invalides');}
    if(!parsed.length||parsed.errors?.length)throw new Error('Certaines parties sont invalides');
    games.push({...game,id:String(game.id).trim(),pgn:game.pgn});
  }
  if(data.globalMoveAnnotations!=null&&(!data.globalMoveAnnotations||typeof data.globalMoveAnnotations!=='object'||Array.isArray(data.globalMoveAnnotations)))throw new Error('Annotations globales invalides');
  if(data.trainingPuzzles!=null&&!Array.isArray(data.trainingPuzzles))throw new Error('Puzzles d’entraînement invalides');
  if(data.chessSyncArchives!=null&&!Array.isArray(data.chessSyncArchives))throw new Error('Historique de synchronisation invalide');
  return games;
}

export function migrateBackupGames(games,schemaVersion){
  let out=games.map(g=>({...g}));
  const from=Math.max(1,Number(schemaVersion||1));
  if(from<=1)out=out.map(g=>({...g,source:g.source||"PGN",analysisTree:g.analysisTree||null,annotationCount:Number(g.annotationCount||0)}));
  if(from<=2)out=out.map(g=>({...g,updatedAt:Number(g.updatedAt||((Number(g.timestamp)||0)*1000)||Date.now())}));
  return out;
}
