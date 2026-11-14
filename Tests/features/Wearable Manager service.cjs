const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {getFunction}=require('../support/Wearable Manager extract.cjs');
const src=fs.readFileSync(path.resolve(__dirname,'../../Wearable Manager Wardrobe.dsa'),'utf8');
let passed=0;function test(n,f){f();passed++;}
function fixture(){
 const fig={label:'Helen',getLabel(){return this.label;},figure:true},bone={owner:fig},other={label:'Helen (2)',getLabel(){return this.label;},figure:true};
 const db={libraryID:'lib',commitID:'r1',sets:{s:{id:'s',name:'Outfit',items:['x']}}};
 let selected=fig;const calls=[],c=vm.createContext({
 TITLE:'Wardrobe',setGroupID:st=>st.groupID||'',trim:s=>s.trim(),Scene:{getPrimarySelection:()=>selected},isFigure:n=>!!n&&n.figure===true,
 boneOwner:n=>n&&n.owner,sceneNodes:()=>[fig,other],app:{db},scopeProblem:st=>st.incompatible?'wrong':'',
 refreshWM2Figures(){},loadPreferences:()=>({libraryPath:'L',uiSettings:{}}),applyUISettings(){},
 canonicalDirectory:p=>p,readCatalog:()=>db,key:()=> 'figure-key',setSelectionSnapshot:(st,text)=>({id:st.id,buttonText:text}),
 runAction:(action,key,payload)=>{calls.push({action,key,payload});return {ok:true,folder:'report',warningCount:0};},print(){}
 });
 for(const n of ['serviceRequest','serviceFigure','serviceSet','serviceListSets','serviceSetByID','mainService'])vm.runInContext(getFunction(src,n).text,c);
 return {c,fig,other,bone,db,calls,select:n=>{selected=n;}};
}
test('three public arguments normalize action and allow empty label',()=>{
 const f=fixture(),r=f.c.serviceRequest(['--wm2-service-v1','',' Outfit ',' PUT ON ']);assert.equal(r.action,'put on');assert.equal(r.name,'Outfit');
});
test('invalid arguments fail before action',()=>{
 const f=fixture();for(const args of [[],['tag','',null,'put on'],['tag','','','put on'],['tag','','X','remove']])assert.throws(()=>f.c.serviceRequest(args));assert.equal(f.calls.length,0);
});
test('empty label resolves selected figure or bone only',()=>{
 const f=fixture();assert.equal(f.c.serviceFigure(''),f.fig);f.select(f.bone);assert.equal(f.c.serviceFigure(''),f.fig);
 f.select({});assert.throws(()=>f.c.serviceFigure(''));f.select(null);assert.throws(()=>f.c.serviceFigure(''));
});
test('explicit labels resolve exactly including automatic suffixes',()=>{
 const f=fixture();assert.equal(f.c.serviceFigure('Helen (2)'),f.other);assert.equal(f.c.serviceFigure('Helen'),f.fig);assert.throws(()=>f.c.serviceFigure('helen'));
});
test('duplicate character labels cannot silently pick a figure',()=>{
 const f=fixture();f.other.label='Helen';assert.throws(()=>f.c.serviceFigure('Helen'),/More than one/);
});
test('set lookup ignores incompatible sets but rejects compatible duplicate names',()=>{
 const f=fixture();f.db.sets.t={id:'t',name:'Outfit',incompatible:true};assert.equal(f.c.serviceSet('Outfit',f.fig).id,'s');
 f.db.sets.t.incompatible=false;assert.throws(()=>f.c.serviceSet('Outfit',f.fig),/More than one/);
});
test('missing or incompatible set makes no changes',()=>{
 const f=fixture();f.db.sets.s.incompatible=true;assert.throws(()=>f.c.mainService(['tag','','Outfit','put on']));assert.equal(f.calls.length,0);
});
test('put on uses normal apply and pins the selected catalog snapshot',()=>{
 const f=fixture();f.c.mainService(['tag','','Outfit','put on']);assert.equal(f.calls[0].action,'apply');assert.equal(f.calls[0].payload.selection.buttonText,'Apply: Outfit');assert.equal(f.calls[0].payload.commitID,'r1');
});
test('take off uses set-specific removal with current library identity',()=>{
 const f=fixture();f.c.mainService(['tag','Helen','Outfit','take off']);assert.equal(f.calls[0].action,'remove_set');assert.equal(f.calls[0].payload.id,'s');assert.equal(f.calls[0].payload.libraryID,'lib');
});
test('no configured library fails without opening settings',()=>{
 const f=fixture();f.c.loadPreferences=()=>({});assert.throws(()=>f.c.mainService(['tag','','Outfit','put on']),/Configure/);assert.equal(f.calls.length,0);
});
test('engine failures propagate to the calling script',()=>{
 const f=fixture();f.c.runAction=()=>({ok:false,outcome:'Stopped',folder:'report'});assert.throws(()=>f.c.mainService(['tag','','Outfit','put on']),/Report: report/);
});
test('warnings are reported without marking successful actions failed',()=>{
 const f=fixture();f.c.runAction=()=>({ok:true,warningCount:1,warningMessages:['coverage'],folder:'report'});assert(f.c.mainService(['tag','','Outfit','put on']).ok);
});
test('list sets accepts empty selector and never runs an action',()=>{
 const f=fixture();const r=f.c.mainService(['tag','','','list sets']);assert.equal(r.apiVersion,1);assert.equal(r.sets.length,1);
 assert.equal(r.sets[0].id,'s');assert.equal(r.sets[0].groupName,'Default');assert.equal(f.calls.length,0);assert.equal(r.figure.label,'Helen');
});
test('empty compatible list is success and supports selected bones',()=>{
 const f=fixture();f.select(f.bone);f.db.sets.s.incompatible=true;
 assert.equal(f.c.mainService(['tag','','','list sets']).sets.length,0);assert.equal(f.calls.length,0);
});
test('listing excludes incompatible sets, keeps duplicate names and returns groups',()=>{
 const f=fixture();f.db.groups={g:{name:'Jewelry'}};f.db.sets.s.groupID='g';
 f.db.sets.t={id:'t',name:'Outfit'};f.db.sets.u={id:'u',name:'Hidden',incompatible:true};
 const r=f.c.serviceListSets(f.fig);assert.equal(r.length,2);assert.equal(r[0].groupName,'Jewelry');assert.equal(r[1].id,'t');
});
test('ID actions disambiguate same-named sets and still enforce compatibility',()=>{
 const f=fixture();f.db.sets.t={id:'t',name:'Outfit'};
 f.c.mainService(['tag','','t','put on by id']);assert.equal(f.calls[0].payload.id,'t');assert.equal(f.calls[0].action,'apply');
 f.c.mainService(['tag','','s','take off by id']);assert.equal(f.calls[1].action,'remove_set');
 f.db.sets.t.incompatible=true;assert.throws(()=>f.c.mainService(['tag','','t','put on by id']));assert.equal(f.calls.length,2);
});
test('listing rejects a nonempty selector rather than silently ignoring it',()=>{
 const f=fixture();assert.throws(()=>f.c.serviceRequest(['tag','','ignored','list sets']));
});
test('successful actions expose serializable warnings and report path',()=>{
 const f=fixture();f.c.runAction=()=>({ok:true,folder:'report-path',warningCount:1,warningMessages:['Review this']});
 const r=f.c.mainService(['tag','','Outfit','put on']);assert.equal(r.reportPath,'report-path');assert.equal(r.warnings[0],'Review this');
 assert.equal(JSON.parse(JSON.stringify(r)).set.id,'s');
});
console.log(JSON.stringify({passed,failed:0,nativeDAZ:false}));
