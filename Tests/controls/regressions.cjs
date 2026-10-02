// Source-extracted fail-before/pass-after checks. Uses only isolated DAZ mocks.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const args=process.argv.slice(2);
let integratedRoot=null;
if(args.length) {
  if(args.length!==2 || args[0]!=='--source-root') throw new Error('Usage: node run_tests.cjs [--source-root <integrated script folder>]');
  integratedRoot=path.resolve(args[1]);
  for(const file of ['Wearables Manager Full.dsa','Wearables Manager Menu.dsa']) if(!fs.existsSync(path.join(integratedRoot,file))) throw new Error('Missing integrated source: '+path.join(integratedRoot,file));
}
const roots={baseline:path.resolve(__dirname,'../../.test-output/baseline'),candidates:integratedRoot||path.join(__dirname,'candidates')};
const oldHarness=fs.readFileSync(path.resolve(__dirname,'../support/controls_mock.cjs'),'utf8');
let prefix=oldHarness.slice(0,oldHarness.indexOf("for(const file of ['Wearables Manager Full.dsa'"));
prefix=prefix.replace("const root = path.resolve(__dirname, '../../source-text');","let root = path.resolve(__dirname, 'baseline');");
prefix=prefix.replace("Color, DATA_ITEM_NAME:","print(){}, Color, DATA_ITEM_NAME:");
prefix=prefix.replace('errors,propertyWrites,undoCalls};','errors,propertyWrites,undoCalls,sandbox};');
prefix=prefix.replace("acceptUndo(){undoCalls.push('accept');}","acceptUndo(label){undoCalls.push({accept:label});}");
const api=new Function('require','__dirname',prefix+'\nreturn {load,Color,rgb,setRoot(folder){root=folder;}};')(require,__dirname);
const cases=[];
function run(file,label,scenario,check) {
  const observations={};
  for(const folder of ['baseline','candidates']) {api.setRoot(roots[folder]);observations[folder]=scenario(api.load(file));}
  check(observations.baseline,observations.candidates);
  cases.push({file,label,before:observations.baseline,after:observations.candidates,result:'PASS'});
}
function config(file,folder,text) {
  const source=fs.readFileSync(path.join(roots[folder],file),'utf8');
  const writes=[];let closes=0,dirsDeleted=0;
  function File(){this.open=mode=>true;this.read=()=>text;this.write=v=>writes.push(v);this.close=()=>closes++;}
  File.ReadOnly=1;File.WriteOnly=2;
  const context={PATH_ICONS:'/Resources',JSON_NAME:'Wearables Manager.json',ICONS_EXTENSION:'.PNG',
    DzDir:function(){this.filePath=n=>'/Resources/'+n;this.deleteLater=()=>dirsDeleted++;},DzFile:File,Pixmap:function(filePath){this.path=filePath;}};
  vm.createContext(context);
  if(source.includes('WM2Support.createIconResolver'))vm.runInContext(fs.readFileSync(path.join(integratedRoot||path.resolve(__dirname,'../..'),'Resources/WM2 Support.dsa'),'utf8'),context);
  vm.runInContext(source.slice(source.indexOf('function WearablesIconsClass('),source.indexOf('function TagImageManagerClass(')),context);
  const icons=new context.WearablesIconsClass();
  let icon,error=null;
  try{icon=icons.GetIconForWearable({className:()=>text.includes('CustomNode')?'CustomNode':'DzBasicCamera',name:'',inherits:name=>name==='CustomNode'||name==='DzBasicCamera',getName:()=>'',getLabel:()=>''}).path;}catch(e){error=e.message;}
  return {writes:writes.length,icon,error,closes,dirsDeleted};
}

for(const file of ['Wearables Manager Full.dsa','Wearables Manager Menu.dsa']) {
  run(file,'Selective OFF keeps fresh recovery color',a=>{
    const m=a.material('Lamp',new api.Color(255,32,4)),n=a.node([m]);a.plan(true,[false]);
    a.manager.iLaunchEmissiveMaterialsDialog(n);a.manager.iToggleEmissives(n);return api.rgb(m.props['Emission Color'].color);
  },(before,after)=>{assert.deepStrictEqual(before,[0,0,0]);assert.deepStrictEqual(after,[255,32,4]);});
  run(file,'Selective OFF refreshes stale saved color',a=>{
    const m=a.material('Lamp',new api.Color(200,0,0)),n=a.node([m],JSON.stringify({Lamp:new api.Color(0,0,200)}));a.plan(true,[false]);
    a.manager.iLaunchEmissiveMaterialsDialog(n);a.manager.iToggleEmissives(n);return api.rgb(m.props['Emission Color'].color);
  },(before,after)=>{assert.deepStrictEqual(before,[0,0,200]);assert.deepStrictEqual(after,[200,0,0]);});
  run(file,'Selective Cancel remains nonmutating',a=>{
    const m=a.material('Lamp',new api.Color(255,32,4)),n=a.node([m]);a.plan(false,[false]);a.manager.iLaunchEmissiveMaterialsDialog(n);
    return {rgb:api.rgb(m.props['Emission Color'].color),metadata:n.findDataItem('MatewWearables'),writes:a.propertyWrites.length};
  },(before,after)=>{assert.deepStrictEqual(before,{rgb:[255,32,4],metadata:null,writes:0});assert.deepStrictEqual(after,before);});
  for(const [method,property,label] of [['iToggleVisible','Visible','Visibility'],['iToggleSmooth','Enable Smoothing','Smoothing'],['iToggleFreezeSimulation','Freeze Simulation','Freeze Simulation']]) run(file,'Direct '+label+' owns one labeled Undo group',a=>{
    const n=a.node([]);n.props[property]={value:true,getBoolValue(){return this.value;},setBoolValue(v){this.value=v;}};
    a.manager[method](n);return {value:n.props[property].value,undo:a.undoCalls};
  },(before,after)=>{assert.strictEqual(before.value,false);assert.deepStrictEqual(before.undo,[]);assert.deepStrictEqual(after,{value:false,undo:['begin',{accept:'Wearables Manager - '+label}]});});
  run(file,'Direct Light owns one labeled Undo group',a=>{
    const n=a.node([]);n.inherits=s=>s==='DzLight';let value='On';n.isOn=()=>value!=='Off';n.props.Illumination={setValueFromString(v){value=v;return true;}};
    a.manager.iToggleLight(n);return {value,undo:a.undoCalls};
  },(before,after)=>{assert.deepStrictEqual(before,{value:'Off',undo:[]});assert.deepStrictEqual(after,{value:'Off',undo:['begin',{accept:'Wearables Manager - Light'}]});});
  run(file,'Ordinary Emissives owns snapshot plus writes in one labeled group',a=>{
    const m=a.material('Lamp',new api.Color(200,0,0)),n=a.node([m]);a.manager.iToggleEmissives(n);
    return {rgb:api.rgb(m.props['Emission Color'].color),tag:!!n.findDataItem('MatewWearables'),undo:a.undoCalls};
  },(before,after)=>{assert.deepStrictEqual(before,{rgb:[0,0,0],tag:true,undo:[]});assert.deepStrictEqual(after,{rgb:[0,0,0],tag:true,undo:['begin',{accept:'Wearables Manager - Emissives'}]});});
  run(file,'Missing control properties create no empty Undo group',a=>{
    const n=a.node([]);n.inherits=s=>s==='DzLight';n.isOn=()=>true;
    for(const method of ['iToggleVisible','iToggleSmooth','iToggleFreezeSimulation','iToggleLight','iToggleEmissives'])a.manager[method](n);
    return {undo:a.undoCalls,tag:!!n.findDataItem('MatewWearables')};
  },(before,after)=>{assert.deepStrictEqual(before.undo,[]);assert.deepStrictEqual(after,{undo:[],tag:false});});
  for(const [accept,states,label] of [[false,[false,false],'Child Cancel'],[true,[],'Unchanged child Accept'],[true,[false,false],'Changed child Accept']]) run(file,label+' visibility Undo boundary',a=>{
    const n=a.node([]);for(const name of ['Visible','Renderable'])n.props[name]={value:true,getBoolValue(){return this.value;},setBoolValue(v){this.value=v;},getLabel(){return name;}};
    a.plan(accept,states);a.manager.iLaunchPropertyDialog(n,['Visible','Renderable']);return {values:['Visible','Renderable'].map(p=>n.props[p].value),undo:a.undoCalls};
  },(before,after)=>{assert.deepStrictEqual(before.undo,[]);assert.deepStrictEqual(before.values,accept&&states.length?[false,false]:[true,true]);assert.deepStrictEqual(after,{values:before.values,undo:accept&&states.length?['begin',{accept:'Wearables Manager - Visibility Properties'}]:[]});});
  run(file,'Selective child apply owns snapshot plus all surface writes',a=>{
    const m1=a.material('One',new api.Color(200,0,0)),m2=a.material('Two',new api.Color(0,200,0)),n=a.node([m1,m2]);a.plan(true,[false,false]);a.manager.iLaunchEmissiveMaterialsDialog(n);
    return {colors:[m1,m2].map(m=>api.rgb(m.props['Emission Color'].color)),tag:!!n.findDataItem('MatewWearables'),undo:a.undoCalls};
  },(before,after)=>{assert.deepStrictEqual(before,{colors:[[0,0,0],[0,0,0]],tag:false,undo:[]});assert.deepStrictEqual(after,{colors:[[0,0,0],[0,0,0]],tag:true,undo:['begin',{accept:'Wearables Manager - Emissive Surfaces'}]});});
  run(file,'Emissive setter failure cancels only the owned group and reports error',a=>{
    const m1=a.material('One',new api.Color(200,0,0)),m2=a.material('Two',new api.Color(0,200,0)),n=a.node([m1,m2]);m2.props['Emission Color'].setColorValue=()=>{throw Error('mock setter failure');};
    const result=a.manager.iToggleEmissives(n);return {result,undo:a.undoCalls,errors:a.errors};
  },(before,after)=>{assert.deepStrictEqual(before.undo,[]);assert.deepStrictEqual(after,{result:false,undo:['begin','cancel'],errors:['mock setter failure']});});
  run(file,'Failed begin does not cancel an Undo block the helper never owned',a=>{
    const n=a.node([]);n.props.Visible={value:true,getBoolValue(){return this.value;},setBoolValue(v){this.value=v;}};a.sandbox.beginUndo=()=>{throw Error('mock begin failure');};
    const result=a.manager.iToggleVisible(n);return {result,value:n.props.Visible.value,undo:a.undoCalls,errors:a.errors};
  },(before,after)=>{assert.strictEqual(before.value,false);assert.deepStrictEqual(after,{result:false,value:true,undo:[],errors:['mock begin failure']});});
  run(file,'Malformed recovery JSON allows current-color row and refuses writes',a=>{
    const m=a.material('Lamp',new api.Color(255,32,4)),n=a.node([m],'{');let count,readThrew=false,writeThrew=false;
    try{count=Array.from(a.manager.iWearableEmissivesCount(n));}catch(e){readThrew=true;}
    try{a.manager.iToggleEmissives(n);}catch(e){writeThrew=true;}
    return {count,readThrew,writeThrew,rgb:api.rgb(m.props['Emission Color'].color),raw:n.findDataItem('MatewWearables').getSettings().getStringValue('Emissive'),errors:a.errors.length};
  },(before,after)=>{assert(before.readThrew&&before.writeThrew);assert(!after.readThrew&&!after.writeThrew);assert.deepStrictEqual(after.count,[1,0]);assert.strictEqual(after.raw,'{');assert.deepStrictEqual(after.rgb,[255,32,4]);assert.strictEqual(after.errors,1);});
  run(file,'Color schema validation rejects wrong channel type without overwriting metadata',a=>{
    const raw=JSON.stringify({Lamp:{red:'bad',green:0,blue:0,alpha:255}});const n=a.node([],raw);let rejected=false,threw=false;
    try{rejected=a.manager.iRetreiveEmissivesFromTag(n)===null;}catch(e){threw=true;}
    return {rejected,threw,rawKept:n.findDataItem('MatewWearables').getSettings().getStringValue('Emissive')===raw};
  },(before,after)=>{assert.strictEqual(before.rejected,false);assert.deepStrictEqual(after,{rejected:true,threw:false,rawKept:true});});
  run(file,'No-object figure getters and SubD callback return safely',a=>{
    const n=a.node([]);n.inherits=s=>s==='DzFigure';n.getObject=()=>null;const out={};
    for(const method of ['iGetIconAndDescription_Resolution','iGetWearableVisiblilityInSimulation','iJumpToSubD','iToggleSubD']) {
      try{out[method]={threw:false,value:a.manager[method](n)};}catch(e){out[method]={threw:true};}
    }return out;
  },(before,after)=>{assert(Object.values(before).every(x=>x.threw));assert(Object.values(after).every(x=>!x.threw));assert.strictEqual(after.iGetWearableVisiblilityInSimulation.value,0);});
  for(const priorSubd of [false,true]) run(file,'SubD conversion refetches replacement properties; existing SubD prop '+priorSubd,a=>{
    const oldWrites=[],newWrites=[];let triggerCount=0,held=0,restored=0;
    const n=a.node([]);n.inherits=s=>s==='DzFigure';
    let shape={findProperty:p=>p==='lodlevel'?{getNumItems:()=>1}:priorSubd?{setValue:v=>oldWrites.push(v)}:null};
    n.getObject=()=>({getCurrentShape:()=>shape});
    a.sandbox.question=()=>0;a.sandbox.beginNodeSelectionHold=()=>held++;a.sandbox.restoreNodeSelectionHold=()=>restored++;
    a.sandbox.Scene={selectAllNodes(){},setPrimarySelection(){}};
    a.sandbox.MainWindow={getActionMgr:()=>({findAction:()=>({trigger(){triggerCount++;shape={findProperty:p=>p==='lodlevel'?{getNumItems:()=>2}:{setValue:v=>newWrites.push(v)}};}})})};
    a.manager.iToggleSubD(n);return {triggerCount,oldWrites,newWrites,held,restored};
  },(before,after)=>{if(!priorSubd)assert.strictEqual(before.triggerCount,0);else assert.deepStrictEqual(before.oldWrites,[1]);assert.deepStrictEqual(after,{triggerCount:1,oldWrites:[],newWrites:[1],held:1,restored:1});});
  run(file,'Selection hold restored after SubD action throws',a=>{
    let restored=0,threw=false;const n=a.node([]);n.inherits=s=>s==='DzFigure';n.getObject=()=>({getCurrentShape:()=>({findProperty:p=>p==='lodlevel'?{getNumItems:()=>1}:{setValue(){}}})});
    a.sandbox.question=()=>0;a.sandbox.beginNodeSelectionHold=()=>{};a.sandbox.restoreNodeSelectionHold=()=>restored++;
    a.sandbox.Scene={selectAllNodes(){},setPrimarySelection(){}};a.sandbox.MainWindow={getActionMgr:()=>({findAction:()=>({trigger(){throw Error('mock conversion failure');}})})};
    try{a.manager.iToggleSubD(n);}catch(e){threw=true;}return {restored,threw,errors:a.errors.length};
  },(before,after)=>{assert.deepStrictEqual(before,{restored:0,threw:true,errors:0});assert.deepStrictEqual(after,{restored:1,threw:false,errors:1});});
  const custom=JSON.stringify({InharitanceIcons:{'Custom Icon':'CustomNode'},NamedIcons:{}});
  const cb=config(file,'baseline',custom),ca=config(file,'candidates',custom);
  assert.strictEqual(ca.writes,0);assert.strictEqual(ca.icon,'/Resources/Custom Icon.PNG');assert.strictEqual(ca.error,null);
  if(file.includes('Full')){assert.strictEqual(cb.writes,1);assert.notStrictEqual(cb.icon,ca.icon);}
  cases.push({file,label:'Validated shipped/custom configuration is read without writes',before:cb,after:ca,result:'PASS'});
  for(const malformed of ['{}','{"InharitanceIcons":42,"NamedIcons":{}}','{"InharitanceIcons":{"Broken":[42]},"NamedIcons":{}}']) {
    const before=config(file,'baseline',malformed),after=config(file,'candidates',malformed);
    assert.strictEqual(after.writes,0);assert.strictEqual(after.error,null);assert.strictEqual(after.icon,'/Resources/Wearables Manager - Camera.PNG');
    cases.push({file,label:'Invalid icon schema falls back to in-memory defaults '+malformed,before,after,result:'PASS'});
  }
}
for(const folder of ['baseline','candidates']) for(const file of ['Wearables Manager Full.dsa','Wearables Manager Menu.dsa']) new vm.Script(fs.readFileSync(path.join(roots[folder],file),'utf8'),{filename:folder+'/'+file});
const status=integratedRoot?'INTEGRATED READ-ONLY VERIFICATION':'UNAPPLIED scratch proposal';
fs.writeFileSync(path.resolve(roots.candidates,'.test-output/controls-results.json'),JSON.stringify({status,sourceRoot:roots.candidates,scope:'source-extracted static/mocks only; no native DAZ',cases},null,2)+'\n');
console.log(JSON.stringify({passed:cases.length,result:'PASS',status,sourceRoot:roots.candidates,nativeVerification:false},null,2));
