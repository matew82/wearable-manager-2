const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');
const {createWorld,extract}=require('./regressions.cjs');
const args=process.argv.slice(2);
function arg(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
const root=path.resolve(arg('--source-root',path.join(__dirname,'../..')));
const overlay=args.includes('--overlay');
const patch=''; if(overlay)throw new Error('Packaged tests check actual sources only');
const files=['Wearables Manager Full.dsa','Wearables Manager Menu.dsa','Wearables Manager Take Off.dsa','Wearables Manager Put On.dsa'];
function setup(source){
  const w=createWorld(source);
  const s=w.sandbox;
  s.processEvents=function(){};
  s.DzSceneHelper=function(){return {findPropertyByInternalName:function(name,node){return node.collision;}};};
  w.Node.prototype.getFollowTarget=function(){return this.follow||null;};
  w.Node.prototype.setFollowTarget=function(node){this.follow=node;};
  ['WM2CheckShellSnapshots','WM2RestoreNodeState','WM2RestoreWearablePairs','WM2QueueReferenceRemoval'].forEach(n=>vm.runInContext(extract(source,n),s));
  if(overlay)vm.runInContext(patch,s);
  w.figure=w.bind(new w.Node('Genesis9','DzFigure'),'pair');
  w.group=w.bind(new w.Node('Storage','DzGroupNode'),'pair');
  w.bone=new w.Node('hip','DzBone',w.figure);
  w.proxy=new w.Node('Proxy','DzGroupNode',w.group);
  w.other=new w.Node('Genesis8Female','DzFigure');
  w.state.nodes=[w.figure,w.group,w.bone,w.proxy,w.other];
  assert(s.WM2MarkBoneProxy(w.proxy,w.figure,w.bone).ok);
  return w;
}
const cases=[
 ['normal direct item restores',source=>{const w=setup(source);const p=new w.Node('Prop','DzNode',w.group);assert.strictEqual(w.sandbox.WM2RestoreWearablePairs(w.figure,w.group,[[p,w.figure]],[]),true);assert.strictEqual(p.parent,w.figure);}],
 ['normal marked proxy child restores',source=>{const w=setup(source);const p=new w.Node('Prop','DzNode',w.proxy);assert.strictEqual(w.sandbox.WM2RestoreWearablePairs(w.figure,w.group,[[p,w.bone]],[]),true);assert.strictEqual(p.parent,w.bone);}],
 ['externally reparented direct item is preserved',source=>{const w=setup(source);const p=new w.Node('Prop','DzNode',w.group);w.other.addNodeChild(p);assert.strictEqual(w.sandbox.WM2RestoreWearablePairs(w.figure,w.group,[[p,w.figure]],[]),false);assert.strictEqual(p.parent,w.other);}],
 ['externally reparented proxy child is preserved',source=>{const w=setup(source);const p=new w.Node('Prop','DzNode',w.proxy);w.other.addNodeChild(p);assert.strictEqual(w.sandbox.WM2RestoreWearablePairs(w.figure,w.group,[[p,w.bone]],[]),false);assert.strictEqual(p.parent,w.other);}],
 ['later invalid pair stops movement of earlier valid pair',source=>{const w=setup(source);const first=new w.Node('First','DzNode',w.group);const second=new w.Node('Second','DzNode',w.proxy);w.other.addNodeChild(second);assert.strictEqual(w.sandbox.WM2RestoreWearablePairs(w.figure,w.group,[[first,w.figure],[second,w.bone]],[]),false);assert.strictEqual(first.parent,w.group);assert.strictEqual(second.parent,w.other);}]
];
const results=[];
for(const file of files){const source=fs.readFileSync(path.join(root,file),'utf8');for(const[name,test]of cases){try{test(source);results.push({file,test:name,pass:true});}catch(e){results.push({file,test:name,pass:false,error:e.message});}}}
const output={sourceRoot:root,overlay,scope:'candidate source-extracted functions; mock Scene/Dz; no native',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
if(args.includes('--output'))fs.writeFileSync(path.resolve(arg('--output')),JSON.stringify(output,null,2));
console.log(JSON.stringify({sourceRoot:root,overlay,passed:output.passed,failed:output.failed,failures:results.filter(r=>!r.pass).map(r=>({file:r.file,test:r.test,error:r.error.split('\n')[0]}))},null,2));
process.exitCode=output.failed?1:0;
