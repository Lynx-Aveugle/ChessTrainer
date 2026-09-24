import {scanGameForTrainingPuzzles,exportTrainingPgn} from './puzzles.js';

export function createTrainingController({state,getGames,currentUser,analyzeFen,cancelEngineAnalysis,render,toast,onPositionChanged}){
  let abortController=null;

  function active(){return !!abortController;}
  function stop(){
    if(!abortController)return;
    abortController.abort();
    cancelEngineAnalysis?.("Scan d’entraînement arrêté…");
  }

  async function scan(){
    if(abortController)return;
    const games=getGames();
    if(!games.length){toast('Aucune partie de HighTaxi à analyser');return;}
    abortController=new AbortController();
    const signal=abortController.signal;
    const progress=document.getElementById('trainingProgress'),scanButton=document.getElementById('trainingScanBtn'),stopButton=document.getElementById('trainingStopBtn');
    if(scanButton)scanButton.disabled=true;
    if(stopButton){stopButton.hidden=false;stopButton.disabled=false;}
    if(progress){progress.hidden=false;progress.textContent=`Analyse 0 / ${games.length} partie(s)…`;}
    cancelEngineAnalysis('Analyse Stockfish réservée au scan d’entraînement…');
    state.trainingScanActive=true;
    const found=[];
    try{
      for(let i=0;i<games.length;i++){
        if(signal.aborted)break;
        const puzzles=await scanGameForTrainingPuzzles(games[i],currentUser(),analyzeFen,{signal,onProgress:info=>{
          if(progress)progress.textContent=`Analyse ${i+1} / ${games.length} · ${info.processed}/${info.total} coups · ${found.length+info.puzzles} puzzle(s)…`;
        }});
        found.push(...puzzles);
        state.trainingPuzzles=[...found];
        if(i===0||(i+1)%8===0||i===games.length-1)render();
      }
      state.trainingPuzzles=[...found];
      save();
      toast(signal.aborted?`Scan arrêté · ${found.length} puzzle(s) conservé(s)`:`Scan terminé · ${found.length} puzzle(s) trouvé(s)`);
    }catch(error){
      if(signal.aborted||error?.name==='AbortError')toast(`Scan arrêté · ${found.length} puzzle(s) conservé(s)`);
      else toast('Analyse d’entraînement impossible : '+(error?.message||error));
    }finally{
      abortController=null;
      state.trainingScanActive=false;
      if(progress){progress.hidden=true;progress.textContent='';}
      render();
      if(document.body.classList.contains('analysisActive'))onPositionChanged();
    }
  }

  function save(){try{localStorage.setItem('ht_training_puzzles_v1',JSON.stringify(state.trainingPuzzles||[]));state.trainingPuzzlesRevision=Number(state.trainingPuzzlesRevision||0)+1;return true}catch{return false}}

  function exportFile(){
    const puzzles=Array.isArray(state.trainingPuzzles)?state.trainingPuzzles:[];
    if(!puzzles.length){toast('Aucun puzzle à exporter');return;}
    const out=exportTrainingPgn(puzzles),blob=new Blob([out],{type:'application/x-chess-pgn'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`HighTaxi_Training_${new Date().toISOString().slice(0,10)}.pgn`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast(`${puzzles.length} puzzle(s) exporté(s)`);
  }

  function clear(){
    if(!state.trainingPuzzles?.length)return;
    if(!confirm('Effacer les puzzles d’entraînement générés ?'))return;
    state.trainingPuzzles=[];save();render();toast('Puzzles d’entraînement effacés');
  }

  return {active,scan,stop,exportFile,clear};
}
