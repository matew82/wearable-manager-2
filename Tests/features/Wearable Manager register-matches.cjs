const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'../..'),src=fs.readFileSync(path.join(root,'Wearable Manager Wardrobe.dsa'),'utf8');
const {getFunction}=require('../support/Wearable Manager extract.cjs');let passed=0;function test(n,f){f();passed++;}
function fixture(){
 const node=(id,label,cls='DzFigure')=>({id,getLabel:()=>label,className:()=>cls});
 const fig={objectName:'Genesis9'},shirt=node('root','Shirt'),child=node('child','Button','DzNode'),nodes={root:shirt,child};
 const item={id:'item',name:'Shirt',figureType:'Genesis9',variantID:'variant',parts:[{id:'p',root:true,name:'Shirt',className:'DzFigure'},{id:'c',root:false,name:'Button',className:'DzNode'}]};
 const db={commitID:'rev',libraryID:'lib',sets:{set:{id:'set'}},items:{item}};
 const matches=[{itemID:'item',itemName:'Shirt',runtimeKey:'root',candidateLabel:'Shirt'}],writes=[];
 const c=vm.createContext({app:{db},ctx:{},scopeProblem:()=>'',possibleUnregisteredLabelMatches:()=>matches,inventory:()=>({}),live:k=>nodes[k],foreignDataGuard(){},
 nonBones:()=>[shirt,child],same:(a,b)=>a===b,key:n=>n.id,numberedLabelBase:s=>s.replace(/ \(\d+\)$/,''),dataObject:()=>null,nativeLinkCheck(){},
 figureIdentity:()=>{writes.push('figure');return 'owner';},unique:()=> 'instance',uniqueNodeID:n=>writes.push('node:'+n.id),txData:(n,d)=>writes.push({node:n.id,data:d}),inspectInstance(){},log(){}});
 vm.runInContext(getFunction(src,'registerConfirmedMatches').text,c);
 return {c,fig,shirt,child,item,db,matches,writes,payload:{id:'set',commitID:'rev',matches:JSON.parse(JSON.stringify(matches))}};
}
test('confirmed objects receive existing item and part identities without catalog changes',()=>{
 const f=fixture(),before=JSON.stringify(f.db);f.c.registerConfirmedMatches(f.payload,f.fig);
 const tags=f.writes.filter(x=>typeof x==='object');assert.equal(tags.length,2);assert.equal(tags[0].data.ItemID,'item');assert.equal(tags[1].data.PartID,'c');assert.equal(tags[0].data.OwnerFigureID,'owner');assert.equal(JSON.stringify(f.db),before);
});
test('stale confirmation rejected before writes',()=>{const f=fixture();f.payload.commitID='old';assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig));assert.equal(f.writes.length,0);});
test('changed candidates rejected before writes',()=>{const f=fixture();f.matches[0].candidateLabel='Other';assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig));assert.equal(f.writes.length,0);});
test('ambiguous root pairing rejected before writes',()=>{const f=fixture();const m={...f.matches[0],runtimeKey:'other'};f.matches.push(m);f.payload.matches.push(m);assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig),/More than one/);assert.equal(f.writes.length,0);});
test('existing registered instance cannot be overwritten',()=>{const f=fixture();f.c.inventory=()=>({item:{where:'stored'}});assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig),/already has/);assert.equal(f.writes.length,0);});
test('missing composite part rejected',()=>{const f=fixture();f.c.nonBones=()=>[f.shirt];assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig),/parts differ/);assert.equal(f.writes.length,0);});
test('tagged child rejected',()=>{const f=fixture();f.c.dataObject=n=>n===f.child?{ItemID:'other'}:null;assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig),/already registered/);assert.equal(f.writes.length,0);});
test('wrong links and pending foreign recovery rejected before writes',()=>{for(const fn of ['nativeLinkCheck','foreignDataGuard']){const f=fixture();f.c[fn]=()=>{throw Error('unsafe');};assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig),/unsafe/);assert.equal(f.writes.length,0);}});
test('wrong class is not accepted based on name alone',()=>{const f=fixture();f.item.parts[0].className='DzNode';assert.throws(()=>f.c.registerConfirmedMatches(f.payload,f.fig),/uniquely/);assert.equal(f.writes.length,0);});
test('cancel and continue do not authorize registration',()=>{
 const c=vm.createContext({possibleUnregisteredLabelMatches:()=>[{candidateLabel:'Shirt',itemName:'Shirt'}],TITLE:'WM',MessageBox:{warning:()=>1}});
 vm.runInContext(getFunction(src,'confirmPossibleUnregisteredLabelMatches').text,c);const fig={getLabel:()=> 'Helen'};
 assert.equal(c.confirmPossibleUnregisteredLabelMatches({},fig).accepted,false);c.MessageBox.warning=()=>0;assert.equal(c.confirmPossibleUnregisteredLabelMatches({},fig).registerMatches,false);
 c.MessageBox.warning=()=>2;assert.equal(c.confirmPossibleUnregisteredLabelMatches({},fig).registerMatches,true);
});
console.log(JSON.stringify({passed,failed:0}));
