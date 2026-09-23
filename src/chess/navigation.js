export function createNavigator({getState,setState,renderBoard,renderArrows,onPositionChanged,schedulePersist=()=>{}}){
  function applyNode(node){
    if(!node)return false;
    schedulePersist();
    const state=getState();
    state.currentNode=node;
    if(state.Chess)state.chess=new state.Chess(node.fen);
    if(state.chessFactory)state.chess=state.chessFactory(node.fen);
    state.selectedSquare=null;
    state.lastMove=node.move?[node.move.from,node.move.to]:null;
    renderBoard?.(state);
    renderArrows?.(node.fen,state);
    onPositionChanged?.(state);
    return true;
  }
  function navigateToNode(node){return applyNode(node);}
  function navigateByMove(move){
    const state=getState(),children=state.currentNode?.children||[];
    const child=children.find(n=>n.move?.from===move?.from&&n.move?.to===move?.to&&(n.move?.promotion||null)===(move?.promotion||null));
    return child?applyNode(child):false;
  }
  function navigatePrevious(){return stateFrom().currentNode?.parent?applyNode(stateFrom().currentNode.parent):false;}
  function navigateNext(){const s=stateFrom(),next=s.currentNode?.children?.[0];return next?applyNode(next):false;}
  function stateFrom(){return getState();}
  return {navigateToNode,navigateByMove,navigatePrevious,navigateNext};
}
