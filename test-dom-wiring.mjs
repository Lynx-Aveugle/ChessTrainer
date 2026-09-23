import fs from "node:fs";
import path from "node:path";

const read = file => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const app = read("app.js");
const html = read("index.html");
const css = read("styles.css");
const sw = read("sw.js");

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function htmlIds(source){
  return new Set([...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m=>m[1]));
}

const htmlIdSet = htmlIds(html);
const referencedIds = [...new Set([...app.matchAll(/\$\(\s*["']([^"']+)["']\s*\)/g)].map(m=>m[1]))];
const missingIds = referencedIds.filter(id=>!htmlIdSet.has(id));
assert(missingIds.length===0, `IDs référencés par $() mais absents du DOM: ${missingIds.join(", ")}`);

assert(html.includes('id="annotationIcon" class="annotationIcon"') || html.includes('class="annotationIcon" id="annotationIcon"'),
  "annotationIcon doit être un vrai id DOM");
assert(/querySelectorAll\("\.analysisScopeTopTab"\)\.forEach\(b=>b\.addEventListener\("click",\(\)=>setAnalysisScope\(b\.dataset\.side\|\|"all"\)\)\)/.test(app),
  "Les onglets .analysisScopeTopTab doivent être reliés à setAnalysisScope()");
assert(/const treeHint=\$\("globalTreeHint"\);if\(treeHint\)treeHint\.textContent=label;/.test(app),
  "globalTreeHint doit suivre la portée d'analyse");
assert(/\.analysisScopeBar\{/.test(css), "Styles .analysisScopeBar manquants");
assert(/\.analysisScopeTopTab\{/.test(css), "Styles .analysisScopeTopTab manquants");
assert(/\.analysisScopeTopTab\.active\{/.test(css), "Style actif des onglets supérieurs manquant");
assert(!/\$\("exportBtn"\)/.test(app), "Le sélecteur obsolète exportBtn doit être supprimé");

const srcFiles = [];
function walk(dir){
  for(const name of fs.readdirSync(dir)){
    const full=path.join(dir,name);
    const stat=fs.statSync(full);
    if(stat.isDirectory()) walk(full);
    else if(full.endsWith(".js") && full.startsWith(path.join(process.cwd(),"src"))) srcFiles.push(full);
  }
}
walk(path.join(process.cwd(),"src"));
const missingPrecache = srcFiles
  .map(full=>"./"+path.relative(process.cwd(),full).replaceAll(path.sep,"/"))
  .filter(rel=>!sw.includes(`"${rel}"`));
assert(missingPrecache.length===0, `Modules src/ absents du precache SW: ${missingPrecache.join(", ")}`);

const staticUrls=[...sw.matchAll(/"(\.\/[^"\n]+)"/g)].map(m=>m[1]).filter(url=>!url.startsWith("./api/"));
const missingStaticFiles=staticUrls.filter(url=>url!=="./" && !fs.existsSync(path.join(process.cwd(),url.slice(2))));
assert(missingStaticFiles.length===0, `Ressources STATIC introuvables: ${missingStaticFiles.join(", ")}`);

console.log(`DOM WIRING CONTRACT TESTS OK · ${referencedIds.length} sélecteurs $() vérifiés · ${srcFiles.length} modules src/ précachés`);
