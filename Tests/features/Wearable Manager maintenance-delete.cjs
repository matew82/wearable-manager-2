const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'Wearable Manager Wardrobe.dsa'),'utf8');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
let passed=0;function test(n,f){f();passed++;}
function fixture(){
 const removed=[],events=[];
 const c=vm.createContext({
  app:{libraryPath:'C:/library',lockToken:'owned'},own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),
  clonePlain:o=>JSON.parse(JSON.stringify(o)),problem:(c,m)=>Error(c+': '+m),
  safeRelative:s=>{if(!s||s.startsWith('/')||s.split('/').some(p=>p==='..'||p==='.'||!p)||/[\\:]/.test(s))throw Error('unsafe');return s;},
  maintenanceAssetGuard:(root,rel)=>({path:root+'/'+rel,bytes:10}),
  pathExists:()=>false,print(){},TITLE:'WM',invalidateReadScope(){events.push('invalidate');},
  commitCatalog(next){events.push('commit');c.app.db=next;},
  DzFile:class{constructor(p){this.p=p;}remove(){events.push('remove');removed.push(this.p);return true;}deleteLater(){}}
 });
 for(const n of ['applySetMaintenance','maintenanceAssetKey','maintenanceAssetPlan','maintenanceDeletionStamp','executeMaintenanceDeletion'])
  vm.runInContext(getFunction(src,n).text,c);
 const db={libraryID:'lib',commitID:'r1',revision:1,sets:{
   a:{id:'a',items:['shirt','shared'],icon:'Icons/a.png'},
   b:{id:'b',items:['pants','shared'],icon:'Icons/shared.png'}
 },items:{
   shirt:{preset:'Items/shirt.duf'},pants:{preset:'Items/pants.duf'},
   shared:{preset:'Items/shared.duf'},orphan:{preset:'Items/orphan.duf'}
 }};
 const files=['Items/shirt.duf','Items/shirt.png','Items/pants.duf','Items/shared.duf','Items/orphan.duf','Icons/a.png','Icons/shared.png','Icons/old.png'].map(relative=>({relative,bytes:10}));
 return {c,db,files,events,removed,plan:(scene=[],docs=[])=>c.maintenanceAssetPlan(db,['a'],files,scene,docs)};
}
test('delete unused and old orphan assets, keep shared and remaining set files',()=>{
 const f=fixture(),p=f.plan();assert.equal(p.bytes,50);assert.equal(p.setCount,1);
 assert.deepEqual(Object.keys(p.next.items).sort(),['pants','shared']);assert.equal(f.db.sets.a.id,'a');
 assert(!p.files.some(x=>x.relative==='Items/shared.duf'));assert(p.files.some(x=>x.relative==='Icons/old.png'));
});
test('scene metadata preserves deleted-set item and its thumbnail without changing scene',()=>{
 const f=fixture(),scene=[{ItemID:'shirt',Recovery:'{"source":"Materials/live.duf"}'}];
 f.files.push({relative:'Materials/live.duf',bytes:21});
 const before=JSON.stringify(scene),p=f.plan(scene);
 assert(p.next.items.shirt);assert(!p.files.some(x=>/shirt|live/.test(x.relative)));assert.equal(JSON.stringify(scene),before);
});
test('transition replacement references are retained transitively',()=>{
 const f=fixture();f.db.items.pants.transitionPolicy={mode:'replace',replacementIDs:['shirt']};
 const p=f.plan();assert(p.next.items.shirt);assert(!p.files.some(x=>x.relative==='Items/shirt.duf'));
});
test('material references and shared icon from remaining set are kept',()=>{
 const f=fixture();f.db.sets.b.materialSnapshots={pants:{nativePreset:'Materials/style.duf'}};
 f.db.sets.b.icon='Icons/a.png';f.files.push({relative:'Materials/style.duf',bytes:30});
 const p=f.plan();assert(!p.files.some(x=>x.relative==='Icons/a.png'||x.relative==='Materials/style.duf'));
});
test('recovery manifest retains native DUFs and item registration',()=>{
 const f=fixture();f.files.push({relative:'Materials/recover.json',bytes:30},{relative:'Materials/recover.duf',bytes:40});
 const p=f.plan([],[{relative:'Materials/recover.json',value:{itemID:'shirt',shells:[{preset:'Materials/recover.duf'}]}}]);
 assert(p.next.items.shirt);assert(!p.files.some(x=>x.relative.startsWith('Materials/')));
});
test('absolute and case-varied internal references protected',()=>{
 const f=fixture();f.db.sets.b.icon='c:/LIBRARY/Icons/A.PNG';
 assert(!f.plan().files.some(x=>x.relative==='Icons/a.png'));
});
test('last set deletion keeps live scene items and deletes other registrations',()=>{
 const f=fixture(),p=f.c.maintenanceAssetPlan(f.db,['a','b'],f.files,[{ItemID:'shirt'}],[]);
 assert.equal(Object.keys(p.next.sets).length,0);assert.deepEqual(Object.keys(p.next.items),['shirt']);
});
test('missing selection fails rather than deleting unrelated files',()=>{
 const f=fixture();assert.throws(()=>f.c.maintenanceAssetPlan(f.db,['missing'],f.files,[],[]));
});
test('path traversal fails closed',()=>{
 const f=fixture();f.db.sets.b.icon='Icons/../outside.png';assert.throws(()=>f.plan());
});
test('catalog or file changes invalidate confirmation stamp',()=>{
 const f=fixture(),p=f.plan();p.root='C:/library';p.commitID='r1';
 const before=f.c.maintenanceDeletionStamp(p);p.files[0].bytes++;assert.notEqual(before,f.c.maintenanceDeletionStamp(p));
});
test('commit precedes all deletion and cleanup invalidates caches',()=>{
 const f=fixture(),p=f.plan();p.root='C:/library';f.c.executeMaintenanceDeletion(p,'old');
 assert.equal(f.events[0],'commit');assert.equal(f.removed.length,5);assert.equal(f.events.at(-1),'invalidate');
});
test('commit failure leaves all files untouched',()=>{
 const f=fixture(),p=f.plan();p.root='C:/library';f.c.commitCatalog=()=>{throw Error('disk');};
 assert.throws(()=>f.c.executeMaintenanceDeletion(p,'old'));assert.equal(f.removed.length,0);
});
test('preflight path or size changes prevent both commit and deletion',()=>{
 const f=fixture(),p=f.plan();p.root='C:/library';f.c.maintenanceAssetGuard=()=>({bytes:99});
 assert.throws(()=>f.c.executeMaintenanceDeletion(p,'old'));assert.equal(f.events.length,0);assert.equal(f.removed.length,0);
});
test('delete failure is reported without pretending catalog rolled back',()=>{
 const f=fixture(),p=f.plan();p.root='C:/library';f.c.DzFile=class{remove(){return false;}deleteLater(){}};
 assert.throws(()=>f.c.executeMaintenanceDeletion(p,'old'),/sets were deleted/);assert(f.c.app.db);assert.equal(f.events[0],'commit');
});
test('deletion needs write lock',()=>{
 const f=fixture();f.c.app.lockToken='';assert.throws(()=>f.c.executeMaintenanceDeletion(f.plan(),'old'));assert.equal(f.events.length,0);
});
test('confirmation shows count and MB, defaults to cancellation, Delete requires click',()=>{
 const f=fixture(),buttons=[],labels=[];let action='Cancel',size;
 class Widget{setFixedHeight(h){this.height=h;}setFixedSize(w,h){this.size=[w,h];}getWidget(){return {setStyleSheet:s=>{this.style=s;}};}}
 f.c.newGeorgiaDialog=()=>({setFixedSize(w,h){size=[w,h];},exec(){if(action)buttons.find(b=>b.text===action).click();},close(){},deleteLater(){}});
 f.c.DzVBoxLayout=class{addWidget(){}};f.c.DzHGroupBox=Widget;
 f.c.DzPushButton=class extends Widget{constructor(){super();buttons.push(this);}};
 f.c.flattenGroupBox=()=>{};f.c.DzLabel={PlainText:0};
 f.c.label=(parent,text)=>{labels.push(text);return new Widget();};
 f.c.connect=(button,signal,cb)=>{button.click=cb;};
 vm.runInContext(getFunction(src,'confirmMaintenanceDeletion').text,f.c);
 assert.equal(f.c.confirmMaintenanceDeletion({setCount:3,files:[{},{}],bytes:1250000}),false);
 assert(labels[0].includes('Outfits to delete: 3'));assert(labels[0].includes('1.25 MB'));
 assert(labels[0].includes('irreversible'));assert(labels[0].includes('Scene objects are kept'));
 assert(buttons.every(b=>b.height===52));assert(buttons.find(b=>b.text==='Delete').style.includes('#ab3030'));
 assert.deepEqual(size,[560,240]);buttons.length=0;action='Delete';
 assert.equal(f.c.confirmMaintenanceDeletion({setCount:1,files:[],bytes:0}),true);
 buttons.length=0;action=null;
 assert.equal(f.c.confirmMaintenanceDeletion({setCount:1,files:[],bytes:0}),false);
 assert.equal(f.removed.length,0);
});
test('library size includes all nested files, logs, history and hidden entries',()=>{
 const f=fixture(),tree={
  'C:/library':['Items','Logs','Catalog','.hidden'],
  'C:/library/Items':['a.duf'],
  'C:/library/Logs':['nested'],
  'C:/library/Logs/nested':['report.txt'],
  'C:/library/Catalog':['old.json']
 },sizes={'C:/library/.hidden':3,'C:/library/Items/a.duf':100,'C:/library/Logs/nested/report.txt':20,'C:/library/Catalog/old.json':7};
 f.c.wm2MaterialCacheEntries=p=>tree[p];
 f.c.DzFileInfo=class{constructor(p){this.p=p;}isDir(){return !!tree[this.p];}deleteLater(){}};
 f.c.wm2MaterialCacheCheckPath=(p,dir)=>({bytes:dir?0:sizes[p]});
 vm.runInContext(getFunction(src,'maintenanceLibraryBytes').text,f.c);
 assert.equal(f.c.maintenanceLibraryBytes('C:/library'),130);
 tree['C:/library/Items']=[];assert.equal(f.c.maintenanceLibraryBytes('C:/library'),30);
 tree['C:/empty']=[];assert.equal(f.c.maintenanceLibraryBytes('C:/empty'),0);
 f.c.wm2MaterialCacheCheckPath=()=>{throw Error('unreadable or linked');};
 assert.throws(()=>f.c.maintenanceLibraryBytes('C:/library'));
});
console.log(JSON.stringify({passed,failed:0,nativeDAZ:false}));
