'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../../Wearable Manager Wardrobe.dsa'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));let passed=0;const failures=[];
function test(name,fn){try{fn();passed++;}catch(e){failures.push({name,error:e.stack});}}
function fixture(mode='normal'){
 function state(scale){return {name:'Jacket',label:'Jacket',refs:{parent:'source',follow:'source'},identity:{nodeID:'original'},materials:[{color:1}],controls:{visible:true},channels:[{name:'Scale',value:scale,raw:scale}],world:{m11:scale,m22:scale,m33:scale}};}
 let actual={jacket:{node:state(1.05)},left:{left:state(1.05)}},pose={scale:1.05},resets=0;
 const original=clone(actual),tx={snapshots:{source:clone(actual),target:{other:{untouched:true}}},poses:{source:clone(pose)}},rollback=clone(actual),current={source:{figure:{getLabel:()=> 'Lisa'},inv:{jacket:{partKeys:['node']},left:{partKeys:['left']}}}};
 const c=vm.createContext({clonePlain:clone,own:(o,k)=>Object.hasOwn(o,k),measured:keys=>clone(actual[keys[0]==='node'?'jacket':'left']),compareMeasured(before,keys){assert.deepEqual(clone(before),actual[keys[0]==='node'?'jacket':'left']);},resetAppliedPropertyStateForFigure(){resets++;if(mode==='none')return 0;actual.jacket.node=state(1);actual.left.left=state(1);pose={scale:1};if(mode==='material')actual.jacket.node.materials[0].color=2;if(mode==='reference')actual.jacket.node.refs.parent='other';return 1;},transferAssertInventories:()=>current,closeNumbers:(a,b)=>JSON.stringify(a)===JSON.stringify(b),must:(v,code)=>{if(!v)throw Error(code);},problem:code=>Error(code),figurePoseAuditEnabled:()=>mode==='full',poseRecord:()=>clone(pose),log(){}});
 vm.runInContext(getFunction(source,'transferResetSourceProperties').text,c);
 return {c,tx,current,original,rollback,actual:()=>actual,resets:()=>resets};
}
test('Scale 1.05 -> 1 refreshes forward checks, leaving original rollback measurements untouched',()=>{const w=fixture(),old=w.tx.snapshots.source.jacket;w.c.transferResetSourceProperties(w.tx,'source',w.current);assert.equal(w.tx.snapshots.source.jacket.node.channels[0].value,1);assert.equal(old.node.channels[0].value,1.05);assert.deepEqual(w.rollback,w.original);assert.deepEqual(w.tx.snapshots.target,{other:{untouched:true}});w.c.compareMeasured(w.tx.snapshots.source.jacket,['node']);});
test('remaining source items affected by property dependencies also get post-reset baselines',()=>{const w=fixture();w.c.transferResetSourceProperties(w.tx,'source',w.current);w.c.compareMeasured(w.tx.snapshots.source.left,['left']);assert.equal(w.resets(),1);});
test('without property writes the original snapshot objects are retained',()=>{const w=fixture('none'),before=w.tx.snapshots.source;w.c.transferResetSourceProperties(w.tx,'source',w.current);assert.equal(w.tx.snapshots.source,before);});
for(const mode of ['material','reference'])test(mode+' changes during reset are rejected',()=>{const w=fixture(mode);assert.throws(()=>w.c.transferResetSourceProperties(w.tx,'source',w.current),/TRANSFER_PROPERTY_RESET_STRUCTURE/);assert.deepEqual(w.tx.snapshots.source,w.original);});
test('unexpected changes before reset stop before any property writes',()=>{const w=fixture();w.actual().jacket.node.channels[0].value=2;assert.throws(()=>w.c.transferResetSourceProperties(w.tx,'source',w.current));assert.equal(w.resets(),0);});
test('Full profile separates expected post-reset pose from immutable rollback pose',()=>{const w=fixture('full');w.c.transferResetSourceProperties(w.tx,'source',w.current);assert.equal(w.tx.verificationPoses.source.scale,1);assert.equal(w.tx.poses.source.scale,1.05);});
test('later unexpected source mutation is still detected against the refreshed baseline',()=>{const w=fixture();w.c.transferResetSourceProperties(w.tx,'source',w.current);w.actual().jacket.node.channels[0].value=2;assert.throws(()=>w.c.compareMeasured(w.tx.snapshots.source.jacket,['node']));});
test('transfer path calls the reset boundary once per source before transfer comparisons',()=>{const s=getFunction(source,'applySetWithTransfers').text;assert(s.includes('transferResetSourceProperties(tx,sourceKey,current)'));assert(s.indexOf('transferResetSourceProperties(')<s.indexOf('"TRANSFER_SOURCE_UNCHANGED_"'));assert(s.includes('ctx.rollbackMeasurements[mk[x]]=m[mk[x]]'));});
console.log(JSON.stringify({passed,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;

