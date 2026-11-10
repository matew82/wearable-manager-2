'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {getFunction,files:engines}=require('../support/Wearable Manager extract.cjs');
const root=path.resolve(__dirname,'../..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const bridge=read('Resources/Wearable Manager Wardrobe Bridge.dsa'),support=read('Resources/Wearable Manager Support.dsa'),wardrobe=read('Wearable Manager Wardrobe.dsa');
let passed=0;const failures=[];
function test(name,run){try{run();passed++;}catch(e){failures.push({name,error:e.stack});}}
const plain=v=>JSON.parse(JSON.stringify(v));
const prefs='/App/matew/WardrobeSetsPrototype',lib='/Library';
const settingsName='settings_0000000002_config.json',catalogName='rev_0000000002_matew_commit2.json';
function catalog(){return {format:'matew.wardrobe.sets',schemaVersion:1,libraryID:'matew_library',revision:2,commitID:'matew_commit2',items:{
 matew_item:{id:'matew_item',variantID:'matew_variant',parts:[{id:'matew_root',root:true},{id:'matew_child',root:false}]},
 matew_unused:{id:'matew_unused',variantID:'matew_unusedVariant',parts:[{id:'matew_unusedRoot',root:true}]}
},sets:{matew_setA:{id:'matew_setA',name:'Travel & <Summer>',items:['matew_item']},matew_setB:{id:'matew_setB',name:'Everyday',items:['matew_item']}}};}
let serial=1;
function node(own={},foreign=null,children=[]){const n={elementID:serial++,children,own,foreign,
 className:()=> 'DzNode',getLabel:()=> 'Shirt',getNodeChildren(recursive){return recursive?children.flatMap(c=>[c,...c.getNodeChildren(true)]):children;},
 findDataItem(name){const o=name==='matewWardrobeSets_v1'?this.own:name==='MatewWearables'?this.foreign:null;return o?{getSettings:()=>({getStringValue:(k,d)=>Object.hasOwn(o,k)?o[k]:d})}:null;}};return n;}
function registered(overrides={}){return node({Schema:'1',Role:'ItemRoot',LibraryID:'matew_library',ItemID:'matew_item',VariantID:'matew_variant',PartID:'matew_root',...overrides});}
function fixture(){
 const db=catalog(),disk=new Map(),dirs=new Set([prefs,lib,lib+'/Catalog']),events={reads:[],lists:[],messages:[],images:[],labels:[]};
 function put(p,o){disk.set(p,JSON.stringify(o));}
 put(prefs+'/'+settingsName,{schemaVersion:1,revision:2,libraryPath:lib});
 put(lib+'/library.json',{format:db.format,schemaVersion:1,libraryID:db.libraryID});put(lib+'/Catalog/'+catalogName,db);
 class File{constructor(p){this.path=p;}setCaching(){}exists(){return disk.has(this.path);}isFile(){return this.exists();}size(){return Buffer.byteLength(disk.get(this.path)||'');}open(mode){assert.equal(mode,1);return this.exists();}read(){events.reads.push(this.path);return disk.get(this.path);}error(){return 0;}close(){}deleteLater(){}}
 File.ReadOnly=1;File.NoError=0;
 class Dir{constructor(p){this.path=p;}exists(){return dirs.has(this.path);}isReadable(){return true;}entryList(pattern){events.lists.push(this.path);const prefix=pattern.split('*')[0];return [...disk.keys()].filter(p=>p.startsWith(this.path+'/')&&!p.slice(this.path.length+1).includes('/')).map(p=>p.slice(this.path.length+1)).filter(n=>n.startsWith(prefix)&&n.endsWith('.json')).sort();}deleteLater(){}}
 Dir.Files=1;Dir.Name=2;
 class Pixmap{constructor(p){this.path=p;this.width=32;this.height=32;events.images.push(this);}isNull(){return false;}resize(w,h){this.width=w;this.height=h;}}
 class Label{constructor(parent){this.parent=parent;events.labels.push(this);}setFixedSize(w,h){this.size=[w,h];}}
 const c=vm.createContext({App:{getAppDataPath:()=>'/App'},DzFile:File,DzDir:Dir,Pixmap,DzLabel:Label,print:s=>events.messages.push(s)});
 vm.runInContext(bridge,c);return {c,disk,dirs,events,put,db,make:()=>c.WM2WardrobeBridge.create('/Resources')};
}
test('include and scenes without registered items perform zero catalog IO',()=>{const f=fixture(),b=f.make();assert.equal(b.info(node(null)),null);assert.equal(b.info(node({Schema:'1',Role:'Figure'})),null);assert.deepEqual(f.events.reads,[]);assert.deepEqual(f.events.lists,[]);assert.deepEqual(f.events.images,[]);});
test('item and composite part list every containing set with escaped tooltip names',()=>{const f=fixture(),b=f.make();const a=b.info(registered()),part=b.info(registered({Role:'Part',PartID:'matew_child'}));assert.deepEqual(plain(a.names),['Everyday','Travel & <Summer>']);assert.deepEqual(plain(part.names),plain(a.names));assert(a.tooltip.includes('Travel &amp; &lt;Summer&gt;'));assert(!a.tooltip.includes('<Summer>'));});
test('24x24 informational badge is present in both columns with one decoded pixmap',()=>{const f=fixture(),b=f.make(),layout={widgets:[],addWidget(w){this.widgets.push(w);},addSpacing(n){assert.equal(n,7);}};for(const column of ['figure','storage'])assert(b.add(column,layout,registered()));assert.equal(layout.widgets.length,2);for(const label of layout.widgets){assert.deepEqual(label.size,[24,24]);assert.equal(label.pixmap.width,24);assert.equal(label.pixmap.height,24);assert(label.toolTip.includes('Everyday'));}assert.equal(f.events.images.length,1);assert.equal(f.events.reads.length,3);assert.equal(f.events.lists.length,2);});
for(const overrides of [{LibraryID:'matew_other'},{ItemID:'matew_unused',VariantID:'matew_unusedVariant',PartID:'matew_unusedRoot'},{VariantID:'matew_otherVariant'},{PartID:'matew_otherPart'},{Role:'Part'},{Schema:'2'}])test('identity does not guess membership '+JSON.stringify(overrides),()=>{assert.equal(fixture().make().info(registered(overrides)),null);});
test('latest preference and catalog revisions win; old schema1 catalogs need no groups',()=>{const f=fixture();f.put(prefs+'/settings_0000000001_old.json',{schemaVersion:1,revision:1,libraryPath:'/Unavailable'});f.put(lib+'/Catalog/rev_0000000001_matew_old.json',{format:'invalid'});assert(f.make().info(registered()));});
for(const where of ['preferences','catalog'])test('forked '+where+' suppress badges, log once and never retry per row',()=>{const f=fixture();f.put(where==='preferences'?prefs+'/settings_0000000002_fork.json':lib+'/Catalog/rev_0000000002_matew_fork.json',{});const b=f.make();assert.equal(b.info(registered()),null);const reads=f.events.reads.length;assert.equal(b.info(registered()),null);assert.equal(f.events.reads.length,reads);assert.equal(f.events.messages.length,1);});
for(const field of ['format','schemaVersion','libraryID','revision','commitID'])test('catalog mismatch '+field+' cannot manufacture a badge',()=>{const f=fixture();f.db[field]=field==='schemaVersion'||field==='revision'?99:'invalid';f.put(lib+'/Catalog/'+catalogName,f.db);assert.equal(f.make().info(registered()),null);});
test('unavailable library does not create replacement folders or lose scene metadata',()=>{const f=fixture(),n=registered(),before=JSON.stringify(n.own);f.disk.delete(lib+'/library.json');assert.equal(f.make().info(n),null);assert.equal(JSON.stringify(n.own),before);assert.equal(f.events.messages.length,1);});
test('catalog snapshot is reused in a dialog and refreshed for the next opening',()=>{const f=fixture(),first=f.make();assert.equal(first.info(registered()).names.length,2);f.db.revision=3;f.db.commitID='matew_commit3';f.db.sets={};f.put(lib+'/Catalog/rev_0000000003_matew_commit3.json',f.db);assert.equal(first.info(registered()).names.length,2);assert.equal(f.make().info(registered()),null);});
for(const file of ['Wearable Manager Menu.dsa','Wearable Manager Full.dsa'])test(file+' installs one bridge in shared row rendering',()=>{const s=read(file);assert(s.includes('include(sWM2ResourcesPath + "/Wearable Manager Wardrobe Bridge.dsa")'));assert.equal((s.match(/WM2WardrobeBridge.create\(PATH_ICONS\)/g)||[]).length,1);assert(getFunction(s,'AddTagImages').text.includes('oWardrobeBadges.add(oContainer, oLayout, oWearable)'));});
function supportContext(){const c=vm.createContext({});vm.runInContext(support,c);return c;}
test('active Wardrobe registration and inert WM identity metadata remain compatible',()=>{const c=supportContext(),n=registered(),owner=node({Schema:'1',Role:'Figure'});assert.equal(c.WM2Support.wardrobeTransferIssue(n,owner),'');assert.doesNotThrow(()=>c.WM2Support.requireWardrobeTransfers(owner,[n]));});
for(const field of ['Recovery','GeoWardrobeSnapshot','Pending'])test('WM refuses pending Wardrobe '+field+' in a composite child',()=>{const c=supportContext(),child=registered({[field]:'saved'}),parent=node(null,null,[child]),before=JSON.stringify(child.own);assert.throws(()=>c.WM2Support.requireWardrobeTransfers(node(null),[parent]),/Wardrobe/);assert.equal(JSON.stringify(child.own),before);});
test('WM refuses owner pending records and Wardrobe storage containers',()=>{const c=supportContext();assert.throws(()=>c.WM2Support.requireWardrobeTransfers(node({Schema:'1',Pending:'saved'}),[registered()]),/unfinished/);assert.throws(()=>c.WM2Support.requireWardrobeTransfers(node(null),[registered({Role:'WardrobeStorage'})]),/storage/);});
test('batch recovery guard visits overlapping subtrees once without long-lived cache',()=>{const c=supportContext(),child=registered(),parent=node(null,null,[child]);let reads=0;const old=child.getNodeChildren;child.getNodeChildren=function(r){reads++;return old.call(this,r);};c.WM2Support.requireWardrobeTransfers(node(null),[parent,child]);assert.equal(reads,1);child.own.Recovery='new';assert.throws(()=>c.WM2Support.requireWardrobeTransfers(node(null),[parent]),/unfinished recovery/);});
for(const file of engines){
 const s=read(file);
 for(const fn of ['PlaceWearableIntoGroup','ReturnWearable'])test(file+' '+fn+' stops foreign recovery before native mutations',()=>{const c=supportContext();vm.runInContext(getFunction(s,fn).text,c);const n=registered({Recovery:'pending'});assert.throws(()=>c[fn](node(null),n,node(null)),/Wardrobe/);});
 test(file+' refuses an open Wardrobe and preserves its busy flag',()=>{const c=vm.createContext({g_matewWardrobeSetsPrototypeBusy:true,g_matewWearablesStatus:0,err:()=>false});vm.runInContext(getFunction(s,'CheckForAnotherProcessActive').text,c);assert.equal(c.CheckForAnotherProcessActive(),false);assert.equal(c.g_matewWardrobeSetsPrototypeBusy,true);c.g_matewWardrobeSetsPrototypeBusy=false;assert.equal(c.CheckForAnotherProcessActive(),true);});
}
function foreignGuard(){const c=vm.createContext({problem:(code,message)=>Object.assign(new Error(message),{code})});vm.runInContext(getFunction(wardrobe,'foreignDataGuard').text,c);return c.foreignDataGuard;}
test('Wardrobe permits restored WM items for use and registration',()=>{const guard=foreignGuard(),n=node(null,{NodeID:'wm_id',Transfer:'Yes'});assert.doesNotThrow(()=>guard(n,false));assert.doesNotThrow(()=>guard(n,true));});
for(const field of ['Target','Target_NodeID','Collision_Item','Collision_Item_NodeID','FileName','UV'])test('Wardrobe stops pending WM '+field+' even after manual reparenting',()=>{const guard=foreignGuard(),child=node(null,{[field]:'saved'}),parent=registered();parent.children.push(child);const before=JSON.stringify(child.foreign);assert.throws(()=>guard(parent,false),e=>e.code==='FOREIGN_RECOVERY');assert.equal(JSON.stringify(child.foreign),before);});
test('Wardrobe inventory, store and restore all validate foreign recovery',()=>{for(const fn of ['inventoryImpl','storeItemImpl','restoreItemImpl'])assert(getFunction(wardrobe,fn).text.includes('foreignDataGuard('));});
test('Wardrobe ignores WM storage and accepts the same item after Put On',()=>{
 const fig=node({}),wmStorage=node(null,{ID:'wm_storage'}),wardrobeStorage=node(null),other=node({}),n=registered({OwnerFigureID:'owner'});n.parent=fig;
 for(const x of [fig,wmStorage,wardrobeStorage,other,n]){x.getNodeParent=()=>x.parent||null;x.inherits=t=>t==='DzGroupNode'&&x===wmStorage;}
 const c=vm.createContext({figureIdentity:()=> 'owner',sceneNodes:()=>[n],storageGroup:()=>wardrobeStorage,dataObject:x=>x.own,
  same:(a,b)=>a===b,humanAncestor:x=>x.parent===fig?fig:x.parent===other?other:null,follow:()=>null,
  key:n=>String(n.elementID),own:(o,k)=>Object.hasOwn(o,k),inspectInstance:(it,root)=>({root}),foreignDataGuard:foreignGuard(),
  problem:(code,message)=>Object.assign(new Error(message),{code})});
 vm.runInContext(getFunction(wardrobe,'inReferenceStorage').text+'\n'+getFunction(wardrobe,'inventoryImpl').text,c);const db=catalog(),before=JSON.stringify(n.own);
 assert.equal(c.inventoryImpl(fig,db).matew_item.where,'active');n.parent=wmStorage;
 assert.deepEqual(plain(c.inventoryImpl(fig,db)),{});
 n.parent=fig;assert.equal(c.inventoryImpl(fig,db).matew_item.where,'active');
 n.parent=wardrobeStorage;assert.equal(c.inventoryImpl(fig,db).matew_item.where,'stored');
 n.parent=other;assert.throws(()=>c.inventoryImpl(fig,db),e=>e.code==='FOREIGN_STORAGE_OR_OWNER');assert.equal(JSON.stringify(n.own),before);
});
test('Wardrobe stops before main when a WM dialog is open, and preserves the other lock',()=>{
 const marker=wardrobe.indexOf('// TEST_ENTRY_POINT:'),tail=wardrobe.slice(marker,wardrobe.lastIndexOf('})();'));
 let calls=0;const c=vm.createContext({g_matewWearablesStatus:1,main(){calls++;},TITLE:'Wardrobe',MessageBox:{warning(){calls++;}}});
 vm.runInContext('(function(){'+tail+'})()',c);assert.equal(calls,1);assert.equal(c.g_matewWearablesStatus,1);assert.equal(c.g_matewWardrobeSetsPrototypeBusy,undefined);
});
console.log(JSON.stringify({passed,failed:failures.length,nativeDAZ:false,failures},null,2));if(failures.length)process.exitCode=1;
