// Models DAZ QObject aliases: every fetch creates a distinct JS wrapper.
// No DAZ instance, product changes, or real file operations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {files,getFunction}=require('../support/extract.cjs');
const args=process.argv.slice(2),sourceRoot=path.resolve(args[args.indexOf('--sourceRoot')+1]||'../candidate');
const overlay=args.includes('--overlay'),expect=args.includes('--expect')?args[args.indexOf('--expect')+1]:(overlay?'after':'before');
const proposed=''; if(overlay)throw new Error('Packaged tests check actual sources only');
function fixture(code,source){
  const scene=new Map(),state=new Map(),log={removals:[],disposed:[],afterDisposalReads:0,getOwnerCalls:0};
  function check(s){if(s.disposed){log.afterDisposalReads++;throw new Error('native data item/settings already disposed');}}
  function ownerAlias(id){const s=state.get(id);return{elementID:id,className:()=> 'DzNode',inherits:c=>c==='DzNode',getLabel:()=>s.label,removeDataItem(d){check(s);assert.equal(d.ownerID,id,'wrong owner received item');s.disposed=true;log.disposed.push(id);},findDataItem(){return dataAlias(id);}};}
  function settingsAlias(id){const s=state.get(id);return{removeValue(k){check(s);log.removals.push({owner:id,key:k});delete s.values[k];},getNumValues(){check(s);return Object.keys(s.values).length;},getStringValue(k,d){check(s);return k in s.values?s.values[k]:d;}};}
  function dataAlias(id){const s=state.get(id);return{ownerID:id,getOwner(){check(s);log.getOwnerCalls++;return ownerAlias(id);},getSettings(){check(s);return settingsAlias(id);}};}
  const c={DATA_ITEM_NAME:'MatewWearables',
    WM2SameNode:(a,b)=>{try{return!!a&&!!b&&a.inherits('DzNode')&&b.inherits('DzNode')&&String(a.elementID)===String(b.elementID)&&a.className()===b.className();}catch{return false;}},
    WM2SceneContains:n=>!!n&&scene.has(String(n.elementID)),Scene:{getNodeList:()=>Array.from(scene.values())},
  };vm.createContext(c);vm.runInContext(code,c);c.queue=new c.RemoveQueueClass();
  for(const name of ['WM2NodeKey','WM2SameNode','WM2LiveNode','WM2SceneContains','WM2NodeIndexOf']){try{vm.runInContext(getFunction(source,name).text,c);}catch(e){if(!String(e).includes('Missing function '))throw e;}}
  c.createOwner=(id,values,label='same label')=>{state.set(String(id),{values:{...values},label,disposed:false});const owner=ownerAlias(String(id));scene.set(String(id),owner);return owner;};
  c.enqueue=(id,key)=>{const d=dataAlias(String(id));c.queue.AddDataToQueue(d,d.getSettings(),key);};
  return{c,log,state,scene,dataAlias,settingsAlias,ownerAlias};
}
const tests={
  'FitTo and collision aliases clean one native owner exactly once':f=>{f.c.createOwner('1',{Target:'human',Collision_Item:'collider'});f.c.enqueue('1','Target');f.c.enqueue('1','Collision_Item');f.c.queue.Finalize();assert.deepEqual(f.log.disposed,['1']);assert.equal(f.log.afterDisposalReads,0);assert.deepEqual(f.state.get('1').values,{});},
  'five-field references through fresh aliases preserve all removals':f=>{const values={Target:'human',Target_NodeID:'uuid',Target_Name:'human',Target_Label:'human',Target_Class:'DzFigure',Collision_Item:'collider'};f.c.createOwner('2',values);for(const k of Object.keys(values))f.c.enqueue('2',k);f.c.queue.Finalize();assert.deepEqual(f.log.disposed,['2']);assert.equal(f.log.afterDisposalReads,0);assert.deepEqual(f.state.get('2').values,{});assert.equal(f.log.removals.length,6);},
  'duplicate alias records remove each field once':f=>{f.c.createOwner('3',{Target:'human',Transfer:'No'});f.c.enqueue('3','Target');f.c.enqueue('3','Target');f.c.queue.Finalize();assert.equal(f.log.removals.filter(r=>r.key==='Target').length,1);assert.deepEqual(f.state.get('3').values,{Transfer:'No'});assert.deepEqual(f.log.disposed,[]);},
  'same-label distinct owners are never merged':f=>{f.c.createOwner('4',{Target:'human'});f.c.createOwner('5',{Collision_Item:'collider'});f.c.enqueue('4','Target');f.c.enqueue('5','Collision_Item');f.c.queue.Finalize();assert.deepEqual(f.log.disposed,['4','5']);assert.equal(f.log.afterDisposalReads,0);assert.deepEqual(f.state.get('4').values,{});assert.deepEqual(f.state.get('5').values,{});},
  'owner scene removal before cleanup fails before fields change':f=>{f.c.createOwner('6',{Target:'human'});f.c.createOwner('7',{Collision_Item:'collider'});f.c.enqueue('6','Target');f.c.enqueue('7','Collision_Item');f.scene.delete('7');assert.throws(()=>f.c.queue.Finalize());assert.deepEqual(f.state.get('6').values,{Target:'human'});assert.deepEqual(f.state.get('7').values,{Collision_Item:'collider'});assert.equal(f.log.removals.length,0);},
  'sparse legacy and typed alias keys remain safe':f=>{f.c.createOwner('8',{Target:'human'});for(const k of ['Target','Target_NodeID','Target_Name','Target_Label','Target_Class'])f.c.enqueue('8',k);f.c.queue.Finalize();assert.deepEqual(f.log.disposed,['8']);assert.equal(f.log.afterDisposalReads,0);},
  'physical backup files remain untouched':f=>{let removed=0,released=0;f.c.queue.AddFileToQueue({remove(){removed++;},deleteLater(){released++;}});f.c.queue.Finalize();assert.equal(removed,0);assert.equal(released,1);},
};
const results=[];for(const file of files){const src=fs.readFileSync(path.join(sourceRoot,file),'utf8').replace(/\r\n/g,'\n');const code=getFunction(overlay?proposed:src,'RemoveQueueClass').text;for(const[name,test]of Object.entries(tests)){try{test(fixture(code,src));results.push({file,name,status:'PASS'});}catch(e){results.push({file,name,status:'FAIL',error:String(e.message)});}}}
const report={sourceRoot,overlay,expect,nativeDAZUsed:false,total:results.length,pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length,results,assumption:'Queue is exclusively the one MatewWearables data item per node; owner aliases use same session elementID/class, not persistent IDs or labels.',limits:['Actual graph WM2NodeKey/SameNode/LiveNode/SceneContains/NodeIndexOf are source-extracted when present; original baseline only uses deterministic fallback mocks','Native alias cleanup requires the parent coordinated native fixture; this runner does not launch DAZ','Ordinary JavaScript cannot reproduce native QObject loose-equality operator override']};
fs.writeFileSync(path.join(sourceRoot,'.test-output/queue-wrapper-alias-'+expect+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({sourceRoot,overlay,total:report.total,pass:report.pass,fail:report.fail,failures:results.filter(r=>r.status==='FAIL')}));if(expect==='after'&&report.fail)process.exitCode=1;if(expect==='before'&&!report.fail)process.exitCode=1;
