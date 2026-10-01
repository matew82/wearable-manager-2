const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const args = process.argv.slice(2);
function arg(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const sourceRoot = path.resolve(arg('--source-root', path.join(__dirname, '../..')));
const mode = arg('--mode', 'source');
assert(['baseline', 'source'].includes(mode), 'mode must be baseline/source');
const manifest = {"engineFiles":["Wearables Manager Full.dsa","Wearables Manager Menu.dsa","Wearables Manager Take Off.dsa","Wearables Manager Put On.dsa"],"addFunctions":["WM2ReferenceResult","WM2NodeSettings","WM2SceneContains","WM2NodesWithValue","WM2UniqueToken","WM2EnsureNodeID","WM2GetNodeReferenceKeys","WM2ResolveNodeReference","WM2SaveNodeReference","WM2BoundPair","WM2IsBoneOfFigure","WM2LegacyBoneMatches","WM2ResolveBoneProxy","WM2MarkBoneProxy","WM2AdoptLegacyBoneProxy"],"replaceFunctions":["FindBoundGroup","FindBoundFigure","BindHumanFigureToGroup","IsParentedToHuman","FilterParentedToHumanFigureAndNotAnExemption","ParentToBoneGroup"]};
const proposal = "", reviewProposal = "";

function extract(source, name, optional = false) {
  const match = new RegExp('(?:^|\\n)[\\t ]*function ' + name + '\\(').exec(source);
  if (!match) { if (optional) return ''; throw new Error('Missing source function: ' + name); }
  const start = match.index + (source[match.index] === '\n' ? 1 : 0);
  let quote = '', comment = '', escape = false, depth = 0, begun = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (comment === '//') { if (c === '\n') comment = ''; continue; }
    if (comment === '/*') { if (c === '*' && next === '/') { comment = ''; i++; } continue; }
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && (next === '/' || next === '*')) { comment = '/' + next; i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') { begun = true; depth++; }
    if (c === '}' && begun && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed source function: ' + name);
}

function createWorld(source) {
  const state = { nodes: [], queued: [], errors: [] };
  function data(key, initial) {
    const values = { ...initial };
    const settings = { getStringValue:(k,d)=>values[k] ?? d, setStringValue:(k,v)=>{values[k]=v;}, removeValue:k=>{delete values[k];} };
    return { key, values, getSettings:()=>settings };
  }
  class Node {
    constructor(name, type = 'DzNode', parent = null) {
      this.name = this.objectName = name; this.label = name; this.type = type;
      this.elementID = Node.next++; this.parent = null; this.children = []; this.data = {};
      if (parent) parent.addNodeChild(this);
    }
    inherits(t) { return t === 'DzNode' || this.type === t || (t === 'DzSkeleton' && this.type === 'DzFigure'); }
    className() { return this.type; }
    getNodeParent() { return this.parent; }
    getFollowTarget() { return this.follow || null; }
    getNodeChildren(recursive) { return recursive ? this.children.flatMap(c=>[c,...c.getNodeChildren(true)]) : this.children.slice(); }
    getLabel() { return this.label; }
    setName(n) { this.name = this.objectName = n; }
    setLabel(n) { this.label = n; }
    setVisible(v) { this.visible = v; }
    findDataItem(k) { return this.data[k]; }
    addDataItem(d) { this.data[d.key] = d; }
    findNodeChild(n,r=false) { return this.getNodeChildren(r).find(c=>c.name===n); }
    addNodeChild(child) {
      if (child.parent) child.parent.children = child.parent.children.filter(c=>c!==child);
      child.parent=this; this.children.push(child);
      // Parenting does not register a newly constructed node with Scene.
    }
  }
  Node.next=1;
  const bind = (n,id) => {n.data.MatewWearables=data('MatewWearables',{ID:id}); return n;};
  const sandbox={
    DATA_ITEM_NAME:'MatewWearables', SETTINGS_ID:'ID', SETTINGS_COLLISION_ITEM:'Collision_Item', SETTINGS_TARGET:'Target',
    ARR_HUMAN_FIGURES_NAMES:JSON.parse(/var ARR_HUMAN_FIGURES_NAMES = (\[[^;]+\]);/.exec(source)[1]),
    Scene:{getNodeList:()=>state.nodes,findNodeByLabel:l=>state.nodes.find(n=>n.label===l),
      addNode:n=>{if(state.nodes.includes(n))return false;state.nodes.push(n);return true;},
      removeNode:n=>{state.nodes=state.nodes.filter(x=>x!==n&&!n.getNodeChildren(true).includes(x));if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=null;}},
    oRemoveQueue:{AddDataToQueue:(...a)=>state.queued.push(a)},
    DzSceneHelper:()=>({findPropertyByInternalName:(name,node)=>node.collision}),
    DzSimpleElementData:function(k){return data(k,{});}, DzGroupNode:function(){return new Node('','DzGroupNode');},
    MessageBox:{critical:m=>state.errors.push(m)}, bAltPressed:false
  };
  vm.createContext(sandbox);
  require("../support/config.cjs").install(sandbox,sourceRoot);
  const originalNames = ['GenerateUniqueID','BindHumanFigureToGroup','FindBoundGroup','FindBoundFigure','GetCurrentHumanFigure',
    'IsNodeHumanFigure','FilterParentedToHumanFigureAndNotAnExemption','IsParentedToHuman','SaveCollisionItem','RestoreCollisionItem','ReturnWearable','ParentToBoneGroup','err'];
  originalNames.forEach(n=>vm.runInContext(extract(source,n),sandbox));
  if(mode==='proposal') vm.runInContext(proposal + '\n' + reviewProposal,sandbox);
  if(mode==='source') manifest.addFunctions.forEach(n=>vm.runInContext(extract(source,n),sandbox));
  // Native-correct comparison helpers were added after the original graph manifest.
  // They remain optional so the same runner can reproduce the earlier source baseline.
  if(mode==='source') ['WM2NodeKey','WM2SameNode','WM2LiveNode','WM2NodeIndexOf'].forEach(n=>{
    const code=extract(source,n,true);
    if(code)vm.runInContext(code,sandbox);
  });
  return {state,sandbox,Node,bind,data};
}

const cases = [
  ['ordinary bound pair resolves', w=>{const f=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const g=w.bind(new w.Node('Storage','DzGroupNode'),'pair');w.state.nodes=[f,g];assert.strictEqual(w.sandbox.FindBoundFigure(g),f);assert.strictEqual(w.sandbox.FindBoundGroup(f),g);}],
  ['missing owner does not resolve group itself',w=>{const g=w.bind(new w.Node('Storage','DzGroupNode'),'pair');w.state.nodes=[g];assert.strictEqual(w.sandbox.GetCurrentHumanFigure(g),false);}],
  ['reordered scene resolves typed owner',w=>{const f=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const g=w.bind(new w.Node('Storage','DzGroupNode'),'pair');w.state.nodes=[g,f];assert.strictEqual(w.sandbox.FindBoundFigure(g),f);}],
  ['untyped matching node is excluded',w=>{const n=w.bind(new w.Node('Prop'),'pair');const f=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const g=w.bind(new w.Node('Storage','DzGroupNode'),'pair');w.state.nodes=[n,f,g];assert.strictEqual(w.sandbox.FindBoundFigure(g),f);}],
  ['copied binding IDs stop first-match selection',w=>{const f=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const f2=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const g=w.bind(new w.Node('Storage','DzGroupNode'),'pair');w.state.nodes=[f,g,f2];assert.throws(()=>w.sandbox.FindBoundGroup(f2),/share|ambiguous/);}],
  ['bind refuses an already shared identity',w=>{const f=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const f2=w.bind(new w.Node('Genesis9','DzFigure'),'pair');const g=new w.Node('Storage','DzGroupNode');w.state.nodes=[f,f2,g];assert.throws(()=>w.sandbox.BindHumanFigureToGroup(f2,g),/ambiguous/);assert.strictEqual(g.findDataItem('MatewWearables')?.values.ID,undefined);}],
  ['explicit Genesis9_1 root remains eligible',w=>{const f=new w.Node('Genesis9_1','DzFigure');const shirt=new w.Node('Shirt','DzFigure',f);w.state.nodes=[f,shirt];w.sandbox.oHumanFigure=f;assert.strictEqual(w.sandbox.FilterParentedToHumanFigureAndNotAnExemption.call([],shirt),true);}],
  ['scene-root stale entry is rejected safely',w=>{const f=new w.Node('Genesis9','DzFigure');const prop=new w.Node('Prop');w.state.nodes=[f,prop];w.sandbox.oHumanFigure=f;assert.strictEqual(w.sandbox.FilterParentedToHumanFigureAndNotAnExemption.call([],prop),false);}],
  ['duplicate collision labels preserve saved target',w=>{const f=new w.Node('Genesis9','DzFigure');const a=new w.Node('A');const b=new w.Node('B');a.label=b.label='Collider';const shirt=new w.Node('Shirt','DzFigure');w.state.nodes=[f,a,b,shirt];let value=b;shirt.collision={getValue:()=>value,setValue:v=>{value=v;}};
    if(w.sandbox.WM2SaveNodeReference){const s=w.data('MatewWearables',{}).getSettings();assert(w.sandbox.WM2SaveNodeReference(s,'Collision_Item',b,'label').ok);value=w.sandbox.WM2ResolveNodeReference(s,'Collision_Item','label').node;}
    else{w.sandbox.SaveCollisionItem(f,shirt);value=null;w.sandbox.RestoreCollisionItem(shirt);}assert.strictEqual(value,b);}],
  ['renamed stable collision target still resolves',w=>{const b=new w.Node('B');w.state.nodes=[b];const s=w.data('MatewWearables',{}).getSettings();assert(w.sandbox.WM2SaveNodeReference(s,'Collision_Item',b,'label').ok);b.setName('NewName');b.setLabel('NewLabel');assert.strictEqual(w.sandbox.WM2ResolveNodeReference(s,'Collision_Item','label').node,b);}],
  ['ambiguous legacy label fails closed',w=>{const a=new w.Node('A');const b=new w.Node('B');a.label=b.label='Collider';w.state.nodes=[a,b];const s=w.data('MatewWearables',{Collision_Item:'Collider'}).getSettings();const r=w.sandbox.WM2ResolveNodeReference(s,'Collision_Item','label');assert.strictEqual(r.ok,false);assert.strictEqual(r.status,'ambiguous');}],
  ['duplicate stable node IDs fail closed',w=>{const b=new w.Node('B');w.state.nodes=[b];const s=w.data('MatewWearables',{}).getSettings();assert(w.sandbox.WM2SaveNodeReference(s,'Target',b,'name').ok);const clone=new w.Node('Bcopy');clone.data.MatewWearables=w.data('MatewWearables',{NodeID:b.data.MatewWearables.values.NodeID});w.state.nodes.push(clone);const r=w.sandbox.WM2ResolveNodeReference(s,'Target','name');assert.strictEqual(r.ok,false);assert.strictEqual(r.status,'ambiguous');}],
  ['missing stable target never falls back to same-name replacement',w=>{const b=new w.Node('B');w.state.nodes=[b];const s=w.data('MatewWearables',{}).getSettings();assert(w.sandbox.WM2SaveNodeReference(s,'Target',b,'name').ok);w.state.nodes=[new w.Node('B')];const r=w.sandbox.WM2ResolveNodeReference(s,'Target','name');assert.strictEqual(r.ok,false);assert.strictEqual(r.status,'missing');}],
  ['pending snapshot is not overwritten',w=>{const b=new w.Node('B');const a=new w.Node('A');w.state.nodes=[a,b];const d=w.data('MatewWearables',{});const s=d.getSettings();assert(w.sandbox.WM2SaveNodeReference(s,'Target',b,'name').ok);const saved=d.values.Target_NodeID;w.state.nodes=[a];const r=w.sandbox.WM2SaveNodeReference(s,'Target',a,'name');assert.strictEqual(r.ok,false);assert.strictEqual(d.values.Target_NodeID,saved);}],
  ['name-shaped legacy subgroup stays intact pending review',w=>{const f=new w.Node('Genesis9','DzFigure');const bone=new w.Node('hip','DzBone',f);const g=new w.Node('Storage','DzGroupNode');const p=new w.Node('Storage_hip','DzGroupNode',g);const prop=new w.Node('Prop','DzNode',p);w.state.nodes=[f,bone,g,p,prop];if(w.sandbox.WM2ResolveBoneProxy){const r=w.sandbox.WM2ResolveBoneProxy(g,p,f);assert.strictEqual(r.ok,false);assert.strictEqual(r.status,'needs-migration');}else w.sandbox.ReturnWearable(f,p,g);assert.strictEqual(prop.parent,p);}],
  ['marked proxy resolves renamed bone by stable identity',w=>{const f=new w.Node('Genesis9','DzFigure');const bone=new w.Node('hip','DzBone',f);const g=new w.Node('Storage','DzGroupNode');const p=new w.Node('Proxy','DzGroupNode',g);w.state.nodes=[f,bone,g,p];assert(w.sandbox.WM2MarkBoneProxy(p,f,bone).ok);bone.setName('renamedHip');assert.strictEqual(w.sandbox.WM2ResolveBoneProxy(g,p,f).node,bone);}],
  ['marked proxy rejects reparented bone',w=>{const f=new w.Node('Genesis9','DzFigure');const other=new w.Node('Genesis8Female','DzFigure');const bone=new w.Node('hip','DzBone',f);const g=new w.Node('Storage','DzGroupNode');const p=new w.Node('Proxy','DzGroupNode',g);w.state.nodes=[f,other,bone,g,p];assert(w.sandbox.WM2MarkBoneProxy(p,f,bone).ok);other.addNodeChild(bone);const r=w.sandbox.WM2ResolveBoneProxy(g,p,f);assert.strictEqual(r.ok,false);assert.strictEqual(r.status,'wrong-owner');}],
  ['new bone storage avoids hijacking legacy name-shaped group',w=>{const f=new w.Node('Genesis9','DzFigure');const bone=new w.Node('hip','DzBone',f);const prop=new w.Node('Prop','DzNode',bone);const g=new w.Node('Storage','DzGroupNode');const legacy=new w.Node('Storage_hip','DzGroupNode',g);w.state.nodes=[f,bone,prop,g,legacy];w.sandbox.oHumanFigure=f;w.sandbox.oGroup=g;w.sandbox.ParentToBoneGroup(bone,prop);assert.notStrictEqual(prop.parent,legacy);assert.strictEqual(prop.parent.findDataItem('MatewWearables').values.WM2Role,'BoneProxy');}]
];
module.exports = {createWorld, extract};
if (require.main === module) {
const results=[];
for(const file of manifest.engineFiles){
  const source=fs.readFileSync(path.join(sourceRoot,file),'utf8');
  for(const [name,run] of cases){try{run(createWorld(source));results.push({file,test:name,pass:true});}catch(e){results.push({file,test:name,pass:false,error:e.message});}}
}
const output={mode,sourceRoot,scope:mode==='proposal'?'actual source functions with proposed ES5 helper/replacement overlay; storage wrapper integration not exercised':'functions extracted from specified actual sourceRoot',passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
if(args.includes('--output'))fs.writeFileSync(path.resolve(arg('--output')),JSON.stringify(output,null,2));
console.log(JSON.stringify({mode,sourceRoot,passed:output.passed,failed:output.failed,failures:results.filter(r=>!r.pass)},null,2));
process.exitCode=output.failed?1:0;
}
