'use strict';
// Source-only regression suite: actual product support/functions, no overlays.
// Scene, QObject aliases and transfer side effects are isolated fixtures; no DAZ.
// Prints its receipt only. The parent runner owns receipt files and product edits.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert'),crypto=require('node:crypto');
const {files,getFunction}=require('../support/extract.cjs');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const root=path.resolve(arg('--source-root',path.join(__dirname,'../..')));
const supportPath=path.resolve(arg('--support-source',path.join(root,'Resources/WM2 Support.dsa')));
const supportText=fs.readFileSync(supportPath,'utf8');
new vm.Script(supportText,{filename:supportPath});
const profiles=[
 {figure:'Genesis9',children:['Genesis9Eyelashes','Genesis9Tear','Genesis9Eyes','Genesis9Mouth','G9EyebrowCards']},
 {figure:'Genesis8_1Female',children:['Genesis8_1FemaleEyelashes','Female 8_1 Tear']},
 {figure:'Genesis8_1Male',children:['Genesis8_1MaleEyelashes','Male 8_1 Tear']},
 {figure:'Genesis8Female',children:['Genesis8FemaleEyelashes']},
 {figure:'Genesis8Male',children:['Genesis8MaleEyelashes']}
];
const oldNames=['Genesis','Genesis2Female','Genesis2Male','Genesis3Female','Genesis3Male','Genesis8Female','Genesis8Male','Genesis8_1Female','Genesis8_1Male','Genesis9','Genesis9_1','Genesis10','Genesis10Female','Genesis10Male'];
const json=v=>JSON.parse(JSON.stringify(v)),tests=[],sourceReceipts=[];
function test(name,body,file){try{body();tests.push({name,...(file?{file}:{}),pass:true});}catch(e){tests.push({name,...(file?{file}:{}),pass:false,error:String(e.stack||e)});}}
function world(fresh=false,hostLists=false){
 const state={nodes:[],next:1,mutations:0,referenceWrites:0,followWrites:0};
 const unwrap=n=>n&&n.nativeNode||n;
 function alias(n){if(!n||!fresh)return n;return new Proxy({nativeNode:n},{get(t,k){if(k==='nativeNode')return n;const v=n[k];return typeof v==='function'?(...a)=>v.apply(n,a):v;},set(t,k,v){n[k]=v;return true;}});}
 function collection(nodes){if(!hostLists)return nodes.map(alias);const out={length:nodes.length};for(let i=0;i<nodes.length;i++)out[i]=alias(nodes[i]);return out;}
 class Node{
  constructor(name,type='DzFigure',parent=null){this._name=this.name=this.objectName=name;this.label=name;this.type=type;this.parent=unwrap(parent);this.elementID=state.next++;this.follow=null;this.grafts=[];state.nodes.push(this);}
  check(){if(this.disposed)throw Error('Disposed QObject fixture');}
  inherits(t){this.check();return t==='DzNode'||t===this.type||(t==='DzSkeleton'&&['DzFigure','DzLegacyFigure'].includes(this.type));}
  className(){this.check();return this.type;}getName(){this.check();return this._name;}getLabel(){this.check();return this.label;}
  getNodeParent(){this.check();return alias(this.parent);}getFollowTarget(){this.check();return alias(this.follow);}
  getSkeleton(){this.check();let p=this.parent;const seen=new Set();while(p&&!p.inherits('DzSkeleton')){if(seen.has(p))return null;seen.add(p);p=unwrap(p.parent);}return alias(p);}
  direct(){this.check();return this.extraChildren||state.nodes.filter(n=>unwrap(n.parent)===this);}
  getNumNodeChildren(){return this.direct().length;}getNodeChild(i){return alias(this.direct()[i]||null);}
  getNodeChildren(recursive){let out=this.direct().slice();if(recursive){const seen=new Set([this]);for(let i=0;i<out.length;i++){const n=unwrap(out[i]);if(seen.has(n))continue;seen.add(n);for(const child of n.direct())if(!seen.has(unwrap(child)))out.push(unwrap(child));}}return collection(out);}
  getNumGraftFigures(){this.check();return this.grafts.length;}getGraftFigure(i){this.check();return alias(this.grafts[i]||null);}
  setFollowTarget(target){this.check();state.followWrites++;this.follow=unwrap(target);}
  addNodeChild(child){this.check();child=unwrap(child);state.mutations++;child.parent=this;}
 }
 const c={Scene:{getNodeList:()=>collection(state.nodes),getNumNodes:()=>state.nodes.length,getNode:i=>alias(state.nodes[i]||null),findNodeByElementID:id=>alias(state.nodes.find(n=>String(n.elementID)===String(id))||null)}};
 vm.createContext(c);vm.runInContext(supportText,c,{filename:supportPath});
 const w={state,c,Node,alias,unwrap,support:c.WM2Support,config:c.WM2Support.defaults()};
 return w;
}
function setProfile(w,figure,children,cfg=w.config){const r=w.support.setProtectedChildNames(cfg,figure,children);assert.strictEqual(r.ok,true,r.message);return r.config;}
function simpleScene(fresh=false,host=false){const w=world(fresh,host),owner=new w.Node('Genesis9'),carrier=new w.Node('Carrier','DzFigure',owner),body=new w.Node('Genesis9Eyes','DzFigure',carrier);carrier.follow=owner;return {...w,owner,carrier,body};}
function blocked(w,node,owner=w.owner,cfg=w.config){return w.support.isProtectedTransfer(w.alias(node),w.alias(owner),cfg);}

test('fresh schema2 defaults drop only the four inherited future compatibility entries',()=>{const w=world();assert.strictEqual(w.config.schema,2);assert.deepStrictEqual(json(w.config.supportedFigures),oldNames.slice(0,10));assert.strictEqual(w.config.protectedChildren.length,5);});
for(const p of profiles)test('default protection profile '+p.figure,()=>{const w=world();assert.deepStrictEqual(json(w.support.protectedChildNames(w.config,p.figure)),p.children);});
test('schema1 migration preserves every saved registry name and icon rule without input mutation',()=>{const w=world(),old={schema:1,iconRules:[{kind:'exactName',pattern:'Saddle',icon:'Wearables Manager - Prop.png'}],supportedFigures:oldNames.concat(['HorseFromSavedConfig'])},before=JSON.stringify(old),r=w.support.validate(old);assert(r.ok,r.message);assert.strictEqual(r.config.schema,2);assert.deepStrictEqual(json(r.config.supportedFigures),old.supportedFigures);assert.deepStrictEqual(json(r.config.iconRules),old.iconRules);for(const p of profiles)assert.deepStrictEqual(json(w.support.protectedChildNames(r.config,p.figure)),p.children);assert.strictEqual(JSON.stringify(old),before);});
test('schema1 migration retains an intentionally empty registry',()=>{const w=world(),r=w.support.validate({schema:1,iconRules:[],supportedFigures:[]});assert(r.ok,r.message);assert.deepStrictEqual(json(r.config.supportedFigures),[]);});
test('duplicate protected profile names are rejected without mutation',()=>{const w=world();w.config.protectedChildren.push({figure:'Genesis9',children:['Other']});const before=JSON.stringify(w.config);assert.strictEqual(w.support.validate(w.config).ok,false);assert.strictEqual(JSON.stringify(w.config),before);});
test('duplicate child names in one profile are rejected',()=>{const w=world();w.config.protectedChildren[0].children=['Anatomy','Anatomy'];assert.strictEqual(w.support.validate(w.config).ok,false);});
test('same child name in different figure profiles is valid',()=>{const w=world();let cfg=setProfile(w,'Genesis9',['Anatomy']);cfg=setProfile(w,'Genesis8Female',['Anatomy'],cfg);assert.strictEqual(w.support.validate(cfg).ok,true);});
test('editing protection preserves registry and icon rules and clones the input',()=>{const w=world();w.config.supportedFigures.push('SavedFutureType');w.config.iconRules.push({kind:'exactLabel',pattern:'Saddle',icon:'Wearables Manager - Prop.png'});const before=JSON.stringify(w.config),cfg=setProfile(w,'Genesis9',['ChosenBody']);assert.notStrictEqual(cfg,w.config);assert.deepStrictEqual(json(cfg.supportedFigures),json(w.config.supportedFigures));assert.deepStrictEqual(json(cfg.iconRules),json(w.config.iconRules));assert.strictEqual(JSON.stringify(w.config),before);});
test('empty edited profile intentionally overrides inherited protection',()=>{const w=world(),cfg=setProfile(w,'Genesis9',[]);assert.deepStrictEqual(json(w.support.protectedChildNames(cfg,'Genesis9')),[]);});
test('protection getter returns an independent list',()=>{const w=world(),list=w.support.protectedChildNames(w.config,'Genesis9');list.push('Injected');assert(!w.support.protectedChildNames(w.config,'Genesis9').includes('Injected'));});
test('invalid exact child names fail setter without input mutation',()=>{const w=world(),before=JSON.stringify(w.config);for(const children of [[''],['\t'],['Body','Body']])assert.strictEqual(w.support.setProtectedChildNames(w.config,'Genesis9',children).ok,false);assert.strictEqual(JSON.stringify(w.config),before);});
test('figure internal getName wins over stale .name and display label',()=>{const w=world(),f=new w.Node('HorseActualInternal');f.name='StaleAlias';f.label='DAZ Horse 2';assert.strictEqual(w.support.figureInternalName(f),'HorseActualInternal');});
test('getName-only figure is supported and registers its actual internal name',()=>{const w=world(),f=new w.Node('HorseActualInternal');delete f.name;delete f.objectName;f.label='DAZ Horse 2';const r=w.support.addSupportedFigure(w.config,f);assert(r.ok,r.message);assert(r.config.supportedFigures.includes('HorseActualInternal'));assert(!r.config.supportedFigures.includes('DAZ Horse 2'));assert.strictEqual(w.support.isSupportedFigure(f,r.config),true);});
test('internal-name fallback never registers display label',()=>{const w=world(),f=new w.Node('InternalFallback');f.getName=undefined;f.label='Visible Label';assert.strictEqual(w.support.figureInternalName(f),'InternalFallback');delete f.name;assert.strictEqual(w.support.figureInternalName(f),'');});
test('selected bone seeds all nonbone attached descendants including clothing and nested props',()=>{const w=world(),f=new w.Node('HorseActualInternal'),hip=new w.Node('hip','DzBone',f),eyes=new w.Node('Eyes','DzFigure',hip),saddle=new w.Node('Saddle','DzFigure',f),strap=new w.Node('Strap','DzNode',saddle),box=new w.Node('AccessoryGroup','DzGroupNode',f),prop=new w.Node('Tag','DzNode',box);saddle.follow=f;f.label='DAZ Horse 2';delete f.name;const before=JSON.stringify(w.config),r=w.support.addSupportedFigure(w.config,hip);assert(r.ok,r.message);const names=json(w.support.protectedChildNames(r.config,'HorseActualInternal')).sort();assert.deepStrictEqual(names,['AccessoryGroup','Eyes','Saddle','Strap','Tag'].sort());assert(!r.config.supportedFigures.includes('hip'));assert.strictEqual(JSON.stringify(w.config),before);assert.strictEqual(w.state.mutations,0);assert.strictEqual(w.state.followWrites,0);});
test('custom seed deduplicates repeated internal names across current attachments',()=>{const w=world(),f=new w.Node('HorseActualInternal');new w.Node('Anatomy','DzNode',f);new w.Node('Anatomy','DzFigure',f);const r=w.support.addSupportedFigure(w.config,f);assert(r.ok,r.message);assert.deepStrictEqual(json(w.support.protectedChildNames(r.config,'HorseActualInternal')),['Anatomy']);});
test('re-registering preserves explicit edited profile rather than reseeding clothing',()=>{const w=world(),f=new w.Node('HorseActualInternal');new w.Node('Saddle','DzFigure',f);let r=w.support.addSupportedFigure(w.config,f);assert(r.ok,r.message);const cfg=setProfile(w,'HorseActualInternal',[],r.config);new w.Node('LaterClothing','DzFigure',f);r=w.support.addSupportedFigure(cfg,f);assert(r.ok,r.message);assert.deepStrictEqual(json(w.support.protectedChildNames(r.config,'HorseActualInternal')),[]);});
test('fresh alias wrappers and indexed native-style lists support bone registration and subtree checks',()=>{const w=world(true,true),f=new w.Node('HorseActualInternal'),b=new w.Node('hip','DzBone',f),p=new w.Node('Body','DzNode',b);const r=w.support.addSupportedFigure(w.config,w.alias(b));assert(r.ok,r.message);assert.strictEqual(r.figure.elementID,f.elementID);assert(w.support.protectedChildNames(r.config,'HorseActualInternal').includes('Body'));assert.strictEqual(w.support.isProtectedTransfer(w.alias(p),w.alias(f),r.config),true);});
test('direct protected node and descendants beneath it are blocked',()=>{const w=simpleScene();assert.strictEqual(blocked(w,w.body),true);const p=new w.Node('Decal','DzNode',w.body);assert.strictEqual(blocked(w,p),true);});
test('movable ancestor cannot carry a protected descendant',()=>{const w=simpleScene();assert.strictEqual(blocked(w,w.carrier),true);});
test('unprotected subtree remains eligible after explicit profile edit',()=>{const w=simpleScene(),cfg=setProfile(w,'Genesis9',[]);assert.strictEqual(blocked(w,w.carrier,w.owner,cfg),false);});
test('exact protection is case-sensitive and never matches the display label',()=>{const w=simpleScene();w.body._name=w.body.name='genesis9eyes';w.body.label='Genesis9Eyes';assert.strictEqual(blocked(w,w.carrier),false);});
test('same-name separate owner instances cannot contaminate each other subtrees',()=>{const w=world(true),a=new w.Node('Genesis9'),b=new w.Node('Genesis9'),owned=new w.Node('Hat','DzNode',a);new w.Node('Genesis9Eyes','DzFigure',b);assert.strictEqual(w.support.isProtectedTransfer(w.alias(owned),w.alias(a),w.config),false);});
test('foreign-owner candidate fails closed rather than borrowing name equality',()=>{const w=world(true),a=new w.Node('Genesis9'),b=new w.Node('Genesis9'),other=new w.Node('Hat','DzNode',b);assert.strictEqual(w.support.isProtectedTransfer(w.alias(other),w.alias(a),w.config),true);});
test('missing owner and node fail closed',()=>{const w=simpleScene();assert.strictEqual(w.support.isProtectedTransfer(null,w.owner,w.config),true);assert.strictEqual(w.support.isProtectedTransfer(w.carrier,null,w.config),true);});
test('deleted owner or candidate fails closed',()=>{for(const which of ['owner','carrier']){const w=simpleScene();w.state.nodes=w.state.nodes.filter(n=>n!==w[which]);assert.strictEqual(blocked(w,w.carrier),true);}});
test('disposed native wrapper fails closed',()=>{const w=simpleScene();w.carrier.disposed=true;assert.strictEqual(blocked(w,w.carrier),true);});
test('missing native root child enumeration fails closed',()=>{const w=simpleScene();w.carrier.getNodeChildren=undefined;assert.strictEqual(blocked(w,w.carrier),true);});
test('duplicate session identity fails closed',()=>{const w=simpleScene(),copy=new w.Node('Other','DzFigure');copy.elementID=w.carrier.elementID;assert.strictEqual(blocked(w,w.carrier),true);});
test('reparented candidate fails closed before transfer',()=>{const w=simpleScene(),other=new w.Node('Genesis8Female');w.carrier.parent=other;assert.strictEqual(blocked(w,w.carrier),true);});
test('reparented protected child does not leave a stale block on old carrier',()=>{const w=simpleScene(),other=new w.Node('Genesis8Female');w.body.parent=other;assert.strictEqual(blocked(w,w.carrier),false);});
test('stale child entry causes a safe block instead of silent omission',()=>{const w=simpleScene();w.state.nodes=w.state.nodes.filter(n=>n!==w.body);w.carrier.extraChildren=[w.body];assert.strictEqual(blocked(w,w.carrier),true);});
test('parent hierarchy cycle is bounded and fails closed',()=>{const w=simpleScene();w.carrier.parent=w.body;assert.strictEqual(blocked(w,w.carrier),true);});
test('child hierarchy cycle is bounded and fails closed',()=>{const w=simpleScene(),cfg=setProfile(w,'Genesis9',[]);w.carrier.extraChildren=[w.body];w.body.extraChildren=[w.carrier];assert.strictEqual(blocked(w,w.carrier,w.owner,cfg),true);});
test('custom actual graft remains protected after removing its configured name',()=>{const w=world(),f=new w.Node('HorseActualInternal'),g=new w.Node('AnatomyGraft','DzFigure',f);g.follow=f;f.grafts=[g];const r=w.support.addSupportedFigure(w.config,f);assert(r.ok,r.message);const cfg=setProfile(w,'HorseActualInternal',[],r.config);assert.strictEqual(w.support.isProtectedTransfer(g,f,cfg),true);});
test('custom unknown graft evidence fails closed',()=>{const w=world(),f=new w.Node('HorseActualInternal'),p=new w.Node('Saddle','DzNode',f),r=w.support.addSupportedFigure(w.config,f);assert(r.ok,r.message);const cfg=setProfile(w,'HorseActualInternal',[],r.config);f.getNumGraftFigures=undefined;assert.strictEqual(w.support.isProtectedTransfer(p,f,cfg),true);});
test('Alt state never weakens the central protection policy',()=>{const w=simpleScene();for(const alt of [false,true]){w.c.bAltPressed=alt;assert.strictEqual(blocked(w,w.carrier),true);}});

function engineWorld(source,fresh=false){
 const w=world(fresh),c=w.c;c.oWM2Config=w.config;c.bAltPressed=false;c.DATA_ITEM_NAME='MatewWearables';
 for(const name of ['WM2NodeKey','WM2SameNode','WM2LiveNode','WM2SceneContains','WM2IsBoneOfFigure','IsParentedToHuman','GetDefaultTransferExemptionsList','FilterParentedToHumanFigureAndNotAnExemption','PlaceWearableIntoGroup'])vm.runInContext(getFunction(source,name).text,c);
 // These are mutation receipts, not replacements for graph/protection predicates.
 c.WM2NodeSettings=()=>{w.state.referenceWrites++;return {};};c.WM2SaveNodeReference=()=>{w.state.referenceWrites++;return {ok:true};};c.SaveCollisionItem=()=>{w.state.referenceWrites++;return true;};
 c.ParentToBoneGroup=()=>{w.state.mutations++;throw Error('Unexpected bone-placement fixture path');};
 w.owner=new w.Node('Genesis9');w.group=new w.Node('Storage','DzGroupNode');c.oHumanFigure=w.alias(w.owner);c.oGroup=w.alias(w.group);
 return w;
}
for(const file of files){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 sourceReceipts.push({file,sha256:crypto.createHash('sha256').update(source).digest('hex')});
 function check(name,body,fresh=false){test(name,()=>body(engineWorld(source,fresh)),file);}
 check('actual UI filter blocks direct protected child with either Alt state',w=>{const body=new w.Node('Genesis9Eyes','DzFigure',w.owner);for(const alt of [false,true]){w.c.bAltPressed=alt;assert.strictEqual(w.c.FilterParentedToHumanFigureAndNotAnExemption.call(w.c.GetDefaultTransferExemptionsList(w.alias(w.owner)),w.alias(body)),false);}});
 check('actual UI filter blocks ancestor carrying a protected descendant',w=>{const carrier=new w.Node('Carrier','DzFigure',w.owner);new w.Node('Genesis9Eyes','DzNode',carrier);assert.strictEqual(w.c.FilterParentedToHumanFigureAndNotAnExemption.call([],w.alias(carrier)),false);});
 check('actual storage entry blocks protected child before FitTo or recovery writes',w=>{const body=new w.Node('Genesis9Eyes','DzFigure',w.owner);body.follow=w.owner;assert.throws(()=>w.c.PlaceWearableIntoGroup(w.alias(w.owner),w.alias(body),w.alias(w.group)));assert.strictEqual(w.state.followWrites,0);assert.strictEqual(w.state.referenceWrites,0);assert.strictEqual(w.state.mutations,0);assert.strictEqual(w.unwrap(body.parent),w.owner);});
 check('actual storage entry blocks carrying ancestor before FitTo or recovery writes',w=>{const carrier=new w.Node('Carrier','DzFigure',w.owner);carrier.follow=w.owner;new w.Node('Genesis9Eyes','DzNode',carrier);assert.throws(()=>w.c.PlaceWearableIntoGroup(w.alias(w.owner),w.alias(carrier),w.alias(w.group)));assert.strictEqual(w.state.followWrites,0);assert.strictEqual(w.state.referenceWrites,0);assert.strictEqual(w.state.mutations,0);});
 check('actual source supports native-style aliases in protection preflight',w=>{const carrier=new w.Node('Carrier','DzFigure',w.owner);new w.Node('Genesis9Eyes','DzNode',carrier);assert.strictEqual(w.c.FilterParentedToHumanFigureAndNotAnExemption.call([],w.alias(carrier)),false);assert.throws(()=>w.c.PlaceWearableIntoGroup(w.alias(w.owner),w.alias(carrier),w.alias(w.group)));assert.strictEqual(w.state.mutations,0);},true);
 check('explicit profile edit permits formerly protected name in filter and placement',w=>{w.c.oWM2Config=setProfile(w,'Genesis9',[]);const body=new w.Node('Genesis9Eyes','DzNode',w.owner);assert.strictEqual(w.c.FilterParentedToHumanFigureAndNotAnExemption.call(w.c.GetDefaultTransferExemptionsList(w.owner),body),true);w.c.PlaceWearableIntoGroup(w.owner,body,w.group);assert.strictEqual(w.unwrap(body.parent),w.group);});
 check('ordinary unprotected item still moves into storage',w=>{const prop=new w.Node('Hat','DzNode',w.owner);w.c.PlaceWearableIntoGroup(w.owner,prop,w.group);assert.strictEqual(w.unwrap(prop.parent),w.group);assert.strictEqual(w.state.mutations,1);});
 test('restoration retains eligibility for items protected after storage',()=>{for(const name of ['WM2RestoreWearablePairs','ReturnWearable','ReturnAllWearableToTheFigure']){const body=getFunction(source,name).text;assert(!/\bisProtectedTransfer\s*\(/.test(body),name+' must not acquire the move-out protection guard');}},file);
}
const receipt={nativeExecuted:false,sourceRoot:root,supportPath,supportSHA256:crypto.createHash('sha256').update(supportText).digest('hex'),scope:'Actual schema2 WM2Support and unchanged extracted four-engine transfer/filter functions; isolated native-style aliases and Scene mocks; restoration guard source anchors only',sourceReceipts,passed:tests.filter(t=>t.pass).length,failed:tests.filter(t=>!t.pass).length,tests};
console.log(JSON.stringify(receipt,null,2));process.exitCode=receipt.failed?1:0;
