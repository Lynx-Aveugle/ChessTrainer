import assert from 'node:assert/strict';

class FakeNode{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.style={};this.listeners={};this.classList={values:new Set(),add:(...v)=>v.forEach(x=>this.classList.values.add(x))};}
  setAttribute(k,v){this.attributes[k]=String(v);}
  appendChild(node){node.parentNode=this;this.children.push(node);return node;}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}}
  addEventListener(type,fn){this.listeners[type]=fn;}
}
const fakeDocument={createElementNS:(_ns,tag)=>new FakeNode(tag)};
globalThis.document=fakeDocument;
const {createArrowRenderer}=await import('./src/ui/arrows.js');
const container=new FakeNode('div');
let clicked=null;
const renderer=createArrowRenderer(container,{onArrowMove:move=>{clicked=move}});
const arrows=[
  {from:'e2',to:'e4',san:'e4',classification:'blunder',engineBest:false,promotion:null},
  {from:'d2',to:'d4',san:'d4',classification:'error',engineBest:false,promotion:null},
  {from:'g1',to:'f3',san:'Nf3',classification:'good',engineBest:false,promotion:null},
  {from:'b1',to:'c3',san:'Nc3',classification:'excellent',engineBest:false,promotion:null},
  {from:'c2',to:'c4',san:'c4',classification:'brilliant',engineBest:false,promotion:null},
  {from:'a2',to:'a4',san:'a4',classification:'neutral',engineBest:true,promotion:null}
];
const svg=renderer.render(arrows,{orientation:'white'});
assert.equal(svg.tagName,'svg');
assert.equal(svg.children.length,7,'defs plus six arrows');
const engineGroup=svg.children.at(-1);assert.equal(engineGroup.dataset.engineBest,'true');
const engineLine=engineGroup.children[0];assert.equal(engineLine.style.color,'#1d4ed8');assert.equal(engineLine.style.opacity,'0.55');
assert.equal(svg.children[0].tagName,'defs');
const whiteX=svg.children[1].children[0].attributes.x1;
const blackSvg=renderer.render([{...arrows[0]}],{orientation:'black'});
const blackLine=blackSvg.children[1].children[0];
assert.notEqual(blackLine.attributes.x1,whiteX);
svg.children[1].listeners.click();
assert.deepEqual(clicked,{from:'e2',to:'e4',promotion:undefined});
renderer.clear();assert.equal(svg.children.length,1);
renderer.destroy();assert.equal(container.children.length,0);
console.log('ARROW RENDERER TESTS OK');
