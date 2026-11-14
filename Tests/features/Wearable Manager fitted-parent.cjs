'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../../Wearable Manager Wardrobe.dsa'),'utf8');
let passed=0;const failures=[];function test(name,fn){try{fn();passed++;}catch(e){failures.push({name,error:e.stack});}}
function fixture(){
 const fig={id:'figure'},other={id:'other'},bone={id:'bone'},n={id:'node',getLabel:()=> 'Jacket 03a',className:()=> 'DzFigure',getNodeParent:()=>n.refs.parent};
 const fields=['parent','follow','collision','shell','rigidFollow'],refs={parent:{kind:'none'},follow:{kind:'figure'},collision:{kind:'none'},shell:{kind:'none'},rigidFollow:{kind:'none'}};
 const spec={id:'part',root:true,name:'Jacket 03a',refs},it={id:'item',variantID:'variant',name:'Jacket 03a',parts:[spec]},inf={root:n,rootID:'node',instanceID:'instance',parts:{part:n},allKeys:['node'],where:'stored'};
 n.refs={parent:fig,follow:fig,collision:null,shell:null,rigidFollow:null};const map={figure:fig,other,bone,node:n};
 const c=vm.createContext({REF_FIELDS:fields,same:(a,b)=>a===b||!a&&!b,nodeReferences:n=>n.refs,resolveBonePath:()=>bone,problem:(code,m)=>Object.assign(Error(m),{code}),must:(v,c,m)=>{if(!v)throw Error(c+':'+m);},app:{db:{libraryID:'library'}},figureIdentity:()=> 'owner',expectList:assert.ok,expectObject:assert.ok,own:(o,k)=>Object.hasOwn(o,k),live:k=>map[k],nodeByID:id=>map[id]||null,value:(n,k)=>k==='NodeID'?n.id:'',boneOwner:n=>n===bone?fig:null,follow:n=>n.refs.follow,linked:(n,k)=>k==='Shell Node'?n.refs.shell:null});
 for(const name of ['resolvePortable','portableLinkMatches','nativeLinkCheckImpl','validateRecoveryImpl'])vm.runInContext(getFunction(source,name).text,c);
 return {c,fig,other,bone,n,spec,it,inf};
}
test('saved unparented fitted jacket accepts WM-restored direct figure parent without changing catalog',()=>{const w=fixture(),before=JSON.stringify(w.it);w.c.nativeLinkCheckImpl(w.it,w.inf,w.fig);assert.equal(JSON.stringify(w.it),before);});
test('saved direct parent accepts unparented root with the same Fit To',()=>{const w=fixture();w.spec.refs.parent={kind:'figure'};w.n.refs.parent=null;w.c.nativeLinkCheckImpl(w.it,w.inf,w.fig);});
for(const change of ['foreignParent','boneParent','foreignFit','missingFit','childPart','savedBone','unfittedProp','collision'])test(change+' remains a reference mismatch',()=>{const w=fixture();if(change==='foreignParent')w.n.refs.parent=w.other;if(change==='boneParent')w.n.refs.parent=w.bone;if(change==='foreignFit')w.n.refs.follow=w.other;if(change==='missingFit')w.n.refs.follow=null;if(change==='childPart')w.spec.root=false;if(change==='savedBone')w.spec.refs.parent={kind:'figure-bone',path:['hip']};if(change==='unfittedProp'){w.spec.refs.follow={kind:'none'};w.n.refs.follow=null;}if(change==='collision')w.n.refs.collision=w.other;assert.throws(()=>w.c.nativeLinkCheckImpl(w.it,w.inf,w.fig),e=>e.code==='NATIVE_REFERENCE_MISMATCH');});
function recovery(w){return {schemaVersion:1,libraryID:'library',itemID:'item',variantID:'variant',rootID:'node',instanceID:'instance',ownerFigureID:'owner',parts:[{partID:'part',nodeID:'node',refs:{parent:'figure',follow:'figure',collision:'',shell:'',rigidFollow:''}}],hierarchy:[{nodeID:'node',parentID:'figure',className:'DzFigure'}]};}
test('stored recovery accepts captured actual parent and saved Fit To, preserving exact restore data',()=>{const w=fixture(),rec=recovery(w),before=JSON.stringify(rec);w.n.refs.follow=null;w.n.refs.parent={id:'storage'};assert.equal(w.c.validateRecoveryImpl(w.it,w.inf,w.fig,rec,true),rec);assert.equal(JSON.stringify(rec),before);});
test('stored recovery still rejects another figure parent',()=>{const w=fixture(),rec=recovery(w);rec.parts[0].refs.parent='other';w.n.refs.follow=null;assert.throws(()=>w.c.validateRecoveryImpl(w.it,w.inf,w.fig,rec,true),e=>e.code==='RECOVERY_REFERENCE_CONFLICT');});
console.log(JSON.stringify({passed,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
