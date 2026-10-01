// Combined actual graph + storage functions; mocked DAZ objects/I/O/Undo, no native DAZ.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {getFunction,files}=require('./support/extract.cjs');
const argv=process.argv.slice(2);
const sourceArg=argv.indexOf('--source-root');
const root=path.resolve(sourceArg<0?path.join(__dirname,'..'):argv[sourceArg+1]);
function world(source) {
  const state={nodes:[],disk:new Map(),dirs:new Set(),errors:[],warnings:[],undo:[],opened:[],removed:[],deleted:[],saveError:0,openResult:true,answer:0};
  class Settings {
    constructor(v={}){this.values={...v};}
    getStringValue(k,d){return k in this.values?this.values[k]:d;}
    setStringValue(k,v){this.values[k]=v;}setBoolValue(k,v){this.values[k]=v;}
    removeValue(k){delete this.values[k];}getNumValues(){return Object.keys(this.values).length;}
  }
  function Data(k){this.key=k;this.settings=new Settings();this.getSettings=()=>this.settings;this.getOwner=()=>this.owner;}
  class Node {
    constructor(name,type='DzNode',parent=null){this.name=this.objectName=name;this.type=type;this.label=name;this.parent=null;this.children=[];this.data={};this.elementID=state.nodes.length+1;this.follow=null;this.collider=null;this.shape=null;state.nodes.push(this);if(parent)parent.addNodeChild(this);}
    inherits(k){return this.type===k||(this.type==='DzFigure'&&k==='DzSkeleton');}className(){return this.type;}
    getLabel(){return this.label;}setName(n){this.name=this.objectName=n;}setLabel(n){this.label=n;}setVisible(v){this.visible=v;}
    getNodeParent(){return this.parent;}getNodeChildren(r){return r?this.children.flatMap(n=>[n,...n.getNodeChildren(true)]):this.children.slice();}
    addNodeChild(n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);n.parent=this;this.children.push(n);}
    findNodeChild(n,r){return this.getNodeChildren(!!r).find(c=>c.name===n)||null;}
    findDataItem(k){return this.data[k]||null;}addDataItem(d){d.owner=this;this.data[d.key]=d;}removeDataItem(d){delete this.data[d.key];}
    getFollowTarget(){return this.follow;}setFollowTarget(n){this.follow=n;if(n)this.collider=n;}
    getObject(){return this.shape?{getCurrentShape:()=>this.shape}:null;}
  }
  function capture(){return {nodes:state.nodes.slice(),items:state.nodes.map(n=>({n,parent:n.parent,children:n.children.slice(),follow:n.follow,collider:n.collider,data:Object.fromEntries(Object.entries(n.data).map(([k,d])=>[k,{d,values:{...d.settings.values}}]))}))};}
  let snapshot;
  const c={DATA_ITEM_NAME:'MatewWearables',SETTINGS_ID:'ID',SETTINGS_FILE_NAME:'FileName',SETTINGS_UVS:'UV',SETTINGS_TARGET:'Target',SETTINGS_COLLISION_ITEM:'Collision_Item',SETTIGNS_TRANSFER:'Transfer',VALUE_TRANSFER_YES:'Yes',VALUE_TRANSFER_NO:'No',ARRAY_SEPARATOR:',,',PATH_TEMP:'/legacy/matew/',bAltPressed:false,bTransferByDefault:true,bWM2UndoOpen:false,g_matewWearablesStatus:0,
    ARR_HUMAN_FIGURES_NAMES:JSON.parse(/var ARR_HUMAN_FIGURES_NAMES = (\[[^;]+\]);/.exec(source)[1]),
    App:{getAppDataPath:()=>'/durable/studio',getAssetIOMgr:()=>({findAssetFilterIndex:()=>0,getAssetFilter:()=>({getDefaultOptions(){},getOptions:()=>true,deleteLater(){}}),doSaveWithOptions:(_f,_o,_b,p)=>{if(state.saveError===0)state.disk.set(p+'.duf','valid-preset');return state.saveError;}}),getContentMgr:()=>({openFile:p=>{state.opened.push(p);return state.openResult;}})},
    Scene:{getNodeList:()=>state.nodes,addNode:n=>{if(!state.nodes.includes(n))state.nodes.push(n);},removeNode:n=>{state.removed.push(n.name);state.nodes=state.nodes.filter(x=>x!==n&&!n.getNodeChildren(true).includes(x));if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=null;},findNodeByLabel:l=>state.nodes.find(n=>n.label===l),selectAllNodes(){},setPrimarySelection(){}},
    DzGroupNode:function(){return new Node('','DzGroupNode');},DzSimpleElementData:Data,DzFileIOSettings:Settings,
    DzSceneHelper:function(){return{findPropertyByInternalName:(k,n)=>k==='Collision Item'?{getValue:()=>n.collider,setValue:v=>{n.collider=v;}}:null};},
    DzDir:function(p){this.exists=()=>state.dirs.has(p);this.mkpath=()=>{state.dirs.add(p);return true;};this.deleteLater=()=>{};},
    DzFile:function(p){this.refresh=()=>{};this.exists=()=>state.disk.has(p);this.isFile=()=>true;this.size=()=>state.disk.get(p)?.length||0;this.open=()=>state.disk.has(p);this.close=()=>{};this.deleteLater=()=>{};this.remove=()=>{state.deleted.push(p);state.disk.delete(p);};},
    MessageBox:{critical:m=>state.errors.push(m),warning:m=>{state.warnings.push(m);return state.answer;},information:m=>state.warnings.push(m)},
    beginUndo(){assert(!snapshot,'nested mock Undo');snapshot=capture();state.undo.push('begin');},acceptUndo:l=>{assert(snapshot);snapshot=null;state.undo.push('accept:'+l);},cancelUndo:()=>{assert(snapshot);state.nodes=snapshot.nodes;for(const a of snapshot.items){a.n.parent=a.parent;a.n.children=a.children;a.n.follow=a.follow;a.n.collider=a.collider;a.n.data={};for(const[k,v]of Object.entries(a.data)){v.d.settings.values={...v.values};a.n.data[k]=v.d;}}snapshot=null;state.undo.push('cancel');},
    beginNodeSelectionHold(){},restoreNodeSelectionHold(){},processEvents(){},print(){},SetStatusFinished:()=>{c.g_matewWearablesStatus=0;},
    getElementProperties:m=>m.properties||[],getPropertyEntry:p=>p,
    setMaterialPropertyOptions(){},setCommonMaterialPropertyOptions(){},
  };
  c.DzFile.ReadOnly=1;
  vm.createContext(c);
  const names=['RemoveQueueClass','GenerateUniqueID','GenerateUniqueGroupFileName','AddStringDataToNode','AddStringDataToNodeEx','GetSerializedUVs','GetHumanFigureMaterialsNames','GetExtraMaterialsArray','GetDefaultTransferExemptionsList','IsNodeHumanFigure','FilterParentedToHumanFigureAndNotAnExemption','IsParentedToHuman','FilterShells','FilterSkeletons','FilterMarkedForTransferring','GetBelongingsGroup','FindBoundGroup','FindBoundFigure','BindHumanFigureToGroup','ParentToBoneGroup','SaveCollisionItem','PlaceWearableIntoGroup','RestoreCollisionItem','RestoreNodeFollowTarget','ReturnWearable','ReturnAllWearableToTheFigure','GetAllShells','SaveShellMaterialsInFile','RestoreMaterialsFromFile','err','CheckForAnotherProcessActive'];
  for(const match of source.matchAll(/^\s*function (WM2\w+)\(/gm))if(!names.includes(match[1]))names.push(match[1]);
  for(const n of names){try{vm.runInContext(getFunction(source,n).text,c);}catch(e){if(!String(e).includes('Missing function '))throw e;}}
  c.oRemoveQueue=new c.RemoveQueueClass();
  function metadata(n,v){let d=n.findDataItem('MatewWearables');if(!d){d=new Data('MatewWearables');n.addDataItem(d);}Object.assign(d.settings.values,v);return d.settings;}
  function shell(n,parent,materials=['graft']){const s=new Node(n,'DzGeometryShellNode',parent);s.shape={getAllMaterials:()=>s.materials,findMaterial:name=>s.materials.find(m=>m.name===name)};s.materials=materials.map(name=>{const uv={value:name+'-uv',getStringValue(){return this.value;},setValueFromString(v){this.value=v;return true;}};return{name,properties:[['Diffuse Color','Value','Image']],getUVSetControl:()=>uv};});return s;}
  return{state,c,Node,metadata,shell};
}
const tests={
 'Actual stored FitTo pair restores target and follower, repeated return is harmless':w=>{const h=new w.Node('Genesis9','DzFigure'),a=new w.Node('A','DzFigure',h),b=new w.Node('B','DzFigure',h);a.follow=h;b.follow=a;w.c.oHumanFigure=h;const g=w.c.oGroup=w.c.GetBelongingsGroup(h,true);w.c.WM2BeginUndo();w.c.PlaceWearableIntoGroup(h,a,g);w.c.PlaceWearableIntoGroup(h,b,g);w.c.WM2AcceptUndo('Take Off');assert.equal(w.c.ReturnAllWearableToTheFigure(h),true);assert.equal(a.parent,h);assert.equal(b.parent,h);assert.equal(b.follow,a);assert(!b.findDataItem('MatewWearables')?.settings.values.Target);assert.equal(w.c.ReturnAllWearableToTheFigure(h),true);},
 'Actual stable collider reference survives duplicate labels and rename':w=>{const h=new w.Node('Genesis9','DzFigure'),a=new w.Node('ColliderA'),b=new w.Node('ColliderB'),shirt=new w.Node('Shirt','DzFigure',h);a.label=b.label='Collider';shirt.follow=h;shirt.collider=b;w.c.oHumanFigure=h;const g=w.c.oGroup=w.c.GetBelongingsGroup(h,true);w.c.PlaceWearableIntoGroup(h,shirt,g);b.label='Renamed';b.name='Changed';assert.equal(w.c.ReturnAllWearableToTheFigure(h),true);assert.equal(shirt.collider,b);},
 'Missing actual collider rolls back movement and preserves reference':w=>{const h=new w.Node('Genesis9','DzFigure'),b=new w.Node('Collider'),shirt=new w.Node('Shirt','DzFigure',h);shirt.follow=h;shirt.collider=b;w.c.oHumanFigure=h;const g=w.c.oGroup=w.c.GetBelongingsGroup(h,true);w.c.PlaceWearableIntoGroup(h,shirt,g);w.state.nodes=w.state.nodes.filter(n=>n!==b);assert.equal(w.c.ReturnAllWearableToTheFigure(h),false);assert.equal(shirt.parent,g);assert(shirt.findDataItem('MatewWearables').settings.values.Collision_Item_NodeID);assert(w.state.nodes.includes(g));assert.equal(w.c.bWM2UndoOpen,false);},
 'Actual marked bone proxy round-trips its child and retains user groups':w=>{const h=new w.Node('Genesis9','DzFigure'),bone=new w.Node('hip','DzBone',h),prop=new w.Node('Prop','DzNode',bone);w.c.oHumanFigure=h;const g=w.c.oGroup=w.c.GetBelongingsGroup(h,true),user=new w.Node('UserGroup','DzGroupNode',h);w.c.PlaceWearableIntoGroup(h,prop,g);assert.equal(w.c.ReturnAllWearableToTheFigure(h),true);assert.equal(prop.parent,bone);assert.equal(user.parent,h);assert(w.state.nodes.includes(user));},
 'Legacy adoption requires concrete approval and rejects declined whole return':w=>{const h=new w.Node('Genesis9','DzFigure'),bone=new w.Node('hip','DzBone',h);w.c.oHumanFigure=h;const g=w.c.oGroup=w.c.GetBelongingsGroup(h,true),p=new w.Node(g.name+'_hip','DzGroupNode',g),prop=new w.Node('Prop','DzNode',p);w.state.answer=1;assert.equal(w.c.ReturnAllWearableToTheFigure(h),false);assert.equal(prop.parent,p);w.state.answer=0;assert.equal(w.c.ReturnAllWearableToTheFigure(h),true);assert.equal(prop.parent,bone);assert(w.state.warnings.some(m=>m.includes('hip')&&m.includes('Direct items')));},
 'Actual durable shell snapshot is retained and fields cleared only after restore':w=>{const h=new w.Node('Genesis9','DzFigure'),s=w.shell('Shell',h);assert.equal(w.c.SaveShellMaterialsInFile(h,s),true);const data=s.findDataItem('MatewWearables').settings,backup=data.values.BackupPath;assert(backup.startsWith('/durable/studio/matew/WearablesManager/Backups/'));assert(w.state.disk.has(backup));assert.equal(w.c.RestoreMaterialsFromFile(s),true);w.c.oRemoveQueue.Finalize();assert(!s.findDataItem('MatewWearables'));assert(w.state.disk.has(backup));assert.equal(w.state.deleted.length,0);},
 'Actual unreadable snapshot preflight prevents any parent mutation':w=>{const h=new w.Node('Genesis9','DzFigure');w.c.oHumanFigure=h;const g=w.c.oGroup=w.c.GetBelongingsGroup(h,true),s=w.shell('Shell',g);w.metadata(s,{FileName:'old',BackupPath:'/missing/original.duf',UV:''});assert.equal(w.c.ReturnAllWearableToTheFigure(h),false);assert.equal(s.parent,g);assert.equal(w.state.undo.length,0);assert.equal(s.findDataItem('MatewWearables').settings.values.BackupPath,'/missing/original.duf');assert(w.state.errors.some(e=>e.includes('/missing/original.duf')));},
 'Actual failed backup publishes no receipt':w=>{const h=new w.Node('Genesis9','DzFigure'),s=w.shell('Shell',h);w.state.saveError=1;assert.equal(w.c.SaveShellMaterialsInFile(h,s),false);assert.equal(s.findDataItem('MatewWearables'),null);assert.equal(s.parent,h);},
 'Actual binding ambiguity preserves both figures and groups':w=>{const a=new w.Node('Genesis9','DzFigure'),b=new w.Node('Genesis9','DzFigure'),g=new w.Node('Storage','DzGroupNode');w.metadata(a,{ID:'same'});w.metadata(b,{ID:'same'});w.metadata(g,{ID:'same'});assert.throws(()=>w.c.FindBoundFigure(g),/share|ambiguous/);assert.equal(w.state.nodes.length,3);},
 'Busy repeat calls never override an active invocation':w=>{w.c.g_matewWearablesStatus=1;assert.equal(w.c.CheckForAnotherProcessActive(),false);assert.equal(w.c.CheckForAnotherProcessActive(),false);assert.equal(w.c.CheckForAnotherProcessActive(),false);assert.equal(w.c.g_matewWearablesStatus,1);},
};
const results=[];
for(const file of files){const source=fs.readFileSync(path.join(root,file),'utf8');new vm.Script(source);for(const[name,test]of Object.entries(tests)){try{test(world(source));results.push({file,name,pass:true});}catch(e){results.push({file,name,pass:false,error:e.stack});}}}
const receipt={sourceRoot:root,nativeDAZ:false,note:'Mock Undo restores scene/data by design; this does not establish native data-item Undo behavior.',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
fs.writeFileSync(path.join(root,'.test-output/integration-results.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify({sourceRoot:root,passed:receipt.passed,failed:receipt.failed,failures:results.filter(r=>!r.pass)},null,2));
if(receipt.failed)process.exitCode=1;
