export function renderMovesList({root,currentNode,esc,moveOutcomeStats,moveGaugeMarkup,findElement=(id)=>document.getElementById(id)}){
  let html='';
  const walk=(node,depth=0)=>{
    for(const child of node?.children||[]){
      const fields=String(child.parent?.fen||'').split(/\s+/),turn=fields[1]||'w',num=Number(fields[5]||1),prefix=depth?'↳ ':'',gauge=moveGaugeMarkup(moveOutcomeStats(child));
      html+=`<button class="move ${child===currentNode?'current':''} ${depth?'variationMove':''}" style="margin-left:${Math.min(depth,6)*10}px" data-node="${esc(child.id)}"><span class="moveMain">${prefix}${turn==='w'?num+'.':num+'...'} ${esc(child.san)}</span>${gauge}</button>`;
      walk(child,depth+1);
    }
  };
  walk(root);
  for(const id of ['moves','analysisMoves']){
    const el=findElement(id);if(!el)continue;
    el.innerHTML=html||'<span class="muted">Position initiale</span>';
    const current=el.querySelector('.move.current');if(current)requestAnimationFrame(()=>current.scrollIntoView({block:'nearest',inline:'nearest'}));
  }
  return html;
}
export function createMoveNavigator({navigateByMove,navigateToNode}){return {navigateByMove,navigateToNode};}
