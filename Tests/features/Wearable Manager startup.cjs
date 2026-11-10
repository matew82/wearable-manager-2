'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {getFunction,files}=require('../support/Wearable Manager extract.cjs');
const root=path.resolve(__dirname,'../..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
let passed=0;const failures=[];function test(name,fn){try{fn();passed++;}catch(e){failures.push({name,error:e.stack});}}
function scene(){
 let next=1,scans=0,lookups=0;const map=new Map();
 class Node{constructor(name,type,parent=null){this.name=name;this.type=type;this.parent=parent;this.elementID=next++;this.children=[];if(parent)parent.children.push(this);map.set(this.elementID,this);}
 inherits(t){return t==='DzNode'||t===this.type||t==='DzSkeleton'&&this.type==='DzFigure';}className(){return this.type;}getName(){return this.name;}getLabel(){return this.name;}getFollowTarget(){return null;}getNodeParent(){return this.parent;}getNumNodeChildren(){return this.children.length;}getNodeChildren(){return this.children;}}
 const Scene={getNodeList(){scans++;return [...map.values()];},getNumNodes:()=>map.size,findNodeByElementID(id){lookups++;return map.get(id)||null;}};
 const c=vm.createContext({Scene});vm.runInContext(read('Resources/Wearable Manager Support.dsa'),c);return {c,Node,map,stats:()=>({scans,lookups})};
}
test('startup figure-type preflight does not enumerate the scene for every bone',()=>{const w=scene(),f=new w.Node('Genesis9','DzFigure'),cfg=w.c.WM2Support.defaults();for(let i=0;i<2000;i++)assert.equal(w.c.WM2Support.isSupportedFigureType(new w.Node('bone','DzBone',f),cfg),false);assert.equal(w.stats().scans,0);assert.equal(w.stats().lookups,0);assert(w.c.WM2Support.isSupportedFigure(f,cfg));assert.equal(w.stats().scans,0);});
for(const file of files)test(file+' resolves current native membership without a JS scene scan',()=>{const w=scene(),s=read(file);for(const fn of ['WM2NodeKey','WM2SameNode','WM2LiveNode'])vm.runInContext(getFunction(s,fn).text,w.c);const n=new w.Node('Item','DzNode');for(let i=0;i<2000;i++)new w.Node('Other','DzNode');assert.equal(w.c.WM2LiveNode(n),n);w.map.delete(n.elementID);assert.equal(w.c.WM2LiveNode(n),null);assert.equal(w.stats().scans,0);assert.equal(w.stats().lookups,2);});
test('transfer guard visits the live subtree without scanning unrelated scene nodes',()=>{const w=scene(),f=new w.Node('Genesis9','DzFigure'),item=new w.Node('Coat','DzNode',f),cfg=w.c.WM2Support.defaults();for(let i=0;i<2000;i++)new w.Node('Other','DzNode');assert.equal(w.c.WM2Support.isProtectedTransfer(item,f,cfg),false);assert.equal(w.stats().scans,0);new w.Node('Genesis9Eyes','DzNode',item);assert.equal(w.c.WM2Support.isProtectedTransfer(item,f,cfg),true);assert.equal(w.stats().scans,0);});
const wardrobe=read('Wearable Manager Wardrobe.dsa');
for(const failure of ['', 'save','validation','duplicate'])test('Wardrobe export restores both managers metadata after '+(failure||'success'),()=>{
 let unrelatedLabelReads=0;const extras=Array.from({length:100},(_,i)=>({getLabel(){unrelatedLabelReads++;return 'Extra '+i;}}));
 const original={PartID:'part',NodeID:'runtime',OwnerFigureID:'owner'},foreign={persistent:true,NodeID:'wm-original',Transfer:'Yes'};
 const n={elementID:1,own:{...original},foreign,getNodeChildren:()=>[],getLabel:()=> 'Coat',inherits:()=>false,select(){},findDataItem(name){return name==='MatewWearables'?this.foreign:null;},removeDataItem(d){assert.equal(d,foreign);this.foreign=null;},addDataItem(d){this.foreign=d;}};
 const fig={getLabel:()=> 'Figure'},filter={getDefaultOptions(){},getOptions:()=>true,deleteLater(){}};
 const c=vm.createContext({DATA:"WardrobeLegacy",auxiliaryWeightNode:()=>false,requireUnscoped(){},inLibrary:p=>p,app:{libraryPath:'/test',db:{libraryID:'library'}},App:{getAssetIOMgr:()=>({findAssetFilterIndex:()=>0,getAssetFilter:()=>filter,doSaveWithOptions(){assert.equal(n.foreign,null);assert.equal(n.own.NodeID,undefined);assert.equal(n.own.ExportDefinition,'1');if(failure==='save')throw Error('save');return 0;}})},pathExists:()=>false,readable:()=>true,
 DzFileIOSettings:class{setStringValue(){}setBoolValue(){}setSettingsValue(){return this;}hasKey(){return -1;}},poseRecord:()=>({}),dataObject:n=>n.own,key:n=>n.elementID,putData:(n,d)=>n.own=d,same:(a,b)=>a===b,beginNodeSelectionHold(){},restoreNodeSelectionHold(){},Scene:{selectAllNodes(){},setPrimarySelection(){}},clearSetting(){},sceneNodes:()=>[fig,n].concat(extras).concat(failure==='duplicate'?[{getLabel:()=> 'Coat'}]:[]),validatePreset(){if(failure==='validation')throw Error('validation');},must:assert,closeNumbers:()=>true,live:()=>n,errorText:String,problem:(c,m)=>Error(c+':'+m),log(){}});
 c.own=(o,k)=>Object.hasOwn(o,k);
 vm.runInContext(getFunction(wardrobe,'saveItemPreset').text,c);
 const run=()=>c.saveItemPreset({preset:'item.duf',id:'item',variantID:'variant',name:'Coat',parts:[{id:'part'}]},n,fig,{part:n});
 if(failure)assert.throws(run,new RegExp(failure==='duplicate'?'SAVE_SELECTOR':failure));else run();assert.equal(n.foreign,foreign);assert.deepEqual(n.own,original);assert.equal(unrelatedLabelReads,100);
});
console.log(JSON.stringify({passed,failed:failures.length,nativeDAZ:false,failures},null,2));if(failures.length)process.exitCode=1;
