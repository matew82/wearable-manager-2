// Desired recovery behavior, exercised against unchanged OR proposed sources.
// Usage: node storage-regressions.cjs --sourceRoot <folder> [--expect before|after]
// No DAZ or actual filesystem snapshots. Results are written only beside this harness.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {files,getFunction}=require('../support/extract.cjs');
const args=process.argv.slice(2),root=args.includes('--sourceRoot')?path.resolve(args[args.indexOf('--sourceRoot')+1]):path.resolve(__dirname,'../..');
const expect=args.includes('--expect')?args[args.indexOf('--expect')+1]:'after';
class Settings {
  constructor(values={}){this.values={...values};}
  getStringValue(k,d){return k in this.values?this.values[k]:d;}
  setStringValue(k,v){this.values[k]=v;} setBoolValue(k,v){this.values[k]=v;}
  removeValue(k){delete this.values[k];} getNumValues(){return Object.keys(this.values).length;}
}
class Node {
  constructor(name,classes=[],values={}){this.name=name;this.classes=classes;this.children=[];this.parent=null;this.settings=new Settings(values);this.hasData=!!Object.keys(values).length;this.follow=null;this.collision=null;this.data={getSettings:()=>this.settings,getOwner:()=>this};}
  getLabel(){return this.name;} inherits(c){return this.classes.includes(c);}
  getNodeChildren(recursive){return this.children.flatMap(c=>[c,...(recursive?c.getNodeChildren(true):[])]);}
  addNodeChild(n){if(n.parent)n.parent.children=n.parent.children.filter(v=>v!==n);n.parent=this;this.children.push(n);}
  getNodeParent(){return this.parent;} findNodeChild(n,recursive){return this.getNodeChildren(!!recursive).find(v=>v.name===n)||null;}
  findDataItem(){return this.hasData?this.data:null;} addDataItem(d){this.data=d;d.getOwner=()=>this;this.settings=d.getSettings();this.hasData=true;}
  removeDataItem(){this.hasData=false;} getFollowTarget(){return this.follow;}
  setFollowTarget(v){this.follow=v;if(v)this.collision=v;}
}
function material(name,props=0){const uv={value:name+'-uv',getStringValue(){return this.value;},setValueFromString(v){if(this.fail)return false;if(!this.ignore)this.value=v;return true;}};return{name,properties:Array.from({length:props},(_,i)=>['prop'+i,'Value','Image']),getUVSetControl:()=>uv};}
function fixture(src){
  const log={errors:[],saveCalls:[],opened:[],selection:[],deleted:[],removed:[],undo:[],options:[]};
  const disk=new Set(),empty=new Set(),unreadable=new Set(),nodes=[];
  const c={DATA_ITEM_NAME:'MatewWearables',SETTINGS_FILE_NAME:'FileName',SETTINGS_UVS:'UV',SETTINGS_TARGET:'Target',SETTINGS_COLLISION_ITEM:'Collision_Item',ARRAY_SEPARATOR:',,',PATH_TEMP:'/mock/matew/',
    log,disk,empty,unreadable,nodes,saveError:0,openResult:true,serial:0,emptyAfterSave:false,bWM2UndoOpen:false,
    print(){},processEvents(){},beginUndo(){log.undo.push('begin');},cancelUndo(){log.undo.push('cancel');},acceptUndo(){log.undo.push('accept');},SetStatusFinished(){},
    beginNodeSelectionHold(){log.selection.push('hold');},restoreNodeSelectionHold(){log.selection.push('restore');},
    MessageBox:{critical(m){log.errors.push(m);}},
    DzFile:function(p){this.exists=()=>disk.has(p);this.refresh=()=>{};this.isFile=()=>disk.has(p);this.size=()=>disk.has(p)&&!empty.has(p)?12:0;this.open=()=>disk.has(p)&&!unreadable.has(p);this.close=()=>{};this.remove=()=>{log.deleted.push(p);disk.delete(p);};this.deleteLater=()=>{};},
    DzFileIOSettings:Settings,DzSimpleElementData:function(){const s=new Settings();this.getSettings=()=>s;},
    DzSceneHelper:function(){return{findPropertyByInternalName:(_,n)=>({getValue:()=>n.collision,setValue:v=>n.collision=v})};},
    Scene:{getNodeList:()=>nodes,findNodeByLabel:n=>nodes.find(v=>v.name===n)||null,selectAllNodes(){},setPrimarySelection(){},getPrimarySelection:()=>({getLabel:()=>'selected'}),removeNode(n){log.removed.push(n.name);if(n.parent)n.parent.children=n.parent.children.filter(v=>v!==n);}},
    App:{getContentMgr:()=>({openFile:p=>{log.opened.push(p);return c.openResult;}}),getAssetIOMgr:()=>({findAssetFilterIndex:()=>0,getAssetFilter:()=>({getDefaultOptions(){},getOptions:()=>true,deleteLater(){}}),doSaveWithOptions:(_f,_s,_a,p)=>{log.saveCalls.push(p);if(c.saveError===0){disk.add(p+'.duf');if(c.emptyAfterSave)empty.add(p+'.duf');}return c.saveError;}})},
    GenerateUniqueGroupFileName:()=> 'candidate'+(++c.serial),
    GetExtraMaterialsArray:shape=>shape.getAllMaterials(),GetHumanFigureMaterialsNames:()=>[],getElementProperties:m=>m.properties||[],getPropertyEntry:p=>p,
    setMaterialPropertyOptions:(_s,name,props)=>log.options.push({name,props:props.map(p=>p.slice())}),
    setCommonMaterialPropertyOptions:(_s,names,props)=>names.forEach(name=>log.options.push({name,props:props.map(p=>p.slice())})),
    WM2GetNodeReferenceKeys:prefix=>[prefix,prefix+'_NodeID',prefix+'_Name',prefix+'_Label',prefix+'_Class'],
    WM2ResolveNodeReference:(settings,prefix)=>{const name=settings.getStringValue(prefix,'');const found=nodes.filter(n=>n.name===name);return found.length===1?{ok:true,node:found[0]}:{ok:false,status:'missing',message:'missing/ambiguous '+name};},
    WM2ResolveBoneProxy:(group,proxy,human)=>{if(!proxy.inherits('DzGroupNode')||!proxy.name.startsWith(group.name+'_'))return{ok:true,status:'not-proxy'};const bone=human.findNodeChild(proxy.name.slice(group.name.length+1),true);return bone?{ok:true,status:'resolved',node:bone}:{ok:false,status:'missing',message:'missing bone'};},
    WM2SceneContains:n=>!!n&&nodes.indexOf(n)>=0,
    WM2IsBoneOfFigure:(n,h)=>{if(!n||!n.inherits('DzBone'))return false;let p=n.parent;while(p){if(p===h)return true;p=p.parent;}return false;},
    WM2BackupDirectory:()=>'/mock/matew/',
  };
  c.WM2ReviewAndAdoptLegacyProxy=(g,p,h)=>c.WM2ResolveBoneProxy(g,p,h);
  c.DzFile.ReadOnly=1;vm.createContext(c);
  const wanted=['RemoveQueueClass','SaveShellMaterialsInFile','AddStringDataToNodeEx','GetSerializedUVs','RestoreMaterialsFromFile','RestoreNodeFollowTarget','RestoreCollisionItem','ReturnWearable','ReturnAllWearableToTheFigure','FilterSkeletons','FilterShells','err','GetListOfSkeletonsFromMoveToFigurePairs',
    'WM2BeginUndo','WM2AcceptUndo','WM2CancelUndo','WM2SnapshotPath',
    'WM2ReadableBackup','WM2CheckPendingShellSnapshot','WM2SaveShellSnapshots','WM2CheckShellSnapshots','WM2CheckShellUVMaterials','WM2QueueReferenceRemoval','WM2RestoreNodeState','WM2RestoreWearablePairs','WM2RemoveEmptyStorageGroup'];
  for(const name of wanted){try{const f=getFunction(src,name);vm.runInContext(f.text,c);}catch(e){if(!String(e).includes('Missing function '))throw e;}}
  c.oRemoveQueue=new c.RemoveQueueClass();
  c.makeNode=(name,classes=[],values={})=>{const n=new Node(name,classes,values);nodes.push(n);return n;};
  c.makeShell=(values={},mats=[])=>{const n=c.makeNode('shell',['DzGeometryShellNode'],values);n.materials=mats;n.getObject=()=>({getCurrentShape:()=>({getAllMaterials:()=>n.materials,findMaterial:name=>n.materials.find(v=>v.name===name)||null})});return n;};
  return c;
}
const commonTests={
  'sparse reference keys removed before native owner disposal':c=>{const n=c.makeNode('legacy',['DzSkeleton'],{Target:'human'});let alive=true,disposals=0;const origRemove=n.settings.removeValue.bind(n.settings);n.settings.removeValue=k=>{assert(alive,'settings accessed after owner disposed');origRemove(k);};n.removeDataItem=()=>{assert(alive,'owner disposed twice');alive=false;disposals++;};for(const k of ['Target','Target_NodeID','Target_Name','Target_Label','Target_Class'])c.oRemoveQueue.AddDataToQueue(n.data,n.settings,k);c.oRemoveQueue.Finalize();assert.equal(disposals,1);assert.equal(alive,false);},
  'durable backup path loaded and acknowledged without file deletion':c=>{const saved='/persistent/full.duf',n=c.makeShell({FileName:'legacy-name',BackupPath:saved,UV:''});c.disk.add(saved);const r=c.RestoreMaterialsFromFile(n);c.oRemoveQueue.Finalize();assert.deepEqual(c.log.opened,[saved]);assert.deepEqual(n.settings.values,{});assert(c.disk.has(saved));assert.equal(r,true);},
  'missing durable backup does not fall back to legacy temporary file':c=>{const saved='/persistent/missing.duf',n=c.makeShell({FileName:'legacy-name',BackupPath:saved,UV:''});c.disk.add('/mock/matew/legacy-name.duf');const r=c.RestoreMaterialsFromFile(n);c.oRemoveQueue.Finalize();assert.equal(c.log.opened.length,0);assert.equal(n.settings.values.FileName,'legacy-name');assert.equal(n.settings.values.BackupPath,saved);assert.equal(r,false);},
  'successful save publishes durable BackupPath only after verification':c=>{const n=c.makeShell({},[material('graft')]);const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.equal(n.settings.values.BackupPath,'/mock/matew/candidate1.duf');assert(c.disk.has(n.settings.values.BackupPath));assert.equal(r,true);},
  'empty successful-save candidate publishes no metadata':c=>{const n=c.makeShell({},[material('graft')]);c.emptyAfterSave=true;const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.deepEqual(n.settings.values,{});assert.equal(r,false);},
  'unreadable pending original fails closed':c=>{const n=c.makeShell({FileName:'original',UV:'graft,,graft-uv'},[material('graft')]);c.disk.add('/mock/matew/original.duf');c.unreadable.add('/mock/matew/original.duf');const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.equal(n.settings.values.FileName,'original');assert.equal(c.log.saveCalls.length,0);assert.equal(r,false);},
  'UV setter false keeps recovery pending':c=>{const m=material('graft');m.getUVSetControl().fail=true;const n=c.makeShell({FileName:'original',UV:'graft,,target-uv'},[m]);c.disk.add('/mock/matew/original.duf');const r=c.RestoreMaterialsFromFile(n);c.oRemoveQueue.Finalize();assert.equal(n.settings.values.FileName,'original');assert.equal(r,false);},
  'UV setter success with mismatched readback stays pending':c=>{const m=material('graft');m.getUVSetControl().ignore=true;const n=c.makeShell({FileName:'original',UV:'graft,,target-uv'},[m]);c.disk.add('/mock/matew/original.duf');const r=c.RestoreMaterialsFromFile(n);c.oRemoveQueue.Finalize();assert.equal(n.settings.values.FileName,'original');assert.equal(r,false);},
  'failed save publishes no metadata':c=>{const n=c.makeShell({},[material('graft')]);c.saveError=1;const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.deepEqual(n.settings.values,{});assert.equal(c.log.saveCalls.length,1);assert.equal(r,false);},
  'pending original snapshot retained across later removal':c=>{const n=c.makeShell({FileName:'original',UV:'graftA,,graftA-uv,,graftB,,graftB-uv'},[material('graftB')]);c.disk.add('/mock/matew/original.duf');const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.equal(n.settings.values.FileName,'original');assert.equal(n.settings.values.UV,'graftA,,graftA-uv,,graftB,,graftB-uv');assert.equal(c.log.saveCalls.length,0);assert.equal(r,true);},
  'new surface while snapshot pending fails closed':c=>{const n=c.makeShell({FileName:'original',UV:'graftA,,graftA-uv'},[material('graftA'),material('newGraft')]);c.disk.add('/mock/matew/original.duf');const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.equal(n.settings.values.FileName,'original');assert.equal(c.log.saveCalls.length,0);assert.equal(r,false);},
  'changed UV while snapshot pending fails closed':c=>{const m=material('graftA');m.getUVSetControl().value='edited-uv';const n=c.makeShell({FileName:'original',UV:'graftA,,graftA-uv'},[m]);c.disk.add('/mock/matew/original.duf');const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.equal(n.settings.values.FileName,'original');assert.equal(c.log.saveCalls.length,0);assert.equal(r,false);},
  'missing material snapshot stays pending':c=>{const n=c.makeShell({FileName:'original',UV:'graft,,graft-uv'},[material('graft')]);const r=c.RestoreMaterialsFromFile(n);c.oRemoveQueue.Finalize();assert.equal(n.settings.values.FileName,'original');assert.equal(n.settings.values.UV,'graft,,graft-uv');assert.equal(r,false);},
  'preset open failure preserves snapshot and selection':c=>{const n=c.makeShell({FileName:'original',UV:''});c.disk.add('/mock/matew/original.duf');c.openResult=false;const r=c.RestoreMaterialsFromFile(n);c.oRemoveQueue.Finalize();assert.equal(n.settings.values.FileName,'original');assert(c.disk.has('/mock/matew/original.duf'));assert.deepEqual(c.log.selection,['hold','restore']);assert.equal(r,false);},
  'successful restore retains physical sidecar for Undo':c=>{const n=c.makeShell({FileName:'original',UV:''});c.disk.add('/mock/matew/original.duf');assert.equal(c.RestoreMaterialsFromFile(n),true);c.oRemoveQueue.Finalize();assert(c.disk.has('/mock/matew/original.duf'));assert.equal(c.log.deleted.length,0);assert(!('FileName' in n.settings.values));},
  'stored target and follower restored parent-first':c=>{const h=c.makeNode('Genesis9',['DzFigure']),g=c.makeNode('group',['DzGroupNode']),a=c.makeNode('A',['DzSkeleton']),b=c.makeNode('B',['DzSkeleton'],{Target:'A'});g.addNodeChild(a);g.addNodeChild(b);c.GetBelongingsGroup=()=>g;c.GetAllShells=()=>[];const r=c.ReturnAllWearableToTheFigure(h);assert.equal(b.follow,a);assert.equal(a.parent,h);assert(!('Target' in b.settings.values));assert.equal(r,true);},
  'missing collider retains its recovery record':c=>{const n=c.makeNode('wearable',['DzSkeleton'],{Collision_Item:'missing'});const r=c.RestoreCollisionItem(n);c.oRemoveQueue.Finalize();assert.equal(n.settings.values.Collision_Item,'missing');assert.equal(r,false);},
  'missing bone retains storage group':c=>{const h=c.makeNode('Genesis9',['DzFigure']),g=c.makeNode('group',['DzGroupNode']),proxy=c.makeNode('group_missingBone',['DzGroupNode']),n=c.makeNode('prop');g.addNodeChild(proxy);proxy.addNodeChild(n);c.GetBelongingsGroup=()=>g;c.GetAllShells=()=>[];const r=c.ReturnAllWearableToTheFigure(h);assert(!c.log.removed.includes('group'));assert.equal(n.parent,proxy);assert.equal(r,false);},
  'missing snapshot rejected before any restore mutation':c=>{const h=c.makeNode('Genesis9',['DzFigure']),g=c.makeNode('group',['DzGroupNode']),shell=c.makeShell({FileName:'missing',UV:''});g.addNodeChild(shell);c.GetBelongingsGroup=()=>g;c.GetAllShells=()=>[shell];const r=c.ReturnAllWearableToTheFigure(h);assert.equal(shell.parent,g);assert.equal(c.log.undo.length,0);assert.equal(shell.settings.values.FileName,'missing');assert.equal(r,false);},
  'material property options scale linearly and preserve entries':c=>{const mats=[material('A',4),material('B',4),material('C',4)],n=c.makeShell({},mats);const r=c.SaveShellMaterialsInFile(c.makeNode('Genesis9'),n);assert.equal(c.log.options.reduce((s,v)=>s+v.props.length,0),12);assert.deepEqual(c.log.options.map(v=>v.name),['A','B','C']);for(const v of c.log.options){assert.equal(v.props.length,4);assert.deepEqual(v.props[0],['prop0','Value','Image']);}assert.equal(r,true);},
  'all required save snapshots checked before first movement':(c,src,file)=>{
    if(!file.includes('Take Off')&&!file.includes('Put On'))return {skip:true};
    const h=c.makeNode('Genesis9',['DzFigure']),g=c.makeNode('group',['DzGroupNode']),shell=c.makeShell({},[material('graft')]);h.addNodeChild(shell);
    c.oHumanFigure=h;c.bReturnBelongings=false;c.bUseTransferMark=false;c.GetBelongingsGroup=()=>g;c.GetDefaultTransferExemptionsList=()=>[];c.FilterParentedToHumanFigureAndNotAnExemption=()=>true;
    c.SetStatusBusy=()=>{};c.saveError=1;let moves=0;c.PlaceWearableIntoGroup=()=>moves++;
    const start=src.indexOf('\n\tSetStatusBusy();'),end=src.indexOf('\n\t/*-----------------------------------------------------------------*\\',start);
    assert(start>=0&&end>start);vm.runInContext('(function(){'+src.slice(start,end)+'})()',c);assert.equal(moves,0);
  },
};
function selectiveBody(src,file){const m=/^([ \t]*)var arrMoveToFigurePairs = arrAll\[1\];/m.exec(src);assert(m);const ending=/(?:WM2AcceptUndo|acceptUndo)\("matew's Wearables - Move Wearables"\);/g;ending.lastIndex=m.index;const end=ending.exec(src);assert(end,'selective owned Undo boundary present');return src.slice(m.index,end.index);}
const selectiveTests={
  'selective return restores saved nonhuman collider':(c,src,file)=>{const h=c.makeNode('Genesis9',['DzFigure']),g=c.makeNode('group',['DzGroupNode']),coll=c.makeNode('collider'),n=c.makeNode('wearable',['DzSkeleton'],{Target:'Genesis9',Collision_Item:'collider'});g.addNodeChild(n);c.initialGroup=g;c.oHumanFigure=h;c.arrAll=[[],[[n,h]]];c.arrShells=[];c.oWearablesManager={HasWearablesInGroup:()=>false};vm.runInContext('(function(){var oGroup=initialGroup;'+selectiveBody(src,file)+'})()',c);assert.equal(n.collision,coll);assert(!('Collision_Item' in n.settings.values));},
  'selective failure has no restore-all fallback and clears queue':(c,src,file)=>{const h=c.makeNode('Genesis9',['DzFigure']),g=c.makeNode('group',['DzGroupNode']),n=c.makeNode('wearable',['DzSkeleton']),shell=c.makeShell({FileName:'original',UV:''});g.addNodeChild(n);c.disk.add('/mock/matew/original.duf');c.initialGroup=g;c.oHumanFigure=h;c.arrAll=[[],[[n,h]]];c.arrShells=[shell];c.oWearablesManager={HasWearablesInGroup:()=>false};let fallback=0;c.ReturnAllWearableToTheFigure=()=>fallback++;c.RestoreMaterialsFromFile=node=>{c.oRemoveQueue.AddDataToQueue(node.data,node.settings,'FileName');return false;};if(typeof c.WM2CancelUndo==='function')c.bWM2UndoOpen=true;vm.runInContext('(function(){var oGroup=initialGroup;'+selectiveBody(src,file)+'})()',c);assert.equal(fallback,0);assert.equal(c.oRemoveQueue.arrDataSettingsItems.length,0);assert.deepEqual(c.log.undo,['cancel']);assert.equal(c.bWM2UndoOpen,false);},
};
const results=[];
for(const file of files){const src=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');const tests={...commonTests,...((file.includes('Full')||file.includes('Menu'))?selectiveTests:{})};for(const [name,test]of Object.entries(tests)){try{const value=test(fixture(src),src,file);results.push({file,name,status:value?.skip?'SKIP':'PASS'});}catch(e){results.push({file,name,status:'FAIL',error:String(e.message)});}}}
const report={proposalOnly:false,nativeDAZUsed:false,sourceRoot:root,expect,total:results.length,pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length,skip:results.filter(r=>r.status==='SKIP').length,results,dependencyMocks:['WM2ResolveNodeReference + WM2ResolveBoneProxy deterministic scene fixtures','WM2ReviewAndAdoptLegacyProxy delegates bone fixture without UI','WM2SceneContains + WM2IsBoneOfFigure deterministic live-node checks','WM2BackupDirectory returns mock PATH_TEMP; actual WM2SnapshotPath tested','actual source WM2BeginUndo/AcceptUndo/CancelUndo evaluated with invocation flag'],limitations:['Scene cancelUndo rollback/data-item native recording are not modeled','Graph stable-reference helpers are deterministic fixture stubs; their independent graph suite must pass','No DAZ4/6/native API behavior exercised','No physical snapshot filesystem touched']};
fs.writeFileSync(path.join(root,'.test-output/storage-'+expect+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({sourceRoot:root,total:report.total,pass:report.pass,fail:report.fail,skip:report.skip,failures:results.filter(r=>r.status==='FAIL')}));
if(expect==='after'&&report.fail)process.exitCode=1;
if(expect==='before'&&!report.fail)process.exitCode=1;
