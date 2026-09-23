export function renderBoardSquares({board,chess,currentNode,selectedSquare,lastMove,files,ranks,pieceSVG,annotationDef,installPieceFallbacks}){
  const legal=new Set(selectedSquare?chess.legalMoves(selectedSquare).map(m=>m.to):[]);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    const file=files[col],rank=ranks[row],square=file+rank,x='abcdefgh'.indexOf(file),y=Number(rank)-1;
    const cell=document.createElement('div');cell.className=`square ${((x+y)%2===0)?'dark':'light'}`;cell.dataset.square=square;
    if(square===selectedSquare)cell.classList.add('selected');
    if(lastMove?.includes(square))cell.classList.add('last');
    if(legal.has(square))cell.classList.add(chess.board[square]?'capture':'legal');
    const piece=chess.board[square];if(piece)cell.insertAdjacentHTML('beforeend',pieceSVG(piece));
    const annotations=currentNode?.annotations||[];
    if(annotations.length&&currentNode?.move&&currentNode.move.to===square){const badge=document.createElement('span');const def=annotationDef(annotations.at(-1));badge.className=`squareAnnotation ${def.kind}`;badge.dataset.annotation=def.icon;badge.textContent=def.icon;badge.title=annotations.join(' ');cell.appendChild(badge);}
    if(currentNode?.note?.trim()&&currentNode?.move?.to===square){const note=document.createElement('span');note.className='squareNote';note.textContent='✎';note.title=currentNode.note.trim();cell.appendChild(note);}
    if(row===7){const coord=document.createElement('span');coord.className='coord file';coord.textContent=file;cell.appendChild(coord);}
    if(col===0){const coord=document.createElement('span');coord.className='coord rank';coord.textContent=rank;cell.appendChild(coord);}
    board.appendChild(cell);
  }
  installPieceFallbacks?.(board);
}

export function createBoardRenderer({board,renderSquares}){
  if(!board||typeof renderSquares!=='function')throw new Error('Board renderer requires board and renderSquares');
  function render(state){renderSquares(state);return board;}
  return {render};
}
