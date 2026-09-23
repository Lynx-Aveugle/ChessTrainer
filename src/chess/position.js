export function positionKeyFromFen(fen){
  const parts=String(fen||'').trim().split(/\s+/);
  if(parts.length<4)return String(fen||'').trim();
  let ep=parts[3];
  if(ep!=='-'){
    const file='abcdefgh'.indexOf(ep[0]);
    const targetRank=Number(ep[1]);
    const expectedTarget=parts[1]==='w'?6:3;
    const sourceRank=parts[1]==='w'?5:4;
    let legal=false;
    if(file>=0&&targetRank===expectedTarget){
      const rows=parts[0].split('/');
      const row=rows[8-sourceRank];
      const wanted=parts[1]==='w'?'P':'p';
      let col=0;
      for(const ch of row||''){
        if(/\d/.test(ch))col+=Number(ch);
        else{
          if((col===file-1||col===file+1)&&ch===wanted)legal=true;
          col++;
        }
      }
    }
    if(!legal)ep='-';
  }
  return [parts[0],parts[1],parts[2],ep].join(' ');
}

export function normalizeMove(move){
  if(typeof move==='string')return {from:'',to:'',promotion:null,san:move};
  return {from:String(move?.from||''),to:String(move?.to||''),promotion:move?.promotion?String(move.promotion):null,san:move?.san?String(move.san):null};
}

export function sameMove(a,b){
  const x=normalizeMove(a),y=normalizeMove(b);
  return x.from===y.from&&x.to===y.to&&(x.promotion||null)===(y.promotion||null);
}
