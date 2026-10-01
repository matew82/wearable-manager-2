'use strict';
// Source-only product regression tests. No patch overlay or replacement implementation.
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const args=process.argv.slice(2);
function arg(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
// Packaged as Tests/graph/registration.cjs: ../.. is the installed product root.
const sourceRoot=path.resolve(arg('--source-root',path.join(__dirname,'../..')));
const harnessArg=arg('--harness',null);
const harnessPath=harnessArg?path.resolve(__dirname,harnessArg):path.join(__dirname,'regressions.cjs');
// The shared harness must load the actual source functions rather than proposal mode.
const modeIndex=process.argv.indexOf('--mode');
if(modeIndex<0)process.argv.push('--mode','source');
else assert.strictEqual(process.argv[modeIndex+1],'source','Registration tests require actual source mode.');
const {createWorld}=require(harnessPath);
const engineFiles=['Wearables Manager Full.dsa','Wearables Manager Menu.dsa','Wearables Manager Take Off.dsa','Wearables Manager Put On.dsa'];
function fixture(source){
 const w=createWorld(source),figure=new w.Node('Genesis9','DzFigure'),bone=new w.Node('hip','DzBone',figure),wearable=new w.Node('Prop','DzNode',bone),group=new w.Node('Storage','DzGroupNode');
 w.state.nodes=[figure,bone,wearable,group];w.sandbox.oHumanFigure=figure;w.sandbox.oGroup=group;
 return {...w,figure,bone,wearable,group};
}
function verifyStored(w){
 const proxy=w.wearable.getNodeParent();
 assert(proxy&&!w.sandbox.WM2SameNode(proxy,w.bone),'Wearable did not move to a proxy.');
 assert(w.sandbox.WM2SceneContains(proxy),'Proxy is not registered in Scene.');
 assert(w.sandbox.WM2SameNode(proxy.getNodeParent(),w.group),'Proxy does not belong to the storage owner.');
 const settings=w.sandbox.WM2NodeSettings(proxy,false);
 assert(settings&&settings.getStringValue('WM2Role','')==='BoneProxy','Proxy role was not recorded.');
 const resolved=w.sandbox.WM2ResolveBoneProxy(w.group,proxy,w.figure);
 assert(resolved.ok&&w.sandbox.WM2SameNode(resolved.node,w.bone),'Recorded proxy does not resolve to the original bone.');
 return proxy;
}
const cases=[
 ['registers the new proxy before marking and transferring',source=>{
  const w=fixture(source),events=[],add=w.sandbox.Scene.addNode,mark=w.sandbox.WM2MarkBoneProxy;
  w.sandbox.Scene.addNode=n=>{events.push('register');return add(n);};
  w.sandbox.WM2MarkBoneProxy=(proxy,figure,bone)=>{
   events.push('mark');assert(w.sandbox.WM2SceneContains(proxy),'Marker received an unregistered proxy.');
   assert(w.sandbox.WM2SameNode(proxy.getNodeParent(),w.group),'Marker received an unattached proxy.');
   return mark(proxy,figure,bone);
  };
  w.sandbox.ParentToBoneGroup(w.bone,w.wearable);assert.deepStrictEqual(events,['register','mark']);verifyStored(w);
 }],
 ['reuses the existing registered proxy without registering another',source=>{
  const w=fixture(source);w.sandbox.ParentToBoneGroup(w.bone,w.wearable);const proxy=verifyStored(w);
  const second=new w.Node('Prop2','DzNode',w.bone);w.state.nodes.push(second);
  w.sandbox.Scene.addNode=()=>{throw new Error('Existing proxy must not be registered again.');};
  w.sandbox.ParentToBoneGroup(w.bone,second);
  assert(w.sandbox.WM2SameNode(second.getNodeParent(),proxy));assert.strictEqual(w.group.getNodeChildren(false).length,1);
 }],
 ['accepts successful registration when addNode returns undefined',source=>{
  const w=fixture(source),add=w.sandbox.Scene.addNode;
  w.sandbox.Scene.addNode=n=>{add(n);return undefined;};
  w.sandbox.ParentToBoneGroup(w.bone,w.wearable);verifyStored(w);
 }],
 ['failed Scene registration preserves the wearable and skips marking',source=>{
  const w=fixture(source);let markingCalls=0;w.sandbox.Scene.addNode=()=>false;
  w.sandbox.WM2MarkBoneProxy=()=>{markingCalls++;return {ok:true};};
  assert.throws(()=>w.sandbox.ParentToBoneGroup(w.bone,w.wearable));assert.strictEqual(markingCalls,0);
  assert(w.sandbox.WM2SameNode(w.wearable.getNodeParent(),w.bone));assert.strictEqual(w.group.getNodeChildren(false).length,0);
  assert.strictEqual(w.state.nodes.filter(n=>n.className()==='DzGroupNode').length,1);
 }],
 ['failed hierarchy attachment removes the empty registered proxy',source=>{
  const w=fixture(source);let markingCalls=0;w.group.addNodeChild=()=>{};
  w.sandbox.WM2MarkBoneProxy=()=>{markingCalls++;return {ok:true};};
  assert.throws(()=>w.sandbox.ParentToBoneGroup(w.bone,w.wearable));assert.strictEqual(markingCalls,0);
  assert(w.sandbox.WM2SameNode(w.wearable.getNodeParent(),w.bone));assert.strictEqual(w.group.getNodeChildren(false).length,0);
  assert.strictEqual(w.state.nodes.filter(n=>n.className()==='DzGroupNode').length,1);
 }],
 ['failed marking removes the empty registered proxy and preserves the wearable',source=>{
  const w=fixture(source);w.sandbox.WM2MarkBoneProxy=()=>({ok:false,message:'Fixture marker failure'});
  assert.throws(()=>w.sandbox.ParentToBoneGroup(w.bone,w.wearable),/Fixture marker failure/);
  assert(w.sandbox.WM2SameNode(w.wearable.getNodeParent(),w.bone));assert.strictEqual(w.group.getNodeChildren(false).length,0);
  assert.strictEqual(w.state.nodes.filter(n=>n.className()==='DzGroupNode').length,1);
 }],
 ['new proxy registration preserves an unmarked name-shaped legacy group',source=>{
  const w=fixture(source),legacy=new w.Node('Storage_hip','DzGroupNode',w.group),stored=new w.Node('LegacyStored','DzNode',legacy);
  w.state.nodes.push(legacy,stored);w.sandbox.ParentToBoneGroup(w.bone,w.wearable);const proxy=verifyStored(w);
  assert(!w.sandbox.WM2SameNode(proxy,legacy));assert.strictEqual(stored.getNodeParent(),legacy);
  const legacySettings=w.sandbox.WM2NodeSettings(legacy,false);
  assert(!legacySettings||legacySettings.getStringValue('WM2Role','')==='','Legacy group was silently marked.');
 }]
];
const results=[],inputs=[];
for(const file of engineFiles){
 const source=fs.readFileSync(path.join(sourceRoot,file),'utf8');
 inputs.push({file,sha256:crypto.createHash('sha256').update(source).digest('hex')});
 for(const[name,run]of cases){try{run(source);results.push({file,test:name,pass:true});}catch(e){results.push({file,test:name,pass:false,error:e.message});}}
}
const output={nativeExecuted:false,sourceRoot,harnessPath,scope:'Actual source-extracted graph functions; explicit Scene registration fixture; bridge sources use shared graph-only metadata contract; no overlay/native',inputs,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
const outputPath=arg('--output',null);if(outputPath)fs.writeFileSync(path.resolve(outputPath),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({sourceRoot,passed:output.passed,failed:output.failed,failures:results.filter(r=>!r.pass)},null,2));process.exitCode=output.failed?1:0;
