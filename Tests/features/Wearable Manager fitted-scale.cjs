'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const src=fs.readFileSync(path.resolve(__dirname,'../../Wearable Manager Wardrobe.dsa'),'utf8');
let passed=0;const failures=[];
function test(name,fn){try{fn();passed++;}catch(e){failures.push({name,error:e.stack});}}
function fixture(options={}){
 let raw=1,factor=options.factor||.9835,writes=0;
 const p={getValue:()=>raw*factor,setValue(v){writes++;if(!options.locked)raw=v;},getTransformType:()=>options.ordinary?0:1,adjustValue:v=>options.invalid?NaN:v/factor,setRawValue(v){writes++;if(!options.locked)raw=options.clamped?Math.min(v,1):v;}};
 const node={getLabel:()=> 'Jacket'},rec={propertyName:'Scale'};
 const c=vm.createContext({DzFloatProperty:{SCALE:1},isFinite,propertyHandleForOverride:()=>p,checkPropertyOverrideValue:()=>({displayPercent:true}),closeNumbers:(a,b)=>Math.abs(a-b)<1e-6,problem:(a,b)=>Error(a+': '+b),log(){},ctx:{propertyRollback:[]},live:()=>node,errorText:String,rememberPropertyRollback(){if(!c.ctx.propertyRollback.length)c.ctx.propertyRollback.push({nodeKey:'jacket',locator:rec,value:p.getValue()});}});
 for(const name of ['setPropertyOverrideNativeValue','writePropertyOverride','rollbackPropertyWrites'])vm.runInContext(getFunction(src,name).text,c);
 return {c,p,node,rec,writes:()=>writes,raw:()=>raw,factor(v){factor=v;},write(v){return c.writePropertyOverride(node,rec,v,'apply');}};
}
test('fitted Scale uses adjusted raw value and verifies saved evaluated native value',()=>{const w=fixture();assert(w.write(1.05));assert(Math.abs(w.p.getValue()-1.05)<1e-6);assert(Math.abs(w.raw()-1.05/.9835)<1e-6);});
test('rollback restores original evaluated scale',()=>{const w=fixture();w.write(1.05);const errors=[];assert(w.c.rollbackPropertyWrites(errors));assert.equal(errors.length,0);assert(Math.abs(w.p.getValue()-.9835)<1e-6);});
test('non-scale properties keep ordinary setter semantics',()=>{const w=fixture({ordinary:true,factor:1});w.write(2);assert.equal(w.raw(),2);assert.equal(w.writes(),1);});
test('matching values do not write or register rollback',()=>{const w=fixture();assert.equal(w.write(.9835),false);assert.equal(w.writes(),0);assert.equal(w.c.ctx.propertyRollback.length,0);});
for(const mode of ['locked','clamped'])test(mode+' scale is still rejected by readback',()=>{const w=fixture({[mode]:true});assert.throws(()=>w.write(1.05),/PROPERTY_WRITE/);});
test('invalid adjusted value fails before writing',()=>{const w=fixture({invalid:true});assert.throws(()=>w.write(1.05),/PROPERTY_VALUE/);assert.equal(w.writes(),0);});
test('unit figure scale remains unchanged',()=>{const w=fixture({factor:1});w.write(1.05);assert.equal(w.raw(),1.05);});
test('DAZ 6 without setRawValue uses adjusted scale through setValue, including rollback',()=>{const w=fixture();delete w.p.setRawValue;assert(w.write(1.05));assert(Math.abs(w.p.getValue()-1.05)<1e-6);assert(w.c.rollbackPropertyWrites([]));assert(Math.abs(w.p.getValue()-.9835)<1e-6);});
test('ERC-driven morph applies evaluated 15 percent instead of adding 11.25 percent',()=>{const w=fixture({ordinary:true,factor:1});let raw=0;w.p.getValue=()=>raw+.1125;w.p.adjustValue=v=>v-.1125;w.p.setValue=v=>{raw=v;};w.p.setRawValue=v=>{raw=v;};assert(w.write(.15));assert(Math.abs(w.p.getValue()-.15)<1e-6);assert(Math.abs(raw-.0375)<1e-6);assert(w.c.rollbackPropertyWrites([]));assert(Math.abs(w.p.getValue()-.1125)<1e-6);});
test('DAZ 6 ERC-driven morph uses adjusted setter and rollback without raw setter',()=>{const w=fixture({ordinary:true,factor:1});let raw=0;delete w.p.setRawValue;w.p.getValue=()=>raw+.1125;w.p.adjustValue=v=>v-.1125;w.p.setValue=v=>{raw=v;};w.write(.15);assert(Math.abs(w.p.getValue()-.15)<1e-6);assert(w.c.rollbackPropertyWrites([]));assert(Math.abs(w.p.getValue()-.1125)<1e-6);});
test('integer or boolean without float transform API uses its native setter',()=>{const w=fixture({ordinary:true,factor:1});delete w.p.getTransformType;w.p.adjustValue=()=>{throw Error('Integer adjustment must not run');};w.write(2);assert.equal(w.p.getValue(),2);});
console.log(JSON.stringify({passed,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
