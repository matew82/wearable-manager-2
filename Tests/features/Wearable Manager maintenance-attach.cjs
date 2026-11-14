const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'Wearable Manager Wardrobe.dsa'),'utf8');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
let passed=0;function test(name,fn){fn();passed++;}
function fixture(){
 const item={id:'item_old',variantID:'variant_old',figureType:'Genesis9',preset:'Items/item_old.duf',parts:[{id:'part_old'}]};
 const outfit=(id,type)=>({id,name:id,figureType:type,items:['item_old'],scope:{kind:'type'},properties:[{value:5}],handPoses:{right:{values:[2]}}});
 const db={libraryID:'lib',commitID:'v1',sets:{a:outfit('a','Genesis9'),b:outfit('b','Genesis9'),same:outfit('same','Genesis8_1Male')},items:{item_old:item}};
 const events=[],files=[],c=vm.createContext({app:{db,catalogFile:'catalog'},ctx:{},own:(o,k)=>Object.prototype.hasOwnProperty.call(o,k),clonePlain:x=>JSON.parse(JSON.stringify(x)),
 unique:p=>p+'_'+events.push('id'),figureIdentity:()=>{events.push('tag');return 'target';},validatePreset(){},validateCatalog(){},
 inLibrary:p=>p,readJSON:p=>({ref:'item_old',variant:'variant_old',part:'part_old'}),writeNewJSON:(p,d)=>files.push({p,d}),
 commitCatalog:n=>{events.push('commit');c.saved=n;},log(){}});
 for(const n of ['remapBindingIDs','maintenanceAttachSummary','attachMaintenanceSets'])vm.runInContext(getFunction(src,n).text,c);
 return {c,db,events,files,fig:{objectName:'Genesis8_1Male',getLabel:()=> 'Target'},payload:{ids:['a'],commitID:'v1',confirmedTargetType:'Genesis8_1Male',confirmedRemoval:true}};
}
test('cross-type counts only actual saved properties and hand poses',()=>{
 const f=fixture();let s=f.c.maintenanceAttachSummary(f.db,['a','same'],'Genesis8_1Male');assert.equal(s.cross,1);assert.equal(s.properties,1);assert.equal(s.handPoses,1);
 f.db.sets.a.properties=[];f.db.sets.a.handPoses={};s=f.c.maintenanceAttachSummary(f.db,['a'],'Genesis8_1Male');assert.equal(s.properties+s.handPoses,0);
});
test('stale catalog and unconfirmed loss stop before writes',()=>{
 for(const change of [{commitID:'old'},{confirmedTargetType:''},{confirmedRemoval:false}]){
 const f=fixture();assert.throws(()=>f.c.attachMaintenanceSets(Object.assign(f.payload,change),f.fig));assert.equal(f.events.length,0);assert.equal(f.files.length,0);
 }
});
test('cross transfer preserves set identity, changes item type, removes only incompatible data',()=>{
 const f=fixture();f.c.attachMaintenanceSets(f.payload,f.fig);const st=f.c.saved.sets.a;
 assert.equal(st.id,'a');assert.equal(st.name,'a');assert.equal(st.figureType,'Genesis8_1Male');assert.equal(st.scope.figureID,'target');
 assert.equal(st.properties.length,0);assert.equal(Object.keys(st.handPoses).length,0);assert.notEqual(st.items[0],'item_old');
 assert.equal(f.c.saved.items[st.items[0]].figureType,'Genesis8_1Male');assert.equal(f.files[0].d.ref,st.items[0]);
 assert.deepEqual(f.c.saved.sets.b,f.db.sets.b);assert.deepEqual(f.c.saved.items.item_old,f.db.items.item_old);assert.equal(Object.keys(f.c.saved.sets).length,3);
 assert.equal(f.db.sets.a.properties.length,1);
});
test('same type keeps saved data and needs no destructive confirmation',()=>{
 const f=fixture();f.payload.ids=['same'];delete f.payload.confirmedTargetType;delete f.payload.confirmedRemoval;
 f.c.attachMaintenanceSets(f.payload,f.fig);assert.deepEqual(f.c.saved.sets.same.properties,f.db.sets.same.properties);
 assert.deepEqual(f.c.saved.sets.same.handPoses,f.db.sets.same.handPoses);assert.equal(f.files.length,0);
});
test('mixed selection preserves compatible data and shares one adapted item',()=>{
 const f=fixture();f.payload.ids=['a','b','same'];f.c.attachMaintenanceSets(f.payload,f.fig);
 assert.equal(f.files.length,1);assert.equal(f.c.saved.sets.a.items[0],f.c.saved.sets.b.items[0]);
 assert.equal(f.c.saved.sets.same.items[0],'item_old');assert.equal(f.c.saved.sets.same.properties.length,1);
});
test('failed preset write does not commit catalog',()=>{
 const f=fixture();f.c.writeNewJSON=()=>{throw Error('disk');};assert.throws(()=>f.c.attachMaintenanceSets(f.payload,f.fig),/disk/);
 assert(!f.events.includes('commit'));assert.equal(f.db.sets.a.figureType,'Genesis9');
});
test('duplicate across types preserves original data and creates a bound copy',()=>{
 const f=fixture();f.payload.mode='duplicate';f.c.attachMaintenanceSets(f.payload,f.fig);
 const keys=Object.keys(f.c.saved.sets).filter(id=>!f.db.sets[id]);assert.equal(keys.length,1);
 const copy=f.c.saved.sets[keys[0]];assert.equal(copy.figureType,'Genesis8_1Male');assert.equal(copy.scope.figureID,'target');
 assert.equal(copy.properties.length,0);assert.equal(Object.keys(copy.handPoses).length,0);assert(copy.created);
 assert.deepEqual(f.c.saved.sets.a,f.db.sets.a);assert.equal(copy.name,'a - Target');
});
test('same-type duplicate preserves overrides and avoids preset duplication',()=>{
 const f=fixture();f.payload.mode='duplicate';f.payload.ids=['same'];f.c.attachMaintenanceSets(f.payload,f.fig);
 const copy=f.c.saved.sets[Object.keys(f.c.saved.sets).find(id=>!f.db.sets[id])];
 assert.deepEqual(copy.properties,f.db.sets.same.properties);assert.deepEqual(copy.handPoses,f.db.sets.same.handPoses);
 assert.equal(f.files.length,0);assert.deepEqual(f.c.saved.sets.same,f.db.sets.same);
});
test('maintenance displays numbered labels and local creation date',()=>{
 const c=vm.createContext({figureIconBaseLabel:s=>s.replace(/ \(\d+\)$/,''),scopeDisplayText:()=> 'Any figure'});
 for(const name of ['maintenanceCreatedText','maintenanceOwnerText'])vm.runInContext(getFunction(src,name).text,c);
 assert.equal(c.maintenanceCreatedText({created:'2026-01-02T03:04:05'}),'02-01-2026, 03:04:05');
 assert.equal(c.maintenanceCreatedText({created:'invalid'}),'Created: unavailable');
 const qt=c.maintenanceCreatedText({created:'Fri Oct 9 00:53:03 2026 GMT-0500'});
 assert.notEqual(qt,'Created: unavailable');
 assert.equal(qt,c.maintenanceCreatedText({created:'Fri Oct 09 2026 00:53:03 GMT-0500 (Central Daylight Time)'}));
 assert.equal(c.maintenanceOwnerText({scope:{kind:'label',label:'Fred 8.1 (3)'},figureType:'Genesis8_1Male'},{}),'Fred 8.1, Fred 8.1 (2)... | Genesis8_1Male');
});
console.log(JSON.stringify({passed,failed:0}));
