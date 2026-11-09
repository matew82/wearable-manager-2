'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const root=path.resolve(__dirname,'../..');
const wardrobe=fs.readFileSync(path.join(root,'Wearable Manager Wardrobe.dsa'),'utf8');
let passed=0;const failures=[];
function test(name,run){try{run();passed++;}catch(e){failures.push({name,error:e.stack});}}

test('version and changelog name the UI read-scope reuse',()=>{
 assert(wardrobe.includes('var VERSION = "0.9.10.45"'));
 assert(wardrobe.includes('UI read-scope reuse for inventory and materials'));
 assert(wardrobe.includes('first-open + set-change share WM-1 read scope'));
 assert(wardrobe.includes('inventoryCacheHits'));
 assert(wardrobe.includes('materialCacheHits'));
});

test('readSceneStatus shares one withReadScope across summary and cards',()=>{
 const body=getFunction(wardrobe,'readSceneStatus').text;
 assert(body.includes('withReadScope(function()'));
 assert(body.includes('readOutfitSummary('));
 assert(body.includes('renderCards('));
 assert(body.indexOf('withReadScope(')<body.indexOf('readOutfitSummary('));
 assert(body.indexOf('readOutfitSummary(')<body.indexOf('renderCards('));
});

test('first open uses openSceneStatus instead of an early inventory pass',()=>{
 const body=getFunction(wardrobe,'mainDialog').text;
 assert(body.includes('function openSceneStatus()'));
 assert(body.includes('openSceneStatus();'));
 assert(body.includes('var cardLayout=new DzVBoxLayout(content)'));
 assert(!/sortSummary\s*=\s*sortFigure\s*\?\s*readOutfitSummary/.test(body));
 assert(body.indexOf('function openSceneStatus()')<body.indexOf('openSceneStatus();'));
 const open=body.slice(body.indexOf('function openSceneStatus()'),body.indexOf('function refreshCardChrome()'));
 assert(open.includes('withReadScope(function()'));
 assert(open.includes('readOutfitSummary('));
 assert(open.includes('applyWornFirstCardOrder('));
 assert(open.includes('renderCards('));
 assert(open.indexOf('withReadScope(')<open.indexOf('readOutfitSummary('));
 assert(open.indexOf('readOutfitSummary(')<open.indexOf('applyWornFirstCardOrder('));
 assert(open.indexOf('applyWornFirstCardOrder(')<open.indexOf('renderCards('));
});

test('post-action finally reuses stored card diagnostics when status is fresh',()=>{
 const body=getFunction(wardrobe,'mainDialog').text;
 assert(body.includes('function refreshCardChrome()'));
 assert(body.includes('if(sceneStatusFresh)renderCards(false);else renderCards();'));
 assert(body.includes('if(!action)refreshCardChrome();'));
 assert(!/finally\{busy=false;box\.enabled=true;renderCards\(\);\}/.test(body));
});

test('Take Off All and Take Off Set chrome stay summary-driven',()=>{
 const body=getFunction(wardrobe,'mainDialog').text;
 assert(body.includes('takeOffAll.text=recoverableComposite?"                  Resolve Changed Wearable...":'));
 assert(body.includes('"Take Off All"+(summary.valid&&summary.activeIDs.length?" ("+summary.activeIDs.length+")":"")'));
 assert(body.includes('takeOffAll.toolTip=recoverableComposite?'));
 assert(body.includes('"Store all currently worn registered items for the selected figure."'));
 assert(body.includes('if(hasWornMember)rec.removeSet.show();else rec.removeSet.hide();'));
 assert(body.includes('removeSet.hide();'));
 assert(body.includes('removeSet.toolTip="Take Off Set: store all worn members of this Set regardless of Keep/Replace policy, and reset its active Property Overrides. Other items stay worn."'));
 // Provisional empty summary must not be the last paint before the dialog shows.
 assert(body.indexOf('summary={valid:false,activeIDs:[],message:""}')<body.indexOf('openSceneStatus();'));
 assert(body.includes('summary=fig?readOutfitSummary(fig)'));
});

test('withReadScope and invalidateReadScope manage inventory/materials maps',()=>{
 const scope=getFunction(wardrobe,'withReadScope').text;
 const invalidate=getFunction(wardrobe,'invalidateReadScope').text;
 assert(scope.includes('inventory:null'));
 assert(scope.includes('materials:null'));
 assert(invalidate.includes('readScope.inventory=null'));
 assert(invalidate.includes('readScope.materials=null'));
});

test('inventory reuses the same owner map inside one read scope',()=>{
 const counters={};let builds=0;
 const fig={id:'fig'},db={libraryID:'lib',commitID:'c1'};
 const c=vm.createContext({
  optimizedReads:()=>true,
  readScope:null,
  profileBegin:()=>({}),
  profileEnd(){},
  profileCount(name,amount){counters[name]=(counters[name]||0)+(amount||1);},
  key:n=>n.id,
  own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),
  inventoryImpl(){builds++;return {built:builds};}
 });
 vm.runInContext(
  getFunction(wardrobe,'withReadScope').text+'\n'+
  getFunction(wardrobe,'inventory').text,
  c);
 const first=c.withReadScope(()=>{
  const a=c.inventory(fig,db),b=c.inventory(fig,db);
  assert.equal(a,b);
  assert.equal(a.built,1);
  return a;
 },false);
 assert.equal(builds,1);
 assert.equal(counters.inventoryCacheHits,1);
 assert.equal(counters.readScopes,1);
 const second=c.inventory(fig,db);
 assert.notEqual(second,first);
 assert.equal(builds,2);
});

test('materials snapshots are reused inside one read scope and cloned for callers',()=>{
 const counters={};let builds=0;
 const node={id:'shirt'};
 const c=vm.createContext({
  readScope:null,
  profileCount(name,amount){counters[name]=(counters[name]||0)+(amount||1);},
  key:n=>n.id,
  own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),
  clonePlain:o=>JSON.parse(JSON.stringify(o)),
  materialsBuild(){builds++;return {surfaces:[{name:'Default',values:{Cutout:1}}],skipped:0};},
  optimizedReads:()=>true
 });
 vm.runInContext(
  getFunction(wardrobe,'withReadScope').text+'\n'+
  getFunction(wardrobe,'materialsImpl').text,
  c);
 c.withReadScope(()=>{
  const a=c.materialsImpl(node),b=c.materialsImpl(node);
  assert.notEqual(a,b);
  assert.deepEqual(a,b);
  a.surfaces[0].values.Cutout=0;
  assert.equal(b.surfaces[0].values.Cutout,1);
  assert.equal(builds,1);
  assert.equal(counters.materialCacheHits,1);
 },false);
 c.materialsImpl(node);
 assert.equal(builds,2);
});

test('inReferenceStorage ancestry results are memoized for one inventory pass',()=>{
 const fig={id:1},storage={id:2,group:true,wm:true},item={id:3,parent:storage},orphan={id:4,parent:fig};
 let finds=0;
 for(const n of [fig,storage,item,orphan]){
  n.getNodeParent=()=>n.parent||null;
  n.inherits=t=>t==='DzGroupNode'&&!!n.group;
  n.findDataItem=name=>{
   if(name!=='MatewWearables'||!n.wm)return null;
   finds++;
   return {getSettings:()=>({getStringValue:(k,d)=>k==='ID'?'wm_storage':d})};
  };
 }
 const c=vm.createContext({
  key:n=>String(n.id),
  own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),
  problem:(code,message)=>Object.assign(new Error(message),{code})
 });
 vm.runInContext(getFunction(wardrobe,'inReferenceStorage').text,c);
 const cache={};
 assert.equal(c.inReferenceStorage(item,cache),true);
 assert.equal(c.inReferenceStorage(item,cache),true);
 assert.equal(c.inReferenceStorage(storage,cache),true);
 assert.equal(c.inReferenceStorage(orphan,cache),false);
 assert.equal(c.inReferenceStorage(orphan,cache),false);
 assert.equal(finds,1);
});

console.log(JSON.stringify({passed,failed:failures.length,nativeDAZ:false,failures},null,2));
if(failures.length)process.exitCode=1;
