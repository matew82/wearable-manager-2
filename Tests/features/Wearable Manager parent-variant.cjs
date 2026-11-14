const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const src=fs.readFileSync(path.resolve(__dirname,'../../Wearable Manager Wardrobe.dsa'),'utf8');
let passed=0;function test(n,f){f();passed++;}
function fixture(){
 const fig={objectName:'Genesis8Female'},hand={getLabel:()=> 'Right Hand'},otherHand={getLabel:()=> 'Left Hand'};
 const md={Role:'ItemRoot',OwnerFigureID:'owner',LibraryID:'lib',ItemID:'camera',VariantID:'v1',InstanceID:'i1',PartID:'p1'};
 const root={getLabel:()=> 'Camera',getNodeParent:()=>hand,inherits:()=>false,className:()=> 'DzNode'};
 const item={id:'camera',name:'Camera',variantID:'v1',figureType:'Genesis8Female',parts:[{id:'p1',name:'Camera',root:true,className:'DzNode',refs:{parent:{kind:'none'},follow:{kind:'none'}}}]};
 const db={libraryID:'lib',items:{camera:item}},state={fields:{},refs:{parent:hand,follow:null},ancestor:fig};
 const c=vm.createContext({
  dataObject:n=>n===root?md:null,figureIdentity:()=> 'owner',own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),
  problem:(code,message)=>Error(code+': '+message),same:(a,b)=>a===b,humanAncestor:()=>state.ancestor,follow:()=>null,
  wearableHierarchy:()=>[root],isFigure:()=>false,uniqueNodeID:()=> 'node1',findData:()=>[root],value:(n,k)=> n===root?(state.fields[k]||md[k]||''):'',
  nodeReferences:()=>state.refs,REF_FIELDS:['parent','follow'],
  portableLinkMatches:(spec,field,actual)=>field==='parent'?spec.refs.parent.kind==='figure'&&actual===fig:actual===null,
  portableRef:n=>n===fig?{kind:'figure'}:n===hand?{kind:'figure-bone',path:['rHand']}:n===otherHand?{kind:'figure-bone',path:['lHand']}:{kind:'part',partID:'foreign'},
  key:n=>n===hand?'hand':n===otherHand?'otherHand':'root',jsonText:JSON.stringify,clonePlain:o=>JSON.parse(JSON.stringify(o)),
  closeNumbers:(a,b)=>JSON.stringify(a)===JSON.stringify(b)
 });
 for(const n of ['inspectCompositeAddition','compositeVariantScanMatches'])vm.runInContext(getFunction(src,n).text,c);
 return {c,fig,hand,otherHand,root,item,db,state,scan:()=>c.inspectCompositeAddition(fig,root,db)};
}
test('registered prop attached to hand is a discoverable variant without changing original',()=>{
 const f=fixture(),before=JSON.stringify(f.db),s=f.scan();assert.equal(s.rootParentChange.ref.kind,'figure-bone');
 assert.equal(s.rootParentLabel,'Right Hand');assert.equal(s.partCount,1);assert.equal(s.extraKeys.length,0);
 assert.equal(JSON.stringify(f.db),before);
});
test('attachment to figure root is also supported',()=>{
 const f=fixture();f.fig.getLabel=()=> 'Charlie';f.state.refs.parent=f.fig;
 assert.equal(f.scan().rootParentChange.ref.kind,'figure');
});
test('unchanged root link has no variant',()=>{
 const f=fixture();f.item.parts[0].refs.parent={kind:'figure'};f.state.refs.parent=f.fig;assert.equal(f.scan(),null);
});
test('unrelated native link mismatch is still rejected',()=>{
 const f=fixture();f.state.refs.follow={};assert.throws(()=>f.scan(),/COMPOSITE_LINK_CHANGED/);
});
test('attachment to another wearable is not accepted as hand reparenting',()=>{
 const f=fixture();f.state.refs.parent={};assert.throws(()=>f.scan(),/COMPOSITE_LINK_CHANGED/);
});
test('foreign figure cannot adopt item',()=>{
 const f=fixture();f.state.ancestor={};assert.equal(f.scan(),null);
});
test('pending transaction and GeoShell recovery remain blocked',()=>{
 for(const field of ['Pending','GeoWardrobeSnapshot']){const f=fixture();f.state.fields[field]='pending';assert.throws(()=>f.scan(),/COMPOSITE_/);}
});
test('changed hand after confirmation invalidates payload',()=>{
 const f=fixture(),s=f.scan(),payload=JSON.parse(JSON.stringify(s));
 assert(f.c.compositeVariantScanMatches(s,payload));
 f.state.refs.parent=f.otherHand;assert(!f.c.compositeVariantScanMatches(f.scan(),payload));
});
test('old saved parent in a different item is not silently reinterpreted',()=>{
 const f=fixture();f.item.parts[0].refs.parent={kind:'part',partID:'x'};assert.throws(()=>f.scan(),/COMPOSITE_LINK_CHANGED/);
});
console.log(JSON.stringify({passed,failed:0,nativeDAZ:false}));
