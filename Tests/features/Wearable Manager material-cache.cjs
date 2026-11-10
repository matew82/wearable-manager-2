'use strict';
// Actual-source functions against a synthetic in-memory filesystem. No DAZ,
// user cache, scene, installed configuration or real file deletion is used.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../../Wearable Manager Wardrobe.dsa'),'utf8');
new vm.Script(source);
const names=[...source.matchAll(/function (wm2MaterialCache\w+)\(/g)].map(x=>x[1]);
let passed=0;const failures=[];
function test(name,fn){try{fn();passed++;}catch(e){failures.push({name,error:e.stack});}}
function fixture(){
 const appdata='C:/appdata',root=appdata+'/matew/WearablesManager/Backups',entries=new Map(),deleted=[],messages=[];
 const norm=p=>String(p).replace(/\\/g,'/').replace(/\/+$/,'');
 function add(p,entry){entries.set(norm(p),{readable:true,...entry});return entry;}
 function folder(p){add(p,{dir:true});}
 for(const p of [appdata,appdata+'/matew',appdata+'/matew/WearablesManager',root])folder(p);
 const state={nodes:[],answer:0,onWarning:null,beforeRemove:null,entryHook:null,scanHook:null};
 class Info {
  constructor(p){this.path=norm(p);}
  row(){return entries.get(this.path);}
  exists(){return !!this.row()&&!this.row().broken;}
  isSymLink(){return !!this.row()?.link;}
  isDir(){return !!this.row()?.dir;}
  isFile(){return !!this.row()&&!this.row().dir&&!this.row().special;}
  isReadable(){return this.row()?.readable!==false;}
  canonicalFilePath(){return this.row()?.canonical===undefined?this.path:this.row().canonical;}
  absoluteFilePath(){return this.path;}
  size(){return this.row()?.bytes??0;}
  deleteLater(){}
 }
 class Dir extends Info {
  entryList(){
   if(state.entryHook)state.entryHook(this.path);
   const list=[...entries.keys()].filter(p=>p.startsWith(this.path+'/')&&!p.slice(this.path.length+1).includes('/')).map(p=>p.slice(this.path.length+1));
   return this.row()?.names??list;
  }
  rmdir(){if(this.row()?.removeFail||this.entryList().length)return false;deleted.push(this.path);entries.delete(this.path);return true;}
 }
 Object.assign(Dir,{AllEntries:1,Hidden:2,System:4,NoDotAndDotDot:8,Name:16});
 class File extends Info {
  remove(){
   if(state.beforeRemove)state.beforeRemove(this.path);
   if(this.row()?.removeThrow)throw Error('I/O error');
   if(this.row()?.removeFail)return false;
   deleted.push(this.path);if(!this.row()?.lie)entries.delete(this.path);return true;
  }
 }
 const c=vm.createContext({App:{getAppDataPath:()=>appdata},DzFileInfo:Info,DzDir:Dir,DzFile:File,DzSettings:{StringValue:3},Scene:{getNodeList:()=>state.nodes},
  TITLE:'WM2',own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),errorText:String,
  readDataNative:n=>{if(n.badOwn)throw Error('bad authoritative metadata');return n.own??null;},
  geoWardrobeManifestPath:p=>{if(!/^Materials\/matew_geo_wardrobe_[a-zA-Z0-9_]+\.json$/.test(p))throw Error('invalid manifest');return p;},
  MessageBox:{warning(...args){messages.push(args);if(args.length===4){if(state.onWarning)state.onWarning();return state.answer;}return 0;}},
  pathExists:p=>entries.has(norm(p)),safeRelative:r=>{if(!r||/[\\:\x00-\x1f]/.test(r)||r.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('unsafe relative');return r;}
 });
 for(const name of names)vm.runInContext(getFunction(source,name).text,c);
 function file(rel,bytes=100,extra={}){add(root+'/'+rel,{bytes,...extra});}
 function node(values={},extra={}){
  const keys=Object.keys(values),settings={hasKey:k=>keys.indexOf(k),getValueType:i=>typeof values[keys[i]]==='string'?3:1,getStringValue:(k,d)=>Object.hasOwn(values,k)?values[k]:d};
  return {findDataItem:k=>k==='MatewWearables'&&keys.length?{getSettings:()=>settings}:null,...extra};
 }
 const button={enabled:true,text:''};
 return {c,entries,root,deleted,messages,state,file,folder,node,button,scan:()=>c.wm2MaterialCacheScan(),clear:()=>c.wm2MaterialCacheClear(button)};
}
test('empty cache disabled; root retained',()=>{const f=fixture();f.c.wm2MaterialCacheButtonState(f.button);assert.equal(f.button.text,'Cache empty');assert.equal(f.button.enabled,false);f.clear();assert.equal(f.messages.length,0);assert(f.entries.has(f.root));});
test('absent cache is empty without directory creation',()=>{const f=fixture();f.entries.delete(f.root);assert.equal(f.scan().files.length,0);assert(!f.entries.has(f.root));});
test('missing ancestor is empty without creation',()=>{const f=fixture();for(const p of [...f.entries.keys()])if(p.includes('/matew'))f.entries.delete(p);assert.equal(f.scan().bytes,0);assert.equal(f.entries.size,1);});
test('MB count includes nested hidden/system and zero-byte files',()=>{const f=fixture();f.file('a.duf',1200000);f.folder(f.root+'/sub');f.file('sub/.hidden',340000);f.file('zero',0);assert.equal(f.scan().bytes,1540000);f.c.wm2MaterialCacheButtonState(f.button);assert.equal(f.button.text,'Clear cache (1.54 MB)');});
test('zero-byte file remains actionable',()=>{const f=fixture();f.file('empty',0);f.c.wm2MaterialCacheButtonState(f.button);assert.equal(f.button.enabled,true);assert.equal(f.button.text,'Clear cache (0.00 MB)');});
test('empty nested directory remains actionable',()=>{const f=fixture();f.folder(f.root+'/sub');f.c.wm2MaterialCacheButtonState(f.button);assert(f.button.enabled);});
for(const field of ['FileName','BackupPath','UV'])test('pending '+field+' anywhere in scene blocks before confirmation',()=>{const f=fixture();f.file('a');f.state.nodes=[f.node(),f.node({[field]:'pending'})];f.state.answer=1;f.clear();assert.equal(f.deleted.length,0);assert.equal(f.messages.length,1);assert.match(f.messages[0][0],/Return all affected items/);assert.equal(f.messages[0].length,3);});
test('unrelated legacy metadata does not block',()=>{const f=fixture();f.file('a');f.state.nodes=[f.node({Root:'x',Transfer:'yes'})];f.state.answer=1;f.clear();assert.equal(f.button.text,'Cache empty');});
test('empty recovery fields do not block',()=>{const f=fixture();f.state.nodes=[f.node({FileName:'',BackupPath:'',UV:''})];assert.equal(f.c.wm2MaterialCachePending(),0);});
test('malformed recovery field at index zero fails closed',()=>{const f=fixture();f.file('a');f.state.nodes=[f.node({FileName:12})];f.state.answer=1;f.clear();assert.equal(f.deleted.length,0);assert.match(f.messages[0][0],/Invalid Wearables/);});
test('unreadable recovery settings block',()=>{const f=fixture();f.file('a');f.state.nodes=[f.node({}, {findDataItem:()=>({getSettings:()=>null})})];f.state.answer=1;f.clear();assert.equal(f.deleted.length,0);assert.match(f.messages[0][0],/Unreadable/);});
test('unreadable current scene fails closed',()=>{const f=fixture();f.file('a');f.state.nodes=null;f.state.answer=1;f.clear();assert.equal(f.deleted.length,0);});
for(const length of [NaN,1.5,Infinity,-1,200001])test('invalid scene list length '+length+' blocks',()=>{const f=fixture();f.file('a');f.state.nodes={length};f.state.answer=1;f.clear();assert.equal(f.deleted.length,0);assert.match(f.messages[0][0],/could not be checked/);});
test('pending Wardrobe material recovery also blocks',()=>{const f=fixture();f.state.nodes=[f.node({}, {own:{GeoWardrobeSnapshot:JSON.stringify({schemaVersion:1,path:'Materials/matew_geo_wardrobe_x.json',pending:[0]})}})];assert.equal(f.c.wm2MaterialCachePending(),1);});
test('consumed Wardrobe pointer does not block',()=>{const f=fixture();f.state.nodes=[f.node({}, {own:{GeoWardrobeSnapshot:JSON.stringify({schemaVersion:1,path:'Materials/matew_geo_wardrobe_x.json',pending:[]})}})];assert.equal(f.c.wm2MaterialCachePending(),0);});
test('invalid Wardrobe metadata fails closed',()=>{const f=fixture();f.file('a');f.state.nodes=[f.node({}, {own:{GeoWardrobeSnapshot:'{bad'}})];f.state.answer=1;f.clear();assert.equal(f.deleted.length,0);});
test('authoritative clear is not replaced by stale legacy data',()=>{const f=fixture();f.state.nodes=[f.node({}, {own:null,legacy:{GeoWardrobeSnapshot:'stale'}})];assert.equal(f.c.wm2MaterialCachePending(),0);});
for(const answer of [0,-1,undefined])test('Cancel/close/unknown response '+answer+' never deletes',()=>{const f=fixture();f.file('a');f.state.answer=answer;f.clear();assert.equal(f.deleted.length,0);assert.equal(f.button.enabled,true);assert.equal(f.button.wm2CacheBusy,false);});
test('confirmation defaults to Cancel and warns all scenes plus Undo',()=>{const f=fixture();f.file('a');f.clear();const m=f.messages[0];assert.equal(m[2],'&Cancel');assert.equal(m[3],'&Clear Cache');for(const text of ['ALL items in ALL scenes','saved scenes that are not open','Only the current scene','Undo/Redo','permanent material loss','cannot be undone',f.root])assert(m[0].includes(text),text);});
test('confirmed clear removes contents, not root or external material presets',()=>{const f=fixture();f.file('a');f.folder(f.root+'/sub');f.file('sub/b');f.entries.set('C:/library/Materials/material.duf',{bytes:200});f.state.answer=1;f.clear();assert.equal(f.button.text,'Cache empty');assert.equal(f.button.enabled,false);assert(f.entries.has(f.root));assert(f.entries.has('C:/library/Materials/material.duf'));assert.equal(f.deleted.length,3);});
test('repeat clear after empty is harmless',()=>{const f=fixture();f.file('a');f.state.answer=1;f.clear();f.clear();assert.equal(f.deleted.length,1);assert.equal(f.messages.length,1);});
test('reentrant click while confirmation open is ignored',()=>{const f=fixture();f.file('a');f.state.answer=1;f.state.onWarning=()=>f.clear();f.clear();assert.equal(f.deleted.length,1);assert.equal(f.messages.length,1);});
test('new pending materials during confirmation prevent deletion',()=>{const f=fixture();f.file('a');f.state.answer=1;f.state.onWarning=()=>{f.state.nodes=[f.node({FileName:'now pending'})];};f.clear();assert.equal(f.deleted.length,0);assert.equal(f.messages.length,2);});
test('cache contents changed during confirmation prevent deletion',()=>{const f=fixture();f.file('a');f.state.answer=1;f.state.onWarning=()=>f.file('b');f.clear();assert.equal(f.deleted.length,0);assert.match(f.messages[1][0],/cache changed/);});
test('cache byte size changed during confirmation prevents deletion',()=>{const f=fixture();f.file('a');f.state.answer=1;f.state.onWarning=()=>f.file('a',200);f.clear();assert.equal(f.deleted.length,0);});
for(const relative of ['', '/sub'])test('linked root/nested directory rejected '+relative,()=>{const f=fixture();if(relative)f.folder(f.root+relative);f.entries.get(f.root+relative).link=true;assert.throws(f.scan,/Linked/);});
test('linked ancestor rejected',()=>{const f=fixture();f.entries.get('C:/appdata/matew').link=true;assert.throws(f.scan,/Linked/);});
test('junction-like canonical redirect rejected without symlink flag',()=>{const f=fixture();f.entries.get(f.root).canonical='C:/outside';assert.throws(f.scan,/redirected/);});
test('redirected appdata ancestor rejected',()=>{const f=fixture();f.entries.get('C:/appdata').canonical='C:/outside';assert.throws(f.scan,/redirected/);});
test('symlink file does not follow target',()=>{const f=fixture();f.file('link',50,{link:true,canonical:'C:/outside/x'});assert.throws(f.scan,/Linked/);assert.equal(f.deleted.length,0);});
test('dangling symlink rejected even if exists false',()=>{const f=fixture();f.file('link',0,{link:true,broken:true});assert.throws(f.scan,/Linked/);});
test('missing canonical API data rejected',()=>{const f=fixture();f.file('bad',10,{canonical:''});assert.throws(f.scan,/cannot be verified/);});
test('unreadable nested folder disables instead of showing empty',()=>{const f=fixture();f.folder(f.root+'/sub');f.entries.get(f.root+'/sub').readable=false;f.c.wm2MaterialCacheButtonState(f.button);assert.equal(f.button.text,'Cache unavailable');assert.equal(f.button.enabled,false);});
test('special file refused',()=>{const f=fixture();f.file('socket',0,{special:true});assert.throws(f.scan,/Unexpected/);});
for(const name of ['../escape','C:/escape','a\\b','..'])test('unsafe listed name rejected '+name,()=>{const f=fixture();f.entries.get(f.root).names=[name];assert.throws(f.scan,/Unsafe|unsafe/);});
test('invalid size fails closed',()=>{const f=fixture();f.file('a',NaN);assert.throws(f.scan,/Invalid cache file size/);});
test('excess depth fails closed',()=>{const f=fixture();let p=f.root;for(let i=0;i<66;i++){p+='/d';f.folder(p);}assert.throws(f.scan,/nested folders/);});
test('partial removal keeps button active and reports actual remaining bytes',()=>{const f=fixture();f.file('a',100);f.file('locked',2000000,{removeFail:true});f.state.answer=1;f.clear();assert.deepEqual(f.deleted,[f.root+'/a']);assert.equal(f.button.text,'Clear cache (2.00 MB)');assert.equal(f.button.enabled,true);assert.match(f.messages[1][0],/incomplete.*1 file/);});
test('thrown delete error still refreshes button',()=>{const f=fixture();f.file('a',100,{removeThrow:true});f.state.answer=1;f.clear();assert.equal(f.button.enabled,true);assert.equal(f.button.wm2CacheBusy,false);assert.match(f.messages[1][0],/I\/O error/);});
test('false successful remove does not report empty',()=>{const f=fixture();f.file('a',100,{lie:true});f.state.answer=1;f.clear();assert.equal(f.button.enabled,true);assert.match(f.messages[1][0],/could not be verified/);});
test('new file while deleting kept and warned',()=>{const f=fixture();f.file('a');f.state.beforeRemove=()=>f.file('new',100);f.state.answer=1;f.clear();assert(f.entries.has(f.root+'/new'));assert.equal(f.button.enabled,true);assert.match(f.messages[1][0],/incomplete/);});
test('nested nonempty folder after failure is kept',()=>{const f=fixture();f.folder(f.root+'/sub');f.file('sub/a',100,{removeFail:true});f.state.answer=1;f.clear();assert(f.entries.has(f.root+'/sub'));assert.equal(f.deleted.length,0);});
test('directory removal failure remains actionable',()=>{const f=fixture();f.folder(f.root+'/sub');f.entries.get(f.root+'/sub').removeFail=true;f.state.answer=1;f.clear();assert(f.button.enabled);assert.match(f.messages[1][0],/incomplete/);});
test('post-confirm root redirect detected before delete',()=>{const f=fixture();f.file('a');f.state.answer=1;f.state.onWarning=()=>{f.entries.get(f.root).canonical='C:/outside';};f.clear();assert.equal(f.deleted.length,0);assert.equal(f.button.text,'Cache unavailable');});
test('guard revalidates ancestor before every later removal',()=>{const f=fixture();f.file('a');f.file('b');f.state.beforeRemove=()=>{f.entries.get('C:/appdata/matew').link=true;};f.state.answer=1;f.clear();assert.equal(f.deleted.length,1);assert(f.entries.has(f.root+'/b'));});
test('button is after GeoShell recovery and participates in automatic height',()=>{const ui=getFunction(source,'settingsDialog').text;assert(ui.indexOf('var materialCacheButton')>ui.indexOf('geoRecovery=flag("GeoShell Material Recovery"'));assert(ui.includes('settingsWidget(materialCacheButton,36)'));assert(ui.includes('background-color: #C87924'));assert(ui.includes('materialCacheButton.autoDefault=false'));assert(ui.includes('wm2MaterialCacheClear(materialCacheButton)'));assert(!ui.includes('debugOnly.push(materialCacheButton)'));});
test('delete function never invokes library cleanup, scene writes or recursive delete',()=>{const body=getFunction(source,'wm2MaterialCacheDeleteContents').text;for(const forbidden of ['inLibrary(', 'cleanupTemporaryMaterialPreset(', 'processEvents(', 'removeRecursively(', 'putData(', 'removeValue('])assert(!body.includes(forbidden));});
console.log(JSON.stringify({passed,failed:failures.length,failures,nativeDAZ:false,filesystem:'synthetic in-memory only'},null,2));if(failures.length)process.exitCode=1;
