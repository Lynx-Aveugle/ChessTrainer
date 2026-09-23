const SVG_NS='http://www.w3.org/2000/svg';
const CLASS_COLORS={blunder:'#ef4444',error:'#f97316',good:'#86efac',excellent:'#166534',brilliant:'#2dd4bf',theoretical:'#d6c7a1',neutral:'#94a3b8'};

function squareCenter(square,geometry){
  const file='abcdefgh'.indexOf(String(square||'')[0]);
  const rank=Number(String(square||'')[1]);
  if(file<0||rank<1||rank>8)return null;
  const flipped=geometry?.orientation==='black';
  const col=flipped?7-file:file;
  const row=flipped?rank-1:8-rank;
  const size=100/8;
  return {x:(col+.5)*size,y:(row+.5)*size};
}

export function createArrowRenderer(container,{onArrowMove=()=>{}}={}){
  if(!container)throw new Error('Arrow renderer container is required');
  let svg=null;
  function ensure(){
    if(svg){if(svg.parentNode!==container)container.appendChild(svg);return svg;}
    svg=document.createElementNS(SVG_NS,'svg');
    svg.classList.add('moveArrows');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-label','Coups recommandés et coups déjà joués');svg.setAttribute('role','img');
    const defs=document.createElementNS(SVG_NS,'defs');
    const marker=document.createElementNS(SVG_NS,'marker');marker.setAttribute('id','htArrowHead');marker.setAttribute('markerWidth','7');marker.setAttribute('markerHeight','7');marker.setAttribute('refX','6');marker.setAttribute('refY','3.5');marker.setAttribute('orient','auto');
    const path=document.createElementNS(SVG_NS,'path');path.setAttribute('d','M0,0 L7,3.5 L0,7 z');path.setAttribute('fill','currentColor');marker.appendChild(path);defs.appendChild(marker);svg.appendChild(defs);container.appendChild(svg);return svg;
  }
  function render(arrows=[],geometry={orientation:'white'}){
    const root=ensure();
    for(const child of [...root.children])if(child.tagName!=='defs')child.remove();
    arrows.forEach((arrow,index)=>{
      const a=squareCenter(arrow.from,geometry),b=squareCenter(arrow.to,geometry);if(!a||!b)return;
      const group=document.createElementNS(SVG_NS,'g');group.classList.add('moveArrow');group.dataset.from=arrow.from;group.dataset.to=arrow.to;if(arrow.promotion)group.dataset.promotion=arrow.promotion;group.dataset.classification=arrow.classification;group.dataset.engineBest=String(Boolean(arrow.engineBest));
      group.setAttribute('role','button');group.setAttribute('tabindex','0');group.setAttribute('aria-label',`${arrow.san||`${arrow.from}-${arrow.to}`} · ${arrow.engineBest?'meilleur coup Stockfish':arrow.classification}`);
      const line=document.createElementNS(SVG_NS,'line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width',arrow.engineBest?'4':'6');line.setAttribute('stroke-linecap','round');line.setAttribute('marker-end','url(#htArrowHead)');line.style.color=arrow.engineBest?'#1d4ed8':(CLASS_COLORS[arrow.classification]||CLASS_COLORS.neutral);if(arrow.engineBest)line.style.opacity='0.55';group.appendChild(line);
      const hit=document.createElementNS(SVG_NS,'line');hit.setAttribute('x1',a.x);hit.setAttribute('y1',a.y);hit.setAttribute('x2',b.x);hit.setAttribute('y2',b.y);hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','18');hit.style.pointerEvents='stroke';group.appendChild(hit);
      const activate=()=>onArrowMove({from:arrow.from,to:arrow.to,promotion:arrow.promotion||undefined});
      group.addEventListener('click',activate);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});root.appendChild(group);
    });
    return root;
  }
  function clear(){if(svg){for(const child of [...svg.children])if(child.tagName!=='defs')child.remove();}}
  function destroy(){svg?.remove();svg=null;}
  return {render,clear,destroy};
}
