const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const source=fs.readFileSync(require('path').join(__dirname,'../../Wearable Manager Wardrobe.dsa'),'utf8');
const pose=v=>({schemaVersion:1,channels:[{propertyNodePath:['rHand'],propertyName:'XRotate',propertyGroupPath:'/General/Transforms/Rotation',propertyOwnerName:'rHand',rawValue:v}]});
const clone=x=>JSON.parse(JSON.stringify(x));let count=0;
const c={JSON,Object,Array,isFinite,clonePlain:clone,own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),
 problem:(code,m)=>Error(code+': '+m),expectObject:(x)=>assert(x&&typeof x==='object'&&!Array.isArray(x)),propertyLocatorFields:()=>{},
 handPoseSession:{},syncHandPoseSession(){},commitHandPoseSession(){},key:f=>f.id,Scene:{getFrame:()=>0},log(){},errorText:String,
 captureHandPose:(f,s)=>clone(f[s]),resolveHandPose(){},writeHandPose:(f,s,p)=>{f[s]=clone(p);}};
vm.createContext(c);for(const name of ['handPosesForSave','handChannelKey','validateHandPoses','prepareHandTransition','prepareHandRemoval','applyHandTransition','rollbackHandTransition'])vm.runInContext(getFunction(source,name).text,c);
function test(name,fn){fn();count++;}
test('old sets default to no poses',()=>assert.equal(Object.keys(c.validateHandPoses(undefined)).length,0));
test('reject non-finite and duplicate saved channels',()=>{const p=pose(Infinity);assert.throws(()=>c.validateHandPoses({right:p}));p.channels[0].rawValue=1;p.channels.push(clone(p.channels[0]));assert.throws(()=>c.validateHandPoses({right:p}));});
const a={id:'A',right:pose(1),left:pose(2)},b={id:'B',right:pose(3),left:pose(4)};
test('baselines independent by figure and side across multiple sets',()=>{
 c.applyHandTransition(c.prepareHandTransition({handPoses:{right:pose(10)}},a),a);
 c.applyHandTransition(c.prepareHandTransition({handPoses:{right:pose(20)}},b),b);
 c.applyHandTransition(c.prepareHandTransition({handPoses:{right:pose(30),left:pose(40)}},a),a);
 c.applyHandTransition(c.prepareHandTransition({handPoses:{left:pose(50)}},a),a);
 assert.deepEqual(a.right,pose(1));assert.deepEqual(a.left,pose(50));assert.deepEqual(b.right,pose(20));
 c.applyHandTransition(c.prepareHandTransition({},a),a);c.applyHandTransition(c.prepareHandTransition(null,b),b);
 assert.deepEqual(a.left,pose(2));assert.deepEqual(b.right,pose(3));assert.equal(Object.keys(c.handPoseSession).length,0);
});
test('rollback retains previous session baseline',()=>{
 c.applyHandTransition(c.prepareHandTransition({handPoses:{right:pose(10)}},a),a);
 const tx=c.prepareHandTransition({handPoses:{right:pose(20)}},a);c.applyHandTransition(tx,a);c.rollbackHandTransition(tx,a);
 assert.deepEqual(a.right,pose(10));c.applyHandTransition(c.prepareHandTransition({},a),a);assert.deepEqual(a.right,pose(1));
});
test('new session does not restore a committed pose',()=>{c.applyHandTransition(c.prepareHandTransition({handPoses:{right:pose(9)}},a),a);c.handPoseSession={};c.applyHandTransition(c.prepareHandTransition({},a),a);assert.deepEqual(a.right,pose(9));});
test('raw ERC offset is not compared with evaluated joint limits; locks and readback remain checked',()=>{
 let raw=0,locked=false;
 const rec=pose(-32.94038009643555).channels[0],property={isLocked:()=>locked,getRawValue:()=>raw,
   getValue:()=>raw+80,isClamped:()=>true,getMin:()=>-12,getMax:()=>105,setValue:v=>{raw=v;}};
 const native={JSON,Object,Number,problem:c.problem,handChannelKey:c.handChannelKey,
   closeNumbers:(a,b)=>Math.abs(a-b)<1e-7,handNativeChannels:()=>[{record:rec,property}],
   checkPropertyOverrideValue:()=>{throw Error('Evaluated limits must not reject raw channels');}};
 vm.createContext(native);for(const name of ['resolveHandPose','writeHandPose'])vm.runInContext(getFunction(source,name).text,native);
 native.writeHandPose({},'right',{channels:[rec]});assert.equal(raw,rec.rawValue);assert.equal(property.isClamped(),true);
 locked=true;assert.throws(()=>native.writeHandPose({},'right',pose(0)),/HAND_POSE_LOCKED/);
 locked=false;property.setValue=()=>{};assert.throws(()=>native.writeHandPose({},'right',pose(0)),/HAND_POSE_WRITE/);
});
test('removing current set restores baseline; unrelated removals preserve it; rollback preserves owner',()=>{
 const f={id:'removal',right:pose(2),left:pose(3)},set={id:'sword',items:['sword'],handPoses:{right:pose(20)}};
 c.applyHandTransition(c.prepareHandTransition(set,f),f);
 c.applyHandTransition(c.prepareHandRemoval(f,['shirt'],'shirtSet'),f);assert.deepEqual(f.right,pose(20));
 const tx=c.prepareHandRemoval(f,['sword'],'');c.applyHandTransition(tx,f);assert.deepEqual(f.right,pose(2));
 c.rollbackHandTransition(tx,f);assert.deepEqual(f.right,pose(20));
 c.applyHandTransition(c.prepareHandRemoval(f,[],'sword'),f);assert.deepEqual(f.right,pose(2));assert.deepEqual(f.left,pose(3));
});
test('missing recovery for unrelated storage cannot block an outfit, but incoming storage remains protected',()=>{
 const q={value:()=>'',log(){},validateRecovery:()=>{throw Error('RECOVERY_MISSING');}};vm.createContext(q);
 vm.runInContext(getFunction(source,'validateTransitionRecovery').text,q);
 q.validateTransitionRecovery({items:['sword']},{id:'shorts',name:'Shorts'},{root:{}},{});
 assert.throws(()=>q.validateTransitionRecovery({items:['shorts']},{id:'shorts'},{root:{}},{}),/RECOVERY_MISSING/);
 q.value=()=>'{record}';assert.throws(()=>q.validateTransitionRecovery({items:['sword']},{id:'shorts'},{root:{}},{}),/RECOVERY_MISSING/);
});
test('another group retains the worn source hand pose until its source items are removed',()=>{
 const f={id:'groups',right:pose(1),left:pose(2)},sword={id:'sword',items:['sword'],handPoses:{right:pose(10)}};
 c.applyHandTransition(c.prepareHandTransition(sword,f,['sword']),f);
 c.applyHandTransition(c.prepareHandTransition({id:'shirt',items:['shirt']},f,['sword','shirt']),f);
 assert.deepEqual(f.right,pose(10));
 c.applyHandTransition(c.prepareHandTransition({id:'shirt',items:['shirt']},f,['shirt']),f);
 assert.deepEqual(f.right,pose(1));
});
test('metadata uses native undoable string state',()=>{
 assert(source.includes('new DzStringProperty("matewWardrobeState_v1",true)'));
});
test('ordinary edit keeps saved poses even when the figure has another pose',()=>{
 const old={handPoses:{right:pose(30),left:pose(40)}},fig={right:pose(1),left:pose(2)};
 const saved=c.handPosesForSave({rightHandPose:true,leftHandPose:true},old,fig);
 assert.deepEqual(saved,old.handPoses);saved.right.channels[0].rawValue=99;assert.equal(old.handPoses.right.channels[0].rawValue,30);
});
test('explicit recapture replaces only requested side; unchecked removes side',()=>{
 const old={handPoses:{right:pose(30),left:pose(40)}},fig={right:pose(1),left:pose(2)};
 assert.deepEqual(c.handPosesForSave({rightHandPose:true,leftHandPose:true,rightHandPoseRecapture:true},old,fig),{right:pose(1),left:pose(40)});
 assert.deepEqual(c.handPosesForSave({rightHandPose:false,leftHandPose:true},old,fig),{left:pose(40)});
});
test('new sets and newly enabled sides capture the current pose',()=>{
 const fig={right:pose(1),left:pose(2)};
 assert.deepEqual(c.handPosesForSave({rightHandPose:true},null,fig),{right:pose(1)});
 assert.deepEqual(c.handPosesForSave({leftHandPose:true},{handPoses:{}},fig),{left:pose(2)});
});
console.log(JSON.stringify({passed:count,failed:0}));
