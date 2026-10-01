const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');
const {createWorld}=require('./regressions.cjs');
const args=process.argv.slice(2);
function arg(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
const root=path.resolve(arg('--source-root',path.join(__dirname,'../..')));
const overlay=args.includes('--overlay');
const manifest={"engineFiles":["Wearables Manager Full.dsa","Wearables Manager Menu.dsa","Wearables Manager Take Off.dsa","Wearables Manager Put On.dsa"]};
const helper=''; if(overlay)throw new Error('Packaged tests check actual sources only');
function setup(source){
  if(overlay)for(const r of manifest.replaceNodeExpressionsOnly)source=source.split(r.from).join(r.to);
  const w=createWorld(source),s=w.sandbox;
  if(overlay)vm.runInContext(helper,s);
  const oldInherits=w.Node.prototype.inherits;
  w.Node.prototype.inherits=function(t){if(this.disposed)throw new Error('Disposed QObject');return t==='DzNode'||oldInherits.call(this,t);};
  const unwrap=n=>n&&n.__native?n.__native:n;
  function alias(n){
    if(!n)return null;
    const a={__native:n};
    for(const key of ['elementID','name','objectName','label'])Object.defineProperty(a,key,{get:()=>n[key],set:v=>{n[key]=v;}});
    for(const method of ['inherits','className','getLabel','findDataItem','addDataItem','setName','setLabel','setVisible'])a[method]=function(...v){return n[method](...v);};
    a.getNodeParent=()=>alias(n.getNodeParent());
    a.getNodeChildren=r=>n.getNodeChildren(r).map(alias);
    a.findNodeChild=(name,recurse)=>alias(n.findNodeChild(name,recurse));
    a.addNodeChild=child=>n.addNodeChild(unwrap(child));
    return a;
  }
  s.Scene.getNodeList=()=>w.state.nodes.map(alias);
  s.Scene.findNodeByLabel=label=>alias(w.state.nodes.find(n=>n.label===label));
  w.alias=alias;
  w.same=(a,b)=>s.WM2SameNode?s.WM2SameNode(a,b):a===b;
  return w;
}
const cases=[
 ['same session node with fresh wrappers compares equal',source=>{const w=setup(source);const n=new w.Node('N');w.state.nodes=[n];assert.notStrictEqual(w.alias(n),n);assert.strictEqual(w.same(w.alias(n),n),true);}],
 ['constructor node is recognized in freshly wrapped scene enumeration',source=>{const w=setup(source);const n=new w.Node('N');w.state.nodes=[n];assert.strictEqual(w.sandbox.WM2SceneContains(n),true);}],
 ['stable snapshot creation and repeat-save accept target aliases',source=>{const w=setup(source);const n=new w.Node('Target');w.state.nodes=[n];const d=w.data('MatewWearables',{}),s=d.getSettings();assert(w.sandbox.WM2SaveNodeReference(s,'Target',n,'name').ok);assert(w.sandbox.WM2SaveNodeReference(s,'Target',w.alias(n),'name').ok);const r=w.sandbox.WM2ResolveNodeReference(s,'Target','name');assert.strictEqual(r.ok,true);assert.strictEqual(w.same(r.node,n),true);assert.strictEqual(r.node.findDataItem('MatewWearables').values.NodeID,n.findDataItem('MatewWearables').values.NodeID);}],
 ['bound pair survives constructor versus scene aliases',source=>{const w=setup(source);const f=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const g=w.bind(new w.Node('Storage','DzGroupNode'),'pair');w.state.nodes=[f,g];assert.strictEqual(w.same(w.sandbox.FindBoundFigure(g),f),true);assert.strictEqual(w.same(w.sandbox.FindBoundGroup(f),g),true);}],
 ['proxy owner and bone references survive fresh aliases',source=>{const w=setup(source);const f=new w.Node('Genesis9','DzFigure');const bone=new w.Node('hip','DzBone',f);const g=new w.Node('Storage','DzGroupNode');const proxy=new w.Node('Proxy','DzGroupNode',g);w.state.nodes=[f,bone,g,proxy];assert(w.sandbox.WM2MarkBoneProxy(proxy,f,bone).ok);const r=w.sandbox.WM2ResolveBoneProxy(w.alias(g),w.alias(proxy),w.alias(f));assert.strictEqual(r.ok,true);assert.strictEqual(w.same(r.node,bone),true);}],
 ['attachment root filter accepts aliased parent chain',source=>{const w=setup(source);const f=new w.Node('Genesis9','DzFigure');const shirt=new w.Node('Shirt','DzFigure',f);w.state.nodes=[f,shirt];w.sandbox.oHumanFigure=f;assert.strictEqual(w.sandbox.FilterParentedToHumanFigureAndNotAnExemption.call([],w.alias(shirt)),true);}],
 ['node array membership deduplicates wrappers of same native node',source=>{const w=setup(source);const n=new w.Node('N');w.state.nodes=[n];const nodes=[w.alias(n)];const i=w.sandbox.WM2NodeIndexOf?w.sandbox.WM2NodeIndexOf(nodes,w.alias(n)):nodes.indexOf(w.alias(n));assert.strictEqual(i,0);}],
 ['distinct nodes with same persisted ID and label remain distinct',source=>{const w=setup(source);const a=new w.Node('A');const b=new w.Node('B');a.label=b.label='Duplicate';a.data.MatewWearables=w.data('MatewWearables',{NodeID:'copied'});b.data.MatewWearables=w.data('MatewWearables',{NodeID:'copied'});w.state.nodes=[a,b];assert.strictEqual(w.same(w.alias(a),w.alias(b)),false);}],
 ['retained nonlive wrapper is rejected by live guard',source=>{const w=setup(source);const n=new w.Node('Removed');w.state.nodes=[];assert.strictEqual(w.sandbox.WM2SceneContains(w.alias(n)),false);}],
 ['disposed wrapper is rejected without an exception',source=>{const w=setup(source);const n=new w.Node('Disposed');n.disposed=true;w.state.nodes=[];assert.strictEqual(w.sandbox.WM2SceneContains(w.alias(n)),false);assert.strictEqual(w.same(w.alias(n),n),false);}],
 ['equal elementID with different node class is not equivalent',source=>{const w=setup(source);const a=new w.Node('A');const b=new w.Node('B','DzGroupNode');b.elementID=a.elementID;w.state.nodes=[a];assert.strictEqual(w.same(w.alias(a),w.alias(b)),false);}],
 ['duplicate session identities in scene fail closed',source=>{const w=setup(source);const a=new w.Node('A');const b=new w.Node('B');b.elementID=a.elementID;w.state.nodes=[a,b];assert.strictEqual(w.sandbox.WM2SceneContains(a),false);}]
];
const results=[];
for(const file of manifest.engineFiles){const source=fs.readFileSync(path.join(root,file),'utf8');for(const[name,test]of cases){try{test(source);results.push({file,test:name,pass:true});}catch(e){results.push({file,test:name,pass:false,error:e.message});}}}
const output={sourceRoot:root,overlay,scope:'actual extracted candidate functions + fresh-wrapper mock; optional scalar-key proposal overlay; no native',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
if(args.includes('--output'))fs.writeFileSync(path.resolve(arg('--output')),JSON.stringify(output,null,2));
console.log(JSON.stringify({sourceRoot:root,overlay,passed:output.passed,failed:output.failed,failures:results.filter(r=>!r.pass).map(r=>({file:r.file,test:r.test,error:r.error.split('\n')[0]}))},null,2));
process.exitCode=output.failed?1:0;
